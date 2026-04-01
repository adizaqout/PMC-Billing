import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useLookupValues } from "@/hooks/useLookupValues";
import AppLayout from "@/components/AppLayout";
import ExcelToolbar from "@/components/ExcelToolbar";
import ColumnVisibilityToggle, { useColumnVisibility, type ColumnDef } from "@/components/ColumnVisibilityToggle";
import type { SmartImportConfig, ImportColumnDef } from "@/components/import/types";
import TablePagination from "@/components/TablePagination";
import ColumnFilter from "@/components/ColumnFilter";
import SortableHeader from "@/components/SortableHeader";
import { usePagination } from "@/hooks/usePagination";
import { useSort } from "@/hooks/useSort";
import { exportToExcel, downloadTemplate } from "@/lib/excel-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Position = Tables<"positions"> & { consultants?: { short_name: string } | null; service_orders?: { so_number: string } | null };
interface PosForm { position_id: string; position_name: string; consultant_id: string; so_id: string | null; total_years_of_exp: number | null; year_1_rate: number | null; year_2_rate: number | null; year_3_rate: number | null; year_4_rate: number | null; year_5_rate: number | null; effective_from: string | null; effective_to: string | null; notes: string | null; function: string | null; }
const emptyForm: PosForm = { position_id: "", position_name: "", consultant_id: "", so_id: null, total_years_of_exp: null, year_1_rate: null, year_2_rate: null, year_3_rate: null, year_4_rate: null, year_5_rate: null, effective_from: null, effective_to: null, notes: null, function: null };
const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en").format(v) : "—";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const exportCols = [
  { header: "Position ID", key: "position_id", width: 14 },
  { header: "System ID", key: "system_id", width: 18 },
  { header: "Position Name", key: "position_name", width: 25 },
  { header: "Function", key: "function", width: 20 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "Service Order", key: "so_number", width: 18 },
  { header: "Exp (Yrs)", key: "total_years_of_exp", width: 10 },
  { header: "Year 1 Rate", key: "year_1_rate", width: 14 },
  { header: "Year 2 Rate", key: "year_2_rate", width: 14 },
  { header: "Year 3 Rate", key: "year_3_rate", width: 14 },
  { header: "Year 4 Rate", key: "year_4_rate", width: 14 },
  { header: "Year 5 Rate", key: "year_5_rate", width: 14 },
  { header: "Effective From", key: "effective_from", width: 14 },
  { header: "Effective To", key: "effective_to", width: 14 },
  { header: "Notes", key: "notes", width: 25 },
];
const importCols = [
  { header: "Position ID", key: "position_id", width: 14 },
  { header: "Position Name", key: "position_name", width: 25 },
  { header: "Function", key: "function", width: 20 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "Service Order", key: "so_number", width: 18 },
  { header: "Exp (Yrs)", key: "total_years_of_exp", width: 10 },
  { header: "Year 1 Rate", key: "year_1_rate", width: 14 },
  { header: "Year 2 Rate", key: "year_2_rate", width: 14 },
  { header: "Year 3 Rate", key: "year_3_rate", width: 14 },
  { header: "Year 4 Rate", key: "year_4_rate", width: 14 },
  { header: "Year 5 Rate", key: "year_5_rate", width: 14 },
  { header: "Effective From", key: "effective_from", width: 14 },
  { header: "Effective To", key: "effective_to", width: 14 },
  { header: "Notes", key: "notes", width: 25 },
];

