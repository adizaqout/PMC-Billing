import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Position = Tables<"positions"> & { consultants?: { name: string } | null; service_orders?: { so_number: string } | null };

interface PosForm {
  position_name: string; consultant_id: string; so_id: string | null; total_years_of_exp: number | null;
  year_1_rate: number | null; year_2_rate: number | null; year_3_rate: number | null; year_4_rate: number | null; year_5_rate: number | null;
  effective_from: string | null; effective_to: string | null; notes: string | null;
}

const emptyForm: PosForm = { position_name: "", consultant_id: "", so_id: null, total_years_of_exp: null, year_1_rate: null, year_2_rate: null, year_3_rate: null, year_4_rate: null, year_5_rate: null, effective_from: null, effective_to: null, notes: null };
const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en").format(v) : "—";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function PositionsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState<PosForm>(emptyForm);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => { const { data, error } = await supabase.from("positions").select("*, consultants(name), service_orders(so_number)").order("position_name"); if (error) throw error; return data as Position[]; },
  });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });
  const { data: serviceOrders = [] } = useQuery({ queryKey: ["so-list"], queryFn: async () => { const { data, error } = await supabase.from("service_orders").select("id, so_number").order("so_number"); if (error) throw error; return data as { id: string; so_number: string }[]; } });

  const upsertMutation = useMutation({
    mutationFn: async (values: PosForm & { id?: string }) => {
      const payload: any = { position_name: values.position_name, consultant_id: values.consultant_id, so_id: values.so_id || null, total_years_of_exp: values.total_years_of_exp, year_1_rate: values.year_1_rate, year_2_rate: values.year_2_rate, year_3_rate: values.year_3_rate, year_4_rate: values.year_4_rate, year_5_rate: values.year_5_rate, effective_from: values.effective_from || null, effective_to: values.effective_to || null, notes: values.notes || null };
      if (values.id) { const { error } = await supabase.from("positions").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("positions").insert(payload as TablesInsert<"positions">); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["positions"] }); toast.success(editing ? "Updated" : "Created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("positions").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["positions"] }); toast.success("Deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: Position) => { setEditing(item); setForm({ position_name: item.position_name, consultant_id: item.consultant_id, so_id: item.so_id, total_years_of_exp: item.total_years_of_exp, year_1_rate: item.year_1_rate, year_2_rate: item.year_2_rate, year_3_rate: item.year_3_rate, year_4_rate: item.year_4_rate, year_5_rate: item.year_5_rate, effective_from: item.effective_from, effective_to: item.effective_to, notes: item.notes }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.position_name.trim()) { toast.error("Position name is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const numSet = (key: keyof PosForm, v: string) => setForm({ ...form, [key]: v ? parseFloat(v) : null });
  const filtered = items.filter((i) => i.position_name.toLowerCase().includes(search.toLowerCase()) || (i.consultants?.name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Positions</h1><p className="page-subtitle">Rate card with yearly rates linked to SOs</p></div>
          <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Position</Button>
        </div>
        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : filtered.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No records found</div> : (
              <table className="w-full text-sm"><thead><tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5">Position</th>
                <th className="data-table-header text-left px-4 py-2.5">Consultant</th>
                <th className="data-table-header text-left px-4 py-2.5">SO</th>
                <th className="data-table-header text-center px-4 py-2.5">Exp</th>
                <th className="data-table-header text-right px-4 py-2.5">Y1 Rate</th>
                <th className="data-table-header text-right px-4 py-2.5">Y2 Rate</th>
                <th className="data-table-header text-right px-4 py-2.5">Y3 Rate</th>
                <th className="data-table-header text-center px-4 py-2.5">From</th>
                <th className="data-table-header text-center px-4 py-2.5">To</th>
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{filtered.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{item.position_name}</td>
                  <td className="px-4 py-2.5">{item.consultants?.name || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.service_orders?.so_number || "—"}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{item.total_years_of_exp ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_1_rate)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_2_rate)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_3_rate)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.effective_from)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.effective_to)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <DropdownMenu><DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(item)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                  </td>
                </tr>
              ))}</tbody></table>
            )}
          </div>
        </div>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Position" : "Add Position"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-3 space-y-1.5"><Label>Position Name *</Label><Input value={form.position_name} onChange={(e) => setForm({ ...form, position_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={(v) => setForm({ ...form, consultant_id: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Service Order</Label><Select value={form.so_id || "none"} onValueChange={(v) => setForm({ ...form, so_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{serviceOrders.map((s) => <SelectItem key={s.id} value={s.id}>{s.so_number}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Total Exp (Yrs)</Label><Input type="number" value={form.total_years_of_exp ?? ""} onChange={(e) => numSet("total_years_of_exp", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 1 Rate</Label><Input type="number" value={form.year_1_rate ?? ""} onChange={(e) => numSet("year_1_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 2 Rate</Label><Input type="number" value={form.year_2_rate ?? ""} onChange={(e) => numSet("year_2_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 3 Rate</Label><Input type="number" value={form.year_3_rate ?? ""} onChange={(e) => numSet("year_3_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 4 Rate</Label><Input type="number" value={form.year_4_rate ?? ""} onChange={(e) => numSet("year_4_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 5 Rate</Label><Input type="number" value={form.year_5_rate ?? ""} onChange={(e) => numSet("year_5_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Effective From</Label><Input type="date" value={form.effective_from || ""} onChange={(e) => setForm({ ...form, effective_from: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Effective To</Label><Input type="date" value={form.effective_to || ""} onChange={(e) => setForm({ ...form, effective_to: e.target.value || null })} /></div>
              <div className="space-y-1.5"></div>
              <div className="col-span-3 space-y-1.5"><Label>Notes</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} rows={2} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
