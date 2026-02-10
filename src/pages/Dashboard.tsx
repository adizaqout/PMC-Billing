import {
  CalendarCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import StatusBadge from "@/components/StatusBadge";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const kpis = [
  { label: "Billed YTD", value: "AED 12.4M", change: "+8.2%", color: "kpi-blue", icon: TrendingUp },
  { label: "Forecast (3M)", value: "AED 4.1M", change: "+3.5%", color: "kpi-green", icon: CalendarCheck },
  { label: "PO Remaining", value: "AED 6.8M", change: "-12%", color: "kpi-amber", icon: AlertTriangle },
  { label: "Approved Submissions", value: "24 / 31", change: "77%", color: "kpi-blue", icon: CheckCircle2 },
];

const tasks = [
  { id: 1, title: "Review Baseline Deployment – Jan 2025", type: "Review", consultant: "WSP", status: "Submitted", dueDate: "2025-02-15" },
  { id: 2, title: "Fix & Resubmit Forecast – Feb 2025", type: "Revision", consultant: "AECOM", status: "Returned", dueDate: "2025-02-12" },
  { id: 3, title: "Approve Actual Deployment – Dec 2024", type: "Approval", consultant: "Mace", status: "In Review", dueDate: "2025-02-10" },
  { id: 4, title: "New update approved – Mace Q4", type: "Info", consultant: "Mace", status: "Approved", dueDate: "2025-02-08" },
];

const trendData = [
  { month: "Sep", actual: 1200, forecast: 1100 },
  { month: "Oct", actual: 1350, forecast: 1250 },
  { month: "Nov", actual: 1280, forecast: 1400 },
  { month: "Dec", actual: 1520, forecast: 1450 },
  { month: "Jan", actual: 1680, forecast: 1600 },
  { month: "Feb", actual: null, forecast: 1550 },
  { month: "Mar", actual: null, forecast: 1700 },
];

const projectData = [
  { name: "Saadiyat HQ", billed: 2400 },
  { name: "Yas Mall Exp.", billed: 1800 },
  { name: "Al Raha Ph.3", billed: 1600 },
  { name: "Marina Tower", billed: 1200 },
  { name: "Central Park", billed: 950 },
];

const submissions = [
  { consultant: "WSP", baseline: "Approved", actual: "Submitted", forecast: "Draft", workload: "Draft" },
  { consultant: "AECOM", baseline: "Approved", actual: "Approved", forecast: "Returned", workload: "Submitted" },
  { consultant: "Mace", baseline: "Approved", actual: "In Review", forecast: "Draft", workload: "Draft" },
  { consultant: "Faithful+Gould", baseline: "Approved", actual: "Approved", forecast: "Approved", workload: "Approved" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Welcome, {displayName}</h1>
            <p className="page-subtitle">PMC Billing & Deployment Control Overview</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-success/10 border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-xs font-medium text-success">Open Period: Jan 2025</span>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="kpi-card">
              <div className="flex items-center justify-between">
                <span className="kpi-label">{kpi.label}</span>
                <kpi.icon size={16} className="text-muted-foreground" />
              </div>
              <span className="kpi-value">{kpi.value}</span>
              <span className="text-xs text-muted-foreground">{kpi.change} from last period</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Tasks */}
          <div className="lg:col-span-1 bg-card rounded-md border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">My Tasks</h2>
              <span className="text-xs text-muted-foreground">{tasks.length} pending</span>
            </div>
            <div className="divide-y">
              {tasks.map((task) => (
                <div key={task.id} className="px-4 py-3 flex flex-col gap-1 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium leading-tight">{task.title}</span>
                    <ArrowRight size={14} className="text-muted-foreground shrink-0 ml-2" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{task.consultant}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <StatusBadge status={task.status} />
                    <span className="text-xs text-muted-foreground ml-auto">{task.dueDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trend Chart */}
          <div className="lg:col-span-2 bg-card rounded-md border p-4">
            <h2 className="text-sm font-semibold mb-4">Actual vs Forecast Trend (AED '000s)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="actual" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} name="Actual" />
                <Line type="monotone" dataKey="forecast" stroke="hsl(var(--chart-2))" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} name="Forecast" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Projects */}
          <div className="bg-card rounded-md border p-4">
            <h2 className="text-sm font-semibold mb-4">Top Projects by Billed Amount (AED '000s)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={projectData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="billed" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Submission Status */}
          <div className="bg-card rounded-md border">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Submission Status by Consultant</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header text-left px-4 py-2">Consultant</th>
                    <th className="data-table-header text-center px-3 py-2">Baseline</th>
                    <th className="data-table-header text-center px-3 py-2">Actual</th>
                    <th className="data-table-header text-center px-3 py-2">Forecast</th>
                    <th className="data-table-header text-center px-3 py-2">Workload</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((row) => (
                    <tr key={row.consultant} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5 font-medium">{row.consultant}</td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={row.baseline} /></td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={row.actual} /></td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={row.forecast} /></td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={row.workload} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
