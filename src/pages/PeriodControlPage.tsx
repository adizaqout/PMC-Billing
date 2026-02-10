import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, CalendarCheck, Loader2, ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Period = Tables<"period_control">;

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function MonthYearPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [viewYear, setViewYear] = useState(() => value ? parseInt(value.split("-")[0]) : currentYear);

  const selectedMonth = value ? parseInt(value.split("-")[1]) : null;
  const selectedYear = value ? parseInt(value.split("-")[0]) : null;

  const handleSelect = (month: number) => {
    onChange(`${viewYear}-${String(month).padStart(2, "0")}`);
    setOpen(false);
  };

  const displayLabel = value
    ? `${MONTH_NAMES[(selectedMonth || 1) - 1]} ${selectedYear}`
    : "Select month";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3 pointer-events-auto" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setViewYear(y => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{viewYear}</span>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setViewYear(y => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MONTH_NAMES.map((name, idx) => {
            const m = idx + 1;
            const isSelected = selectedYear === viewYear && selectedMonth === m;
            return (
              <Button key={m} type="button" variant={isSelected ? "default" : "ghost"} size="sm" className="h-9 text-xs" onClick={() => handleSelect(m)}>
                {name}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function PeriodControlPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [firstPeriodMonth, setFirstPeriodMonth] = useState("");

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
      const lastMonth = periods.length > 0 ? periods[0].month : null;
      let nextMonth: string;
      if (lastMonth) {
        const [y, m] = lastMonth.split("-").map(Number);
        const d = new Date(y, m);
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

  const openFirstPeriodMutation = useMutation({
    mutationFn: async (month: string) => {
      const { error } = await supabase.from("period_control").insert({ month, status: "open" as any, opened_at: new Date().toISOString(), opened_by: user?.id || null } as any);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["period_control"] }); setFirstPeriodMonth(""); toast.success("First period opened"); },
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
  const hasPeriods = periods.length > 0;

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Period Control</h1>
            <p className="page-subtitle">Manage monthly billing periods — only one period can be open at a time</p>
          </div>
          {hasPeriods ? (
            <Button size="sm" onClick={() => openNextMutation.mutate()} disabled={hasOpenPeriod || openNextMutation.isPending}>
              {openNextMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <CalendarCheck size={14} className="mr-1.5" />}
              Open Next Period
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <MonthYearPicker value={firstPeriodMonth} onChange={setFirstPeriodMonth} />
              <Button size="sm" onClick={() => openFirstPeriodMutation.mutate(firstPeriodMonth)} disabled={!firstPeriodMonth || openFirstPeriodMutation.isPending}>
                {openFirstPeriodMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <CalendarCheck size={14} className="mr-1.5" />}
                Open First Period
              </Button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-md border">
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : periods.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No periods yet. Select a month/year and click "Open First Period" to start.</div> : (
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
