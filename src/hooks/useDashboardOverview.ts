import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OverviewKpis {
  totalBudget: number;
  totalActualBilled: number;
  totalForecastCost: number;
  totalBaselineCost: number;
  remainingBudget: number;
  forecastRemaining: number;
  varianceToBaseline: number;
  activeEmployees: number;
  activePmc: number;
  activeSupervision: number;
  deployedProjects: number;
  deployedOffice: number;
  myOpenTasks: number;
  pendingReviews: number;
  projectsAtRisk: number;
}

export interface OverviewProjectMetric {
  id: string;
  name: string;
  budget: number;
  actual: number;
  forecast: number;
  remaining: number;
  risk: "red" | "amber" | "green";
}

export interface OverviewTaskRow {
  id: string;
  type: string;
  month: string;
  consultant: string | null;
  status: string;
  dueDate: string | null;
}

export interface OverviewReviewItem {
  id: string;
  company: string | null;
  month: string;
  scheduleType: string;
}

export interface DashboardOverview {
  openMonth: string;
  amberThreshold: number;
  profile: { full_name: string | null; consultant_id: string | null } | null;
  kpis: OverviewKpis;
  statusCounts: Array<{ name: string; value: number }>;
  monthlyTrend: Array<{ month: string; actual: number; forecast: number; baseline: number }>;
  projectMetrics: OverviewProjectMetric[];
  taskRows: OverviewTaskRow[];
  reviewQueue: OverviewReviewItem[];
  workforceByConsultant: Array<{ name: string; count: number }>;
}

export function useDashboardOverview() {
  return useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview"],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_overview" as any);
      if (error) throw error;
      return data as unknown as DashboardOverview;
    },
  });
}
