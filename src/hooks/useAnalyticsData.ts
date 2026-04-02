import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsSourceData, DeploymentLineRow, SubmissionRow } from "@/lib/analytics-engine";

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(queryBuilder: any): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export function useAnalyticsData() {
  return useQuery<AnalyticsSourceData>({
    queryKey: ["analytics-data"],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) {
        throw new Error("Authentication required to load dashboard data.");
      }

      const [
        periodRes,
        settingsRes,
        profileRes,
        consultantsRes,
        projectsRes,
        employeesRes,
        positionsRes,
        serviceOrdersRes,
        purchaseOrdersRes,
        invoicesRes,
        submissionsRes,
        linesRes,
        reportCatalogRes,
        reportVisibilityRes,
        featureToggleRes,
        savedInsightsRes,
        dashboardGadgetsRes,
        gadgetVisibilityRes,
        userDashboardGadgetsRes,
      ] = await Promise.all([
        supabase.from("period_control").select("month, status").eq("status", "open").maybeSingle(),
        supabase.from("app_settings").select("setting_key, setting_value"),
        supabase.from("profiles").select("full_name, consultant_id").eq("user_id", userId).maybeSingle(),
        supabase.from("consultants").select("id, name, short_name, status"),
        supabase.from("projects").select("id, project_name, latest_budget, latest_pmc_budget, previous_pmc_budget, previous_pmc_actual, actual_pmc_to_date, portfolio, status"),
        supabase.from("employees").select("id, employee_name, consultant_id, position_id, status, active"),
        supabase.from("positions").select("id, position_name, consultant_id, so_id, year_1_rate, year_2_rate, year_3_rate, year_4_rate, year_5_rate, function"),
        supabase.from("service_orders").select("id, so_number, consultant_id, so_value"),
        supabase.from("purchase_orders").select("id, po_number, consultant_id, so_id, project_id, po_value, amount, revision_number"),
        supabase.from("invoices").select("id, consultant_id, po_id, billed_amount_no_vat, invoice_month, status, invoice_number"),
        fetchAllRows<SubmissionRow>(supabase.from("deployment_submissions").select("id, consultant_id, month, schedule_type, revision_no, status, created_at, updated_at, submitted_on, reviewed_on")),
        fetchAllRows<DeploymentLineRow>(supabase.from("deployment_lines").select("id, submission_id, employee_id, worked_project_id, billed_project_id, so_id, po_id, allocation_pct, derived_cost, derived_monthly_rate, man_months, rate_year, notes")),
        supabase.from("report_catalog").select("*"),
        supabase.from("group_report_visibility").select("*"),
        supabase.from("group_feature_toggles").select("*"),
        supabase.from("saved_insights").select("*"),
        supabase.from("dashboard_gadgets").select("*").order("sort_order"),
        supabase.from("group_dashboard_gadget_visibility").select("*"),
        supabase.from("user_dashboard_gadgets").select("*").eq("user_id", userId),
      ]);

      if (periodRes.error) throw periodRes.error;
      if (profileRes.error) throw profileRes.error;
      if (consultantsRes.error) throw consultantsRes.error;
      if (projectsRes.error) throw projectsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (positionsRes.error) throw positionsRes.error;
      if (serviceOrdersRes.error) throw serviceOrdersRes.error;
      if (purchaseOrdersRes.error) throw purchaseOrdersRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (reportCatalogRes.error) throw reportCatalogRes.error;
      if (dashboardGadgetsRes.error) throw dashboardGadgetsRes.error;
      if (gadgetVisibilityRes.error) throw gadgetVisibilityRes.error;
      if (userDashboardGadgetsRes.error) throw userDashboardGadgetsRes.error;

      if (settingsRes.error) console.warn("Analytics settings unavailable, using defaults.", settingsRes.error.message);
      if (reportVisibilityRes.error) console.warn("Report visibility unavailable, falling back to catalog defaults.", reportVisibilityRes.error.message);
      if (featureToggleRes.error) console.warn("Feature toggles unavailable in analytics payload.", featureToggleRes.error.message);
      if (savedInsightsRes.error) console.warn("Saved insights unavailable in analytics payload.", savedInsightsRes.error.message);

      const analyticsData: AnalyticsSourceData = {
        openPeriod: periodRes.data,
        settings: settingsRes.data || [],
        profile: profileRes.data,
        consultants: consultantsRes.data || [],
        projects: projectsRes.data || [],
        employees: employeesRes.data || [],
        positions: positionsRes.data || [],
        serviceOrders: serviceOrdersRes.data || [],
        purchaseOrders: purchaseOrdersRes.data || [],
        invoices: invoicesRes.data || [],
        submissions: submissionsRes,
        lines: linesRes,
        reportCatalog: reportCatalogRes.data || [],
        reportVisibility: reportVisibilityRes.data || [],
        featureToggles: featureToggleRes.data || [],
        savedInsights: savedInsightsRes.data || [],
        dashboardGadgets: dashboardGadgetsRes.data || [],
        dashboardGadgetVisibility: gadgetVisibilityRes.data || [],
        userDashboardGadgets: userDashboardGadgetsRes.data || [],
      };

      return analyticsData;
    },
  });
}

