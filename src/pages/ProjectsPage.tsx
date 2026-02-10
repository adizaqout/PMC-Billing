import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import ExcelToolbar from "@/components/ExcelToolbar";
import TablePagination from "@/components/TablePagination";
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

type Project = Tables<"projects">;
type ProjectInsert = TablesInsert<"projects">;

const emptyForm: Partial<ProjectInsert> = {
  project_name: "", project_number: "", entity: "", portfolio: "", project_type: "", classification: "",
  latest_budget: null, latest_pmc_budget: null, status: "active",
};

const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(v) : "—";

const columns = [
  { header: "Project Number", key: "project_number", width: 18 },
  { header: "Project Name", key: "project_name", width: 30 },
  { header: "Entity", key: "entity", width: 20 },
  { header: "Portfolio", key: "portfolio", width: 20 },
  { header: "Type", key: "project_type", width: 15 },
  { header: "Classification", key: "classification", width: 15 },
  { header: "Budget", key: "latest_budget", width: 15 },
  { header: "PMC Budget", key: "latest_pmc_budget", width: 15 },
  { header: "Status", key: "status", width: 10 },
];

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<Partial<ProjectInsert>>(emptyForm);
  const queryClient = useQueryClient();

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
    setForm({ project_name: p.project_name, project_number: (p as any).project_number || "", entity: p.entity, portfolio: p.portfolio, project_type: p.project_type, classification: p.classification, latest_budget: p.latest_budget, latest_pmc_budget: p.latest_pmc_budget, status: p.status });
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
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const numVal = (v: string) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const filtered = projects.filter((p) => 
    p.project_name.toLowerCase().includes(search.toLowerCase()) ||
    ((p as any).project_number || "").toLowerCase().includes(search.toLowerCase())
  );
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(filtered);

  const handleExport = () => {
    exportToExcel("projects.xlsx", columns, filtered.map(p => ({ ...p, project_number: (p as any).project_number || "" })));
    toast.success("Exported");
  };
  const handleTemplate = () => {
    downloadTemplate("projects-template.xlsx", columns);
    toast.success("Template downloaded");
  };
  const handleImport = async (file: File) => {
    try {
      const rows = await parseExcelFile(file);
      if (rows.length < 2) { toast.error("File is empty"); return; }
      const errors: string[] = [];
      let created = 0;
      for (let i = 1; i < rows.length; i++) {
        const [projNum, projName, entity, portfolio, projType, classification, budget, pmcBudget, status] = rows[i];
        if (!projName?.trim()) continue;
        const { error } = await supabase.from("projects").insert({
          project_number: projNum?.trim() || null,
          project_name: projName.trim(),
          entity: entity?.trim() || null,
          portfolio: portfolio?.trim() || null,
          project_type: projType?.trim() || null,
          classification: classification?.trim() || null,
          latest_budget: budget ? parseFloat(String(budget)) : null,
          latest_pmc_budget: pmcBudget ? parseFloat(String(pmcBudget)) : null,
          status: (status?.trim()?.toLowerCase() === "inactive" ? "inactive" : "active") as any,
        } as any);
        if (error) errors.push(`Row ${i + 1}: ${error.message}`);
        else created++;
      }
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (errors.length) toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join("; ")}`);
      if (created) toast.success(`${created} project(s) imported`);
    } catch { toast.error("Failed to parse file"); }
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
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={handleImport} />
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
                    <th className="data-table-header text-left px-4 py-2.5">Project No.</th>
                    <th className="data-table-header text-left px-4 py-2.5">Project Name</th>
                    <th className="data-table-header text-left px-4 py-2.5">Entity</th>
                    <th className="data-table-header text-left px-4 py-2.5">Portfolio</th>
                    <th className="data-table-header text-right px-4 py-2.5">Budget (AED)</th>
                    <th className="data-table-header text-right px-4 py-2.5">PMC Budget</th>
                    <th className="data-table-header text-center px-4 py-2.5">Type</th>
                    <th className="data-table-header text-center px-4 py-2.5">Status</th>
                    <th className="data-table-header w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{(p as any).project_number || "—"}</td>
                      <td className="px-4 py-2.5 font-medium">{p.project_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.entity || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.portfolio || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(p.latest_budget)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(p.latest_pmc_budget)}</td>
                      <td className="px-4 py-2.5 text-center text-xs">{p.project_type || "—"}</td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={p.status} /></td>
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
