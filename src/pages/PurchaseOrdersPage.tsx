import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type PO = Tables<"purchase_orders"> & { consultants?: { name: string } | null; service_orders?: { so_number: string } | null };

interface POForm {
  po_number: string; consultant_id: string; so_id: string | null; po_reference: string | null;
  po_start_date: string | null; po_end_date: string | null; po_value: number | null;
  portfolio: string | null; type: string | null; status: "active" | "inactive"; comments: string | null; revision_number: number | null;
}

const emptyForm: POForm = { po_number: "", consultant_id: "", so_id: null, po_reference: null, po_start_date: null, po_end_date: null, po_value: null, portfolio: null, type: null, status: "active", comments: null, revision_number: 0 };
const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en").format(v) : "—";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function PurchaseOrdersPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PO | null>(null);
  const [form, setForm] = useState<POForm>(emptyForm);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => { const { data, error } = await supabase.from("purchase_orders").select("*, consultants(name), service_orders(so_number)").order("po_number"); if (error) throw error; return data as PO[]; },
  });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });
  const { data: serviceOrders = [] } = useQuery({ queryKey: ["so-list"], queryFn: async () => { const { data, error } = await supabase.from("service_orders").select("id, so_number").order("so_number"); if (error) throw error; return data as { id: string; so_number: string }[]; } });

  const upsertMutation = useMutation({
    mutationFn: async (values: POForm & { id?: string }) => {
      const payload: any = { po_number: values.po_number, consultant_id: values.consultant_id, so_id: values.so_id || null, po_reference: values.po_reference || null, po_start_date: values.po_start_date || null, po_end_date: values.po_end_date || null, po_value: values.po_value, portfolio: values.portfolio || null, type: values.type || null, status: values.status, comments: values.comments || null, revision_number: values.revision_number };
      if (values.id) { const { error } = await supabase.from("purchase_orders").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("purchase_orders").insert(payload as TablesInsert<"purchase_orders">); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["purchase_orders"] }); toast.success(editing ? "Updated" : "Created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("purchase_orders").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["purchase_orders"] }); toast.success("Deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: PO) => { setEditing(item); setForm({ po_number: item.po_number, consultant_id: item.consultant_id, so_id: item.so_id, po_reference: item.po_reference, po_start_date: item.po_start_date, po_end_date: item.po_end_date, po_value: item.po_value, portfolio: item.portfolio, type: item.type, status: item.status, comments: item.comments, revision_number: item.revision_number }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.po_number.trim()) { toast.error("PO number is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = items.filter((i) => i.po_number.toLowerCase().includes(search.toLowerCase()) || (i.consultants?.name || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Purchase Orders</h1><p className="page-subtitle">Manage POs and PO line items</p></div>
          <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add PO</Button>
        </div>
        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : filtered.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No records found</div> : (
              <table className="w-full text-sm"><thead><tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5">PO Number</th>
                <th className="data-table-header text-left px-4 py-2.5">Consultant</th>
                <th className="data-table-header text-left px-4 py-2.5">SO</th>
                <th className="data-table-header text-center px-4 py-2.5">Start</th>
                <th className="data-table-header text-center px-4 py-2.5">End</th>
                <th className="data-table-header text-right px-4 py-2.5">Value (AED)</th>
                <th className="data-table-header text-center px-4 py-2.5">Rev</th>
                <th className="data-table-header text-center px-4 py-2.5">Status</th>
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{filtered.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-medium">{item.po_number}</td>
                  <td className="px-4 py-2.5">{item.consultants?.name || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.service_orders?.so_number || "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.po_start_date)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.po_end_date)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(item.po_value)}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{item.revision_number ?? 0}</td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={item.status} /></td>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Purchase Order" : "Add Purchase Order"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>PO Number *</Label><Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>PO Reference</Label><Input value={form.po_reference || ""} onChange={(e) => setForm({ ...form, po_reference: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={(v) => setForm({ ...form, consultant_id: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Service Order</Label><Select value={form.so_id || "none"} onValueChange={(v) => setForm({ ...form, so_id: v === "none" ? null : v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{serviceOrders.map((s) => <SelectItem key={s.id} value={s.id}>{s.so_number}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.po_start_date || ""} onChange={(e) => setForm({ ...form, po_start_date: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={form.po_end_date || ""} onChange={(e) => setForm({ ...form, po_end_date: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Value (AED)</Label><Input type="number" value={form.po_value ?? ""} onChange={(e) => setForm({ ...form, po_value: e.target.value ? parseFloat(e.target.value) : null })} /></div>
              <div className="space-y-1.5"><Label>Revision No.</Label><Input type="number" value={form.revision_number ?? 0} onChange={(e) => setForm({ ...form, revision_number: parseInt(e.target.value) || 0 })} /></div>
              <div className="space-y-1.5"><Label>Portfolio</Label><Input value={form.portfolio || ""} onChange={(e) => setForm({ ...form, portfolio: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Type</Label><Input value={form.type || ""} onChange={(e) => setForm({ ...form, type: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
              <div className="col-span-2 space-y-1.5"><Label>Comments</Label><Textarea value={form.comments || ""} onChange={(e) => setForm({ ...form, comments: e.target.value || null })} rows={2} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
