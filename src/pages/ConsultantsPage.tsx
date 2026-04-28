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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type Consultant = Tables<"consultants">;
type ConsultantInsert = TablesInsert<"consultants">;

const emptyForm: Partial<ConsultantInsert> = {
  short_name: "", name: "", commercial_registration_no: "", tax_registration_no: "", contact_email: "", contact_phone: "", address: "", status: "active", consultant_type: "PMC" as any,
};

const columns = [
  { header: "Short Name", key: "short_name", width: 20 },
  { header: "Name", key: "name", width: 30 },
  { header: "Consultant Type", key: "consultant_type", width: 18 },
  { header: "CR No.", key: "commercial_registration_no", width: 20 },
  { header: "Tax No.", key: "tax_registration_no", width: 20 },
  { header: "Email", key: "contact_email", width: 25 },
  { header: "Phone", key: "contact_phone", width: 18 },
  { header: "Address", key: "address", width: 30 },
  { header: "Status", key: "status", width: 10 },
];

const tableCols: ColumnDef[] = [
  { key: "shortName", label: "Short Name" },
  { key: "name", label: "Name" },
  { key: "consultantType", label: "Consultant Type" },
  { key: "cr", label: "CR No." },
  { key: "tax", label: "Tax No." },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
];

const importColumns: ImportColumnDef[] = [
  { header: "Short Name", key: "short_name", required: true },
  { header: "Name", key: "name", required: true, aliases: ["Long Name", "Name (Long)"] },
  { header: "Consultant Type", key: "consultant_type", aliases: ["Type"] },
  { header: "CR No.", key: "commercial_registration_no", aliases: ["Commercial Registration No."] },
  { header: "Tax No.", key: "tax_registration_no", aliases: ["Tax Registration No."] },
  { header: "Email", key: "contact_email", aliases: ["Contact Email"] },
  { header: "Phone", key: "contact_phone", aliases: ["Contact Phone"] },
  { header: "Address", key: "address" },
  { header: "Status", key: "status" },
];

function normalizeConsultantType(v: any): "PMC" | "Supervision" {
  const s = String(v || "").trim().toLowerCase();
  if (s === "supervision") return "Supervision";
  return "PMC";
}

