import type { Json, Tables } from "@/integrations/supabase/types";
import {
  ALL_FILTER_VALUE,
  compareMonth,
  computeRiskStatus,
  formatMonthLabel,
  getLatestSubmissionIds,
  type AnalyticsFilters,
} from "@/lib/analytics";

export type AppSettingRow = Pick<Tables<"app_settings">, "setting_key" | "setting_value">;
export type ProfileSummary = Pick<Tables<"profiles">, "full_name" | "consultant_id"> | null;
export type ConsultantRow = Pick<Tables<"consultants">, "id" | "name" | "status">;
export type ProjectRow = Pick<Tables<"projects">, "id" | "project_name" | "latest_budget" | "latest_pmc_budget" | "previous_pmc_budget" | "previous_pmc_actual" | "actual_pmc_to_date" | "portfolio" | "status">;
export type EmployeeRow = Pick<Tables<"employees">, "id" | "employee_name" | "consultant_id" | "position_id" | "status">;
export type PositionRow = Pick<Tables<"positions">, "id" | "position_name" | "consultant_id" | "so_id">;
export type ServiceOrderRow = Pick<Tables<"service_orders">, "id" | "so_number" | "consultant_id" | "so_value">;
export type PurchaseOrderRow = Pick<Tables<"purchase_orders">, "id" | "po_number" | "consultant_id" | "so_id" | "project_id" | "po_value" | "amount"> & { revision_number?: number | null };
export type InvoiceRow = Pick<Tables<"invoices">, "id" | "consultant_id" | "po_id" | "billed_amount_no_vat" | "invoice_month" | "status" | "invoice_number">;
export type SubmissionRow = Pick<Tables<"deployment_submissions">, "id" | "consultant_id" | "month" | "schedule_type" | "revision_no" | "status" | "created_at" | "updated_at" | "submitted_on" | "reviewed_on">;
export type DeploymentLineRow = Pick<Tables<"deployment_lines">, "id" | "submission_id" | "employee_id" | "worked_project_id" | "billed_project_id" | "so_id" | "po_id" | "allocation_pct" | "derived_cost" | "derived_monthly_rate" | "man_months" | "rate_year">;
export type ReportCatalogRow = Tables<"report_catalog">;
export type ReportVisibilityRow = Tables<"group_report_visibility">;
export type FeatureToggleRow = Tables<"group_feature_toggles">;
export type SavedInsightRow = Tables<"saved_insights">;
type DashboardGadgetRow = {
  id: string;
  gadget_key: string;
  title: string;
  description: string | null;
  gadget_type: string;
  is_active: boolean;
  default_width: number;
  default_height: number;
  sort_order: number;
  config: Record<string, unknown>;
};
type DashboardGadgetVisibilityRow = {
  id: string;
  group_id: string;
  gadget_id: string;
  is_visible: boolean;
};
type UserDashboardGadgetRow = {
  id: string;
  user_id: string;
  gadget_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  is_enabled: boolean;
  settings: Record<string, unknown>;
};
export type PeriodRow = Pick<Tables<"period_control">, "month" | "status"> | null;

export interface AnalyticsSourceData {
  openPeriod: PeriodRow;
  settings: AppSettingRow[];
  profile: ProfileSummary;
  consultants: ConsultantRow[];
  projects: ProjectRow[];
  employees: EmployeeRow[];
  positions: PositionRow[];
  serviceOrders: ServiceOrderRow[];
  purchaseOrders: PurchaseOrderRow[];
  invoices: InvoiceRow[];
  submissions: SubmissionRow[];
  lines: DeploymentLineRow[];
  reportCatalog: ReportCatalogRow[];
  reportVisibility: ReportVisibilityRow[];
  featureToggles: FeatureToggleRow[];
  savedInsights: SavedInsightRow[];
  dashboardGadgets: DashboardGadgetRow[];
  dashboardGadgetVisibility: DashboardGadgetVisibilityRow[];
  userDashboardGadgets: UserDashboardGadgetRow[];
}

