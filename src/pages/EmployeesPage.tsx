import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useLookupValues } from "@/hooks/useLookupValues";
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
import { fetchAllRows } from "@/lib/fetchAllRows";
import type { SmartImportConfig, ImportColumnDef } from "@/components/import/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

type Employee = Tables<"employees"> & { consultants?: { short_name: string; consultant_type?: string } | null; positions?: { position_name: string; position_id: string } | null };
type Consultant = { id: string; short_name: string };
type Position = { id: string; position_id: string; position_name: string; consultant_id: string };

interface EmployeeForm { employee_id: string; employee_name: string; consultant_id: string; position_id: string; experience_years: number | null; start_date: string | null; end_date: string | null; status: string; active: boolean; deployment: string; }
const emptyForm: EmployeeForm = { employee_id: "", employee_name: "", consultant_id: "", position_id: "", experience_years: null, start_date: null, end_date: null, status: "active", active: true, deployment: "Projects" };

function normalizeDeployment(v: any): "Projects" | "Office" {
  const s = String(v || "").trim().toLowerCase();
  if (s === "office") return "Office";
  return "Projects";
}

function parseImportDate(val: any): string | null {
  if (val == null || String(val).trim() === "") return null;
  const n = Number(val);
  if (!isNaN(n) && n > 10000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

const excelCols = [
  { header: "Employee ID", key: "employee_id", width: 18 },
  { header: "Employee Name", key: "employee_name", width: 25 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "Position ID", key: "position_id_code", width: 16 },
  { header: "Position Name", key: "position_name", width: 20 },
  { header: "Exp (Years)", key: "experience_years", width: 12 },
  { header: "Start Date", key: "start_date", width: 14 },
  { header: "End Date", key: "end_date", width: 14 },
  { header: "Deployment", key: "deployment", width: 14 },
  { header: "Status", key: "status", width: 12 },
];

const importColumns: ImportColumnDef[] = [
  { header: "Employee ID", key: "employee_id", required: true },
  { header: "Employee Name", key: "employee_name" },
  { header: "Consultant", key: "consultant_name", required: true },
  { header: "Position ID", key: "position_id_code" },
  { header: "Position Name", key: "position_name" },
  { header: "Exp (Years)", key: "experience_years", type: "number" },
  { header: "Start Date", key: "start_date", type: "date" },
  { header: "End Date", key: "end_date", type: "date" },
  { header: "Deployment", key: "deployment" },
  { header: "Status", key: "status" },
];

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "PMC" | "Supervision">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const empTableCols: ColumnDef[] = [
     { key: "emp_id", label: "Emp ID" }, { key: "name", label: "Name" }, { key: "consultant", label: "Consultant" },
    { key: "pos_id", label: "Position ID" }, { key: "pos_name", label: "Position Name" }, { key: "exp", label: "Exp (Yrs)" },
    { key: "start", label: "Start Date" }, { key: "end", label: "End Date" }, { key: "deployment", label: "Deployment" }, { key: "active_flag", label: "Active" }, { key: "status", label: "Status" },
  ];
  const { visibleColumns, setVisibleColumns } = useColumnVisibility(empTableCols);
  const queryClient = useQueryClient();
  const { data: statuses = [] } = useLookupValues("employee_status");

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => fetchAllRows<Employee>(() => supabase.from("employees").select("*, consultants(short_name, consultant_type), positions(position_id, position_name)").order("employee_name")),
  });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => fetchAllRows<Consultant>(() => supabase.from("consultants").select("id, short_name").eq("status", "active").order("short_name")) });
  const { data: allPositions = [] } = useQuery({ queryKey: ["positions-list"], queryFn: async () => fetchAllRows<Position>(() => supabase.from("positions").select("id, position_id, position_name, consultant_id").order("position_name")) });

  const upsertMutation = useMutation({
    mutationFn: async (values: EmployeeForm & { id?: string }) => {
      const payload = { employee_id: values.employee_id || null, employee_name: values.employee_name, consultant_id: values.consultant_id, position_id: values.position_id || null, experience_years: values.experience_years, start_date: values.start_date || null, end_date: values.end_date || null, status: values.status as any, active: values.active, deployment: normalizeDeployment(values.deployment) };
      if (values.id) { const { error } = await supabase.from("employees").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("employees").insert({ ...payload } as any); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); toast.success(editing ? "Employee updated" : "Employee created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("employees").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); toast.success("Employee deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (emp: Employee) => { setEditing(emp); setForm({ employee_id: (emp as any).employee_id || "", employee_name: emp.employee_name, consultant_id: emp.consultant_id, position_id: emp.position_id || "", experience_years: emp.experience_years, start_date: emp.start_date, end_date: emp.end_date, status: emp.status, active: emp.active, deployment: ((emp as any).deployment || "Projects") }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm({ ...emptyForm }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_name.trim()) { toast.error("Name is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    if (form.employee_id.trim()) {
      const dupId = employees.find(i => (i as any).employee_id?.toLowerCase() === form.employee_id.trim().toLowerCase() && i.consultant_id === form.consultant_id && i.id !== editing?.id);
      if (dupId) { toast.error("This Employee ID already exists for this consultant"); return; }
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { toast.error("End date must be after start date"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = employees.filter((e) => {
    const s = search.toLowerCase();
    const ct = (e.consultants?.consultant_type || "PMC");
    if (typeFilter !== "all" && ct !== typeFilter) return false;
    if (s && !e.employee_name.toLowerCase().includes(s) && !(e.consultants?.short_name || "").toLowerCase().includes(s) && !((e as any).employee_id || "").toLowerCase().includes(s)) return false;
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const v = val.toLowerCase();
      if (key === "employee_id" && !((e as any).employee_id || "").toLowerCase().includes(v)) return false;
      if (key === "name" && !e.employee_name.toLowerCase().includes(v)) return false;
      if (key === "consultant" && !(e.consultants?.short_name || "").toLowerCase().includes(v)) return false;
      if (key === "position" && !(e.positions?.position_name || "").toLowerCase().includes(v)) return false;
      if (key === "status" && !e.status.toLowerCase().includes(v)) return false;
      if (key === "deployment" && !((e as any).deployment || "Projects").toLowerCase().includes(v)) return false;
    }
    return true;
  });
  const { sorted, sort, toggleSort } = useSort(filtered, "employee_name", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const handleExport = () => { exportToExcel("employees.xlsx", excelCols, filtered.map(e => ({ ...e, employee_id: (e as any).employee_id || "", consultant_name: e.consultants?.short_name || "", position_id_code: e.positions?.position_id || "", position_name: e.positions?.position_name || "", deployment: (e as any).deployment || "Projects" }))); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("employees-template.xlsx", excelCols, { Consultants: consultants.map(c => c.short_name), "Position IDs": allPositions.map(p => `${p.position_id} — ${p.position_name}`), Statuses: statuses.map(s => s.label), Deployments: ["Projects", "Office"] }); toast.success("Template downloaded"); };

  const smartImportConfig: SmartImportConfig = useMemo(() => ({
    entityName: "Employees",
    columns: importColumns,
    businessKeys: ["employee_id", "consultant_name"],
    fetchExisting: async () => {
      const data = await fetchAllRows<any>(() => supabase.from("employees").select("*, consultants(short_name), positions(position_id, position_name)").order("employee_name"));
      return (data || []).map((e: any) => ({
        _id: e.id,
        employee_id: e.employee_id || "",
        employee_name: e.employee_name || "",
        consultant_name: e.consultants?.short_name || "",
        position_id_code: e.positions?.position_id || "",
        position_name: e.positions?.position_name || "",
        experience_years: e.experience_years != null ? String(e.experience_years) : "",
        start_date: e.start_date || "",
        end_date: e.end_date || "",
        status: e.status || "",
        deployment: e.deployment || "Projects",
      }));
    },
    executeInsert: async (rec) => {
      const consultant = consultants.find(c => c.short_name.toLowerCase() === rec.consultant_name?.trim()?.toLowerCase());
      if (!consultant) return `Consultant "${rec.consultant_name}" not found`;
      const posIdStr = rec.position_id_code?.trim() || "";
      const pos = posIdStr ? allPositions.find(p => p.position_id.toLowerCase() === posIdStr.toLowerCase() && p.consultant_id === consultant.id) : null;
      if (posIdStr && !pos) return `Position ID "${posIdStr}" not found for this consultant`;
      const nameTrimmed = rec.employee_name?.trim() || "";
      const isTba = !nameTrimmed;
      const { error } = await supabase.from("employees").insert({
        employee_id: rec.employee_id?.trim() || null,
        employee_name: isTba ? "TBA" : nameTrimmed,
        consultant_id: consultant.id,
        position_id: pos?.id || null,
        experience_years: rec.experience_years ? parseInt(rec.experience_years) : null,
        start_date: isTba ? null : parseImportDate(rec.start_date),
        end_date: isTba ? null : parseImportDate(rec.end_date),
        status: isTba ? "pending" : (rec.status?.trim()?.toLowerCase() || "active"),
        deployment: normalizeDeployment(rec.deployment),
      } as any);
      return error?.message || null;
    },
    executeUpdate: async (id, rec) => {
      const consultant = consultants.find(c => c.short_name.toLowerCase() === rec.consultant_name?.trim()?.toLowerCase());
      if (!consultant) return `Consultant "${rec.consultant_name}" not found`;
      const posIdStr = rec.position_id_code?.trim() || "";
      const pos = posIdStr ? allPositions.find(p => p.position_id.toLowerCase() === posIdStr.toLowerCase() && p.consultant_id === consultant.id) : null;
      const nameUpd = rec.employee_name?.trim() || "";
      const isTbaUpd = !nameUpd;
      const { error } = await supabase.from("employees").update({
        employee_id: rec.employee_id?.trim() || null,
        employee_name: isTbaUpd ? "TBA" : nameUpd,
        consultant_id: consultant.id,
        position_id: pos?.id || null,
        experience_years: rec.experience_years ? parseInt(rec.experience_years) : null,
        start_date: isTbaUpd ? null : parseImportDate(rec.start_date),
        end_date: isTbaUpd ? null : parseImportDate(rec.end_date),
        status: isTbaUpd ? "pending" : (rec.status?.trim()?.toLowerCase() || "active"),
        deployment: normalizeDeployment(rec.deployment),
      }).eq("id", id);
      return error?.message || null;
    },
    onComplete: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); },
  }), [consultants, allPositions, queryClient]);

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Employees</h1><p className="page-subtitle">Manage PMC consultant employees</p></div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} smartImportConfig={smartImportConfig} />
            <ColumnVisibilityToggle columns={empTableCols} visibleColumns={visibleColumns} onChange={setVisibleColumns} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Employee</Button>
          </div>
        </div>
        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm min-w-[200px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-1">
              <span className="px-2 text-xs font-semibold uppercase text-muted-foreground">Consultant Type</span>
              <div className="inline-flex overflow-hidden rounded-sm border bg-background" aria-label="Consultant Type filter">
                {(["all","PMC","Supervision"] as const).map(opt => (
                  <button key={opt} onClick={() => setTypeFilter(opt)} className={`h-8 min-w-24 px-3 text-xs font-medium transition-colors ${typeFilter === opt ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                    {opt === "all" ? "All Types" : opt}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : filtered.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No employees found</div> : (
              <table className="w-full text-sm"><thead><tr className="border-b">
                {visibleColumns.has("emp_id") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Emp ID" sortKey="employee_id" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.employee_id || ""} onChange={(v) => setColFilter("employee_id", v)} label="Emp ID" /></SortableHeader></th>}
                {visibleColumns.has("name") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Name" sortKey="employee_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.name || ""} onChange={(v) => setColFilter("name", v)} label="Name" /></SortableHeader></th>}
                {visibleColumns.has("consultant") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Consultant" sortKey="consultants.short_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.consultant || ""} onChange={(v) => setColFilter("consultant", v)} label="Consultant" /></SortableHeader></th>}
                {visibleColumns.has("pos_id") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Position ID" sortKey="positions.position_id" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("pos_name") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Position Name" sortKey="positions.position_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.position || ""} onChange={(v) => setColFilter("position", v)} label="Position" /></SortableHeader></th>}
                {visibleColumns.has("exp") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Exp (Yrs)" sortKey="experience_years" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("start") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Start Date" sortKey="start_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("end") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="End Date" sortKey="end_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("deployment") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Deployment" sortKey="deployment" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.deployment || ""} onChange={(v) => setColFilter("deployment", v)} label="Deployment" /></SortableHeader></th>}
                {visibleColumns.has("active_flag") && <th className="data-table-header text-center px-4 py-2.5">Active</th>}
                {visibleColumns.has("status") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Status" sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.status || ""} onChange={(v) => setColFilter("status", v)} label="Status" /></SortableHeader></th>}
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{paginatedItems.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  {visibleColumns.has("emp_id") && <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{(emp as any).employee_id || "—"}</td>}
                  {visibleColumns.has("name") && <td className="px-4 py-2.5 font-medium">{emp.employee_name}</td>}
                  {visibleColumns.has("consultant") && <td className="px-4 py-2.5">{emp.consultants?.short_name || "—"}</td>}
                  {visibleColumns.has("pos_id") && <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{emp.positions?.position_id || "—"}</td>}
                  {visibleColumns.has("pos_name") && <td className="px-4 py-2.5 text-muted-foreground">{emp.positions?.position_name || "—"}</td>}
                  {visibleColumns.has("exp") && <td className="px-4 py-2.5 text-center font-mono">{emp.experience_years ?? "—"}</td>}
                  {visibleColumns.has("start") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(emp.start_date)}</td>}
                  {visibleColumns.has("end") && <td className="px-4 py-2.5 text-center text-xs">{fmtDate(emp.end_date)}</td>}
                  {visibleColumns.has("deployment") && <td className="px-4 py-2.5 text-center">{(emp as any).deployment || "Projects"}</td>}
                  {visibleColumns.has("active_flag") && <td className="px-4 py-2.5 text-center"><Switch checked={emp.active} onCheckedChange={async (checked) => { await supabase.from("employees").update({ active: checked }).eq("id", emp.id); queryClient.invalidateQueries({ queryKey: ["employees"] }); }} /></td>}
                  {visibleColumns.has("status") && <td className="px-4 py-2.5 text-center"><StatusBadge status={emp.status} /></td>}
                  <td className="px-4 py-2.5 text-center">
                    <DropdownMenu><DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(emp)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(emp.id)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Employee ID</Label><Input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="e.g. EMP-001" /></div>
              <div className="space-y-1.5"><Label>Employee Name *</Label><Input value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={(v) => setForm({ ...form, consultant_id: v, position_id: "" })}><SelectTrigger><SelectValue placeholder="Select consultant" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.short_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2 space-y-1.5"><Label>Position</Label><Select value={form.position_id} onValueChange={(v) => setForm({ ...form, position_id: v })}><SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger><SelectContent>{allPositions.filter(p => p.consultant_id === form.consultant_id).map((p) => <SelectItem key={p.id} value={p.id}>{p.position_id} — {p.position_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Experience (Years)</Label><Input type="number" value={form.experience_years ?? ""} onChange={(e) => setForm({ ...form, experience_years: e.target.value ? parseInt(e.target.value) : null })} /></div>
              <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Deployment</Label><Select value={form.deployment || "Projects"} onValueChange={(v) => setForm({ ...form, deployment: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Projects">Projects</SelectItem><SelectItem value="Office">Office</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} min={form.start_date || undefined} /></div>
              <div className="flex items-center gap-2 col-span-2"><Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} /><Label>Active</Label></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
