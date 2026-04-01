import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import CurrencyInput from "@/components/CurrencyInput";
import ExcelToolbar from "@/components/ExcelToolbar";
import ColumnVisibilityToggle, { useColumnVisibility, type ColumnDef } from "@/components/ColumnVisibilityToggle";
import TablePagination from "@/components/TablePagination";
import ColumnFilter from "@/components/ColumnFilter";
import SortableHeader from "@/components/SortableHeader";
import { usePagination } from "@/hooks/usePagination";
import { useSort } from "@/hooks/useSort";
import { exportToExcel, downloadTemplate } from "@/lib/excel-utils";
import type { SmartImportConfig, ImportColumnDef } from "@/components/import/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type SO = Tables<"service_orders"> & { consultants?: { short_name: string } | null; framework_agreements?: { framework_agreement_no: string } | null };
interface SOForm { so_number: string; consultant_id: string; framework_id: string | null; so_start_date: string | null; so_end_date: string | null; so_value: number | null; comments: string | null; }
const emptyForm: SOForm = { so_number: "", consultant_id: "", framework_id: null, so_start_date: null, so_end_date: null, so_value: null, comments: null };
const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en").format(v) : "—";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function parseImportDate(val: any): string | null {
  if (val == null || String(val).trim() === "") return null;
  const n = Number(val);
  if (!isNaN(n) && n > 10000) { const d = new Date(Math.round((n - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10); }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  return !isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

const importColumns: ImportColumnDef[] = [
  { header: "SO Number", key: "so_number", required: true },
  { header: "Consultant", key: "consultant_name", required: true },
  { header: "Framework Agreement", key: "framework_no" },
  { header: "Start Date", key: "so_start_date", type: "date" },
  { header: "End Date", key: "so_end_date", type: "date" },
  { header: "Value (AED)", key: "so_value", type: "number" },
  { header: "Comments", key: "comments" },
];

const cols = [
  { header: "SO Number", key: "so_number", width: 18 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "Framework Agreement", key: "framework_no", width: 22 },
  { header: "Start Date", key: "so_start_date", width: 14 },
  { header: "End Date", key: "so_end_date", width: 14 },
  { header: "Value (AED)", key: "so_value", width: 15 },
  { header: "Comments", key: "comments", width: 30 },
];

const soTableCols: ColumnDef[] = [
  { key: "so_number", label: "SO Number" },
  { key: "consultant", label: "Consultant" },
  { key: "framework", label: "Framework" },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "value", label: "Value" },
];

export default function ServiceOrdersPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SO | null>(null);
  const [form, setForm] = useState<SOForm>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const { visibleColumns, setVisibleColumns } = useColumnVisibility(soTableCols);
  const queryClient = useQueryClient();

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: items = [], isLoading } = useQuery({ queryKey: ["service_orders"], queryFn: async () => { const { data, error } = await supabase.from("service_orders").select("*, consultants(short_name), framework_agreements(framework_agreement_no)").order("so_number"); if (error) throw error; return data as SO[]; } });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, short_name").eq("status", "active").order("short_name"); if (error) throw error; return data as { id: string; short_name: string }[]; } });
  const { data: frameworks = [] } = useQuery({ queryKey: ["frameworks-all"], queryFn: async () => { const { data, error } = await supabase.from("framework_agreements").select("id, framework_agreement_no, consultant_id").eq("status", "active").order("framework_agreement_no"); if (error) throw error; return data as { id: string; framework_agreement_no: string; consultant_id: string }[]; } });
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
  const handleConsultantChange = (v: string) => { setForm({ ...form, consultant_id: v, framework_id: null }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.so_number.trim()) { toast.error("SO number is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    if (form.so_start_date && form.so_end_date && form.so_end_date < form.so_start_date) { toast.error("End date must be after start date"); return; }
    const dup = items.find(i => i.so_number.toLowerCase() === form.so_number.toLowerCase().trim() && i.consultant_id === form.consultant_id && i.id !== editing?.id);
    if (dup) { toast.error("This SO number already exists for this consultant"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = items.filter((i) => {
    if (search && !i.so_number.toLowerCase().includes(search.toLowerCase()) && !(i.consultants?.short_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (colFilters.so_number && !i.so_number.toLowerCase().includes(colFilters.so_number.toLowerCase())) return false;
    if (colFilters.consultant && !(i.consultants?.short_name || "").toLowerCase().includes(colFilters.consultant.toLowerCase())) return false;
    if (colFilters.framework && !(i.framework_agreements?.framework_agreement_no || "").toLowerCase().includes(colFilters.framework.toLowerCase())) return false;
    return true;
  });
  const { sorted, sort, toggleSort } = useSort(filtered, "so_number", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);

  const handleExport = () => { exportToExcel("service-orders.xlsx", cols, filtered.map(i => ({ ...i, consultant_name: i.consultants?.short_name || "", framework_no: i.framework_agreements?.framework_agreement_no || "" }))); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("so-template.xlsx", cols, { Consultants: consultants.map(c => c.short_name), Frameworks: frameworks.map(f => f.framework_agreement_no) }); toast.success("Template downloaded"); };

  const smartImportConfig: SmartImportConfig = useMemo(() => ({
    entityName: "Service Orders",
    columns: importColumns,
    businessKeys: ["so_number", "consultant_name"],
    fetchExisting: async () => {
      const { data, error } = await supabase.from("service_orders").select("*, consultants(short_name), framework_agreements(framework_agreement_no)").order("so_number");
      if (error) throw error;
      return (data || []).map((i: any) => ({
        _id: i.id, so_number: i.so_number || "", consultant_name: i.consultants?.short_name || "",
        framework_no: i.framework_agreements?.framework_agreement_no || "",
        so_start_date: i.so_start_date || "", so_end_date: i.so_end_date || "",
        so_value: i.so_value != null ? String(i.so_value) : "", comments: i.comments || "",
      }));
    },
    executeInsert: async (rec) => {
      const consultant = consultants.find(c => c.short_name.toLowerCase() === rec.consultant_name?.trim()?.toLowerCase());
      if (!consultant) return `Consultant "${rec.consultant_name}" not found`;
      const fw = rec.framework_no ? frameworks.find(f => f.framework_agreement_no.toLowerCase() === rec.framework_no.trim().toLowerCase() && f.consultant_id === consultant.id) : null;
      const { error } = await supabase.from("service_orders").insert({
        so_number: rec.so_number.trim(), consultant_id: consultant.id, framework_id: fw?.id || null,
        so_start_date: parseImportDate(rec.so_start_date), so_end_date: parseImportDate(rec.so_end_date),
        so_value: rec.so_value ? parseFloat(rec.so_value) : null, comments: rec.comments?.trim() || null,
      } as TablesInsert<"service_orders">);
      return error?.message || null;
    },
    executeUpdate: async (id, rec) => {
      const consultant = consultants.find(c => c.short_name.toLowerCase() === rec.consultant_name?.trim()?.toLowerCase());
      if (!consultant) return `Consultant "${rec.consultant_name}" not found`;
      const fw = rec.framework_no ? frameworks.find(f => f.framework_agreement_no.toLowerCase() === rec.framework_no.trim().toLowerCase() && f.consultant_id === consultant.id) : null;
      const { error } = await supabase.from("service_orders").update({
        so_number: rec.so_number.trim(), consultant_id: consultant.id, framework_id: fw?.id || null,
        so_start_date: parseImportDate(rec.so_start_date), so_end_date: parseImportDate(rec.so_end_date),
        so_value: rec.so_value ? parseFloat(rec.so_value) : null, comments: rec.comments?.trim() || null,
      }).eq("id", id);
      return error?.message || null;
    },
    onComplete: () => { queryClient.invalidateQueries({ queryKey: ["service_orders"] }); },
  }), [consultants, frameworks, queryClient]);
  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Service Orders</h1><p className="page-subtitle">Track service orders per consultant</p></div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} smartImportConfig={smartImportConfig} />
            <ColumnVisibilityToggle columns={soTableCols} visibleColumns={visibleColumns} onChange={setVisibleColumns} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Service Order</Button>
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
                {visibleColumns.has("so_number") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="SO Number" sortKey="so_number" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.so_number || ""} onChange={(v) => setColFilter("so_number", v)} label="SO Number" /></SortableHeader></th>}
                {visibleColumns.has("consultant") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Consultant" sortKey="consultants.short_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.consultant || ""} onChange={(v) => setColFilter("consultant", v)} label="Consultant" /></SortableHeader></th>}
                {visibleColumns.has("framework") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Framework" sortKey="framework_agreements.framework_agreement_no" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.framework || ""} onChange={(v) => setColFilter("framework", v)} label="Framework" /></SortableHeader></th>}
                {visibleColumns.has("start_date") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Start" sortKey="so_start_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("end_date") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="End" sortKey="so_end_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("value") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Value (AED)" sortKey="so_value" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{paginatedItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  {visibleColumns.has("so_number") && <td className="px-4 py-2.5 font-mono font-medium">{item.so_number}</td>}
                  {visibleColumns.has("consultant") && <td className="px-4 py-2.5">{item.consultants?.short_name || "—"}</td>}
                  {visibleColumns.has("framework") && <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{item.framework_agreements?.framework_agreement_no || "—"}</td>}
                  {visibleColumns.has("start_date") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.so_start_date)}</td>}
                  {visibleColumns.has("end_date") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.so_end_date)}</td>}
                  {visibleColumns.has("value") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.so_value)}</td>}
                  <td className="px-4 py-2.5 text-center">
                    <DropdownMenu><DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(item)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                  </td>
                </tr>
              ))}</tbody></table>
            )}
          </div>
          {filtered.length > 0 && <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />}
        </div>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Service Order" : "Add Service Order"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>SO Number *</Label><Input value={form.so_number} onChange={(e) => setForm({ ...form, so_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={handleConsultantChange}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.short_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Framework Agreement</Label><Select value={form.framework_id || "none"} onValueChange={(v) => setForm({ ...form, framework_id: v === "none" ? null : v })} disabled={!form.consultant_id}><SelectTrigger><SelectValue placeholder={form.consultant_id ? "Select" : "Select consultant first"} /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{filteredFrameworks.map((f) => <SelectItem key={f.id} value={f.id}>{f.framework_agreement_no}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.so_start_date || ""} onChange={(e) => setForm({ ...form, so_start_date: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={form.so_end_date || ""} onChange={(e) => setForm({ ...form, so_end_date: e.target.value || null })} min={form.so_start_date || undefined} /></div>
              <div className="space-y-1.5"><Label>Value (AED)</Label><CurrencyInput value={form.so_value} onChange={(v) => setForm({ ...form, so_value: v })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Comments</Label><Textarea value={form.comments || ""} onChange={(e) => setForm({ ...form, comments: e.target.value || null })} rows={2} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