export default function PositionsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState<PosForm>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const posTableCols: ColumnDef[] = [
    { key: "pos_id", label: "Position ID" }, { key: "sys_id", label: "System ID" }, { key: "name", label: "Position" },
    { key: "function", label: "Function" },
    { key: "consultant", label: "Consultant" }, { key: "so", label: "SO" }, { key: "exp", label: "Exp" },
    { key: "y1", label: "Y1 Rate" }, { key: "y2", label: "Y2 Rate" }, { key: "y3", label: "Y3 Rate" },
    { key: "y4", label: "Y4 Rate" }, { key: "y5", label: "Y5 Rate" },
    { key: "from", label: "From" }, { key: "to", label: "To" },
  ];
  const { visibleColumns, setVisibleColumns } = useColumnVisibility(posTableCols);
  const queryClient = useQueryClient();

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: items = [], isLoading } = useQuery({ queryKey: ["positions"], queryFn: async () => { const { data, error } = await supabase.from("positions").select("*, consultants(short_name), service_orders(so_number)").order("position_name"); if (error) throw error; return data as Position[]; } });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, short_name").eq("status", "active").order("short_name"); if (error) throw error; return data as { id: string; short_name: string }[]; } });
  const { data: allServiceOrders = [] } = useQuery({ queryKey: ["so-all"], queryFn: async () => { const { data, error } = await supabase.from("service_orders").select("id, so_number, consultant_id").order("so_number"); if (error) throw error; return data as { id: string; so_number: string; consultant_id: string }[]; } });
  const filteredSOs = form.consultant_id ? allServiceOrders.filter(s => s.consultant_id === form.consultant_id) : [];
  const { data: functionLookups = [] } = useLookupValues("Position Function");

  const upsertMutation = useMutation({
    mutationFn: async (values: PosForm & { id?: string }) => {
      const payload: any = { position_id: values.position_id.trim() || null, position_name: values.position_name, consultant_id: values.consultant_id, so_id: values.so_id || null, total_years_of_exp: values.total_years_of_exp, year_1_rate: values.year_1_rate, year_2_rate: values.year_2_rate, year_3_rate: values.year_3_rate, year_4_rate: values.year_4_rate, year_5_rate: values.year_5_rate, effective_from: values.effective_from || null, effective_to: values.effective_to || null, notes: values.notes || null, "function": values.function ? values.function.substring(0, 50) : null };
      if (values.id) { const { error } = await supabase.from("positions").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("positions").insert(payload as TablesInsert<"positions">); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["positions"] }); toast.success(editing ? "Updated" : "Created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("positions").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["positions"] }); toast.success("Deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: Position) => { setEditing(item); setForm({ position_id: item.position_id || "", position_name: item.position_name, consultant_id: item.consultant_id, so_id: item.so_id, total_years_of_exp: item.total_years_of_exp, year_1_rate: item.year_1_rate, year_2_rate: item.year_2_rate, year_3_rate: item.year_3_rate, year_4_rate: item.year_4_rate, year_5_rate: item.year_5_rate, effective_from: item.effective_from, effective_to: item.effective_to, notes: item.notes, function: (item as any).function || null }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };
  const handleConsultantChange = (v: string) => { setForm({ ...form, consultant_id: v, so_id: null }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.position_name.trim()) { toast.error("Position name is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    if (form.effective_from && form.effective_to && form.effective_to < form.effective_from) { toast.error("Effective To must be after Effective From"); return; }
    const dup = items.find(i => i.position_name.toLowerCase() === form.position_name.toLowerCase().trim() && i.consultant_id === form.consultant_id && i.id !== editing?.id);
    if (dup) { toast.error("This position name already exists for this consultant"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const numSet = (key: keyof PosForm, v: string) => setForm({ ...form, [key]: v ? parseFloat(v) : null });

  const filtered = items.filter((i) => {
    const s = search.toLowerCase();
    const matchSearch = !s || i.position_name.toLowerCase().includes(s) || (i.consultants?.short_name || "").toLowerCase().includes(s) || (i.position_id || "").toLowerCase().includes(s);
    if (!matchSearch) return false;
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const v = val.toLowerCase();
      if (key === "position_id" && !(i.position_id || "").toLowerCase().includes(v)) return false;
      if (key === "system_id" && !((i as any).system_id || "").toLowerCase().includes(v)) return false;
      if (key === "position_name" && !i.position_name.toLowerCase().includes(v)) return false;
      if (key === "function" && !((i as any).function || "").toLowerCase().includes(v)) return false;
      if (key === "consultant" && !(i.consultants?.short_name || "").toLowerCase().includes(v)) return false;
      if (key === "so" && !(i.service_orders?.so_number || "").toLowerCase().includes(v)) return false;
    }
    return true;
  });
  const { sorted, sort, toggleSort } = useSort(filtered, "position_name", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);

  const handleExport = () => { exportToExcel("positions.xlsx", exportCols, filtered.map(i => ({ ...i, position_id: i.position_id || "", system_id: (i as any).system_id || "", function: (i as any).function || "", consultant_name: i.consultants?.short_name || "", so_number: i.service_orders?.so_number || "" }))); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("positions-template.xlsx", importCols, { Consultants: consultants.map(c => c.short_name), "Service Orders": allServiceOrders.map(s => s.so_number) }); toast.success("Template downloaded"); };


  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Positions</h1><p className="page-subtitle">Rate card with yearly rates linked to SOs</p></div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} />
            <ColumnVisibilityToggle columns={posTableCols} visibleColumns={visibleColumns} onChange={setVisibleColumns} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Position</Button>
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
                {visibleColumns.has("pos_id") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Position ID" sortKey="position_id" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.position_id || ""} onChange={(v) => setColFilter("position_id", v)} label="Position ID" /></SortableHeader></th>}
                {visibleColumns.has("sys_id") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="System ID" sortKey="system_id" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.system_id || ""} onChange={(v) => setColFilter("system_id", v)} label="System ID" /></SortableHeader></th>}
                {visibleColumns.has("name") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Position" sortKey="position_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.position_name || ""} onChange={(v) => setColFilter("position_name", v)} label="Position" /></SortableHeader></th>}
                {visibleColumns.has("function") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Function" sortKey="function" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.function || ""} onChange={(v) => setColFilter("function", v)} label="Function" /></SortableHeader></th>}
                {visibleColumns.has("consultant") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Consultant" sortKey="consultants.short_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.consultant || ""} onChange={(v) => setColFilter("consultant", v)} label="Consultant" /></SortableHeader></th>}
                {visibleColumns.has("so") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="SO" sortKey="service_orders.so_number" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.so || ""} onChange={(v) => setColFilter("so", v)} label="SO" /></SortableHeader></th>}
                {visibleColumns.has("exp") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Exp" sortKey="total_years_of_exp" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("y1") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Y1 Rate" sortKey="year_1_rate" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("y2") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Y2 Rate" sortKey="year_2_rate" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("y3") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Y3 Rate" sortKey="year_3_rate" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("y4") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Y4 Rate" sortKey="year_4_rate" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("y5") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Y5 Rate" sortKey="year_5_rate" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("from") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="From" sortKey="effective_from" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("to") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="To" sortKey="effective_to" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{paginatedItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  {visibleColumns.has("pos_id") && <td className="px-4 py-2.5 font-mono text-xs text-primary">{item.position_id || "—"}</td>}
                  {visibleColumns.has("sys_id") && <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{(item as any).system_id || "—"}</td>}
                  {visibleColumns.has("name") && <td className="px-4 py-2.5 font-medium">{item.position_name}</td>}
                  {visibleColumns.has("function") && <td className="px-4 py-2.5 text-muted-foreground">{(item as any).function || "—"}</td>}
                  {visibleColumns.has("consultant") && <td className="px-4 py-2.5">{item.consultants?.short_name || "—"}</td>}
                  {visibleColumns.has("so") && <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.service_orders?.so_number || "—"}</td>}
                  {visibleColumns.has("exp") && <td className="px-4 py-2.5 text-center font-mono">{item.total_years_of_exp ?? "—"}</td>}
                  {visibleColumns.has("y1") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_1_rate)}</td>}
                  {visibleColumns.has("y2") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_2_rate)}</td>}
                  {visibleColumns.has("y3") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_3_rate)}</td>}
                  {visibleColumns.has("y4") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_4_rate)}</td>}
                  {visibleColumns.has("y5") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.year_5_rate)}</td>}
                  {visibleColumns.has("from") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.effective_from)}</td>}
                  {visibleColumns.has("to") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(item.effective_to)}</td>}
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? `Edit Position${(editing as any).system_id ? ` (${(editing as any).system_id})` : ""}` : "Add Position"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Position ID</Label><Input value={form.position_id} onChange={(e) => setForm({ ...form, position_id: e.target.value })} placeholder="e.g. SE-01" /></div>
              <div className="col-span-2 space-y-1.5"><Label>Position Name *</Label><Input value={form.position_name} onChange={(e) => setForm({ ...form, position_name: e.target.value })} /></div>
              <div className="col-span-3 space-y-1.5"><Label>Function</Label><Select value={form.function || ""} onValueChange={(v) => setForm({ ...form, function: v || null })}><SelectTrigger><SelectValue placeholder="Select function" /></SelectTrigger><SelectContent>{functionLookups.map(lv => <SelectItem key={lv.id} value={lv.value}>{lv.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={handleConsultantChange}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.short_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Service Order</Label><Select value={form.so_id || "none"} onValueChange={(v) => setForm({ ...form, so_id: v === "none" ? null : v })} disabled={!form.consultant_id}><SelectTrigger><SelectValue placeholder={form.consultant_id ? "Select" : "Select consultant first"} /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{filteredSOs.map((s) => <SelectItem key={s.id} value={s.id}>{s.so_number}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Total Exp (Yrs)</Label><Input type="number" value={form.total_years_of_exp ?? ""} onChange={(e) => numSet("total_years_of_exp", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 1 Rate</Label><Input type="number" value={form.year_1_rate ?? ""} onChange={(e) => numSet("year_1_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 2 Rate</Label><Input type="number" value={form.year_2_rate ?? ""} onChange={(e) => numSet("year_2_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 3 Rate</Label><Input type="number" value={form.year_3_rate ?? ""} onChange={(e) => numSet("year_3_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 4 Rate</Label><Input type="number" value={form.year_4_rate ?? ""} onChange={(e) => numSet("year_4_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Year 5 Rate</Label><Input type="number" value={form.year_5_rate ?? ""} onChange={(e) => numSet("year_5_rate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Effective From</Label><Input type="date" value={form.effective_from || ""} onChange={(e) => setForm({ ...form, effective_from: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Effective To</Label><Input type="date" value={form.effective_to || ""} onChange={(e) => setForm({ ...form, effective_to: e.target.value || null })} min={form.effective_from || undefined} /></div>
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