export interface AnalyticsModel {
  openMonth: string;
  months: string[];
  appliedFilters: AnalyticsFilters;
  consultants: ConsultantRow[];
  projects: ProjectRow[];
  serviceOrders: ServiceOrderRow[];
  purchaseOrders: PurchaseOrderRow[];
  positions: PositionRow[];
  settingsMap: Map<string, unknown>;
  amberThreshold: number;
  redThreshold: number;
  filteredSubmissions: SubmissionRow[];
  filteredLines: DeploymentLineRow[];
  filteredInvoices: InvoiceRow[];
  latestSubmissionIds: Set<string>;
  reportCatalog: ReportCatalogRow[];
  reportVisibility: ReportVisibilityRow[];
  featureToggles: FeatureToggleRow[];
  savedInsights: SavedInsightRow[];
  kpis: {
    totalBudget: number;
    totalActualBilled: number;
    totalForecastCost: number;
    totalBaselineCost: number;
    remainingBudget: number;
    forecastRemaining: number;
    varianceToBaseline: number;
    activeEmployees: number;
    myOpenTasks: number;
    pendingReviews: number;
    projectsAtRisk: number;
  };
  monthlyTrend: Array<{ month: string; actual: number; forecast: number; baseline: number }>;
  statusCounts: Array<{ name: string; value: number }>;
  projectMetrics: Array<{
    id: string;
    name: string;
    budget: number;
    actual: number;
    forecast: number;
    remaining: number;
    remainingPct: number;
    risk: "green" | "amber" | "red";
  }>;
  portfolio: Array<{ name: string; budget: number; actual: number; forecast: number; remaining: number }>;
  burnTrend: Array<{ month: string; actual: number; forecast: number }>;
  commercial: Array<{ so: string; soValue: number; poValue: number; invoiced: number; remaining: number; variance: number }>;
  heatmap: Array<{ position: string; project: string; value: number }>;
  employeeDeployment: Array<{ employee: string; project: string; allocation: number }>;
  workflowAudit: Array<{ month: string; submitted: number; returned: number; inReview: number; avgReviewDays: number }>;
  crossBilling: Array<{ id: string; employee: string; workedProject: string; billedProject: string; company: string; amount: number }>;
  overAllocation: Array<{ employee: string; month: string; allocation: number }>;
  taskRows: Array<{ id: string; type: string; month: string; project: string | null; status: string; dueDate: string | null }>;
  reviewQueue: Array<{ id: string; company: string; month: string; scheduleType: string }>;
  recentActivity: Array<{ id: string; label: string; status: string; timestamp: string }>;
  filterOptions: {
    monthOptions: Array<{ value: string; label: string }>;
    consultantOptions: Array<{ value: string; label: string }>;
    projectOptions: Array<{ value: string; label: string }>;
    soOptions: Array<{ value: string; label: string }>;
    poOptions: Array<{ value: string; label: string }>;
    positionOptions: Array<{ value: string; label: string }>;
  };
  dashboardGadgets: Array<DashboardGadgetRow & {
    isVisible: boolean;
    isEnabled: boolean;
    width: number;
    height: number;
    positionY: number;
    settings: Record<string, unknown>;
  }>;
  aiContext: {
    summary: {
      openMonth: string;
      filters: AnalyticsFilters;
      thresholds: { amberPct: number; redPct: number };
      totals: AnalyticsModel["kpis"];
    };
    projects: Array<{ name: string; budget: number; actual: number; forecast: number; remaining: number; risk: string }>;
    monthlyTrend: AnalyticsModel["monthlyTrend"];
    workflowAudit: AnalyticsModel["workflowAudit"];
    commercial: AnalyticsModel["commercial"];
    crossBilling: AnalyticsModel["crossBilling"];
    savedInsights: Array<{ id: string; title: string; summary_markdown: string | null; insight_type: string; is_pinned_to_dashboard: boolean }>;
  };
}

function numeric(value: unknown) {
  return Number(value || 0);
}

function incrementMap(map: Map<string, number>, key: string | null | undefined, amount: number) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

