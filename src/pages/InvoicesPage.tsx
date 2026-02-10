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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Invoice = Tables<"invoices"> & { consultants?: { name: string } | null; purchase_orders?: { po_number: string } | null };
interface InvoiceForm { invoice_number: string; invoice_month: string; consultant_id: string; po_id: string | null; billed_amount_no_vat: number | null; paid_amount: number | null; status: "pending" | "paid" | "cancelled"; description: string | null; }
const emptyForm: InvoiceForm = { invoice_number: "", invoice_month: "", consultant_id: "", po_id: null, billed_amount_no_vat: null, paid_amount: null, status: "pending", description: null };
const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(v) : "—";

const cols = [
  { header: "Invoice Number", key: "invoice_number", width: 18 },
  { header: "Month", key: "invoice_month", width: 12 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "PO Number", key: "po_number", width: 18 },
  { header: "Billed Amount", key: "billed_amount_no_vat", width: 15 },
  { header: "Paid Amount", key: "paid_amount", width: 15 },
  { header: "Status", key: "status", width: 10 },
  { header: "Description", key: "description", width: 30 },
];

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyForm);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: items = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: async () => { const { data, error } = await supabase.from("invoices").select("*, consultants(name), purchase_orders(po_number)").order("invoice_month", { ascending: false }); if (error) throw error; return data as Invoice[]; } });
  const { data: consultants = [] } = useQuery({ queryKey: ["consultants-list"], queryFn: async () => { const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name"); if (error) throw error; return data as { id: string; name: string }[]; } });
  const { data: allPOs = [] } = useQuery({ queryKey: ["po-all"], queryFn: async () => { const { data, error } = await supabase.from("purchase_orders").select("id, po_number, consultant_id").eq("status", "active").order("po_number"); if (error) throw error; return data as { id: string; po_number: string; consultant_id: string }[]; } });
  const filteredPOs = form.consultant_id ? allPOs.filter(p => p.consultant_id === form.consultant_id) : [];

  const upsertMutation = useMutation({
    mutationFn: async (values: InvoiceForm & { id?: string }) => {
      const payload: any = { invoice_number: values.invoice_number, invoice_month: values.invoice_month, consultant_id: values.consultant_id, po_id: values.po_id || null, billed_amount_no_vat: values.billed_amount_no_vat, paid_amount: values.paid_amount, status: values.status, description: values.description || null };
      if (values.id) { const { error } = await supabase.from("invoices").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("invoices").insert(payload as TablesInsert<"invoices">); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); toast.success(editing ? "Updated" : "Created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("invoices").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); toast.success("Deleted"); }, onError: (e: Error) => toast.error(e.message) });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: Invoice) => { setEditing(item); setForm({ invoice_number: item.invoice_number, invoice_month: item.invoice_month, consultant_id: item.consultant_id, po_id: item.po_id, billed_amount_no_vat: item.billed_amount_no_vat, paid_amount: item.paid_amount, status: item.status, description: item.description }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };
  const handleConsultantChange = (v: string) => { setForm({ ...form, consultant_id: v, po_id: null }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.invoice_number.trim()) { toast.error("Invoice number is required"); return; }
    if (!form.invoice_month.trim()) { toast.error("Invoice month is required"); return; }
    if (!form.consultant_id) { toast.error("Consultant is required"); return; }
    const dup = items.find(i => i.invoice_number.toLowerCase() === form.invoice_number.toLowerCase().trim() && i.consultant_id === form.consultant_id && i.id !== editing?.id);
    if (dup) { toast.error("This invoice number already exists for this consultant"); return; }
    upsertMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = items.filter((i) => {
    if (search && !i.invoice_number.toLowerCase().includes(search.toLowerCase()) && !(i.consultants?.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (colFilters.invoice_number && !i.invoice_number.toLowerCase().includes(colFilters.invoice_number.toLowerCase())) return false;
    if (colFilters.month && !i.invoice_month.toLowerCase().includes(colFilters.month.toLowerCase())) return false;
    if (colFilters.consultant && !(i.consultants?.name || "").toLowerCase().includes(colFilters.consultant.toLowerCase())) return false;
    if (colFilters.po && !(i.purchase_orders?.po_number || "").toLowerCase().includes(colFilters.po.toLowerCase())) return false;
    if (colFilters.status && !i.status.toLowerCase().includes(colFilters.status.toLowerCase())) return false;
    return true;
  });
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(filtered);

  const handleExport = () => { exportToExcel("invoices.xlsx", cols, filtered.map(i => ({ ...i, consultant_name: i.consultants?.name || "", po_number: i.purchase_orders?.po_number || "" }))); toast.success("Exported"); };
  const handleTemplate = () => { downloadTemplate("invoices-template.xlsx", cols, { Consultants: consultants.map(c => c.name), "PO Numbers": allPOs.map(p => p.po_number) }); toast.success("Template downloaded"); };
  const handleImport = async (file: File) => {
    try {
      const rows = await parseExcelFile(file);
      if (rows.length < 2) { toast.error("File is empty"); return; }
      const errors: string[] = []; let created = 0;
      for (let i = 1; i < rows.length; i++) {
        const [invNum, month, consultantName, poNum, billed, paid, status, desc] = rows[i];
        if (!invNum?.trim()) continue;
        const consultant = consultants.find(c => c.name.toLowerCase() === consultantName?.trim()?.toLowerCase());
        if (!consultant) { errors.push(`Row ${i + 1}: Consultant "${consultantName}" not found`); continue; }
        const po = poNum ? allPOs.find(p => p.po_number.toLowerCase() === poNum.trim().toLowerCase() && p.consultant_id === consultant.id) : null;
        const { error } = await supabase.from("invoices").insert({
          invoice_number: invNum.trim(), invoice_month: month?.trim() || "", consultant_id: consultant.id, po_id: po?.id || null,
          billed_amount_no_vat: billed ? parseFloat(String(billed)) : null, paid_amount: paid ? parseFloat(String(paid)) : null,
          status: (["paid", "cancelled"].includes(status?.trim()?.toLowerCase() || "") ? status.trim().toLowerCase() : "pending") as any,
          description: desc?.trim() || null,
        } as TablesInsert<"invoices">);
        if (error) errors.push(`Row ${i + 1}: ${error.message}`); else created++;
      }
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      if (errors.length) toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join("; ")}`);
      if (created) toast.success(`${created} record(s) imported`);
    } catch { toast.error("Failed to parse file"); }
  };

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Invoices</h1><p className="page-subtitle">Track and validate invoices</p></div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={handleImport} />
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1.5" />Add Invoice</Button>
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
                <th className="data-table-header text-left px-4 py-2.5">Invoice No.<ColumnFilter value={colFilters.invoice_number || ""} onChange={(v) => setColFilter("invoice_number", v)} label="Invoice No." /></th>
                <th className="data-table-header text-left px-4 py-2.5">Month<ColumnFilter value={colFilters.month || ""} onChange={(v) => setColFilter("month", v)} label="Month" /></th>
                <th className="data-table-header text-left px-4 py-2.5">Consultant<ColumnFilter value={colFilters.consultant || ""} onChange={(v) => setColFilter("consultant", v)} label="Consultant" /></th>
                <th className="data-table-header text-left px-4 py-2.5">PO<ColumnFilter value={colFilters.po || ""} onChange={(v) => setColFilter("po", v)} label="PO" /></th>
                <th className="data-table-header text-right px-4 py-2.5">Billed (AED)</th>
                <th className="data-table-header text-right px-4 py-2.5">Paid (AED)</th>
                <th className="data-table-header text-center px-4 py-2.5">Status<ColumnFilter value={colFilters.status || ""} onChange={(v) => setColFilter("status", v)} label="Status" /></th>
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{paginatedItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-medium">{item.invoice_number}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{item.invoice_month}</td>
                  <td className="px-4 py-2.5">{item.consultants?.name || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.purchase_orders?.po_number || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(item.billed_amount_no_vat)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(item.paid_amount)}</td>
                  <td className="px-4 py-2.5 text-center"><StatusBadge status={item.status} /></td>
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
          <DialogHeader><DialogTitle>{editing ? "Edit Invoice" : "Add Invoice"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Invoice Number *</Label><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Invoice Month * (YYYY-MM)</Label><Input value={form.invoice_month} onChange={(e) => setForm({ ...form, invoice_month: e.target.value })} placeholder="2026-02" /></div>
              <div className="space-y-1.5"><Label>Consultant *</Label><Select value={form.consultant_id} onValueChange={handleConsultantChange}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Purchase Order</Label><Select value={form.po_id || "none"} onValueChange={(v) => setForm({ ...form, po_id: v === "none" ? null : v })} disabled={!form.consultant_id}><SelectTrigger><SelectValue placeholder={form.consultant_id ? "Select" : "Select consultant first"} /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{filteredPOs.map((p) => <SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Billed Amount (AED)</Label><Input type="number" step="0.01" value={form.billed_amount_no_vat ?? ""} onChange={(e) => setForm({ ...form, billed_amount_no_vat: e.target.value ? parseFloat(e.target.value) : null })} /></div>
              <div className="space-y-1.5"><Label>Paid Amount (AED)</Label><Input type="number" step="0.01" value={form.paid_amount ?? ""} onChange={(e) => setForm({ ...form, paid_amount: e.target.value ? parseFloat(e.target.value) : null })} /></div>
              <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="paid">Paid</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
              <div className="col-span-2 space-y-1.5"><Label>Description</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value || null })} rows={2} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button><Button type="submit" disabled={upsertMutation.isPending}>{upsertMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}{editing ? "Update" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
