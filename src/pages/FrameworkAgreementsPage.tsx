import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import ExcelToolbar from "@/components/ExcelToolbar";
import TablePagination from "@/components/TablePagination";
import ColumnFilter from "@/components/ColumnFilter";
import SortableHeader from "@/components/SortableHeader";
import ColumnVisibilityToggle, { useColumnVisibility, type ColumnDef } from "@/components/ColumnVisibilityToggle";
import { usePagination } from "@/hooks/usePagination";
import { useSort } from "@/hooks/useSort";
import { exportToExcel, downloadTemplate } from "@/lib/excel-utils";
import type { SmartImportConfig, ImportColumnDef } from "@/components/import/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type FA = Tables<"framework_agreements"> & { consultants?: { short_name: string; consultant_type?: string | null } | null };
type FAInsert = TablesInsert<"framework_agreements">;

interface FAForm { framework_agreement_no: string; consultant_id: string; start_date: string | null; end_date: string | null; status: "active" | "inactive"; }
const emptyForm: FAForm = { framework_agreement_no: "", consultant_id: "", start_date: null, end_date: null, status: "active" };

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
  { header: "Agreement No.", key: "framework_agreement_no", required: true },
  { header: "Consultant", key: "consultant_name", required: true },
  { header: "Start Date", key: "start_date", type: "date" },
  { header: "End Date", key: "end_date", type: "date" },
  { header: "Status", key: "status" },
];

const cols = [
  { header: "Agreement No.", key: "framework_agreement_no", width: 22 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "Start Date", key: "start_date", width: 14 },
  { header: "End Date", key: "end_date", width: 14 },
  { header: "Status", key: "status", width: 10 },
];

const tableCols: ColumnDef[] = [
  { key: "agreement_no", label: "Agreement No." },
  { key: "consultant", label: "Consultant" },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "status", label: "Status" },
];

export default function FrameworkAgreementsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FA | null>(null);
  const [form, setForm] = useState<FAForm>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const { visibleColumns, setVisibleColumns } = useColumnVisibility(tableCols);
  const queryClient = useQueryClient();

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["framework_agreements"],
    queryFn: async () => { const { data, error } = await supabase.from("framework_agreements").select("*, consultants(short_name, consultant_type)").order("framework_agreement_no"); if (error) throw error; return data as FA[]; },
  });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list-pmc"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, short_name").eq("status", "active").eq("consultant_type", "PMC").order("short_name"); if (error) throw error; return data as { id: string; short_name: string }[]; } });

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
  
  const filtered = items.filter((i) => {
    if (search && !i.framework_agreement_no.toLowerCase().includes(search.toLowerCase()) && !(i.consultants?.short_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (colFilters.agreement_no && !i.framework_agreement_no.toLowerCase().includes(colFilters.agreement_no.toLowerCase())) return false;
    if (colFilters.consultant && !(i.consultants?.short_name || "").toLowerCase().includes(colFilters.consultant.toLowerCase())) return false;
    if (colFilters.status && !i.status.toLowerCase().includes(colFilters.status.toLowerCase())) return false;
    return true;
  });
  const { sorted, sort, toggleSort } = useSort(filtered, "framework_agreement_no", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);

  const handleExport = () => { exportToExcel("framework-agreements.xlsx", cols, filtered.map(i => ({ ...i, consultant_name: i.consultants?.short_name || "" }))); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("fa-template.xlsx", cols, { Consultants: consultants.map(c => c.short_name) }); toast.success("Template downloaded"); };

  const smartImportConfig: SmartImportConfig = useMemo(() => ({
    entityName: "Framework Agreements",
    columns: importColumns,
    businessKeys: ["framework_agreement_no", "consultant_name"],
    fetchExisting: async () => {
      const { data, error } = await supabase.from("framework_agreements").select("*, consultants(short_name)").order("framework_agreement_no");
      if (error) throw error;
      return (data || []).map((i: any) => ({
        _id: i.id, framework_agreement_no: i.framework_agreement_no || "",
        consultant_name: i.consultants?.short_name || "",
        start_date: i.start_date || "", end_date: i.end_date || "", status: i.status || "",
      }));
    },
    executeInsert: async (rec) => {
      const consultant = consultants.find(c => c.short_name.toLowerCase() === rec.consultant_name?.trim()?.toLowerCase());
      if (!consultant) return `Consultant "${rec.consultant_name}" not found`;
      const { error } = await supabase.from("framework_agreements").insert({
        framework_agreement_no: rec.framework_agreement_no.trim(), consultant_id: consultant.id,
        start_date: parseImportDate(rec.start_date), end_date: parseImportDate(rec.end_date),
        status: (rec.status?.trim()?.toLowerCase() === "inactive" ? "inactive" : "active") as any,
      } as FAInsert);
      return error?.message || null;
    },
    executeUpdate: async (id, rec) => {
      const consultant = consultants.find(c => c.short_name.toLowerCase() === rec.consultant_name?.trim()?.toLowerCase());
      if (!consultant) return `Consultant "${rec.consultant_name}" not found`;
      const { error } = await supabase.from("framework_agreements").update({
        framework_agreement_no: rec.framework_agreement_no.trim(), consultant_id: consultant.id,
        start_date: parseImportDate(rec.start_date), end_date: parseImportDate(rec.end_date),
        status: (rec.status?.trim()?.toLowerCase() === "inactive" ? "inactive" : "active") as any,
      }).eq("id", id);
      return error?.message || null;
    },
    onComplete: () => { queryClient.invalidateQueries({ queryKey: ["framework_agreements"] }); },
  }), [consultants, queryClient]);
  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Framework Agreements</h1><p className="page-subtitle">Manage framework agreements with consultants</p></div>
         <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} smartImportConfig={smartImportConfig} />
            <ColumnVisibilityToggle columns={tableCols} visibleColumns={visibleColumns} onChange={setVisibleColumns} />
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
                {visibleColumns.has("agreement_no") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Agreement No." sortKey="framework_agreement_no" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.agreement_no || ""} onChange={(v) => setColFilter("agreement_no", v)} label="Agreement No." /></SortableHeader></th>}
                {visibleColumns.has("consultant") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Consultant" sortKey="consultants.short_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.consultant || ""} onChange={(v) => setColFilter("consultant", v)} label="Consultant" /></SortableHeader></th>}
                {visibleColumns.has("start_date") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Start Date" sortKey="start_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("end_date") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="End Date" sortKey="end_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("status") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Status" sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.status || ""} onChange={(v) => setColFilter("status", v)} label="Status" /></SortableHeader></th>}
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{paginatedItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  {visibleColumns.has("agreement_no") && <td className="px-4 py-2.5 font-mono font-medium">{item.framework_agreement_no}</td>}
                  {visibleColumns.has("consultant") && <td className="px-4 py-2.5">{item.consultants?.short_name || "—"}</td>}
                  {visibleColumns.has("start_date") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.start_date)}</td>}
                  {visibleColumns.has("end_date") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.end_date)}</td>}
                  {visibleColumns.has("status") && <td className="px-4 py-2.5 text-center"><StatusBadge status={item.status} /></td>}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Agreement" : "Add Agreement"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5"><Label>Agreement No. *</Label><Input value={form.framework_agreement_no} onChange={(e) => setForm({ ...form, framework_agreement_no: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={(v) => setForm({ ...form, consultant_id: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.short_name}</SelectItem>)}</SelectContent></Select></div>
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