export function buildAnalyticsModel(
  data: AnalyticsSourceData,
  filters: AnalyticsFilters,
  includePreviousRevisions = false,
): AnalyticsModel {
  const openMonth = data.openPeriod?.month || ALL_FILTER_VALUE;
  const appliedFilters = {
    ...filters,
    month: filters.month === ALL_FILTER_VALUE ? openMonth : filters.month,
  };

  const settingsMap = new Map(data.settings.map((row) => [row.setting_key, row.setting_value]));
  const riskThresholds = settingsMap.get("risk_thresholds");
  const amberThreshold = typeof riskThresholds === "object" && riskThresholds && "amber_pct" in riskThresholds
    ? Number((riskThresholds as { amber_pct?: number }).amber_pct || 10)
    : 10;
  const redThreshold = typeof riskThresholds === "object" && riskThresholds && "red_pct" in riskThresholds
    ? Number((riskThresholds as { red_pct?: number }).red_pct || 0)
    : 0;

  const latestSubmissionIds = getLatestSubmissionIds(data.submissions, includePreviousRevisions);

  const consultantNameById = new Map(data.consultants.map((consultant) => [consultant.id, consultant.name]));
  const projectNameById = new Map(data.projects.map((project) => [project.id, project.project_name]));
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]));
  const employeeNameById = new Map(data.employees.map((employee) => [employee.id, employee.employee_name]));
  const positionNameById = new Map(data.positions.map((position) => [position.id, position.position_name]));
  const purchaseOrderById = new Map(data.purchaseOrders.map((po) => [po.id, po]));

  const filteredSubmissions = data.submissions.filter((submission) => {
    if (!latestSubmissionIds.has(submission.id)) return false;
    if (appliedFilters.month !== ALL_FILTER_VALUE && submission.month !== appliedFilters.month) return false;
    if (appliedFilters.consultantId !== ALL_FILTER_VALUE && submission.consultant_id !== appliedFilters.consultantId) return false;
    if (appliedFilters.submissionStatus !== ALL_FILTER_VALUE && submission.status !== appliedFilters.submissionStatus) return false;
    if (appliedFilters.scenario !== ALL_FILTER_VALUE && submission.schedule_type !== appliedFilters.scenario) return false;
    return true;
  });

  const submissionById = new Map(filteredSubmissions.map((submission) => [submission.id, submission]));
  const submissionIds = new Set(filteredSubmissions.map((submission) => submission.id));

  const poNumberById = new Map(data.purchaseOrders.map((po) => [po.id, po.po_number]));

  const filteredLines = data.lines.filter((line) => {
    if (!submissionIds.has(line.submission_id)) return false;
    if (appliedFilters.projectId !== ALL_FILTER_VALUE && line.billed_project_id !== appliedFilters.projectId && line.worked_project_id !== appliedFilters.projectId) return false;
    if (appliedFilters.soId !== ALL_FILTER_VALUE && line.so_id !== appliedFilters.soId) return false;
    if (appliedFilters.poId !== ALL_FILTER_VALUE && poNumberById.get(line.po_id || "") !== appliedFilters.poId) return false;
    if (appliedFilters.positionId !== ALL_FILTER_VALUE) {
      const employee = line.employee_id ? employeeById.get(line.employee_id) : null;
      if (!employee || employee.position_id !== appliedFilters.positionId) return false;
    }
    return true;
  });

  const poNumberById = new Map(data.purchaseOrders.map((po) => [po.id, po.po_number]));

  const filteredInvoices = data.invoices.filter((invoice) => {
    if (appliedFilters.consultantId !== ALL_FILTER_VALUE && invoice.consultant_id !== appliedFilters.consultantId) return false;
    if (appliedFilters.month !== ALL_FILTER_VALUE && invoice.invoice_month !== appliedFilters.month) return false;
    if (appliedFilters.poId !== ALL_FILTER_VALUE && poNumberById.get(invoice.po_id || "") !== appliedFilters.poId) return false;
    return true;
  });

  const months = Array.from(new Set(filteredSubmissions.map((submission) => submission.month))).sort(compareMonth);
  const lineProjectBySubmission = new Map<string, string | null>();
  const linesBySubmission = new Map<string, DeploymentLineRow[]>();
  const lineCostBySubmission = new Map<string, number>();
  const actualCostByMonth = new Map<string, number>();
  const forecastCostByMonth = new Map<string, number>();
  const baselineCostByMonth = new Map<string, number>();
  const forecastCostByProject = new Map<string, number>();
  const deploymentCostBySo = new Map<string, number>();
  const overAllocationMap = new Map<string, { employee: string; month: string; allocation: number }>();
  const crossBilling: AnalyticsModel["crossBilling"] = [];
  const heatmap: AnalyticsModel["heatmap"] = [];
  const employeeDeployment: AnalyticsModel["employeeDeployment"] = [];

  for (const line of filteredLines) {
    const submission = submissionById.get(line.submission_id);
    if (!submission) continue;

    const lineCost = numeric(line.derived_cost);
    const lineValue = numeric(line.derived_cost || line.allocation_pct);
    const employee = line.employee_id ? employeeById.get(line.employee_id) : null;

    const existingLines = linesBySubmission.get(line.submission_id);
    if (existingLines) {
      existingLines.push(line);
    } else {
      linesBySubmission.set(line.submission_id, [line]);
    }

    if (!lineProjectBySubmission.has(line.submission_id) && line.billed_project_id) {
      lineProjectBySubmission.set(line.submission_id, line.billed_project_id);
    }

    lineCostBySubmission.set(line.submission_id, (lineCostBySubmission.get(line.submission_id) || 0) + lineCost);

    if (submission.schedule_type === "actual") incrementMap(actualCostByMonth, submission.month, lineCost);
    if (submission.schedule_type === "forecast") {
      incrementMap(forecastCostByMonth, submission.month, lineCost);
      if (submission.month > openMonth) incrementMap(forecastCostByProject, line.billed_project_id, lineCost);
    }
    if (submission.schedule_type === "baseline") incrementMap(baselineCostByMonth, submission.month, lineCost);
    incrementMap(deploymentCostBySo, line.so_id, lineCost);

    if (line.worked_project_id && line.billed_project_id && line.worked_project_id !== line.billed_project_id) {
      crossBilling.push({
        id: line.id,
        employee: employeeNameById.get(line.employee_id || "") || "Unassigned",
        workedProject: projectNameById.get(line.worked_project_id) || "—",
        billedProject: projectNameById.get(line.billed_project_id) || "—",
        company: consultantNameById.get(submission.consultant_id || employee?.consultant_id || "") || "Unknown",
        amount: lineCost,
      });
    }

    if (line.employee_id) {
      const allocationKey = `${submission.month}|${line.employee_id}`;
      const current = overAllocationMap.get(allocationKey) || {
        employee: employeeNameById.get(line.employee_id) || "Unassigned",
        month: submission.month,
        allocation: 0,
      };
      current.allocation += numeric(line.allocation_pct);
      overAllocationMap.set(allocationKey, current);
    }

    heatmap.push({
      position: positionNameById.get(employee?.position_id || "") || "Unassigned",
      project: projectNameById.get(line.billed_project_id || line.worked_project_id || "") || "Unassigned",
      value: lineValue,
    });

    const allocation = numeric(line.allocation_pct);
    if (allocation > 0) {
      employeeDeployment.push({
        employee: employeeNameById.get(line.employee_id || "") || "Unassigned",
        project: projectNameById.get(line.billed_project_id || "") || "Unassigned",
        allocation,
      });
    }
  }

  const actualByProject = new Map<string, number>();
  for (const invoice of filteredInvoices) {
    const po = invoice.po_id ? purchaseOrderById.get(invoice.po_id) : null;
    incrementMap(actualByProject, po?.project_id, numeric(invoice.billed_amount_no_vat));
  }

  const totalActualBilled = filteredInvoices.reduce((sum, invoice) => sum + numeric(invoice.billed_amount_no_vat), 0);
  const totalForecastCost = filteredSubmissions
    .filter((submission) => submission.schedule_type === "forecast" && submission.month > openMonth)
    .reduce((sum, submission) => sum + (lineCostBySubmission.get(submission.id) || 0), 0);
  const totalBaselineCost = filteredSubmissions
    .filter((submission) => submission.schedule_type === "baseline")
    .reduce((sum, submission) => sum + (lineCostBySubmission.get(submission.id) || 0), 0);
  const totalBudget = data.projects.reduce((sum, project) => sum + numeric(project.latest_pmc_budget || project.latest_budget), 0);
  const remainingBudget = totalBudget - totalActualBilled;
  const forecastRemaining = totalBudget - totalForecastCost;
  const varianceToBaseline = totalForecastCost - totalBaselineCost;
  const activeEmployees = data.employees.filter((employee) => employee.status === "active").length;
  const myOpenTasks = filteredSubmissions.filter((submission) => ["draft", "returned", "submitted", "in_review"].includes(submission.status)).length;
  const pendingReviews = filteredSubmissions.filter((submission) => submission.status === "submitted").length;

  const projectMetrics = data.projects
    .map((project) => {
      const actual = actualByProject.get(project.id) || 0;
      const forecast = forecastCostByProject.get(project.id) || 0;
      const budget = numeric(project.latest_pmc_budget || project.latest_budget);
      const remaining = budget - actual;
      const remainingPct = budget > 0 ? (remaining / budget) * 100 : 0;
      const risk = computeRiskStatus(budget, actual, forecast, amberThreshold);
      return {
        id: project.id,
        name: project.project_name,
        budget,
        actual,
        forecast,
        remaining,
        remainingPct,
        risk,
      };
    })
    .filter((project) => project.budget > 0 || project.actual > 0 || project.forecast > 0);

  const projectsAtRisk = projectMetrics.filter((project) => project.risk !== "green").length;

  const monthlyTrend = months.map((month) => ({
    month: formatMonthLabel(month),
    actual: actualCostByMonth.get(month) || 0,
    forecast: forecastCostByMonth.get(month) || 0,
    baseline: baselineCostByMonth.get(month) || 0,
  }));

  const statusCounts = ["draft", "submitted", "in_review", "approved", "returned", "rejected"].map((status) => ({
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
      project: lineProjectBySubmission.get(submission.id) || null,
      status: submission.status,
      dueDate: submission.reviewed_on || submission.submitted_on || submission.updated_at,
    }));

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

  const overAllocation = Array.from(overAllocationMap.values()).filter((row) => row.allocation > 100).slice(0, 8);

  const portfolio = projectMetrics.map((project) => ({
    name: project.name,
    budget: project.budget,
    actual: project.actual,
    forecast: project.forecast,
    remaining: project.remaining,
  }));

  const burnTrend = months.map((month) => ({
    month: formatMonthLabel(month),
    actual: actualCostByMonth.get(month) || 0,
    forecast: forecastCostByMonth.get(month) || 0,
  }));

  const purchaseOrdersBySo = new Map<string, PurchaseOrderRow[]>();
  for (const po of data.purchaseOrders) {
    if (!po.so_id) continue;
    const rows = purchaseOrdersBySo.get(po.so_id);
    if (rows) {
      rows.push(po);
    } else {
      purchaseOrdersBySo.set(po.so_id, [po]);
    }
  }

  const commercial = data.serviceOrders
    .map((so) => {
      const pos = purchaseOrdersBySo.get(so.id) || [];
      const poValue = pos.reduce((sum, po) => sum + numeric(po.po_value || po.amount), 0);
      const poIds = new Set(pos.map((po) => po.id));
      const invoiced = filteredInvoices.reduce((sum, invoice) => sum + (invoice.po_id && poIds.has(invoice.po_id) ? numeric(invoice.billed_amount_no_vat) : 0), 0);
      const deploymentCost = deploymentCostBySo.get(so.id) || 0;
      return {
        so: so.so_number,
        soValue: numeric(so.so_value),
        poValue,
        invoiced,
        remaining: poValue - invoiced,
        variance: invoiced - deploymentCost,
      };
    })
    .filter((row) => row.soValue || row.poValue || row.invoiced);

  const workflowAudit = months.map((month) => {
    const monthSubmissions = filteredSubmissions.filter((submission) => submission.month === month);
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

  const uniquePurchaseOrders = Array.from(
    data.purchaseOrders.reduce((map, po) => {
      if (!map.has(po.po_number)) map.set(po.po_number, po);
      return map;
    }, new Map<string, PurchaseOrderRow>()).values(),
  ).sort((a, b) => a.po_number.localeCompare(b.po_number));

  const filterOptions = {
    monthOptions: [
      { value: ALL_FILTER_VALUE, label: `Open period · ${formatMonthLabel(openMonth)}` },
      ...months.map((month) => ({ value: month, label: formatMonthLabel(month) })),
    ],
    consultantOptions: [{ value: ALL_FILTER_VALUE, label: "All companies" }, ...data.consultants.map((consultant) => ({ value: consultant.id, label: consultant.name }))],
    projectOptions: [{ value: ALL_FILTER_VALUE, label: "All projects" }, ...data.projects.map((project) => ({ value: project.id, label: project.project_name }))],
    soOptions: [{ value: ALL_FILTER_VALUE, label: "All SOs" }, ...data.serviceOrders.map((so) => ({ value: so.id, label: so.so_number }))],
    poOptions: [{ value: ALL_FILTER_VALUE, label: "All POs" }, ...uniquePurchaseOrders.map((po) => ({ value: po.po_number, label: po.po_number }))],
    positionOptions: [{ value: ALL_FILTER_VALUE, label: "All positions" }, ...data.positions.map((position) => ({ value: position.id, label: position.position_name }))],
  };

  const visibleGadgetIds = new Set(
    data.dashboardGadgetVisibility.filter((row) => row.is_visible).map((row) => row.gadget_id),
  );
  const userGadgetById = new Map(data.userDashboardGadgets.map((row) => [row.gadget_id, row]));
  const dashboardGadgets = data.dashboardGadgets
    .filter((gadget) => gadget.is_active && (visibleGadgetIds.size === 0 || visibleGadgetIds.has(gadget.id)))
    .map((gadget, index) => {
      const userConfig = userGadgetById.get(gadget.id);
      return {
        ...gadget,
        isVisible: true,
        isEnabled: userConfig?.is_enabled ?? false,
        width: userConfig?.width ?? gadget.default_width,
        height: userConfig?.height ?? gadget.default_height,
        positionY: userConfig?.position_y ?? index,
        settings: userConfig?.settings ?? {},
      };
    })
    .sort((a, b) => a.positionY - b.positionY || a.sort_order - b.sort_order);

  const aiContext = {
    summary: {
      openMonth,
      filters: appliedFilters,
      thresholds: { amberPct: amberThreshold, redPct: redThreshold },
      totals: {
        totalBudget,
        totalActualBilled,
        totalForecastCost,
        totalBaselineCost,
        remainingBudget,
        forecastRemaining,
        varianceToBaseline,
        activeEmployees,
        myOpenTasks,
        pendingReviews,
        projectsAtRisk,
      },
    },
    projects: projectMetrics.slice(0, 20).map((project) => ({
      name: project.name,
      budget: project.budget,
      actual: project.actual,
      forecast: project.forecast,
      remaining: project.remaining,
      risk: project.risk,
    })),
    monthlyTrend,
    workflowAudit,
    commercial: commercial.slice(0, 20),
    crossBilling: crossBilling.slice(0, 20),
    savedInsights: data.savedInsights.map((insight) => ({
      id: insight.id,
      title: insight.title,
      summary_markdown: insight.summary_markdown,
      insight_type: insight.insight_type,
      is_pinned_to_dashboard: insight.is_pinned_to_dashboard,
    })),
  };

  return {
    openMonth,
    months,
    appliedFilters,
    consultants: data.consultants,
    projects: data.projects,
    serviceOrders: data.serviceOrders,
    purchaseOrders: data.purchaseOrders,
    positions: data.positions,
    settingsMap,
    amberThreshold,
    redThreshold,
    filteredSubmissions,
    filteredLines,
    filteredInvoices,
    latestSubmissionIds,
    reportCatalog: data.reportCatalog,
    reportVisibility: data.reportVisibility,
    featureToggles: data.featureToggles,
    savedInsights: data.savedInsights,
    kpis: {
      totalBudget,
      totalActualBilled,
      totalForecastCost,
      totalBaselineCost,
      remainingBudget,
      forecastRemaining,
      varianceToBaseline,
      activeEmployees,
      myOpenTasks,
      pendingReviews,
      projectsAtRisk,
    },
    monthlyTrend,
    statusCounts,
    projectMetrics,
    portfolio,
    burnTrend,
    commercial,
    heatmap,
    employeeDeployment,
    workflowAudit,
    crossBilling,
    overAllocation,
    taskRows,
    reviewQueue,
    recentActivity,
    filterOptions,
    dashboardGadgets,
    aiContext,
  };
}
