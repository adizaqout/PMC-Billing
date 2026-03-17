import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import GlobalFiltersBar from "@/components/analytics/GlobalFiltersBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import {
  ALL_FILTER_VALUE,
  compareMonth,
  currency,
  defaultAnalyticsFilters,
  formatMonthLabel,
  getLatestSubmissionIds,
  type AnalyticsFilters,
} from "@/lib/analytics";

export default function ReportsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [tab, setTab] = useState("portfolio");
  const [showPreviousRevisions, setShowPreviousRevisions] = useState(false);
  const { data, isLoading } = useAnalyticsData();

  const analytics = useMemo(() => {
    if (!data) return null;
    const openMonth = data.openPeriod?.month || ALL_FILTER_VALUE;
    const appliedFilters = {
      ...filters,
      month: filters.month === ALL_FILTER_VALUE ? openMonth : filters.month,
    };

    const latestSubmissionIds = getLatestSubmissionIds(data.submissions, showPreviousRevisions);
    const submissions = data.submissions.filter((submission) => {
      if (!latestSubmissionIds.has(submission.id)) return false;
      if (appliedFilters.month !== ALL_FILTER_VALUE && submission.month !== appliedFilters.month) return false;
      if (appliedFilters.consultantId !== ALL_FILTER_VALUE && submission.consultant_id !== appliedFilters.consultantId) return false;
      if (appliedFilters.submissionStatus !== ALL_FILTER_VALUE && submission.status !== appliedFilters.submissionStatus) return false;
      if (appliedFilters.scenario !== ALL_FILTER_VALUE && submission.schedule_type !== appliedFilters.scenario) return false;
      return true;
    });
    const submissionIds = new Set(submissions.map((submission) => submission.id));
    const lines = data.lines.filter((line) => {
      if (!submissionIds.has(line.submission_id)) return false;
      if (appliedFilters.projectId !== ALL_FILTER_VALUE && line.billed_project_id !== appliedFilters.projectId && line.worked_project_id !== appliedFilters.projectId) return false;
      if (appliedFilters.soId !== ALL_FILTER_VALUE && line.so_id !== appliedFilters.soId) return false;
      if (appliedFilters.poId !== ALL_FILTER_VALUE && line.po_id !== appliedFilters.poId) return false;
      if (appliedFilters.positionId !== ALL_FILTER_VALUE) {
        const employee = data.employees.find((candidate) => candidate.id === line.employee_id);
        if (!employee || employee.position_id !== appliedFilters.positionId) return false;
      }
      return true;
    });

    const months = Array.from(new Set(submissions.map((submission) => submission.month))).sort(compareMonth);
    const portfolio = data.projects.map((project) => {
      const actual = lines.filter((line) => line.billed_project_id === project.id).reduce((sum, line) => sum + Number(line.derived_cost || 0), 0);
      const budget = Number(project.latest_pmc_budget || project.latest_budget || 0);
      const forecast = submissions
        .filter((submission) => submission.schedule_type === "forecast")
        .flatMap((submission) => lines.filter((line) => line.submission_id === submission.id && line.billed_project_id === project.id))
        .reduce((sum, line) => sum + Number(line.derived_cost || 0), 0);
      return {
        name: project.project_name,
        budget,
        actual,
        forecast,
        remaining: budget - actual,
      };
    }).filter((item) => item.budget || item.actual || item.forecast);

    const burnTrend = months.map((month) => ({
      month: formatMonthLabel(month),
      actual: submissions.filter((submission) => submission.month === month && submission.schedule_type === "actual")
        .flatMap((submission) => lines.filter((line) => line.submission_id === submission.id))
        .reduce((sum, line) => sum + Number(line.derived_cost || 0), 0),
      forecast: submissions.filter((submission) => submission.month === month && submission.schedule_type === "forecast")
        .flatMap((submission) => lines.filter((line) => line.submission_id === submission.id))
        .reduce((sum, line) => sum + Number(line.derived_cost || 0), 0),
    }));

    const commercial = data.serviceOrders.map((so) => {
      const pos = data.purchaseOrders.filter((po) => po.so_id === so.id);
      const poValue = pos.reduce((sum, po) => sum + Number(po.po_value || po.amount || 0), 0);
      const invoiced = data.invoices.filter((invoice) => pos.some((po) => po.id === invoice.po_id)).reduce((sum, invoice) => sum + Number(invoice.billed_amount_no_vat || 0), 0);
      const deploymentCost = lines.filter((line) => line.so_id === so.id).reduce((sum, line) => sum + Number(line.derived_cost || 0), 0);
      return {
        so: so.so_number,
        soValue: Number(so.so_value || 0),
        poValue,
        invoiced,
        remaining: poValue - invoiced,
        variance: invoiced - deploymentCost,
      };
    }).filter((item) => item.soValue || item.poValue || item.invoiced);

    const positionNameById = new Map(data.positions.map((position) => [position.id, position.position_name]));
    const projectNameById = new Map(data.projects.map((project) => [project.id, project.project_name]));
    const employeeNameById = new Map(data.employees.map((employee) => [employee.id, employee.employee_name]));
    const consultantNameById = new Map(data.consultants.map((consultant) => [consultant.id, consultant.name]));

    const heatmap = lines.map((line) => {
      const employee = data.employees.find((row) => row.id === line.employee_id);
      return {
        position: positionNameById.get(employee?.position_id || "") || "Unassigned",
        project: projectNameById.get(line.billed_project_id || line.worked_project_id || "") || "Unassigned",
        value: Number(line.derived_cost || line.allocation_pct || 0),
      };
    });

    const employeeDeployment = lines.map((line) => ({
      employee: employeeNameById.get(line.employee_id || "") || "Unassigned",
      project: projectNameById.get(line.billed_project_id || "") || "Unassigned",
      allocation: Number(line.allocation_pct || 0),
    })).filter((row) => row.allocation > 0);

    const workflowAudit = months.map((month) => {
      const monthSubmissions = submissions.filter((submission) => submission.month === month);
      const turnaroundValues = monthSubmissions
        .filter((submission) => submission.submitted_on && submission.reviewed_on)
        .map((submission) => (new Date(submission.reviewed_on!).getTime() - new Date(submission.submitted_on!).getTime()) / 86400000);
      return {
        month: formatMonthLabel(month),
        submitted: monthSubmissions.filter((submission) => submission.status === "submitted").length,
        returned: monthSubmissions.filter((submission) => submission.status === "returned").length,
        inReview: monthSubmissions.filter((submission) => submission.status === "in_review").length,
        avgReviewDays: turnaroundValues.length ? turnaroundValues.reduce((sum, value) => sum + value, 0) / turnaroundValues.length : 0,
      };
    });

    const crossBilling = lines
      .filter((line) => line.worked_project_id && line.billed_project_id && line.worked_project_id !== line.billed_project_id)
      .map((line) => {
        const submission = submissions.find((row) => row.id === line.submission_id);
        const employee = data.employees.find((row) => row.id === line.employee_id);
        return {
          employee: employeeNameById.get(line.employee_id || "") || "Unassigned",
          workedProject: projectNameById.get(line.worked_project_id || "") || "—",
          billedProject: projectNameById.get(line.billed_project_id || "") || "—",
          company: consultantNameById.get(submission?.consultant_id || employee?.consultant_id || "") || "Unknown",
          amount: Number(line.derived_cost || 0),
        };
      });

    return {
      openMonth,
      months,
      consultants: data.consultants,
      projects: data.projects,
      serviceOrders: data.serviceOrders,
      purchaseOrders: data.purchaseOrders,
      positions: data.positions,
      portfolio,
      burnTrend,
      commercial,
      heatmap,
      employeeDeployment,
      workflowAudit,
      crossBilling,
    };
  }, [data, filters, showPreviousRevisions]);

  if (isLoading || !analytics) {
    return <AppLayout><div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">Loading reports…</div></AppLayout>;
  }

  const monthOptions = [
    { value: ALL_FILTER_VALUE, label: `Open period · ${formatMonthLabel(analytics.openMonth)}` },
    ...analytics.months.map((month) => ({ value: month, label: formatMonthLabel(month) })),
  ];
  const consultantOptions = [{ value: ALL_FILTER_VALUE, label: "All companies" }, ...analytics.consultants.map((consultant) => ({ value: consultant.id, label: consultant.name }))];
  const projectOptions = [{ value: ALL_FILTER_VALUE, label: "All projects" }, ...analytics.projects.map((project) => ({ value: project.id, label: project.project_name }))];
  const soOptions = [{ value: ALL_FILTER_VALUE, label: "All SOs" }, ...analytics.serviceOrders.map((so) => ({ value: so.id, label: so.so_number }))];
  const poOptions = [{ value: ALL_FILTER_VALUE, label: "All POs" }, ...analytics.purchaseOrders.map((po) => ({ value: po.id, label: po.po_number }))];
  const positionOptions = [{ value: ALL_FILTER_VALUE, label: "All positions" }, ...analytics.positions.map((position) => ({ value: position.id, label: position.position_name }))];

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Reporting</h1>
            <p className="page-subtitle">Aggregated portfolio, commercial, deployment, workflow, and cross-billing analysis.</p>
          </div>
          <button className="text-sm rounded-md border px-3 py-2 bg-card" onClick={() => setShowPreviousRevisions((value) => !value)}>
            {showPreviousRevisions ? "Viewing all revisions" : "Latest revisions only"}
          </button>
        </div>

        <GlobalFiltersBar
          filters={filters}
          onChange={setFilters}
          monthOptions={monthOptions}
          consultantOptions={consultantOptions}
          projectOptions={projectOptions}
          soOptions={soOptions}
          poOptions={poOptions}
          positionOptions={positionOptions}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex flex-wrap h-auto">
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="commercial">Commercial</TabsTrigger>
            <TabsTrigger value="deployment">Deployment</TabsTrigger>
            <TabsTrigger value="workflow">Workflow Audit</TabsTrigger>
            <TabsTrigger value="cross-billing">Cross-Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="portfolio" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-md border bg-card p-4">
                <h2 className="text-sm font-semibold mb-4">Budget vs Actual vs Forecast</h2>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={analytics.portfolio}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-18} textAnchor="end" height={72} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => currency(value)} />
                    <Bar dataKey="budget" fill="hsl(var(--chart-1))" />
                    <Bar dataKey="actual" fill="hsl(var(--chart-2))" />
                    <Bar dataKey="forecast" fill="hsl(var(--chart-3))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-md border bg-card p-4">
                <h2 className="text-sm font-semibold mb-4">Monthly Burn Trend</h2>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={analytics.burnTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => currency(value)} />
                    <Line type="monotone" dataKey="actual" stroke="hsl(var(--chart-1))" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="forecast" stroke="hsl(var(--chart-2))" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="commercial" className="space-y-6">
            <div className="rounded-md border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header text-left px-4 py-2.5">SO</th>
                    <th className="data-table-header text-right px-4 py-2.5">SO Value</th>
                    <th className="data-table-header text-right px-4 py-2.5">PO Value</th>
                    <th className="data-table-header text-right px-4 py-2.5">Invoiced</th>
                    <th className="data-table-header text-right px-4 py-2.5">Remaining</th>
                    <th className="data-table-header text-right px-4 py-2.5">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.commercial.map((row) => (
                    <tr key={row.so} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-medium">{row.so}</td>
                      <td className="px-4 py-2.5 text-right">{currency(row.soValue)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(row.poValue)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(row.invoiced)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(row.remaining)}</td>
                      <td className="px-4 py-2.5 text-right">{currency(row.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="deployment" className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="rounded-md border bg-card p-4">
                <h2 className="text-sm font-semibold mb-4">Project vs Position Heatmap</h2>
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart>
                    <CartesianGrid stroke="hsl(var(--border))" />
                    <XAxis type="category" dataKey="project" name="Project" />
                    <YAxis type="category" dataKey="position" name="Position" width={120} />
                    <Tooltip formatter={(value: number) => currency(value)} />
                    <Scatter data={analytics.heatmap} fill="hsl(var(--chart-1))" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-md border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="data-table-header text-left px-4 py-2.5">Employee</th>
                      <th className="data-table-header text-left px-4 py-2.5">Project</th>
                      <th className="data-table-header text-right px-4 py-2.5">Allocation %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.employeeDeployment.slice(0, 20).map((row, index) => (
                      <tr key={`${row.employee}-${index}`} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-2.5">{row.employee}</td>
                        <td className="px-4 py-2.5">{row.project}</td>
                        <td className="px-4 py-2.5 text-right">{row.allocation.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workflow" className="space-y-6">
            <div className="rounded-md border bg-card p-4">
              <h2 className="text-sm font-semibold mb-4">Approval Turnaround and Returns</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={analytics.workflowAudit}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="submitted" fill="hsl(var(--chart-1))" />
                  <Bar dataKey="returned" fill="hsl(var(--chart-3))" />
                  <Bar dataKey="inReview" fill="hsl(var(--chart-4))" />
                  <Bar dataKey="avgReviewDays" fill="hsl(var(--chart-2))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="cross-billing" className="space-y-6">
            <div className="rounded-md border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header text-left px-4 py-2.5">Employee</th>
                    <th className="data-table-header text-left px-4 py-2.5">Worked Project</th>
                    <th className="data-table-header text-left px-4 py-2.5">Billed Project</th>
                    <th className="data-table-header text-left px-4 py-2.5">Company</th>
                    <th className="data-table-header text-right px-4 py-2.5">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.crossBilling.map((row, index) => (
                    <tr key={`${row.employee}-${index}`} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5">{row.employee}</td>
                      <td className="px-4 py-2.5">{row.workedProject}</td>
                      <td className="px-4 py-2.5">{row.billedProject}</td>
                      <td className="px-4 py-2.5">{row.company}</td>
                      <td className="px-4 py-2.5 text-right">{currency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
