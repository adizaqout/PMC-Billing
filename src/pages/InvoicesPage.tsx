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
import type { ImportProgress } from "@/components/ExcelToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Invoice = Tables<"invoices"> & {
  consultants?: { name: string } | null;
  purchase_orders?: { po_number: string; revision_number: number | null; po_reference: string | null; po_value: number | null; project_id: string | null } | null;
};
type PORecord = { id: string; po_number: string; consultant_id: string; revision_number: number | null; po_reference: string | null; po_value: number | null; project_id: string | null };
type ProjectRecord = { id: string; project_name: string };

interface InvoiceForm {
  invoice_number: string; invoice_month: string; consultant_id: string;
  po_id: string | null; // the actual PO line record id
  billed_amount_no_vat: number | null; paid_amount: number | null;
  status: "pending" | "paid" | "cancelled"; description: string | null;
  // UI-only fields for cascading selection
  _po_key: string; // "po_number|revision_number" combo
}
const emptyForm: InvoiceForm = { invoice_number: "", invoice_month: "", consultant_id: "", po_id: null, billed_amount_no_vat: null, paid_amount: null, status: "pending", description: null, _po_key: "" };
const fmt = (v: number | null) => v != null ? new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(v) : "—";

const cols = [
  { header: "Invoice Number", key: "invoice_number", width: 18 },
  { header: "Month", key: "invoice_month", width: 12 },
  { header: "Consultant", key: "consultant_name", width: 25 },
  { header: "PO Number", key: "po_number", width: 14 },
  { header: "Rev", key: "po_revision", width: 6 },
  { header: "PO Value (AED)", key: "po_value", width: 15 },
  { header: "Billed Amount", key: "billed_amount_no_vat", width: 15 },
  { header: "Billed To Date", key: "billed_to_date", width: 15 },
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
  const invTableCols: ColumnDef[] = [
    { key: "inv_no", label: "Invoice No." }, { key: "month", label: "Month" }, { key: "consultant", label: "Consultant" },
    { key: "po", label: "PO" }, { key: "rev", label: "Rev" },
    { key: "po_value", label: "PO Value" }, { key: "billed", label: "Billed" }, { key: "billed_to_date", label: "Billed To Date" },
    { key: "paid", label: "Paid" }, { key: "status", label: "Status" },
  ];
  const { visibleColumns, setVisibleColumns } = useColumnVisibility(invTableCols);
  const queryClient = useQueryClient();

  const setColFilter = (key: string, value: string) => setColFilters(prev => ({ ...prev, [key]: value }));

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices")
        .select("*, consultants(name), purchase_orders(po_number, revision_number, po_reference, po_value, project_id)")
        .order("invoice_month", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    }
  });

  const { data: consultants = [] } = useQuery({
    queryKey: ["consultants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    }
  });

  const { data: allPOs = [] } = useQuery({
    queryKey: ["po-all-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_orders")
        .select("id, po_number, consultant_id, revision_number, po_reference, po_value, project_id")
        .eq("status", "active").order("po_number");
      if (error) throw error;
      return data as PORecord[];
    }
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, project_name").order("project_name");
      if (error) throw error;
      return data as ProjectRecord[];
    }
  });

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects) m[p.id] = p.project_name;
    return m;
  }, [projects]);

  // Sum of po_value for each PO+Rev combo
  const poRevTotalMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const po of allPOs) {
      const key = `${po.po_number}|${po.revision_number ?? 0}`;
      m[key] = (m[key] || 0) + (po.po_value || 0);
    }
    return m;
  }, [allPOs]);

  const getPoRevTotal = (inv: Invoice) => {
    if (!inv.purchase_orders) return null;
    const key = `${inv.purchase_orders.po_number}|${inv.purchase_orders.revision_number ?? 0}`;
    return poRevTotalMap[key] ?? null;
  };

  // Distinct PO+Rev combos for selected consultant
  const poRevOptions = useMemo(() => {
    const consultantPOs = form.consultant_id ? allPOs.filter(p => p.consultant_id === form.consultant_id) : [];
    const seen = new Map<string, { po_number: string; revision_number: number | null }>();
    for (const po of consultantPOs) {
      const key = `${po.po_number}|${po.revision_number ?? 0}`;
      if (!seen.has(key)) seen.set(key, { po_number: po.po_number, revision_number: po.revision_number });
    }
    return Array.from(seen.entries()).map(([key, val]) => ({ key, ...val }));
  }, [allPOs, form.consultant_id]);

  // Line items for selected PO+Rev
  const lineOptions = useMemo(() => {
    if (!form._po_key) return [];
    const [poNum, revStr] = form._po_key.split("|");
    const rev = parseInt(revStr);
    return allPOs.filter(p =>
      p.consultant_id === form.consultant_id &&
      p.po_number === poNum &&
      (p.revision_number ?? 0) === rev
    ).sort((a, b) => (a.po_reference || "").localeCompare(b.po_reference || "", undefined, { numeric: true }));
  }, [allPOs, form._po_key, form.consultant_id]);

  const selectedPO = form.po_id ? allPOs.find(p => p.id === form.po_id) : null;

  // Calculate billed to date for the form's current PO line
  const billedToDate = useMemo(() => {
    if (!form.po_id) return null;
    return items
      .filter(inv => inv.po_id === form.po_id && inv.id !== editing?.id)
      .reduce((sum, inv) => sum + (inv.billed_amount_no_vat || 0), 0);
  }, [form.po_id, items, editing]);

  // Calculate billed to date for each invoice row (grouped by po_id)
  const billedToDateMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of items) {
      if (!inv.po_id) continue;
      if (!(inv.po_id in map)) {
        map[inv.po_id] = items
          .filter(i => i.po_id === inv.po_id)
          .reduce((sum, i) => sum + (i.billed_amount_no_vat || 0), 0);
      }
    }
    return map;
  }, [items]);

  const getBilledToDate = (inv: Invoice) => {
    if (!inv.po_id) return null;
    return billedToDateMap[inv.po_id] ?? null;
  };

  const upsertMutation = useMutation({
    mutationFn: async (values: InvoiceForm & { id?: string }) => {
      const payload: any = {
        invoice_number: values.invoice_number, invoice_month: values.invoice_month,
        consultant_id: values.consultant_id, po_id: values.po_id || null,
        billed_amount_no_vat: values.billed_amount_no_vat, paid_amount: values.paid_amount,
        status: values.status, description: values.description || null,
      };
      if (values.id) { const { error } = await supabase.from("invoices").update(payload).eq("id", values.id); if (error) throw error; }
      else { const { error } = await supabase.from("invoices").insert(payload as TablesInsert<"invoices">); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); toast.success(editing ? "Updated" : "Created"); closeDialog(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("invoices").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openEdit = (item: Invoice) => {
    // Derive _po_key from the PO record
    const po = item.po_id ? allPOs.find(p => p.id === item.po_id) : null;
    const poKey = po ? `${po.po_number}|${po.revision_number ?? 0}` : "";
    setEditing(item);
    setForm({
      invoice_number: item.invoice_number, invoice_month: item.invoice_month,
      consultant_id: item.consultant_id, po_id: item.po_id,
      billed_amount_no_vat: item.billed_amount_no_vat, paid_amount: item.paid_amount,
      status: item.status, description: item.description, _po_key: poKey,
    });
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleConsultantChange = (v: string) => { setForm({ ...form, consultant_id: v, po_id: null, _po_key: "" }); };
  const handlePORevChange = (v: string) => {
    if (v === "none") { setForm({ ...form, _po_key: "", po_id: null }); return; }
    const [poNum, revStr] = v.split("|");
    const rev = parseInt(revStr);
    const match = allPOs.find(p => p.consultant_id === form.consultant_id && p.po_number === poNum && (p.revision_number ?? 0) === rev);
    setForm({ ...form, _po_key: v, po_id: match?.id || null });
  };

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

  const { sorted, sort, toggleSort } = useSort(filtered, "invoice_number", "asc");
  const { paginatedItems, pageSize, setPageSize, currentPage, setCurrentPage, totalItems } = usePagination(sorted);

  const handleExport = () => {
    exportToExcel("invoices.xlsx", cols, filtered.map(i => ({
      ...i,
      consultant_name: i.consultants?.name || "",
      po_number: i.purchase_orders?.po_number || "",
      po_revision: i.purchase_orders?.revision_number ?? "",
      po_line: i.purchase_orders?.po_reference || "",
      po_value: getPoRevTotal(i) ?? "",
      billed_to_date: getBilledToDate(i) ?? "",
    })));
    toast.success("Exported");
  };

  const handleTemplate = () => { downloadTemplate("invoices-template.xlsx", cols, { Consultants: consultants.map(c => c.name) }); toast.success("Template downloaded"); };

  const handleImportWithProgress = useCallback(async (
    rows: string[][], onProgress: (p: ImportProgress) => void
  ): Promise<ImportProgress> => {
    const total = rows.length - 1;
    const result: ImportProgress = { total, processed: 0, created: 0, errors: [] };
    for (let i = 1; i < rows.length; i++) {
      const [invNum, month, consultantName, poNum, rev, lineRef, , billed, , paid, status, desc] = rows[i];
      if (!invNum?.trim()) { result.processed++; onProgress({ ...result }); continue; }
      const consultant = consultants.find(c => c.name.toLowerCase() === consultantName?.trim()?.toLowerCase());
      if (!consultant) { result.errors.push({ row: i + 1, message: `Consultant "${consultantName}" not found` }); result.processed++; onProgress({ ...result }); continue; }
      const po = (poNum && lineRef) ? allPOs.find(p =>
        p.po_number === String(poNum).trim() &&
        (p.revision_number ?? 0) === (rev ? parseInt(String(rev)) : 0) &&
        p.po_reference === String(lineRef).trim() &&
        p.consultant_id === consultant.id
      ) : null;
      const safeTrim = (v: any) => v == null ? "" : String(v).trim();
      const { error } = await supabase.from("invoices").insert({
        invoice_number: safeTrim(invNum), invoice_month: safeTrim(month), consultant_id: consultant.id, po_id: po?.id || null,
        billed_amount_no_vat: billed ? parseFloat(String(billed)) : null, paid_amount: paid ? parseFloat(String(paid)) : null,
        status: (["paid", "cancelled"].includes(safeTrim(status).toLowerCase()) ? safeTrim(status).toLowerCase() : "pending") as any,
        description: safeTrim(desc) || null,
      } as TablesInsert<"invoices">);
      if (error) result.errors.push({ row: i + 1, message: error.message }); else result.created++;
      result.processed++;
      onProgress({ ...result });
    }
    return result;
  }, [consultants, allPOs]);
  const handleImportComplete = useCallback(() => { queryClient.invalidateQueries({ queryKey: ["invoices"] }); }, [queryClient]);

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div><h1 className="page-title">Invoices</h1><p className="page-subtitle">Track and validate invoices</p></div>
          <div className="flex items-center gap-2">
            <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={() => {}} onImportWithProgress={handleImportWithProgress} onImportComplete={handleImportComplete} />
            <ColumnVisibilityToggle columns={invTableCols} visibleColumns={visibleColumns} onChange={setVisibleColumns} />
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
                {visibleColumns.has("inv_no") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Invoice No." sortKey="invoice_number" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.invoice_number || ""} onChange={(v) => setColFilter("invoice_number", v)} label="Invoice No." /></SortableHeader></th>}
                {visibleColumns.has("month") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Month" sortKey="invoice_month" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.month || ""} onChange={(v) => setColFilter("month", v)} label="Month" /></SortableHeader></th>}
                {visibleColumns.has("consultant") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Consultant" sortKey="consultants.name" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.consultant || ""} onChange={(v) => setColFilter("consultant", v)} label="Consultant" /></SortableHeader></th>}
                {visibleColumns.has("po") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="PO" sortKey="purchase_orders.po_number" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.po || ""} onChange={(v) => setColFilter("po", v)} label="PO" /></SortableHeader></th>}
                {visibleColumns.has("rev") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Rev" sortKey="purchase_orders.revision_number" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("line") && <th className="data-table-header text-left px-4 py-2.5"><SortableHeader label="Line" sortKey="purchase_orders.po_reference" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("po_value") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="PO Value" sortKey="purchase_orders.po_value" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("billed") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Billed" sortKey="billed_amount_no_vat" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("billed_to_date") && <th className="data-table-header text-right px-4 py-2.5">Billed To Date</th>}
                {visibleColumns.has("paid") && <th className="data-table-header text-right px-4 py-2.5"><SortableHeader label="Paid" sortKey="paid_amount" currentKey={sort.key} direction={sort.direction} onSort={toggleSort} /></th>}
                {visibleColumns.has("status") && <th className="data-table-header text-center px-4 py-2.5"><SortableHeader label="Status" sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggleSort}><ColumnFilter value={colFilters.status || ""} onChange={(v) => setColFilter("status", v)} label="Status" /></SortableHeader></th>}
                <th className="data-table-header w-10"></th>
              </tr></thead>
              <tbody>{paginatedItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  {visibleColumns.has("inv_no") && <td className="px-4 py-2.5 font-mono font-medium">{item.invoice_number}</td>}
                  {visibleColumns.has("month") && <td className="px-4 py-2.5 font-mono text-xs">{item.invoice_month}</td>}
                  {visibleColumns.has("consultant") && <td className="px-4 py-2.5">{item.consultants?.name || "—"}</td>}
                  {visibleColumns.has("po") && <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.purchase_orders?.po_number || "—"}</td>}
                  {visibleColumns.has("rev") && <td className="px-4 py-2.5 text-center font-mono text-xs">{item.purchase_orders?.revision_number ?? "—"}</td>}
                  {visibleColumns.has("line") && <td className="px-4 py-2.5 font-mono text-xs">{item.purchase_orders?.po_reference || "—"}</td>}
                  {visibleColumns.has("po_value") && <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{fmt(getPoRevTotal(item))}</td>}
                  {visibleColumns.has("billed") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.billed_amount_no_vat)}</td>}
                  {visibleColumns.has("billed_to_date") && <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">{fmt(getBilledToDate(item))}</td>}
                  {visibleColumns.has("paid") && <td className="px-4 py-2.5 text-right font-mono">{fmt(item.paid_amount)}</td>}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Invoice" : "Add Invoice"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Invoice Number *</Label><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Invoice Month * (YYYY-MM)</Label><Input value={form.invoice_month} onChange={(e) => setForm({ ...form, invoice_month: e.target.value })} placeholder="2026-02" /></div>
              <div className="space-y-1.5"><Label>Consultant *</Label>
                <Select value={form.consultant_id} onValueChange={handleConsultantChange}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{consultants.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label>PO + Revision</Label>
                <Select value={form._po_key || "none"} onValueChange={handlePORevChange} disabled={!form.consultant_id}>
                  <SelectTrigger><SelectValue placeholder={form.consultant_id ? "Select PO" : "Select consultant first"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {poRevOptions.map((o) => (
                      <SelectItem key={o.key} value={o.key}>{o.po_number} Rev {o.revision_number ?? 0}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form._po_key && selectedPO && (
                <>
                  <div className="space-y-1.5"><Label>PO Value (AED)</Label><Input value={fmt(form._po_key ? (poRevTotalMap[form._po_key] ?? null) : null)} disabled className="bg-muted" /></div>
                  {billedToDate != null && (
                    <div className="space-y-1.5"><Label>Billed To Date (AED)</Label><Input value={fmt(billedToDate)} disabled className="bg-muted font-semibold" /></div>
                  )}
                </>
              )}
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
