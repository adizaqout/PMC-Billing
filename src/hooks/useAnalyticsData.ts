import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsSourceData } from "@/lib/analytics-engine";

export function useAnalyticsData() {
  return useQuery<AnalyticsSourceData>({
    queryKey: ["analytics-data"],
    queryFn: async () => {
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
      ] = await Promise.all([
        supabase.from("period_control").select("month, status").eq("status", "open").maybeSingle(),
        supabase.from("app_settings").select("setting_key, setting_value"),
        supabase.from("profiles").select("full_name, consultant_id").maybeSingle(),
        supabase.from("consultants").select("id, name, status"),
        supabase.from("projects").select("id, project_name, latest_budget, latest_pmc_budget, previous_pmc_budget, previous_pmc_actual, actual_pmc_to_date, portfolio, status"),
        supabase.from("employees").select("id, employee_name, consultant_id, position_id, status"),
        supabase.from("positions").select("id, position_name, consultant_id, so_id"),
        supabase.from("service_orders").select("id, so_number, consultant_id, so_value"),
        supabase.from("purchase_orders").select("id, po_number, consultant_id, so_id, project_id, po_value, amount"),
        supabase.from("invoices").select("id, consultant_id, po_id, billed_amount_no_vat, invoice_month, status, invoice_number"),
        supabase.from("deployment_submissions").select("id, consultant_id, month, schedule_type, revision_no, status, created_at, updated_at, submitted_on, reviewed_on"),
        supabase.from("deployment_lines").select("id, submission_id, employee_id, worked_project_id, billed_project_id, so_id, po_id, allocation_pct, derived_cost, derived_monthly_rate, man_months, rate_year"),
        supabase.from("report_catalog").select("*"),
        supabase.from("group_report_visibility").select("*"),
        supabase.from("group_feature_toggles").select("*"),
        supabase.from("saved_insights").select("*"),
      ]);

      if (periodRes.error) throw periodRes.error;
      if (settingsRes.error) throw settingsRes.error;
      if (profileRes.error) throw profileRes.error;
      if (consultantsRes.error) throw consultantsRes.error;
      if (projectsRes.error) throw projectsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (positionsRes.error) throw positionsRes.error;
      if (serviceOrdersRes.error) throw serviceOrdersRes.error;
      if (purchaseOrdersRes.error) throw purchaseOrdersRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (submissionsRes.error) throw submissionsRes.error;
      if (linesRes.error) throw linesRes.error;
      if (reportCatalogRes.error) throw reportCatalogRes.error;
      if (reportVisibilityRes.error) throw reportVisibilityRes.error;
      if (featureToggleRes.error) throw featureToggleRes.error;
      if (savedInsightsRes.error) throw savedInsightsRes.error;

      return {
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
        submissions: submissionsRes.data || [],
        lines: linesRes.data || [],
        reportCatalog: reportCatalogRes.data || [],
        reportVisibility: reportVisibilityRes.data || [],
        featureToggles: featureToggleRes.data || [],
        savedInsights: savedInsightsRes.data || [],
      };
    },
  });
}
