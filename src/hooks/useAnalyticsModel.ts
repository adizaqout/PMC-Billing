import { useMemo } from "react";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { buildAnalyticsModel } from "@/lib/analytics-engine";
import type { AnalyticsFilters } from "@/lib/analytics";

export function useAnalyticsModel(filters: AnalyticsFilters, includePreviousRevisions = false) {
  const query = useAnalyticsData();

  const analytics = useMemo(() => {
    if (!query.data) return null;
    return buildAnalyticsModel(query.data, filters, includePreviousRevisions);
  }, [query.data, filters, includePreviousRevisions]);

  return {
    ...query,
    analytics,
  };
}
