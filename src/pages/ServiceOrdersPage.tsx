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

type SO = Tables<"service_orders"> & { consultants?: { name: string } | null; framework_agreements?: { framework_agreement_no: string } | null };

interface SOForm {
  so_number: string;
  consultant_id: string;
  framework_id: string | null;
  so_start_date: string | null;
  so_end_date: string | null;
  so_value: number | null;
  comments: string | null;
}

const emptyForm: SOForm = { so_number: "", consultant_id: "", framework_id: null, so_start_date: null, so_end_date: null, so_value: null, comments: null };
const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en").format(v) : "—";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function ServiceOrdersPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SO | null>(null);
  const [form, setForm] = useState<SOForm>(emptyForm);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["service_orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_orders").select("*, consultants(name), framework_agreements(framework_agreement_no)").order("so_number");
      if (error) throw error;
      return data as SO[];
    },
  });

  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });
  const { data: frameworks = [] } = useQuery({ queryKey: ["frameworks-all"], queryFn: async () => { const { data, error } = await supabase.from("framework_agreements").select("id, framework_agreement_no, consultant_id").eq("status", "active").order("framework_agreement_no"); if (error) throw error; return data as { id: string; framework_agreement_no: string; consultant_id: string }[]; } });

  // Filter frameworks by selected consultant
  const filteredFrameworks = form.consultant_id ? frameworks.filter(f => f.consultant_id === form.consultant_id) : [];

  const upsertMutation = useMutation({
    mutationFn: async (values: SOForm & { id?: string }) => {
      const payload: any = { so_number: values.so_number, consultant_id: values.consultant_id, framework_id: values.framework_id || null, so_start_date: values.so_start_date || null, so_end_date: values.so_end_date || null, so_value: values.so_value, comments: values.comments || null };
      if (values.id) { const { error } = await supabase.from("service_orders").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("service_orders").insert(payload as TablesInsert<"service_orders">); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["service_orders"] }); toast.success(editing ? "Updated" : "Created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("service_orders").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["service_orders"] }); toast.success("Deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: SO) => { setEditing(item); setForm({ so_number: item.so_number, consultant_id: item.consultant_id, framework_id: item.framework_id, so_start_date: item.so_start_date, so_end_date: item.so_end_date, so_value: item.so_value, comments: item.comments }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleConsultantChange = (v: string) => {
    setForm({ ...form, consultant_id: v, framework_id: null });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.so_number.trim()) { toast.error("SO number is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    if (form.so_start_date && form.so_end_date && form.so_end_date < form.so_start_date) { toast.error("End date must be after start date"); return; }
    // Duplicate check: same so_number for same consultant
    const dup = items.find(i => i.so_number.toLowerCase() === form.so_number.toLowerCase().trim() && i.consultant_id === form.consultant_id && i.id !== editing?.id);
    if (dup) { toast.error("This SO number already exists for this consultant"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = items.filter((i) => i.so_number.toLowerCase().includes(search.toLowerCase()) || (i.consultants?.name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Service Orders</h1><p className="page-subtitle">Track service orders per consultant</p></div>
          <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Service Order</Button>
        </div>
        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : filtered.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No records found</div> : (
              <table className="w-full text-sm"><thead><tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5">SO Number</th>
                <th className="data-table-header text-left px-4 py-2.5">Consultant</th>
                <th className="data-table-header text-left px-4 py-2.5">Framework</th>
                <th className="data-table-header text-center px-4 py-2.5">Start</th>
                <th className="data-table-header text-center px-4 py-2.5">End</th>
                <th className="data-table-header text-right px-4 py-2.5">Value (AED)</th>
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{filtered.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-medium">{item.so_number}</td>
                  <td className="px-4 py-2.5">{item.consultants?.name || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{item.framework_agreements?.framework_agreement_no || "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.so_start_date)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.so_end_date)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(item.so_value)}</td>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Service Order" : "Add Service Order"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>SO Number *</Label><Input value={form.so_number} onChange={(e) => setForm({ ...form, so_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Consultant *</Label>
                <Select value={form.consultant_id} onValueChange={handleConsultantChange}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>Framework Agreement</Label>
                <Select value={form.framework_id || "none"} onValueChange={(v) => setForm({ ...form, framework_id: v === "none" ? null : v })} disabled={!form.consultant_id}>
                  <SelectTrigger><SelectValue placeholder={form.consultant_id ? "Select" : "Select consultant first"} /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{filteredFrameworks.map((f) => <SelectItem key={f.id} value={f.id}>{f.framework_agreement_no}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.so_start_date || ""} onChange={(e) => setForm({ ...form, so_start_date: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={form.so_end_date || ""} onChange={(e) => setForm({ ...form, so_end_date: e.target.value || null })} min={form.so_start_date || undefined} /></div>
              <div className="space-y-1.5"><Label>Value (AED)</Label><Input type="number" value={form.so_value ?? ""} onChange={(e) => setForm({ ...form, so_value: e.target.value ? parseFloat(e.target.value) : null })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Comments</Label><Textarea value={form.comments || ""} onChange={(e) => setForm({ ...form, comments: e.target.value || null })} rows={2} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
