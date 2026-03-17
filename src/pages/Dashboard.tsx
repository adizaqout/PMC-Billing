import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
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
import { useAnalyticsModel } from "@/hooks/useAnalyticsModel";
import {
  compactNumber,
  currency,
  defaultAnalyticsFilters,
  formatMonthLabel,
  type AnalyticsFilters,
} from "@/lib/analytics";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

function KpiCard({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: typeof DollarSign }) {
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
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [showPreviousRevisions, setShowPreviousRevisions] = useState(false);
  const { analytics, isLoading } = useAnalyticsModel(filters, showPreviousRevisions);

  if (isLoading || !analytics) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Loading dashboard…</div>
      </AppLayout>
    );
  }

  const canReview = roles.includes("pmc_reviewer") || roles.includes("admin") || roles.includes("superadmin");
  const displayName = user?.email?.split("@")[0] || analytics.consultants[0]?.name || "User";

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Welcome, {displayName}</h1>
            <p className="page-subtitle">Shared KPI formulas, latest revision defaults, and open-period logic across the full analytics stack.</p>
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
          monthOptions={analytics.filterOptions.monthOptions}
          consultantOptions={analytics.filterOptions.consultantOptions}
          projectOptions={analytics.filterOptions.projectOptions}
          soOptions={analytics.filterOptions.soOptions}
          poOptions={analytics.filterOptions.poOptions}
          positionOptions={analytics.filterOptions.positionOptions}
        />

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard title="Total PMC Budget" value={currency(analytics.kpis.totalBudget)} hint="Current visible portfolio budget" icon={DollarSign} />
          <KpiCard title="Actual Billed to Date" value={currency(analytics.kpis.totalActualBilled)} hint="Invoices inside applied visibility" icon={CheckCircle2} />
          <KpiCard title="Forecast Cost" value={currency(analytics.kpis.totalForecastCost)} hint="Future months beyond the open period" icon={Clock3} />
          <KpiCard title="Remaining Budget" value={currency(analytics.kpis.remainingBudget)} hint="Budget minus billed actuals" icon={FolderKanban} />
          <KpiCard title="Forecast Remaining" value={currency(analytics.kpis.forecastRemaining)} hint="Budget minus forecast cost" icon={ShieldAlert} />
          <KpiCard title="Variance to Baseline" value={currency(analytics.kpis.varianceToBaseline)} hint="Forecast against baseline" icon={GitCompareArrows} />
          <KpiCard title="Active Employees" value={compactNumber(analytics.kpis.activeEmployees)} hint="Current visible active headcount" icon={Users} />
          <KpiCard title="My Open Tasks" value={compactNumber(analytics.kpis.myOpenTasks)} hint="Drafts, returns, and reviews" icon={Briefcase} />
          <KpiCard title="Pending Reviews" value={compactNumber(analytics.kpis.pendingReviews)} hint="Reviewer queue from latest revisions" icon={Clock3} />
          <KpiCard title="Projects at Risk" value={compactNumber(analytics.kpis.projectsAtRisk)} hint={`Shared thresholds · amber ${analytics.amberThreshold}%`} icon={AlertTriangle} />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div className="rounded-md border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">Actual vs Forecast vs Baseline by Month</h2>
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
            <h2 className="mb-4 text-sm font-semibold">Submission Status Overview</h2>
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

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-md border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold">Remaining Budget by Project</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={analytics.projectMetrics.slice().sort((a, b) => a.remaining - b.remaining).slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={160} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number, _name, props) => {
                  const row = props.payload;
                  return [currency(value), `Remaining • Budget ${currency(row.budget)} • Actual ${currency(row.actual)} • Forecast ${currency(row.forecast)}`];
                }} />
                <Bar dataKey="remaining" radius={[0, 6, 6, 0]}>
                  {analytics.projectMetrics.slice().sort((a, b) => a.remaining - b.remaining).slice(0, 8).map((row) => (
                    <Cell key={row.id} fill={row.risk === "red" ? "hsl(var(--destructive))" : row.risk === "amber" ? "hsl(var(--warning))" : "hsl(var(--chart-2))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-md border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">My Tasks</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/deployments")}>Open deployment</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header px-4 py-2.5 text-left">Task Type</th>
                    <th className="data-table-header px-4 py-2.5 text-left">Month</th>
                    <th className="data-table-header px-4 py-2.5 text-left">Project</th>
                    <th className="data-table-header px-4 py-2.5 text-center">Status</th>
                    <th className="data-table-header px-4 py-2.5 text-left">Due Date</th>
                    <th className="data-table-header px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.taskRows.map((task) => (
                    <tr key={task.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 capitalize">{task.type}</td>
                      <td className="px-4 py-2.5">{formatMonthLabel(task.month)}</td>
                      <td className="px-4 py-2.5">{task.project || "—"}</td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={task.status} /></td>
                      <td className="px-4 py-2.5">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => navigate("/deployments")}>Open</Button></td>
                    </tr>
                  ))}
                  {analytics.taskRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No open tasks for the applied filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-md border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Review Queue</h2>
              <span className="text-xs text-muted-foreground">PMC reviewer only</span>
            </div>
            <div className="divide-y">
              {canReview ? analytics.reviewQueue.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
              {canReview && analytics.reviewQueue.length === 0 && <div className="px-4 py-8 text-sm text-muted-foreground">Nothing pending review.</div>}
            </div>
          </div>

          <div className="rounded-md border bg-card overflow-hidden">
            <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Recent Activity</h2></div>
            <div className="divide-y">
              {analytics.recentActivity.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Exception Panel</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/reports")}>Open report</Button>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cross-billing Exceptions</div>
                <div className="space-y-2">
                  {analytics.crossBilling.slice(0, 5).map((row) => (
                    <div key={row.id} className="rounded-md border bg-muted/30 px-3 py-2">
                      <div className="text-sm font-medium">{row.employee}</div>
                      <div className="text-xs text-muted-foreground">{row.workedProject} → {row.billedProject}</div>
                      <div className="mt-1 text-xs">{currency(row.amount)}</div>
                    </div>
                  ))}
                  {analytics.crossBilling.length === 0 && <div className="text-sm text-muted-foreground">No cross-billing mismatches.</div>}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Over-allocation</div>
                <div className="space-y-2">
                  {analytics.overAllocation.map((row) => (
                    <div key={`${row.employee}-${row.month}`} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      <div className="text-sm font-medium">{row.employee}</div>
                      <div className="text-xs text-muted-foreground">{formatMonthLabel(row.month)}</div>
                      <div className="mt-1 text-xs text-destructive">{row.allocation.toFixed(1)}% allocated</div>
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
