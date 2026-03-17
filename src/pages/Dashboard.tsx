import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  DollarSign,
  FolderKanban,
  GitCompareArrows,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import GlobalFiltersBar from "@/components/analytics/GlobalFiltersBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import {
  ALL_FILTER_VALUE,
  compactNumber,
  compareMonth,
  computeRiskStatus,
  currency,
  defaultAnalyticsFilters,
  formatMonthLabel,
  getLatestSubmissionIds,
  type AnalyticsFilters,
} from "@/lib/analytics";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof DollarSign;
}) {
  return (
    <div className="kpi-card min-h-[124px] justify-between">
      <div className="flex items-center justify-between gap-3">
        <span className="kpi-label">{title}</span>
        <div className="rounded-full bg-accent p-2 text-accent-foreground">
          <Icon size={14} />
        </div>
      </div>
      <div>
        <div className="kpi-value">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [showPreviousRevisions, setShowPreviousRevisions] = useState(false);
  const { data, isLoading } = useAnalyticsData();

  const analytics = useMemo(() => {
    if (!data) return null;

    const openMonth = data.openPeriod?.month || ALL_FILTER_VALUE;
    const appliedFilters = {
      ...filters,
      month: filters.month === ALL_FILTER_VALUE ? openMonth : filters.month,
    };

    const settingsMap = new Map(data.settings.map((row) => [row.setting_key, row.setting_value]));
    const riskThresholdValue = settingsMap.get("risk_thresholds");
    const amberThreshold = typeof riskThresholdValue === "object" && riskThresholdValue && "amber_pct" in riskThresholdValue
      ? Number((riskThresholdValue as { amber_pct?: number }).amber_pct || 10)
      : 10;

    const latestSubmissionIds = getLatestSubmissionIds(data.submissions, showPreviousRevisions);
    const filteredSubmissions = data.submissions.filter((submission) => {
      if (!latestSubmissionIds.has(submission.id)) return false;
      if (appliedFilters.month !== ALL_FILTER_VALUE && submission.month !== appliedFilters.month) return false;
      if (appliedFilters.consultantId !== ALL_FILTER_VALUE && submission.consultant_id !== appliedFilters.consultantId) return false;
      if (appliedFilters.submissionStatus !== ALL_FILTER_VALUE && submission.status !== appliedFilters.submissionStatus) return false;
      if (appliedFilters.scenario !== ALL_FILTER_VALUE && submission.schedule_type !== appliedFilters.scenario) return false;
      return true;
    });

    const submissionIds = new Set(filteredSubmissions.map((submission) => submission.id));
    const filteredLines = data.lines.filter((line) => {
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

    const invoiceTotals = data.invoices.filter((invoice) => {
      if (appliedFilters.consultantId !== ALL_FILTER_VALUE && invoice.consultant_id !== appliedFilters.consultantId) return false;
      if (appliedFilters.month !== ALL_FILTER_VALUE && invoice.invoice_month !== appliedFilters.month) return false;
      if (appliedFilters.poId !== ALL_FILTER_VALUE && invoice.po_id !== appliedFilters.poId) return false;
      return true;
    });

    const totalActualBilled = invoiceTotals.reduce((sum, invoice) => sum + Number(invoice.billed_amount_no_vat || 0), 0);
    const totalForecastCost = filteredSubmissions
      .filter((submission) => submission.schedule_type === "forecast" && submission.month > openMonth)
      .reduce((sum, submission) => {
        const cost = filteredLines
          .filter((line) => line.submission_id === submission.id)
          .reduce((lineSum, line) => lineSum + Number(line.derived_cost || 0), 0);
        return sum + cost;
      }, 0);
    const totalBaselineCost = filteredSubmissions
      .filter((submission) => submission.schedule_type === "baseline")
      .reduce((sum, submission) => {
        const cost = filteredLines
          .filter((line) => line.submission_id === submission.id)
          .reduce((lineSum, line) => lineSum + Number(line.derived_cost || 0), 0);
        return sum + cost;
      }, 0);

    const totalBudget = data.projects.reduce((sum, project) => sum + Number(project.latest_pmc_budget || project.latest_budget || 0), 0);
    const remainingBudget = totalBudget - totalActualBilled;
    const forecastRemaining = totalBudget - totalForecastCost;
    const varianceToBaseline = totalForecastCost - totalBaselineCost;
    const activeEmployees = data.employees.filter((employee) => employee.status === "active").length;
    const myOpenTasks = filteredSubmissions.filter((submission) => ["draft", "returned", "submitted", "in_review"].includes(submission.status)).length;
    const pendingReviews = filteredSubmissions.filter((submission) => submission.status === "submitted").length;

    const projectMetrics = data.projects.map((project) => {
      const billed = filteredLines
        .filter((line) => line.billed_project_id === project.id)
        .reduce((sum, line) => sum + Number(line.derived_cost || 0), 0);
      const forecast = filteredSubmissions
        .filter((submission) => submission.schedule_type === "forecast" && submission.month > openMonth)
        .flatMap((submission) => filteredLines.filter((line) => line.submission_id === submission.id && line.billed_project_id === project.id))
        .reduce((sum, line) => sum + Number(line.derived_cost || 0), 0);
      const budget = Number(project.latest_pmc_budget || project.latest_budget || 0);
      const risk = computeRiskStatus(budget, billed, forecast, amberThreshold);
      return {
        id: project.id,
        name: project.project_name,
        budget,
        actual: billed,
        forecast,
        remaining: budget - billed,
        risk,
      };
    }).filter((project) => project.budget > 0 || project.actual > 0 || project.forecast > 0);

    const projectsAtRisk = projectMetrics.filter((project) => project.risk !== "green").length;

    const months = Array.from(new Set(filteredSubmissions.map((submission) => submission.month))).sort(compareMonth);
    const monthlyTrend = months.map((month) => {
      const monthlySubmissions = filteredSubmissions.filter((submission) => submission.month === month);
      const totalForType = (type: string) => monthlySubmissions
        .filter((submission) => submission.schedule_type === type)
        .reduce((sum, submission) => {
          const cost = filteredLines
            .filter((line) => line.submission_id === submission.id)
            .reduce((lineSum, line) => lineSum + Number(line.derived_cost || 0), 0);
          return sum + cost;
        }, 0);
      return {
        month: formatMonthLabel(month),
        actual: totalForType("actual"),
        forecast: totalForType("forecast"),
        baseline: totalForType("baseline"),
      };
    });

    const statusCounts = ["draft", "submitted", "in_review", "approved", "returned"].map((status) => ({
      name: status.replace("_", " "),
      value: filteredSubmissions.filter((submission) => submission.status === status).length,
    }));

    const taskRows = filteredSubmissions
      .filter((submission) => ["draft", "returned", "submitted", "in_review"].includes(submission.status))
      .slice(0, 8)
      .map((submission) => ({
        id: submission.id,
        type: submission.schedule_type,
        month: submission.month,
        project: filteredLines.find((line) => line.submission_id === submission.id)?.billed_project_id,
        status: submission.status,
        dueDate: submission.reviewed_on || submission.submitted_on || submission.updated_at,
      }));

    const consultantNameById = new Map(data.consultants.map((consultant) => [consultant.id, consultant.name]));
    const projectNameById = new Map(data.projects.map((project) => [project.id, project.project_name]));
    const employeeNameById = new Map(data.employees.map((employee) => [employee.id, employee.employee_name]));

    const reviewQueue = filteredSubmissions
      .filter((submission) => submission.status === "submitted")
      .slice(0, 8)
      .map((submission) => ({
        id: submission.id,
        company: consultantNameById.get(submission.consultant_id) || "Unknown",
        month: submission.month,
        scheduleType: submission.schedule_type,
      }));

    const recentActivity = filteredSubmissions
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 8)
      .map((submission) => ({
        id: submission.id,
        label: `${consultantNameById.get(submission.consultant_id) || "Company"} · ${submission.schedule_type}`,
        status: submission.status,
        timestamp: submission.updated_at,
      }));

    const crossBilling = filteredLines
      .filter((line) => line.worked_project_id && line.billed_project_id && line.worked_project_id !== line.billed_project_id)
      .slice(0, 8)
      .map((line) => ({
        id: line.id,
        employee: employeeNameById.get(line.employee_id || "") || "Unassigned",
        workedProject: projectNameById.get(line.worked_project_id || "") || "—",
        billedProject: projectNameById.get(line.billed_project_id || "") || "—",
        cost: Number(line.derived_cost || 0),
      }));

    const overAllocationMap = new Map<string, { employee: string; month: string; allocation: number }>();
    filteredSubmissions.forEach((submission) => {
      const submissionLines = filteredLines.filter((line) => line.submission_id === submission.id);
      submissionLines.forEach((line) => {
        if (!line.employee_id) return;
        const key = `${submission.month}|${line.employee_id}`;
        const current = overAllocationMap.get(key) || {
          employee: employeeNameById.get(line.employee_id) || "Unassigned",
          month: submission.month,
          allocation: 0,
        };
        current.allocation += Number(line.allocation_pct || 0);
        overAllocationMap.set(key, current);
      });
    });
    const overAllocation = Array.from(overAllocationMap.values()).filter((row) => row.allocation > 100).slice(0, 8);

    return {
      displayName: data.profile?.full_name || user?.email?.split("@")[0] || "User",
      openMonth,
      months,
      consultants: data.consultants,
      projects: data.projects,
      serviceOrders: data.serviceOrders,
      purchaseOrders: data.purchaseOrders,
      positions: data.positions,
      kpis: {
        totalBudget,
        totalActualBilled,
        totalForecastCost,
        remainingBudget,
        forecastRemaining,
        varianceToBaseline,
        activeEmployees,
        myOpenTasks,
        pendingReviews,
        projectsAtRisk,
      },
      monthlyTrend,
      projectMetrics: projectMetrics.sort((a, b) => a.remaining - b.remaining).slice(0, 8),
      statusCounts,
      taskRows,
      reviewQueue,
      recentActivity,
      crossBilling,
      overAllocation,
      canReview: roles.includes("pmc_reviewer") || roles.includes("admin") || roles.includes("superadmin"),
      appliedFilters,
    };
  }, [data, filters, roles, showPreviousRevisions, user?.email]);

  if (isLoading || !analytics) {
    return (
      <AppLayout>
        <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">Loading dashboard…</div>
      </AppLayout>
    );
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
            <h1 className="page-title">Welcome, {analytics.displayName}</h1>
            <p className="page-subtitle">Portfolio, workflow, and risk signals for the current open period.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={showPreviousRevisions ? "default" : "outline"} size="sm" onClick={() => setShowPreviousRevisions((value) => !value)}>
              {showPreviousRevisions ? "Viewing all revisions" : "Latest revisions only"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/reports")}>Open Reports</Button>
          </div>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
          <KpiCard title="Total PMC Budget" value={currency(analytics.kpis.totalBudget)} hint="Current visible portfolio budget" icon={DollarSign} />
          <KpiCard title="Actual Billed to Date" value={currency(analytics.kpis.totalActualBilled)} hint="Invoices within the applied filters" icon={CheckCircle2} />
          <KpiCard title="Forecast Cost" value={currency(analytics.kpis.totalForecastCost)} hint="Future months beyond open period" icon={Clock3} />
          <KpiCard title="Remaining Budget" value={currency(analytics.kpis.remainingBudget)} hint="Budget minus actual billed" icon={FolderKanban} />
          <KpiCard title="Forecast Remaining" value={currency(analytics.kpis.forecastRemaining)} hint="Budget minus forecast cost" icon={ShieldAlert} />
          <KpiCard title="Variance to Baseline" value={currency(analytics.kpis.varianceToBaseline)} hint="Forecast against baseline" icon={GitCompareArrows} />
          <KpiCard title="Active Employees" value={compactNumber(analytics.kpis.activeEmployees)} hint="Current visible active headcount" icon={Users} />
          <KpiCard title="My Open Tasks" value={compactNumber(analytics.kpis.myOpenTasks)} hint="Drafts, returns, and reviews" icon={Briefcase} />
          <KpiCard title="Pending Reviews" value={compactNumber(analytics.kpis.pendingReviews)} hint="Reviewer queue for submitted items" icon={Clock3} />
          <KpiCard title="Projects at Risk" value={compactNumber(analytics.kpis.projectsAtRisk)} hint="Budget pressure by configured thresholds" icon={AlertTriangle} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6 mb-6">
          <div className="rounded-md border bg-card p-4">
            <h2 className="text-sm font-semibold mb-4">Actual vs Forecast vs Baseline by Month</h2>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={analytics.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="hsl(var(--chart-1))" strokeWidth={2.5} />
                <Line type="monotone" dataKey="forecast" name="Forecast" stroke="hsl(var(--chart-2))" strokeWidth={2.5} />
                <Line type="monotone" dataKey="baseline" name="Baseline" stroke="hsl(var(--chart-3))" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-md border bg-card p-4">
            <h2 className="text-sm font-semibold mb-4">Submission Status Overview</h2>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={analytics.statusCounts} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={3}>
                  {analytics.statusCounts.map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6 mb-6">
          <div className="rounded-md border bg-card p-4">
            <h2 className="text-sm font-semibold mb-4">Remaining Budget by Project</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={analytics.projectMetrics} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={160} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number, _name, props) => {
                  const row = props.payload;
                  return [currency(value), `Remaining • Budget ${currency(row.budget)} • Actual ${currency(row.actual)} • Forecast ${currency(row.forecast)}`];
                }} />
                <Bar dataKey="remaining" radius={[0, 6, 6, 0]}>
                  {analytics.projectMetrics.map((row) => (
                    <Cell
                      key={row.id}
                      fill={row.risk === "red" ? "hsl(var(--destructive))" : row.risk === "amber" ? "hsl(var(--warning))" : "hsl(var(--chart-2))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-md border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold">My Tasks</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/deployments")}>Open deployment</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header text-left px-4 py-2.5">Task Type</th>
                    <th className="data-table-header text-left px-4 py-2.5">Month</th>
                    <th className="data-table-header text-left px-4 py-2.5">Project</th>
                    <th className="data-table-header text-center px-4 py-2.5">Status</th>
                    <th className="data-table-header text-left px-4 py-2.5">Due Date</th>
                    <th className="data-table-header text-right px-4 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.taskRows.map((task) => (
                    <tr key={task.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 capitalize">{task.type}</td>
                      <td className="px-4 py-2.5">{formatMonthLabel(task.month)}</td>
                      <td className="px-4 py-2.5">{task.project || "—"}</td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={task.status} /></td>
                      <td className="px-4 py-2.5">{new Date(task.dueDate).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate("/deployments")}>Open</Button>
                      </td>
                    </tr>
                  ))}
                  {analytics.taskRows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No open tasks for the applied filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          <div className="rounded-md border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold">Review Queue</h2>
              <span className="text-xs text-muted-foreground">PMC reviewer only</span>
            </div>
            <div className="divide-y">
              {analytics.canReview ? analytics.reviewQueue.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{item.company}</div>
                    <div className="text-xs text-muted-foreground">{formatMonthLabel(item.month)} · {item.scheduleType}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate("/deployments")}>Approve</Button>
                    <Button size="sm" onClick={() => navigate("/deployments")}>Return</Button>
                  </div>
                </div>
              )) : <div className="px-4 py-8 text-sm text-muted-foreground">You do not have reviewer access.</div>}
              {analytics.canReview && analytics.reviewQueue.length === 0 && <div className="px-4 py-8 text-sm text-muted-foreground">Nothing pending review.</div>}
            </div>
          </div>

          <div className="rounded-md border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b"><h2 className="text-sm font-semibold">Recent Activity</h2></div>
            <div className="divide-y">
              {analytics.recentActivity.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="text-sm font-semibold">Exception Panel</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/reports")}>Open report</Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cross-billing Exceptions</div>
                <div className="space-y-2">
                  {analytics.crossBilling.map((row) => (
                    <div key={row.id} className="rounded-md border bg-muted/30 px-3 py-2">
                      <div className="text-sm font-medium">{row.employee}</div>
                      <div className="text-xs text-muted-foreground">{row.workedProject} → {row.billedProject}</div>
                      <div className="text-xs mt-1">{currency(row.cost)}</div>
                    </div>
                  ))}
                  {analytics.crossBilling.length === 0 && <div className="text-sm text-muted-foreground">No cross-billing mismatches.</div>}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Over-allocation</div>
                <div className="space-y-2">
                  {analytics.overAllocation.map((row) => (
                    <div key={`${row.employee}-${row.month}`} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      <div className="text-sm font-medium">{row.employee}</div>
                      <div className="text-xs text-muted-foreground">{formatMonthLabel(row.month)}</div>
                      <div className="text-xs text-destructive mt-1">{row.allocation.toFixed(1)}% allocated</div>
                    </div>
                  ))}
                  {analytics.overAllocation.length === 0 && <div className="text-sm text-muted-foreground">No over-allocation detected.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
