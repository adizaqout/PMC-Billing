import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Group = Pick<Tables<"groups">, "id" | "name">;
type ReportCatalog = Pick<Tables<"report_catalog">, "id" | "report_name" | "report_key" | "module_key" | "is_active">;
type ReportVisibility = Tables<"group_report_visibility">;
type FeatureToggle = Tables<"group_feature_toggles">;

const FEATURE_KEY = "ai_assistant";
const SETTING_KEY = "risk_thresholds";

export default function AnalyticsControlsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics-controls"],
    queryFn: async () => {
      const [groupsRes, reportsRes, visibilityRes, featuresRes, settingsRes] = await Promise.all([
        supabase.from("groups").select("id, name").order("name"),
        supabase.from("report_catalog").select("id, report_name, report_key, module_key, is_active").order("sort_order"),
        supabase.from("group_report_visibility").select("*"),
        supabase.from("group_feature_toggles").select("*"),
        supabase.from("app_settings").select("*").eq("setting_key", SETTING_KEY).maybeSingle(),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (reportsRes.error) throw reportsRes.error;
      if (visibilityRes.error) throw visibilityRes.error;
      if (featuresRes.error) throw featuresRes.error;
      if (settingsRes.error) throw settingsRes.error;

      return {
        groups: (groupsRes.data || []) as Group[],
        reports: (reportsRes.data || []) as ReportCatalog[],
        visibility: (visibilityRes.data || []) as ReportVisibility[],
        features: (featuresRes.data || []) as FeatureToggle[],
        thresholds: settingsRes.data,
      };
    },
  });

  const thresholds = useMemo(() => {
    const value = data?.thresholds?.setting_value;
    const parsed = typeof value === "object" && value ? value as { amber_pct?: number; red_pct?: number } : {};
    return {
      amber_pct: Number(parsed.amber_pct ?? 10),
      red_pct: Number(parsed.red_pct ?? 0),
    };
  }, [data?.thresholds]);

  const visibilityMutation = useMutation({
    mutationFn: async ({ groupId, reportId, isVisible }: { groupId: string; reportId: string; isVisible: boolean }) => {
      const existing = data?.visibility.find((row) => row.group_id === groupId && row.report_id === reportId);
      if (existing) {
        const { error } = await supabase.from("group_report_visibility").update({ is_visible: isVisible }).eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("group_report_visibility").insert({ group_id: groupId, report_id: reportId, is_visible: isVisible } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-analytics-controls"] });
      toast.success("Report visibility updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const featureMutation = useMutation({
    mutationFn: async ({ groupId, enabled }: { groupId: string; enabled: boolean }) => {
      const existing = data?.features.find((row) => row.group_id === groupId && row.feature_key === FEATURE_KEY);
      if (existing) {
        const { error } = await supabase.from("group_feature_toggles").update({ is_enabled: enabled }).eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("group_feature_toggles").insert({ group_id: groupId, feature_key: FEATURE_KEY, is_enabled: enabled, settings: {} } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-analytics-controls"] });
      toast.success("AI access updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const thresholdsMutation = useMutation({
    mutationFn: async (next: { amber_pct: number; red_pct: number }) => {
      if (data?.thresholds?.id) {
        const { error } = await supabase.from("app_settings").update({ setting_value: next }).eq("id", data.thresholds.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("app_settings").insert({ setting_key: SETTING_KEY, setting_value: next } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-analytics-controls"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-data"] });
      toast.success("Thresholds updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><Loader2 size={18} className="mr-2 animate-spin" />Loading analytics controls…</div>;
  }

  return (
    <div className="grid gap-6 mt-4 xl:grid-cols-[1.25fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Report visibility by group</CardTitle>
          <CardDescription>Control which report modules each group can see without changing core permissions.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5">Group</th>
                {data.reports.map((report) => (
                  <th key={report.id} className="data-table-header text-center px-4 py-2.5 min-w-[140px]">{report.report_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.groups.map((group) => (
                <tr key={group.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{group.name}</td>
                  {data.reports.map((report) => {
                    const row = data.visibility.find((item) => item.group_id === group.id && item.report_id === report.id);
                    const checked = row?.is_visible ?? true;
                    return (
                      <td key={report.id} className="px-4 py-3 text-center">
                        <Switch
                          checked={checked}
                          onCheckedChange={(value) => visibilityMutation.mutate({ groupId: group.id, reportId: report.id, isVisible: value })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>AI enable / disable by group</CardTitle>
            <CardDescription>Gate AI Insights independently from report access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.groups.map((group) => {
              const row = data.features.find((item) => item.group_id === group.id && item.feature_key === FEATURE_KEY);
              const enabled = row?.is_enabled ?? false;
              return (
                <div key={group.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">Feature key: {FEATURE_KEY}</p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={(value) => featureMutation.mutate({ groupId: group.id, enabled: value })} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configurable thresholds</CardTitle>
            <CardDescription>Shared by dashboard, reports, and AI risk categorization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amber-threshold">Amber threshold %</Label>
                <Input
                  id="amber-threshold"
                  type="number"
                  defaultValue={thresholds.amber_pct}
                  onBlur={(e) => thresholdsMutation.mutate({ amber_pct: Number(e.target.value || 10), red_pct: thresholds.red_pct })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="red-threshold">Red threshold %</Label>
                <Input
                  id="red-threshold"
                  type="number"
                  defaultValue={thresholds.red_pct}
                  onBlur={(e) => thresholdsMutation.mutate({ amber_pct: thresholds.amber_pct, red_pct: Number(e.target.value || 0) })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Amber uses remaining budget threshold. Red remains forecast-over-budget by formula and stores this extra threshold for future extensions.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
