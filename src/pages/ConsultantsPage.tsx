import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import ExcelToolbar from "@/components/ExcelToolbar";
import TablePagination from "@/components/TablePagination";
import ColumnFilter from "@/components/ColumnFilter";
import { usePagination } from "@/hooks/usePagination";
import { exportToExcel, downloadTemplate, parseExcelFile } from "@/lib/excel-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Consultant = Tables<"consultants">;
type ConsultantInsert = TablesInsert<"consultants">;

const emptyForm: Partial<ConsultantInsert> = {
  name: "", commercial_registration_no: "", tax_registration_no: "", contact_email: "", contact_phone: "", address: "", status: "active",
};

const columns = [
  { header: "Name", key: "name", width: 30 },
  { header: "CR No.", key: "commercial_registration_no", width: 20 },
  { header: "Tax No.", key: "tax_registration_no", width: 20 },
  { header: "Email", key: "contact_email", width: 25 },
  { header: "Phone", key: "contact_phone", width: 18 },
  { header: "Address", key: "address", width: 30 },
  { header: "Status", key: "status", width: 10 },
];

export default function ConsultantsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Consultant | null>(null);
  const [form, setForm] = useState<Partial<ConsultantInsert>>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consultants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultants"] });
      toast.success("Consultant deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (c: Consultant) => {
    setEditing(c);
    setForm({ name: c.name, commercial_registration_no: c.commercial_registration_no, tax_registration_no: c.tax_registration_no, contact_email: c.contact_email, contact_phone: c.contact_phone, address: c.address, status: c.status });
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm({ ...emptyForm }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error("Name is required"); return; }
    const dup = consultants.find(c => c.name.toLowerCase() === form.name!.toLowerCase().trim() && c.id !== editing?.id);
    if (dup) { toast.error("A consultant with this name already exists"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = consultants.filter((c) => {
    const s = search.toLowerCase();
    if (s && !c.name.toLowerCase().includes(s)) return false;
    for (const [key, val] of Object.entries(colFilters)) {
      if (!val) continue;
      const v = val.toLowerCase();
      if (key === "name" && !c.name.toLowerCase().includes(v)) return false;
      if (key === "cr" && !(c.commercial_registration_no || "").toLowerCase().includes(v)) return false;
      if (key === "tax" && !(c.tax_registration_no || "").toLowerCase().includes(v)) return false;
      if (key === "email" && !(c.contact_email || "").toLowerCase().includes(v)) return false;
      if (key === "phone" && !(c.contact_phone || "").toLowerCase().includes(v)) return false;
      if (key === "status" && !c.status.toLowerCase().includes(v)) return false;
    }
    return true;
  });
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(filtered);

  const handleExport = () => { exportToExcel("consultants.xlsx", columns, filtered); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("consultants-template.xlsx", columns); toast.success("Template downloaded"); };
  const handleImport = async (file: File) => {
    try {
      const rows = await parseExcelFile(file);
      if (rows.length < 2) { toast.error("File is empty"); return; }
      const errors: string[] = [];
      let created = 0;
      for (let i = 1; i < rows.length; i++) {
        const [name, crNo, taxNo, email, phone, address, status] = rows[i];
        if (!name?.trim()) continue;
        const { error } = await supabase.from("consultants").insert({
          name: name.trim(), commercial_registration_no: crNo?.trim() || null, tax_registration_no: taxNo?.trim() || null,
          contact_email: email?.trim() || null, contact_phone: phone?.trim() || null, address: address?.trim() || null,
          status: (status?.trim()?.toLowerCase() === "inactive" ? "inactive" : "active") as any,
        });
        if (error) errors.push(`Row ${i + 1}: ${error.message}`);
        else created++;
      }
      queryClient.invalidateQueries({ queryKey: ["consultants"] });
      if (errors.length) toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join("; ")}`);
      if (created) toast.success(`${created} consultant(s) imported`);
    } catch { toast.error("Failed to parse file"); }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Consultants</h1>
            <p className="page-subtitle">Manage PMC consultant companies</p>
          </div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={handleImport} />
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
                    <th className="data-table-header text-left px-4 py-2.5">Name<ColumnFilter value={colFilters.name || ""} onChange={(v) => setColFilter("name", v)} label="Name" /></th>
                    <th className="data-table-header text-left px-4 py-2.5">CR No.<ColumnFilter value={colFilters.cr || ""} onChange={(v) => setColFilter("cr", v)} label="CR No." /></th>
                    <th className="data-table-header text-left px-4 py-2.5">Tax No.<ColumnFilter value={colFilters.tax || ""} onChange={(v) => setColFilter("tax", v)} label="Tax No." /></th>
                    <th className="data-table-header text-left px-4 py-2.5">Email<ColumnFilter value={colFilters.email || ""} onChange={(v) => setColFilter("email", v)} label="Email" /></th>
                    <th className="data-table-header text-left px-4 py-2.5">Phone<ColumnFilter value={colFilters.phone || ""} onChange={(v) => setColFilter("phone", v)} label="Phone" /></th>
                    <th className="data-table-header text-center px-4 py-2.5">Status<ColumnFilter value={colFilters.status || ""} onChange={(v) => setColFilter("status", v)} label="Status" /></th>
                    <th className="data-table-header w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.commercial_registration_no || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.tax_registration_no || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{c.contact_email || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{c.contact_phone || "—"}</td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-2.5 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(c)}><Pencil size={14} className="mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(c.id)}><Trash2 size={14} className="mr-2" />Delete</DropdownMenuItem>
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
              <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>CR No.</Label><Input value={form.commercial_registration_no || ""} onChange={(e) => setForm({ ...form, commercial_registration_no: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tax No.</Label><Input value={form.tax_registration_no || ""} onChange={(e) => setForm({ ...form, tax_registration_no: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || "active"} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
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
