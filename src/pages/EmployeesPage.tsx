import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useLookupValues } from "@/hooks/useLookupValues";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import ExcelToolbar from "@/components/ExcelToolbar";
import TablePagination from "@/components/TablePagination";
import ColumnFilter from "@/components/ColumnFilter";
import SortableHeader from "@/components/SortableHeader";
import { usePagination } from "@/hooks/usePagination";
import { useSort } from "@/hooks/useSort";
import { exportToExcel, downloadTemplate } from "@/lib/excel-utils";
import type { ImportProgress } from "@/components/ExcelToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Employee = Tables<"employees"> & { consultants?: { name: string } | null; positions?: { position_name: string; position_id?: string } | null };
type Consultant = { id: string; name: string };

interface EmployeeForm { employee_name: string; consultant_id: string; experience_years: number | null; start_date: string | null; end_date: string | null; status: string; }
const emptyForm: EmployeeForm = { employee_name: "", consultant_id: "", experience_years: null, start_date: null, end_date: null, status: "active" };

const excelCols = [
  { header: "Employee Name", key: "employee_name", width: 25 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "Position", key: "position_name", width: 20 },
  { header: "Exp (Years)", key: "experience_years", width: 12 },
  { header: "Start Date", key: "start_date", width: 14 },
  { header: "End Date", key: "end_date", width: 14 },
  { header: "Status", key: "status", width: 12 },
];

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const { data: statuses = [] } = useLookupValues("employee_status");

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => { const { data, error } = await supabase.from("employees").select("*, consultants(name), positions(position_name)").order("employee_name"); if (error) throw error; return data as Employee[]; },
  });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as Consultant[]; } });

  const upsertMutation = useMutation({
    mutationFn: async (values: EmployeeForm & { id?: string }) => {
      const payload = { employee_name: values.employee_name, consultant_id: values.consultant_id, experience_years: values.experience_years, start_date: values.start_date || null, end_date: values.end_date || null, status: values.status as any };
      if (values.id) { const { error } = await supabase.from("employees").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("employees").insert({ ...payload, consultant_id: values.consultant_id } as any); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); toast.success(editing ? "Employee updated" : "Employee created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("employees").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); toast.success("Employee deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (emp: Employee) => { setEditing(emp); setForm({ employee_name: emp.employee_name, consultant_id: emp.consultant_id, experience_years: emp.experience_years, start_date: emp.start_date, end_date: emp.end_date, status: emp.status }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm({ ...emptyForm }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_name.trim()) { toast.error("Name is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { toast.error("End date must be after start date"); return; }
    const dup = employees.find(i => i.employee_name.toLowerCase() === form.employee_name.toLowerCase().trim() && i.consultant_id === form.consultant_id && i.id !== editing?.id);
    if (dup) { toast.error("This employee name already exists for this consultant"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = employees.filter((e) => {
    const s = search.toLowerCase();
    if (s && !e.employee_name.toLowerCase().includes(s) && !(e.consultants?.name || "").toLowerCase().includes(s)) return false;
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const v = val.toLowerCase();
      if (key === "name" && !e.employee_name.toLowerCase().includes(v)) return false;
      if (key === "consultant" && !(e.consultants?.name || "").toLowerCase().includes(v)) return false;
      if (key === "position" && !(e.positions?.position_name || "").toLowerCase().includes(v)) return false;
      if (key === "status" && !e.status.toLowerCase().includes(v)) return false;
    }
    return true;
  });
  const { sorted, sort, toggleSort } = useSort(filtered, "employee_name", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const handleExport = () => { exportToExcel("employees.xlsx", excelCols, filtered.map(e => ({ ...e, consultant_name: e.consultants?.name || "", position_name: e.positions?.position_name || "" }))); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("employees-template.xlsx", excelCols, { Consultants: consultants.map(c => c.name), Statuses: statuses.map(s => s.label) }); toast.success("Template downloaded"); };
  const handleImportWithProgress = useCallback(async (
    rows: string[][], onProgress: (p: ImportProgress) => void
  ): Promise<ImportProgress> => {
    const total = rows.length - 1;
    const result: ImportProgress = { total, processed: 0, created: 0, errors: [] };
    for (let i = 1; i < rows.length; i++) {
      const [name, consultantName, , exp, startDate, endDate, status] = rows[i];
      if (!name?.trim()) { result.processed++; onProgress({ ...result }); continue; }
      const consultant = consultants.find(c => c.name.toLowerCase() === consultantName?.trim()?.toLowerCase());
      if (!consultant) { result.errors.push({ row: i + 1, message: `Consultant "${consultantName}" not found` }); result.processed++; onProgress({ ...result }); continue; }
      const { error } = await supabase.from("employees").insert({
        employee_name: name.trim(), consultant_id: consultant.id,
        experience_years: exp ? parseInt(String(exp)) : null,
        start_date: startDate?.trim() || null, end_date: endDate?.trim() || null,
        status: status?.trim()?.toLowerCase() || "active",
      } as any);
      if (error) result.errors.push({ row: i + 1, message: error.message }); else result.created++;
      result.processed++;
      onProgress({ ...result });
    }
    return result;
  }, [consultants]);
  const handleImportComplete = useCallback(() => { queryClient.invalidateQueries({ queryKey: ["employees"] }); }, [queryClient]);

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Employees</h1><p className="page-subtitle">Manage PMC consultant employees</p></div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={() => {}} onImportWithProgress={handleImportWithProgress} onImportComplete={handleImportComplete} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Employee</Button>
          </div>
        </div>
        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div> : filtered.length === 0 ? <div className="text-center py-12 text-sm text-muted-foreground">No employees found</div> : (
              <table className="w-full text-sm"><thead><tr className="border-b">
                <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Name" sortKey="employee_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.name || ""} onChange={(v) => setColFilter("name", v)} label="Name" /></SortableHeader></th>
                <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Consultant" sortKey="consultants.name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.consultant || ""} onChange={(v) => setColFilter("consultant", v)} label="Consultant" /></SortableHeader></th>
                <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Position" sortKey="positions.position_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.position || ""} onChange={(v) => setColFilter("position", v)} label="Position" /></SortableHeader></th>
                <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Exp (Yrs)" sortKey="experience_years" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>
                <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Start Date" sortKey="start_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>
                <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="End Date" sortKey="end_date" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>
                <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Status" sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.status || ""} onChange={(v) => setColFilter("status", v)} label="Status" /></SortableHeader></th>
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{paginatedItems.map((emp) => (
                <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{emp.employee_name}</td>
                  <td className="px-4 py-2.5">{emp.consultants?.name || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{emp.positions?.position_name || "—"}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{emp.experience_years ?? "—"}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(emp.start_date)}</td>
                  <td className="px-4 py-2.5 text-center text-xs">{fmtDate(emp.end_date)}</td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={emp.status} /></td>
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
              <div className="col-span-2 space-y-1.5"><Label>Employee Name *</Label><Input value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={(v) => setForm({ ...form, consultant_id: v })}><SelectTrigger><SelectValue placeholder="Select consultant" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Experience (Years)</Label><Input type="number" value={form.experience_years ?? ""} onChange={(e) => setForm({ ...form, experience_years: e.target.value ? parseInt(e.target.value) : null })} /></div>
              <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={form.end_date || ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} min={form.start_date || undefined} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
