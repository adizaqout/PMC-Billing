import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import ColumnVisibilityToggle, { useColumnVisibility, type ColumnDef } from "@/components/ColumnVisibilityToggle";
import ExcelToolbar from "@/components/ExcelToolbar";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Project = Tables<"projects">;
type ProjectInsert = TablesInsert<"projects">;

const emptyForm: Partial<ProjectInsert> = {
  project_name: "", project_number: "", entity: "", portfolio: "", project_type: "", classification: "",
  latest_budget: null, latest_pmc_budget: null, start_date: null, end_date: null, status: "active",
};

const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(v) : "—";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const excelDateToISO = (v: any): string | null => {
  if (v == null || String(v).trim() === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (!isNaN(n) && n > 0) { const d = new Date(Math.round((n - 25569) * 86400000)); return d.toISOString().slice(0, 10); }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const importColumns: ImportColumnDef[] = [
  { header: "Project Number", key: "project_number" },
  { header: "Project Name", key: "project_name", required: true },
  { header: "Entity", key: "entity" },
  { header: "Portfolio", key: "portfolio" },
  { header: "Type", key: "project_type" },
  { header: "Classification", key: "classification" },
  { header: "Start Date", key: "start_date", type: "date" },
  { header: "End Date", key: "end_date", type: "date" },
  { header: "Latest Budget", key: "latest_budget", type: "number" },
  { header: "PMC Budget", key: "latest_pmc_budget", type: "number" },
  { header: "Status", key: "status" },
];

const columns = [
  { header: "Project Number", key: "project_number", width: 18 },
  { header: "Project Name", key: "project_name", width: 30 },
  { header: "Entity", key: "entity", width: 20 },
  { header: "Portfolio", key: "portfolio", width: 20 },
  { header: "Type", key: "project_type", width: 15 },
  { header: "Classification", key: "classification", width: 15 },
  { header: "Start Date", key: "start_date", width: 14 },
  { header: "End Date", key: "end_date", width: 14 },
  { header: "Budget", key: "latest_budget", width: 15 },
  { header: "PMC Budget", key: "latest_pmc_budget", width: 15 },
  { header: "Status", key: "status", width: 10 },
];

const projTableCols: ColumnDef[] = [
  { key: "project_number", label: "Project No." },
  { key: "project_name", label: "Project Name" },
  { key: "entity", label: "Entity" },
  { key: "portfolio", label: "Portfolio" },
  { key: "start_date", label: "Start Date" },
  { key: "end_date", label: "End Date" },
  { key: "budget", label: "Budget" },
  { key: "pmc_budget", label: "PMC Budget" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
];

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<Partial<ProjectInsert>>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const { visibleColumns, setVisibleColumns } = useColumnVisibility(projTableCols);
  const queryClient = useQueryClient();

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("project_name");
      if (error) throw error;
      return data as Project[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: Partial<ProjectInsert> & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase.from("projects").update(values).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert(values as ProjectInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(editing ? "Project updated" : "Project created");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({ project_name: p.project_name, project_number: (p as any).project_number || "", entity: p.entity, portfolio: p.portfolio, project_type: p.project_type, classification: p.classification, start_date: p.start_date, end_date: p.end_date, latest_budget: p.latest_budget, latest_pmc_budget: p.latest_pmc_budget, status: p.status });
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm({ ...emptyForm }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_name?.trim()) { toast.error("Project name is required"); return; }
    const dup = projects.find(p => p.project_name.toLowerCase() === form.project_name!.toLowerCase().trim() && p.id !== editing?.id);
    if (dup) { toast.error("A project with this name already exists"); return; }
    if (form.project_number) {
      const numDup = projects.find(p => (p as any).project_number?.toLowerCase() === form.project_number!.toLowerCase().trim() && p.id !== editing?.id);
      if (numDup) { toast.error("A project with this number already exists"); return; }
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { toast.error("End date must be after start date"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const numVal = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

  const filtered = projects.filter((p) => {
    const s = search.toLowerCase();
    if (search && !p.project_name.toLowerCase().includes(s) && !((p as any).project_number || "").toLowerCase().includes(s)) return false;
    if (colFilters.project_number && !((p as any).project_number || "").toLowerCase().includes(colFilters.project_number.toLowerCase())) return false;
    if (colFilters.project_name && !p.project_name.toLowerCase().includes(colFilters.project_name.toLowerCase())) return false;
    if (colFilters.entity && !(p.entity || "").toLowerCase().includes(colFilters.entity.toLowerCase())) return false;
    if (colFilters.portfolio && !(p.portfolio || "").toLowerCase().includes(colFilters.portfolio.toLowerCase())) return false;
    if (colFilters.type && !(p.project_type || "").toLowerCase().includes(colFilters.type.toLowerCase())) return false;
    if (colFilters.status && !p.status.toLowerCase().includes(colFilters.status.toLowerCase())) return false;
    return true;
  });
  const { sorted, sort, toggleSort } = useSort(filtered, "project_name", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);

  const handleExport = () => {
    exportToExcel("projects.xlsx", columns, filtered.map(p => ({ ...p, project_number: (p as any).project_number || "" })));
    toast.success("Exported");
  };
  const handleTemplate = () => {
    downloadTemplate("projects-template.xlsx", columns);
    toast.success("Template downloaded");
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">Manage project master data</p>
          </div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} />
            <ColumnVisibilityToggle columns={projTableCols} visibleColumns={visibleColumns} onChange={setVisibleColumns} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Project</Button>
          </div>
        </div>

        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No projects found</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {visibleColumns.has("project_number") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Project No." sortKey="project_number" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.project_number || ""} onChange={(v) => setColFilter("project_number", v)} label="Project No." /></SortableHeader></th>}
                    {visibleColumns.has("project_name") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Project Name" sortKey="project_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.project_name || ""} onChange={(v) => setColFilter("project_name", v)} label="Project Name" /></SortableHeader></th>}
                    {visibleColumns.has("entity") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Entity" sortKey="entity" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.entity || ""} onChange={(v) => setColFilter("entity", v)} label="Entity" /></SortableHeader></th>}
                    {visibleColumns.has("portfolio") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Portfolio" sortKey="portfolio" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.portfolio || ""} onChange={(v) => setColFilter("portfolio", v)} label="Portfolio" /></SortableHeader></th>}
                    {visibleColumns.has("start_date") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Start" sortKey="start_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                    {visibleColumns.has("end_date") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="End" sortKey="end_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                    {visibleColumns.has("budget") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Budget (AED)" sortKey="latest_budget" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                    {visibleColumns.has("pmc_budget") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="PMC Budget" sortKey="latest_pmc_budget" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                    {visibleColumns.has("type") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Type" sortKey="project_type" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.type || ""} onChange={(v) => setColFilter("type", v)} label="Type" /></SortableHeader></th>}
                    {visibleColumns.has("status") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Status" sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.status || ""} onChange={(v) => setColFilter("status", v)} label="Status" /></SortableHeader></th>}
                    <th className="data-table-header w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      {visibleColumns.has("project_number") && <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{(p as any).project_number || "—"}</td>}
                      {visibleColumns.has("project_name") && <td className="px-4 py-2.5 font-medium">{p.project_name}</td>}
                      {visibleColumns.has("entity") && <td className="px-4 py-2.5 text-muted-foreground">{p.entity || "—"}</td>}
                      {visibleColumns.has("portfolio") && <td className="px-4 py-2.5 text-muted-foreground">{p.portfolio || "—"}</td>}
                      {visibleColumns.has("start_date") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(p.start_date)}</td>}
                      {visibleColumns.has("end_date") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(p.end_date)}</td>}
                      {visibleColumns.has("budget") && <td className="px-4 py-2.5 text-right font-mono">{fmt(p.latest_budget)}</td>}
                      {visibleColumns.has("pmc_budget") && <td className="px-4 py-2.5 text-right font-mono">{fmt(p.latest_pmc_budget)}</td>}
                      {visibleColumns.has("type") && <td className="px-4 py-2.5 text-center text-xs">{p.project_type || "—"}</td>}
                      {visibleColumns.has("status") && <td className="px-4 py-2.5 text-center"><StatusBadge status={p.status} /></td>}
                      <td className="px-4 py-2.5 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(p)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(p.id)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {filtered.length > 0 && <TablePagination totalItems={totalItems} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={setPageSize} />}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Project" : "Add Project"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Project Number</Label>
                <Input value={form.project_number || ""} onChange={(e) => setForm({ ...form, project_number: e.target.value })} placeholder="e.g. PRJ-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Project Name *</Label>
                <Input value={form.project_name || ""} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Entity</Label>
                <Input value={form.entity || ""} onChange={(e) => setForm({ ...form, entity: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Portfolio</Label>
                <Input value={form.portfolio || ""} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Input value={form.project_type || ""} onChange={(e) => setForm({ ...form, project_type: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Classification</Label>
                <Input value={form.classification || ""} onChange={(e) => setForm({ ...form, classification: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} min={form.start_date || undefined} />
              </div>
              <div className="space-y-1.5">
                <Label>Budget (AED)</Label>
                <Input type="number" value={form.latest_budget ?? ""} onChange={(e) => setForm({ ...form, latest_budget: numVal(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>PMC Budget (AED)</Label>
                <Input type="number" value={form.latest_pmc_budget ?? ""} onChange={(e) => setForm({ ...form, latest_pmc_budget: numVal(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || "active"} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                {editing ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
