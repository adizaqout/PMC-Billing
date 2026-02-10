import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, CalendarCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Period = Tables<"period_control">;

export default function PeriodControlPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["period_control"],
    queryFn: async () => {
      const { data, error } = await supabase.from("period_control").select("*").order("month", { ascending: false });
      if (error) throw error;
      return data as Period[];
    },
  });

  const closePeriodMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("period_control").update({ status: "closed" as any, closed_at: new Date().toISOString(), closed_by: user?.id || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["period_control"] }); toast.success("Period closed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNextMutation = useMutation({
    mutationFn: async () => {
      // Determine next month
      const lastMonth = periods.length > 0 ? periods[0].month : null;
      let nextMonth: string;
      if (lastMonth) {
        const [y, m] = lastMonth.split("-").map(Number);
        const d = new Date(y, m); // month is 0-indexed, so m (1-indexed) gives next month
        nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else {
        const now = new Date();
        nextMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }
      const { error } = await supabase.from("period_control").insert({ month: nextMonth, status: "open" as any, opened_at: new Date().toISOString(), opened_by: user?.id || null } as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["period_control"] }); toast.success("New period opened"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlockMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("period_control").update({ status: "open" as any, closed_at: null, closed_by: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["period_control"] }); toast.success("Period reopened"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasOpenPeriod = periods.some(p => p.status === "open");

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Period Control</h1>
            <p className="page-subtitle">Manage monthly billing periods — only one period can be open at a time</p>
          </div>
          <Button size="sm" onClick={() => openNextMutation.mutate()} disabled={hasOpenPeriod || openNextMutation.isPending}>
            {openNextMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <CalendarCheck size={14} className="mr-1.5" />}
            Open Next Period
          </Button>
        </div>

        <div className="bg-card rounded-md border">
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : periods.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No periods yet. Click "Open Next Period" to start.</div> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="data-table-header text-left px-4 py-2.5">Period (Month)</th>
                    <th className="data-table-header text-center px-4 py-2.5">Status</th>
                    <th className="data-table-header text-left px-4 py-2.5">Opened At</th>
                    <th className="data-table-header text-left px-4 py-2.5">Closed At</th>
                    <th className="data-table-header text-center px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 font-mono font-medium">{p.month}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.opened_at ? new Date(p.opened_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.closed_at ? new Date(p.closed_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {p.status === "open" ? (
                          <Button variant="outline" size="sm" onClick={() => closePeriodMutation.mutate(p.id)} disabled={closePeriodMutation.isPending}>
                            <Lock size={12} className="mr-1.5" /> Close Period
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => unlockMutation.mutate(p.id)} disabled={unlockMutation.isPending}>
                            <Unlock size={12} className="mr-1.5" /> Unlock (Admin)
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
