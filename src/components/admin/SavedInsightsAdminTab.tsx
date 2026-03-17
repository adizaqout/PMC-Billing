import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Trash2, Pin, PinOff } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type SavedInsight = Pick<Tables<"saved_insights">, "id" | "title" | "insight_type" | "is_pinned_to_dashboard" | "updated_at" | "summary_markdown" | "user_id">;

export default function SavedInsightsAdminTab() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-saved-insights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_insights")
        .select("id, title, insight_type, is_pinned_to_dashboard, updated_at, summary_markdown, user_id")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SavedInsight[];
    },
  });

  const filtered = useMemo(() => data.filter((row) => {
    const term = search.toLowerCase();
    return row.title.toLowerCase().includes(term) || (row.summary_markdown || "").toLowerCase().includes(term);
  }), [data, search]);

  const pinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("saved_insights").update({ is_pinned_to_dashboard: pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-saved-insights"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-data"] });
      toast.success("Insight updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_insights").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-saved-insights"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-data"] });
      toast.success("Insight deleted");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Saved insights management</CardTitle>
        <CardDescription>Review, pin, and remove saved insights from one place.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search insights…" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><Loader2 size={18} className="mr-2 animate-spin" />Loading insights…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="data-table-header text-left px-4 py-2.5">Title</th>
                  <th className="data-table-header text-left px-4 py-2.5">Type</th>
                  <th className="data-table-header text-left px-4 py-2.5">Updated</th>
                  <th className="data-table-header text-center px-4 py-2.5">Pinned</th>
                  <th className="data-table-header text-right px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.title}</div>
                      {row.summary_markdown ? <p className="mt-1 max-w-[520px] text-xs text-muted-foreground line-clamp-2">{row.summary_markdown}</p> : null}
                    </td>
                    <td className="px-4 py-3 capitalize">{row.insight_type}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(row.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pinMutation.mutate({ id: row.id, pinned: !row.is_pinned_to_dashboard })}
                      >
                        {row.is_pinned_to_dashboard ? <><PinOff size={14} className="mr-1.5" />Unpin</> : <><Pin size={14} className="mr-1.5" />Pin</>}
                      </Button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(row.id)}>
                        <Trash2 size={14} className="mr-1.5" />Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
