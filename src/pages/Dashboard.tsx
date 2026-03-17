import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock3,
  DollarSign,
  FolderKanban,
  GitCompareArrows,
  Plus,
  ShieldAlert,
  Trash2,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useAnalyticsModel } from "@/hooks/useAnalyticsModel";
import { supabase } from "@/integrations/supabase/client";
import {
  compactNumber,
  currency,
  defaultAnalyticsFilters,
  formatMonthLabel,
  type AnalyticsFilters,
} from "@/lib/analytics";
import { toast } from "sonner";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

const GADGET_RENDER_ORDER = ["remaining_budget_by_project", "actual_vs_forecast_baseline"] as const;

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

function GadgetShell({ title, description, children, onRemove }: { title: string; description: string; children: React.ReactNode; onRemove?: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {onRemove ? (
          <Button variant="outline" size="sm" onClick={onRemove}>
            <Trash2 size={14} className="mr-1.5" />Remove
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, roles } = useAuth();
  const [tab, setTab] = useState("overview");
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [showPreviousRevisions, setShowPreviousRevisions] = useState(false);
  const { analytics, isLoading } = useAnalyticsModel(filters, showPreviousRevisions);

  const saveGadgetMutation = useMutation({
    mutationFn: async ({ gadgetId, enabled, positionY }: { gadgetId: string; enabled: boolean; positionY: number }) => {
      const existing = analytics?.dashboardGadgets.find((gadget) => gadget.id === gadgetId && gadget.isEnabled);
      const payload = {
        user_id: user?.id,
        gadget_id: gadgetId,
        is_enabled: enabled,
        position_x: 0,
        position_y: positionY,
      };

      if (!user?.id) throw new Error("Authentication required");

      if (existing) {
        const { error } = await supabase.from("user_dashboard_gadgets").update(payload).eq("id", existing.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("user_dashboard_gadgets").upsert(payload as never, { onConflict: "user_id,gadget_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics-data"] });
      toast.success("Dashboard updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeGadgetMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_dashboard_gadgets").update({ is_enabled: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics-data"] });
      toast.success("Gadget removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addableGadgets = useMemo(
    () =>
      (analytics?.dashboardGadgets || []).filter(
        (gadget) => !gadget.isEnabled && GADGET_RENDER_ORDER.includes(gadget.gadget_key as (typeof GADGET_RENDER_ORDER)[number]),
      ),
    [analytics?.dashboardGadgets],
  );

  const enabledGadgets = useMemo(
    () =>
      (analytics?.dashboardGadgets || [])
        .filter(
          (gadget) => gadget.isEnabled && GADGET_RENDER_ORDER.includes(gadget.gadget_key as (typeof GADGET_RENDER_ORDER)[number]),
        )
        .sort(
          (a, b) =>
            GADGET_RENDER_ORDER.indexOf(a.gadget_key as (typeof GADGET_RENDER_ORDER)[number]) -
            GADGET_RENDER_ORDER.indexOf(b.gadget_key as (typeof GADGET_RENDER_ORDER)[number]),
        ),
    [analytics?.dashboardGadgets],
  );

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Loading overview…</div>
      </AppLayout>
    );
  }

  if (!analytics) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-destructive">Overview data is unavailable right now.</div>
      </AppLayout>
    );
  }

  const canReview = roles.includes("pmc_reviewer") || roles.includes("admin") || roles.includes("superadmin");
  const displayName = user?.email?.split("@")[0] || analytics.consultants[0]?.name || "User";

  const renderGadget = (gadgetKey: string, gadgetId?: string) => {
    if (gadgetKey === "remaining_budget_by_project") {
      const rows = analytics.projectMetrics.slice().sort((a, b) => a.remaining - b.remaining).slice(0, 8);
      return (
        <GadgetShell
          title="Remaining Budget by Project"
          description="First gadget showing the lowest remaining budget projects in the visible PMC scope."
          onRemove={gadgetId ? () => removeGadgetMutation.mutate(gadgetId) : undefined}
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={160} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, _name, props) => {
                  const row = props.payload;
                  return [currency(value), `Remaining • Budget ${currency(row.budget)} • Actual ${currency(row.actual)} • Forecast ${currency(row.forecast)}`];
                }}
              />
              <Bar dataKey="remaining" radius={[0, 6, 6, 0]}>
                {rows.map((row) => (
                  <Cell
                    key={row.id}
                    fill={row.risk === "red" ? "hsl(var(--destructive))" : row.risk === "amber" ? "hsl(var(--warning))" : "hsl(var(--chart-2))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GadgetShell>
      );
    }

    if (gadgetKey === "actual_vs_forecast_baseline") {
      return (
        <GadgetShell
          title="Actual vs Forecast vs Baseline"
          description="Second gadget for month-level trend comparison across the current filters."
          onRemove={gadgetId ? () => removeGadgetMutation.mutate(gadgetId) : undefined}
        >
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
        </GadgetShell>
      );
    }

    return null;
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Welcome, {displayName}</h1>
            <p className="page-subtitle">Overview keeps the summary and task flow; Dashboard is now the gadget workspace for each user.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={showPreviousRevisions ? "default" : "outline"} size="sm" onClick={() => setShowPreviousRevisions((value) => !value)}>
              {showPreviousRevisions ? "Viewing all revisions" : "Latest revisions only"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/reports")}>Open Reports</Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard title="Total PMC Budget" value={currency(analytics.kpis.totalBudget)} hint="Current visible portfolio budget" icon={DollarSign} />
              <KpiCard title="Actual Billed to Date" value={currency(analytics.kpis.totalActualBilled)} hint="Invoices inside applied visibility" icon={CheckCircle2} />
              <KpiCard title="Forecast Cost" value={currency(analytics.kpis.totalForecastCost)} hint="Future months beyond the open period" icon={Clock3} />
              <KpiCard title="Remaining Budget" value={currency(analytics.kpis.remainingBudget)} hint="Budget minus billed actuals" icon={FolderKanban} />
              <KpiCard title="Forecast Remaining" value={currency(analytics.kpis.forecastRemaining)} hint="Budget minus forecast cost" icon={ShieldAlert} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
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

              <div className="grid grid-cols-1 gap-4">
                <KpiCard title="Variance to Baseline" value={currency(analytics.kpis.varianceToBaseline)} hint="Forecast against baseline" icon={GitCompareArrows} />
                <KpiCard title="Active Employees" value={compactNumber(analytics.kpis.activeEmployees)} hint="Active + mobilized headcount" icon={Users} />
                <KpiCard title="My Open Tasks" value={compactNumber(analytics.kpis.myOpenTasks)} hint="Drafts, returns, and reviews" icon={Briefcase} />
                <KpiCard title="Pending Reviews" value={compactNumber(analytics.kpis.pendingReviews)} hint="Reviewer queue from latest revisions" icon={Clock3} />
                <KpiCard title="Projects at Risk" value={compactNumber(analytics.kpis.projectsAtRisk)} hint={`Shared thresholds · amber ${analytics.amberThreshold}%`} icon={AlertTriangle} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
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
            </div>
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-6">
            <GlobalFiltersBar
              filters={filters}
              onChange={setFilters}
              monthOptions={analytics.filterOptions.monthOptions}
              consultantOptions={analytics.filterOptions.consultantOptions}
              projectOptions={analytics.filterOptions.projectOptions}
              soOptions={analytics.filterOptions.soOptions}
              poOptions={analytics.filterOptions.poOptions}
              positionOptions={analytics.filterOptions.positionOptions}
              visibleFilters={["month", "consultant"]}
              consultantLabel="PMC"
              title="Dashboard Filters"
              description="Only month and PMC stay global on the gadget dashboard."
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Add gadgets</CardTitle>
                <CardDescription>Each user can enable the gadgets allowed by the admin panel for their own dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {addableGadgets.map((gadget, index) => (
                  <Button
                    key={gadget.id}
                    variant="outline"
                    onClick={() => saveGadgetMutation.mutate({ gadgetId: gadget.id, enabled: true, positionY: enabledGadgets.length + index })}
                  >
                    <Plus size={14} className="mr-1.5" />{gadget.title}
                  </Button>
                ))}
                {addableGadgets.length === 0 ? <p className="text-sm text-muted-foreground">All available gadgets are already on your dashboard.</p> : null}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6">
              {enabledGadgets.map((gadget) => (
                <div key={gadget.id}>{renderGadget(gadget.gadget_key, gadget.id)}</div>
              ))}
              {enabledGadgets.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">No gadgets added yet</CardTitle>
                    <CardDescription>Use the add buttons above to build your dashboard.</CardDescription>
                  </CardHeader>
                </Card>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
