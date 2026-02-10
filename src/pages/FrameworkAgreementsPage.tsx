import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import ExcelToolbar from "@/components/ExcelToolbar";
import { exportToExcel, downloadTemplate, parseExcelFile } from "@/lib/excel-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type FA = Tables<"framework_agreements"> & { consultants?: { name: string } | null };
type FAInsert = TablesInsert<"framework_agreements">;

interface FAForm { framework_agreement_no: string; consultant_id: string; start_date: string | null; end_date: string | null; status: "active" | "inactive"; }
const emptyForm: FAForm = { framework_agreement_no: "", consultant_id: "", start_date: null, end_date: null, status: "active" };

const cols = [
  { header: "Agreement No.", key: "framework_agreement_no", width: 22 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "Start Date", key: "start_date", width: 14 },
  { header: "End Date", key: "end_date", width: 14 },
  { header: "Status", key: "status", width: 10 },
];

export default function FrameworkAgreementsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FA | null>(null);
  const [form, setForm] = useState<FAForm>(emptyForm);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["framework_agreements"],
    queryFn: async () => { const { data, error } = await supabase.from("framework_agreements").select("*, consultants(name)").order("framework_agreement_no"); if (error) throw error; return data as FA[]; },
  });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });

  const upsertMutation = useMutation({
    mutationFn: async (values: FAForm & { id?: string }) => {
      const payload: any = { ...values, start_date: values.start_date || null, end_date: values.end_date || null }; delete payload.id;
      if (values.id) { const { error } = await supabase.from("framework_agreements").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("framework_agreements").insert(payload as FAInsert); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["framework_agreements"] }); toast.success(editing ? "Updated" : "Created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("framework_agreements").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["framework_agreements"] }); toast.success("Deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: FA) => { setEditing(item); setForm({ framework_agreement_no: item.framework_agreement_no, consultant_id: item.consultant_id, start_date: item.start_date, end_date: item.end_date, status: item.status }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.framework_agreement_no.trim()) { toast.error("Agreement number is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { toast.error("End date must be after start date"); return; }
    const dup = items.find(i => i.framework_agreement_no.toLowerCase() === form.framework_agreement_no.toLowerCase().trim() && i.consultant_id === form.consultant_id && i.id !== editing?.id);
    if (dup) { toast.error("This agreement number already exists for this consultant"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const filtered = items.filter((i) => i.framework_agreement_no.toLowerCase().includes(search.toLowerCase()) || (i.consultants?.name || "").toLowerCase().includes(search.toLowerCase()));

  const handleExport = () => { exportToExcel("framework-agreements.xlsx", cols, filtered.map(i => ({ ...i, consultant_name: i.consultants?.name || "" }))); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("fa-template.xlsx", cols, { Consultants: consultants.map(c => c.name) }); toast.success("Template downloaded"); };
  const handleImport = async (file: File) => {
    try {
      const rows = await parseExcelFile(file);
      if (rows.length < 2) { toast.error("File is empty"); return; }
      const errors: string[] = []; let created = 0;
      for (let i = 1; i < rows.length; i++) {
        const [faNo, consultantName, startDate, endDate, status] = rows[i];
        if (!faNo?.trim()) continue;
        const consultant = consultants.find(c => c.name.toLowerCase() === consultantName?.trim()?.toLowerCase());
        if (!consultant) { errors.push(`Row ${i + 1}: Consultant "${consultantName}" not found`); continue; }
        const { error } = await supabase.from("framework_agreements").insert({
          framework_agreement_no: faNo.trim(), consultant_id: consultant.id,
          start_date: startDate?.trim() || null, end_date: endDate?.trim() || null,
          status: (status?.trim()?.toLowerCase() === "inactive" ? "inactive" : "active") as any,
        } as FAInsert);
        if (error) errors.push(`Row ${i + 1}: ${error.message}`); else created++;
      }
      queryClient.invalidateQueries({ queryKey: ["framework_agreements"] });
      if (errors.length) toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join("; ")}`);
      if (created) toast.success(`${created} record(s) imported`);
    } catch { toast.error("Failed to parse file"); }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Framework Agreements</h1><p className="page-subtitle">Manage framework agreements with consultants</p></div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={handleImport} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Agreement</Button>
          </div>
        </div>
        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : filtered.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No records found</div> : (
              <table className="w-full text-sm"><thead><tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5">Agreement No.</th>
                <th className="data-table-header text-left px-4 py-2.5">Consultant</th>
                <th className="data-table-header text-center px-4 py-2.5">Start Date</th>
                <th className="data-table-header text-center px-4 py-2.5">End Date</th>
                <th className="data-table-header text-center px-4 py-2.5">Status</th>
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{filtered.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-medium">{item.framework_agreement_no}</td>
                  <td className="px-4 py-2.5">{item.consultants?.name || "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.start_date)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.end_date)}</td>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Agreement" : "Add Agreement"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>Agreement No. *</Label><Input value={form.framework_agreement_no} onChange={(e) => setForm({ ...form, framework_agreement_no: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={(v) => setForm({ ...form, consultant_id: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} min={form.start_date || undefined} /></div>
              <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
