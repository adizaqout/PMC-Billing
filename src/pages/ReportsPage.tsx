import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { useAnalyticsModel } from "@/hooks/useAnalyticsModel";
import {
  currency,
  defaultAnalyticsFilters,
  type AnalyticsFilters,
} from "@/lib/analytics";

export default function ReportsPage() {
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [tab, setTab] = useState("portfolio");
  const [showPreviousRevisions, setShowPreviousRevisions] = useState(false);
  const { analytics, isLoading } = useAnalyticsModel(filters, showPreviousRevisions);

  const visibleReports = useMemo(() => {
    if (!analytics) return [];
    const rows = analytics.reportCatalog.filter((report) => report.is_active);
    if (analytics.reportVisibility.length === 0) return rows.map((report) => report.report_key);
    return rows
      .filter((report) => analytics.reportVisibility.some((row) => row.report_id === report.id && row.is_visible))
      .map((report) => report.report_key);
  }, [analytics]);

  if (isLoading || !analytics) {
    return <AppLayout><div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Loading reports…</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Reporting</h1>
            <p className="page-subtitle">One shared calculation layer drives portfolio, commercial, workflow, and exception reporting.</p>
          </div>
          <button className="rounded-md border bg-card px-3 py-2 text-sm" onClick={() => setShowPreviousRevisions((value) => !value)}>
            {showPreviousRevisions ? "Viewing all revisions" : "Latest revisions only"}
          </button>
        </div>

        <GlobalFiltersBar
          filters={filters}
          onChange={setFilters}
          monthOptions={analytics.filterOptions.monthOptions}
          consultantOptions={analytics.filterOptions.consultantOptions}
          projectOptions={analytics.filterOptions.projectOptions}
          soOptions={analytics.filterOptions.soOptions}
          poOptions={analytics.filterOptions.poOptions}
          positionOptions={analytics.filterOptions.positionOptions}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex h-auto flex-wrap">
            {visibleReports.includes("portfolio") && <TabsTrigger value="portfolio">Portfolio</TabsTrigger>}
            {visibleReports.includes("commercial") && <TabsTrigger value="commercial">Commercial</TabsTrigger>}
            {visibleReports.includes("deployment") && <TabsTrigger value="deployment">Deployment</TabsTrigger>}
            {visibleReports.includes("workflow") && <TabsTrigger value="workflow">Workflow Audit</TabsTrigger>}
            {visibleReports.includes("cross_billing") && <TabsTrigger value="cross-billing">Cross-Billing</TabsTrigger>}
          </TabsList>

          <TabsContent value="portfolio" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-md border bg-card p-4">
                <h2 className="mb-4 text-sm font-semibold">Budget vs Actual vs Forecast</h2>
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
                <h2 className="mb-4 text-sm font-semibold">Monthly Burn Trend</h2>
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
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header px-4 py-2.5 text-left">SO</th>
                    <th className="data-table-header px-4 py-2.5 text-right">SO Value</th>
                    <th className="data-table-header px-4 py-2.5 text-right">PO Value</th>
                    <th className="data-table-header px-4 py-2.5 text-right">Invoiced</th>
                    <th className="data-table-header px-4 py-2.5 text-right">Remaining</th>
                    <th className="data-table-header px-4 py-2.5 text-right">Variance</th>
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
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-md border bg-card p-4">
                <h2 className="mb-4 text-sm font-semibold">Project vs Position Heatmap</h2>
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
              <div className="overflow-x-auto rounded-md border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="data-table-header px-4 py-2.5 text-left">Employee</th>
                      <th className="data-table-header px-4 py-2.5 text-left">Project</th>
                      <th className="data-table-header px-4 py-2.5 text-right">Allocation %</th>
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
              <h2 className="mb-4 text-sm font-semibold">Approval Turnaround and Returns</h2>
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
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header px-4 py-2.5 text-left">Employee</th>
                    <th className="data-table-header px-4 py-2.5 text-left">Worked Project</th>
                    <th className="data-table-header px-4 py-2.5 text-left">Billed Project</th>
                    <th className="data-table-header px-4 py-2.5 text-left">Company</th>
                    <th className="data-table-header px-4 py-2.5 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.crossBilling.map((row, index) => (
                    <tr key={`${row.id}-${index}`} className="border-b last:border-0 hover:bg-muted/50">
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
