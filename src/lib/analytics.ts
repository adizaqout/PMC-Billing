import type { Tables } from "@/integrations/supabase/types";

export type Submission = Tables<"deployment_submissions">;
export type DeploymentLine = Tables<"deployment_lines">;
export type Project = Tables<"projects">;
export type Consultant = Tables<"consultants">;
export type Employee = Tables<"employees">;
export type Position = Tables<"positions">;
export type ServiceOrder = Tables<"service_orders">;
export type PurchaseOrder = Tables<"purchase_orders">;
export type Invoice = Tables<"invoices">;

export interface AnalyticsFilters {
  month: string;
  consultantId: string;
  projectId: string;
  soId: string;
  poId: string;
  positionId: string;
  submissionStatus: string;
  scenario: string;
}

export const ALL_FILTER_VALUE = "all";

export const defaultAnalyticsFilters: AnalyticsFilters = {
  month: ALL_FILTER_VALUE,
  consultantId: ALL_FILTER_VALUE,
  projectId: ALL_FILTER_VALUE,
  soId: ALL_FILTER_VALUE,
  poId: ALL_FILTER_VALUE,
  positionId: ALL_FILTER_VALUE,
  submissionStatus: ALL_FILTER_VALUE,
  scenario: ALL_FILTER_VALUE,
};

export function compareMonth(a?: string | null, b?: string | null) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

export function formatMonthLabel(month?: string | null) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return month || "—";
  const [year, rawMonth] = month.split("-");
  const date = new Date(Number(year), Number(rawMonth) - 1, 1);
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
}

export function currency(value: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

export function getLatestSubmissionIds(submissions: Submission[], includePreviousRevisions: boolean) {
  if (includePreviousRevisions) {
    return new Set(submissions.map((submission) => submission.id));
  }

  const latest = new Map<string, Submission>();
  submissions.forEach((submission) => {
    const key = [submission.consultant_id, submission.month, submission.schedule_type].join("|");
    const current = latest.get(key);
    if (!current || submission.revision_no > current.revision_no) {
      latest.set(key, submission);
    }
  });

  return new Set(Array.from(latest.values(), (submission) => submission.id));
}

export function monthMatchesFilter(month: string, filters: AnalyticsFilters) {
  return filters.month === ALL_FILTER_VALUE || month === filters.month;
}

export function computeRiskStatus(
  budget: number,
  actual: number,
  forecast: number,
  amberThresholdPct: number,
) {
  const remaining = budget - actual;
  if (forecast > budget) return "red" as const;
  if (budget > 0 && remaining < budget * (amberThresholdPct / 100)) return "amber" as const;
  return "green" as const;
}