export default function ConsultantsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Consultant | null>(null);
  const [form, setForm] = useState<Partial<ConsultantInsert>>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Consultant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { visibleColumns, setVisibleColumns } = useColumnVisibility(tableCols);
  const queryClient = useQueryClient();
  const { isSuperAdmin, roles } = useAuth();
  const isAdmin = isSuperAdmin || roles.includes("admin");

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));
  const v = (key: string) => visibleColumns.has(key);

  const { data: consultants = [], isLoading } = useQuery({
    queryKey: ["consultants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("*").order("name");
      if (error) throw error;
      return data as Consultant[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: Partial<ConsultantInsert> & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase.from("consultants").update(values).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("consultants").insert(values as ConsultantInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultants"] });
      toast.success(editing ? "Consultant updated" : "Consultant created");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-consultant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ consultant_id: deleteTarget.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Delete failed");
      queryClient.invalidateQueries({ queryKey: ["consultants"] });
      toast.success(`Consultant "${deleteTarget.name}" and all linked data deleted`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (c: Consultant) => {
    setEditing(c);
    setForm({ short_name: c.short_name, name: c.name, commercial_registration_no: c.commercial_registration_no, tax_registration_no: c.tax_registration_no, contact_email: c.contact_email, contact_phone: c.contact_phone, address: c.address, status: c.status, consultant_type: ((c as any).consultant_type || "PMC") as any });
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm({ ...emptyForm }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.short_name?.trim()) { toast.error("Short name is required"); return; }
    if (!form.name?.trim()) { toast.error("Name is required"); return; }
    const dup = consultants.find(c => c.name.toLowerCase() === form.name!.toLowerCase().trim() && c.id !== editing?.id);
    if (dup) { toast.error("A consultant with this name already exists"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = consultants.filter((c) => {
    const s = search.toLowerCase();
    if (s && !(c.short_name || "").toLowerCase().includes(s) && !c.name.toLowerCase().includes(s)) return false;
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const lv = val.toLowerCase();
      if (key === "shortName" && !(c.short_name || "").toLowerCase().includes(lv)) return false;
      if (key === "name" && !c.name.toLowerCase().includes(lv)) return false;
      if (key === "cr" && !(c.commercial_registration_no || "").toLowerCase().includes(lv)) return false;
      if (key === "tax" && !(c.tax_registration_no || "").toLowerCase().includes(lv)) return false;
      if (key === "email" && !(c.contact_email || "").toLowerCase().includes(lv)) return false;
      if (key === "phone" && !(c.contact_phone || "").toLowerCase().includes(lv)) return false;
      if (key === "status" && !c.status.toLowerCase().includes(lv)) return false;
      if (key === "consultantType" && !((c as any).consultant_type || "PMC").toLowerCase().includes(lv)) return false;
    }
    return true;
  });
  const { sorted, sort, toggleSort } = useSort(filtered, "short_name", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);

  const handleExport = () => { exportToExcel("consultants.xlsx", columns, filtered); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("consultants-template.xlsx", columns, { "Consultant Types": ["PMC", "Supervision"], Statuses: ["active", "inactive"] }); toast.success("Template downloaded"); };

  const smartImportConfig: SmartImportConfig = useMemo(() => ({
    entityName: "Consultants",
    columns: importColumns,
    businessKeys: ["short_name"],
    fetchExisting: async () => {
      const { data, error } = await supabase.from("consultants").select("*").order("name");
      if (error) throw error;
      return (data || []).map(c => ({
        _id: c.id,
        short_name: c.short_name || "",
        name: c.name || "",
        commercial_registration_no: c.commercial_registration_no || "",
        tax_registration_no: c.tax_registration_no || "",
        contact_email: c.contact_email || "",
        contact_phone: c.contact_phone || "",
        address: c.address || "",
        status: c.status || "",
        consultant_type: (c as any).consultant_type || "PMC",
      }));
    },
    executeInsert: async (rec) => {
      const { error } = await supabase.from("consultants").insert({
        short_name: rec.short_name?.trim() || "", name: rec.name?.trim() || "",
        commercial_registration_no: rec.commercial_registration_no?.trim() || null,
        tax_registration_no: rec.tax_registration_no?.trim() || null,
        contact_email: rec.contact_email?.trim() || null,
        contact_phone: rec.contact_phone?.trim() || null,
        address: rec.address?.trim() || null,
        status: (rec.status?.trim()?.toLowerCase() === "inactive" ? "inactive" : "active") as any,
        consultant_type: normalizeConsultantType(rec.consultant_type),
      } as any);
      return error?.message || null;
    },
    executeUpdate: async (id, rec) => {
      const { error } = await supabase.from("consultants").update({
        short_name: rec.short_name?.trim() || undefined,
        name: rec.name?.trim() || undefined,
        commercial_registration_no: rec.commercial_registration_no?.trim() || null,
        tax_registration_no: rec.tax_registration_no?.trim() || null,
        contact_email: rec.contact_email?.trim() || null,
        contact_phone: rec.contact_phone?.trim() || null,
        address: rec.address?.trim() || null,
        status: (rec.status?.trim()?.toLowerCase() === "inactive" ? "inactive" : "active") as any,
        consultant_type: normalizeConsultantType(rec.consultant_type),
      } as any).eq("id", id);
      return error?.message || null;
    },
    onComplete: () => { queryClient.invalidateQueries({ queryKey: ["consultants"] }); },
  }), [queryClient]);

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Consultants</h1>
            <p className="page-subtitle">Manage PMC consultant companies</p>
          </div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} smartImportConfig={smartImportConfig} />
            <ColumnVisibilityToggle columns={tableCols} visibleColumns={visibleColumns} onChange={setVisibleColumns} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Consultant</Button>
          </div>
        </div>

        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search consultants..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No consultants found</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {v("shortName") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Short Name" sortKey="short_name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.shortName || ""} onChange={(lv) => setColFilter("shortName", lv)} label="Short Name" /></SortableHeader></th>}
                    {v("name") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Name" sortKey="name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.name || ""} onChange={(lv) => setColFilter("name", lv)} label="Name" /></SortableHeader></th>}
                    {v("consultantType") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Consultant Type" sortKey="consultant_type" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.consultantType || ""} onChange={(lv) => setColFilter("consultantType", lv)} label="Consultant Type" /></SortableHeader></th>}
                    {v("cr") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="CR No." sortKey="commercial_registration_no" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.cr || ""} onChange={(lv) => setColFilter("cr", lv)} label="CR No." /></SortableHeader></th>}
                    {v("tax") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Tax No." sortKey="tax_registration_no" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.tax || ""} onChange={(lv) => setColFilter("tax", lv)} label="Tax No." /></SortableHeader></th>}
                    {v("email") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Email" sortKey="contact_email" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.email || ""} onChange={(lv) => setColFilter("email", lv)} label="Email" /></SortableHeader></th>}
                    {v("phone") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Phone" sortKey="contact_phone" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.phone || ""} onChange={(lv) => setColFilter("phone", lv)} label="Phone" /></SortableHeader></th>}
                    {v("status") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Status" sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.status || ""} onChange={(lv) => setColFilter("status", lv)} label="Status" /></SortableHeader></th>}
                    <th className="data-table-header w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      {v("shortName") && <td className="px-4 py-2.5 font-medium">{c.short_name || "—"}</td>}
                      {v("name") && <td className="px-4 py-2.5">{c.name}</td>}
                      {v("consultantType") && <td className="px-4 py-2.5">{(c as any).consultant_type || "PMC"}</td>}
                      {v("cr") && <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.commercial_registration_no || "—"}</td>}
                      {v("tax") && <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.tax_registration_no || "—"}</td>}
                      {v("email") && <td className="px-4 py-2.5 text-muted-foreground">{c.contact_email || "—"}</td>}
                      {v("phone") && <td className="px-4 py-2.5 text-muted-foreground">{c.contact_phone || "—"}</td>}
                      {v("status") && <td className="px-4 py-2.5 text-center"><StatusBadge status={c.status} /></td>}
                      <td className="px-4 py-2.5 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(c)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                            {isAdmin && <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(c)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>}
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
          <DialogHeader><DialogTitle>{editing ? "Edit Consultant" : "Add Consultant"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Short Name</Label><Input value={form.short_name || ""} onChange={(e) => setForm({ ...form, short_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Name (Long) *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>CR No.</Label><Input value={form.commercial_registration_no || ""} onChange={(e) => setForm({ ...form, commercial_registration_no: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tax No.</Label><Input value={form.tax_registration_no || ""} onChange={(e) => setForm({ ...form, tax_registration_no: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || "active"} onValueChange={(lv) => setForm({ ...form, status: lv as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Consultant Type</Label>
                <Select value={(form as any).consultant_type || "PMC"} onValueChange={(lv) => setForm({ ...form, consultant_type: lv as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PMC">PMC</SelectItem><SelectItem value="Supervision">Supervision</SelectItem></SelectContent>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Consultant</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete <strong>{deleteTarget?.name}</strong> and ALL linked data (employees, positions, service orders, POs, invoices, deployment data). This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
