import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Download, Upload, Save, Send, Plus, Trash2, Eye, Loader2, CheckCircle2, XCircle, RotateCcw, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { exportToExcel, downloadTemplate, parseExcelFile } from "@/lib/excel-utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Submission = Tables<"deployment_submissions"> & { consultants?: { name: string } | null };
type DeploymentLine = Tables<"deployment_lines">;
type Period = Tables<"period_control">;
type Employee = Tables<"employees"> & { positions?: { position_name: string } | null };
type Project = { id: string; project_name: string; project_number: string | null };
type PurchaseOrder = { id: string; po_number: string; consultant_id: string; so_id: string | null };
type POItem = { id: string; po_id: string; po_item_ref: string | null; project_id: string | null };
type ServiceOrder = { id: string; so_number: string; consultant_id: string; framework_id: string | null; so_start_date: string | null; so_end_date: string | null };

interface LineRow {
  id?: string;
  month: string;
  employee_id: string;
  worked_project_id: string;
  billed_project_id: string;
  po_id: string;
  so_id: string;
  allocation_pct: number;
}

// Excel/CSV helpers
const projLabel = (p: Project) => p.project_number ? `${p.project_number} - ${p.project_name}` : p.project_name;

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${(c || "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const cols: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === ',') { cols.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  });
}

export default function DeploymentSchedulePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [consultantId, setConsultantId] = useState("");
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newType, setNewType] = useState<string>("actual");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected" | "returned">("approved");
  const [reviewComment, setReviewComment] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // Check if current user is admin or superadmin
  const { data: userRole } = useQuery({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!data || data.length === 0) return null;
      const roles = data.map(r => r.role);
      if (roles.includes("superadmin")) return "superadmin";
      if (roles.includes("admin")) return "admin";
      return roles[0];
    },
    enabled: !!user?.id,
  });

  const canDeleteDraft = userRole === "superadmin" || userRole === "admin";

  // Load open period
  const { data: openPeriod } = useQuery({
    queryKey: ["open-period"],
    queryFn: async () => {
      const { data, error } = await supabase.from("period_control").select("*").eq("status", "open").limit(1).single();
      if (error) return null;
      return data as Period;
    },
  });

  const periodMonth = openPeriod?.month || "";

  // Load consultants
  const { data: consultants = [] } = useQuery({
    queryKey: ["consultants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!consultantId && consultants.length > 0) setConsultantId(consultants[0].id);
  }, [consultants, consultantId]);

  // Load all submissions for consultant
  const { data: submissions = [] } = useQuery({
    queryKey: ["deployment-submissions-list", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase
        .from("deployment_submissions")
        .select("*, consultants(name)")
        .eq("consultant_id", consultantId)
        .order("month", { ascending: false })
        .order("schedule_type")
        .order("revision_no", { ascending: false });
      if (error) throw error;
      return data as Submission[];
    },
    enabled: !!consultantId,
  });

  // Load employees
  const { data: employees = [] } = useQuery({
    queryKey: ["deployment-employees", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase.from("employees").select("*, positions(position_name)").eq("consultant_id", consultantId).eq("status", "active").order("employee_name");
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!consultantId,
  });

  // Load all projects (for workload fallback and display)
  const { data: allProjects = [] } = useQuery({
    queryKey: ["deployment-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, project_name, project_number").eq("status", "active").order("project_name");
      if (error) throw error;
      return data as Project[];
    },
  });

  // Load POs for consultant
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["deployment-pos", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase.from("purchase_orders").select("id, po_number, consultant_id, so_id").eq("consultant_id", consultantId).eq("status", "active");
      if (error) throw error;
      return data as PurchaseOrder[];
    },
    enabled: !!consultantId,
  });

  // Load PO items to get projects linked to POs
  const { data: poItems = [] } = useQuery({
    queryKey: ["deployment-po-items", consultantId],
    queryFn: async () => {
      if (!consultantId || purchaseOrders.length === 0) return [];
      const poIds = purchaseOrders.map(po => po.id);
      const { data, error } = await supabase.from("purchase_order_items").select("id, po_id, po_item_ref, project_id").in("po_id", poIds);
      if (error) throw error;
      return data as POItem[];
    },
    enabled: !!consultantId && purchaseOrders.length > 0,
  });

  // Load SOs
  const { data: serviceOrders = [] } = useQuery({
    queryKey: ["deployment-sos", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase.from("service_orders").select("id, so_number, consultant_id, framework_id, so_start_date, so_end_date").eq("consultant_id", consultantId);
      if (error) throw error;
      return data as ServiceOrder[];
    },
    enabled: !!consultantId,
  });

  // Derive project lists based on schedule type
  const scheduleType = selectedSubmission?.schedule_type || newType;

  // Projects from PO items (for baseline/actual/forecast)
  const poProjectIds = useMemo(() => {
    const ids = new Set<string>();
    poItems.forEach(pi => { if (pi.project_id) ids.add(pi.project_id); });
    return ids;
  }, [poItems]);

  const poProjects = useMemo(() => allProjects.filter(p => poProjectIds.has(p.id)), [allProjects, poProjectIds]);

  // For workload: PO projects + all projects (union)
  const workloadProjects = allProjects;

  // Get the right project list based on type
  const getProjectList = (type: string) => {
    if (type === "workload") return workloadProjects;
    return poProjects.length > 0 ? poProjects : allProjects; // fallback if no PO items
  };

  const projectsForType = getProjectList(scheduleType);

  // Load lines for selected submission
  const { data: existingLines = [] } = useQuery({
    queryKey: ["deployment-lines", selectedSubmission?.id],
    queryFn: async () => {
      if (!selectedSubmission) return [];
      const { data, error } = await supabase.from("deployment_lines").select("*").eq("submission_id", selectedSubmission.id);
      if (error) throw error;
      return data as DeploymentLine[];
    },
    enabled: !!selectedSubmission,
  });

  useEffect(() => {
    if (existingLines.length > 0 && selectedSubmission) {
      setLines(existingLines.map(l => ({
        id: l.id,
        month: selectedSubmission.month,
        employee_id: l.employee_id,
        worked_project_id: l.worked_project_id || "",
        billed_project_id: l.billed_project_id || "",
        po_id: l.po_id || "",
        so_id: l.so_id || "",
        allocation_pct: Number(l.allocation_pct),
      })));
    } else if (selectedSubmission && existingLines.length === 0) {
      setLines([]);
    }
  }, [existingLines, selectedSubmission]);

  const isEditable = selectedSubmission && ["draft", "returned"].includes(selectedSubmission.status);

  // Create new submission
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!consultantId || !periodMonth) throw new Error("Select consultant and ensure period is open");

      const { data: latest } = await supabase
        .from("deployment_submissions")
        .select("id, revision_no")
        .eq("consultant_id", consultantId)
        .eq("schedule_type", newType as any)
        .eq("month", periodMonth)
        .order("revision_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      const newRevision = (latest?.revision_no || 0) + 1;

      const { data: newSub, error } = await supabase
        .from("deployment_submissions")
        .insert({
          consultant_id: consultantId,
          month: periodMonth,
          schedule_type: newType as any,
          status: "draft" as any,
          revision_no: newRevision,
          created_by: user?.id || null,
        })
        .select("*, consultants(name)")
        .single();
      if (error) throw error;

      // Copy lines from latest if exists
      if (latest?.id) {
        const { data: oldLines } = await supabase.from("deployment_lines").select("*").eq("submission_id", latest.id);
        if (oldLines && oldLines.length > 0) {
          const copied = oldLines.map(l => ({
            submission_id: newSub.id,
            employee_id: l.employee_id,
            worked_project_id: l.worked_project_id,
            billed_project_id: l.billed_project_id,
            po_id: l.po_id,
            so_id: l.so_id,
            allocation_pct: l.allocation_pct,
          }));
          await supabase.from("deployment_lines").insert(copied);
        }
      }

      return newSub as Submission;
    },
    onSuccess: (sub) => {
      queryClient.invalidateQueries({ queryKey: ["deployment-submissions-list"] });
      setSelectedSubmission(sub);
      setView("detail");
      setNewDialogOpen(false);
      toast.success("New submission created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Save draft
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubmission) throw new Error("No submission selected");
      await supabase.from("deployment_lines").delete().eq("submission_id", selectedSubmission.id);
      const toInsert = lines.filter(l => l.employee_id && l.allocation_pct > 0).map(l => ({
        submission_id: selectedSubmission.id,
        employee_id: l.employee_id,
        worked_project_id: l.worked_project_id || null,
        billed_project_id: l.billed_project_id || null,
        po_id: l.po_id || null,
        so_id: l.so_id || null,
        allocation_pct: l.allocation_pct,
      }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("deployment_lines").insert(toInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployment-lines"] });
      toast.success("Draft saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Submit
  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync();
      const { error } = await supabase
        .from("deployment_submissions")
        .update({ status: "submitted" as any, submitted_on: new Date().toISOString(), submitted_by: user?.id || null })
        .eq("id", selectedSubmission!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployment-submissions-list"] });
      queryClient.invalidateQueries({ queryKey: ["deployment-lines"] });
      toast.success("Submitted for review");
      setView("list");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bulk review
  const bulkReviewMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) throw new Error("No submissions selected");
      const { error } = await supabase.from("deployment_submissions").update({
        status: reviewAction as any,
        reviewed_on: new Date().toISOString(),
        reviewed_by: user?.id || null,
        reviewer_comments: reviewComment || null,
      }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployment-submissions-list"] });
      setSelectedIds(new Set());
      setReviewDialogOpen(false);
      setReviewComment("");
      toast.success(`${selectedIds.size} submission(s) ${reviewAction}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Delete draft submission
  const deleteMutation = useMutation({
    mutationFn: async (subId: string) => {
      // Delete lines first, then submission
      await supabase.from("deployment_lines").delete().eq("submission_id", subId);
      const { error } = await supabase.from("deployment_submissions").delete().eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployment-submissions-list"] });
      setDeleteTarget(null);
      toast.success("Draft submission deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLine = () => {
    setLines(prev => [...prev, { month: periodMonth, employee_id: "", worked_project_id: "", billed_project_id: "", po_id: "", so_id: "", allocation_pct: 0 }]);
  };

  const updateLine = (idx: number, field: keyof LineRow, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    const submittedSubs = submissions.filter(s => s.status === "submitted");
    if (selectedIds.size === submittedSubs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(submittedSubs.map(s => s.id)));
  };

  const hasOverAllocation = (() => {
    const totals: Record<string, number> = {};
    lines.forEach(l => {
      if (l.employee_id) {
        const key = `${l.employee_id}-${l.month}`;
        totals[key] = (totals[key] || 0) + l.allocation_pct;
      }
    });
    return Object.values(totals).some(t => t > 100);
  })();

  const openReview = (action: "approved" | "rejected" | "returned") => {
    setReviewAction(action); setReviewComment(""); setReviewDialogOpen(true);
  };

  // Export template
  const handleExportTemplate = () => {
    const headers = ["Employee Name", "Worked Project", "Billed Project", "Service Order", "Purchase Order", "Allocation %"];
    const empNames = employees.map(e => e.employee_name);
    const projNames = projectsForType.map(p => p.project_name);
    const soNums = serviceOrders.map(s => s.so_number);
    const poNums = purchaseOrders.map(p => p.po_number);

    // Include existing lines as rows, or empty rows with employee names pre-filled
    const rows: string[][] = lines.length > 0
      ? lines.map(l => [
          employees.find(e => e.id === l.employee_id)?.employee_name || "",
          allProjects.find(p => p.id === l.worked_project_id)?.project_name || "",
          allProjects.find(p => p.id === l.billed_project_id)?.project_name || "",
          serviceOrders.find(s => s.id === l.so_id)?.so_number || "",
          purchaseOrders.find(p => p.id === l.po_id)?.po_number || "",
          String(l.allocation_pct),
        ])
      : employees.map(e => [e.employee_name, "", "", "", "", ""]);

    // Add reference sheet info
    const refRows = [
      [], ["--- REFERENCE (delete before import) ---"],
      ["Available Employees:", ...empNames],
      ["Available Projects:", ...projNames],
      ["Available SOs:", ...soNums],
      ["Available POs:", ...poNums],
    ];

    downloadCSV(
      `deployment-${scheduleType}-${periodMonth}.csv`,
      headers,
      [...rows, ...refRows.map(r => r.map(String))]
    );
    toast.success("Template exported");
  };

  // Import CSV
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { toast.error("File is empty or has no data rows"); return; }

      const dataRows = rows.slice(1).filter(r => r[0] && !r[0].startsWith("---") && !r[0].startsWith("Available"));
      const errors: string[] = [];
      const newLines: LineRow[] = [];

      dataRows.forEach((row, i) => {
        const [empName, workedProjName, billedProjName, soNum, poNum, allocStr] = row;
        if (!empName?.trim()) return;

        const emp = employees.find(e => e.employee_name.toLowerCase() === empName.trim().toLowerCase());
        if (!emp) { errors.push(`Row ${i + 2}: Employee "${empName}" not found`); return; }

        const workedProj = workedProjName ? allProjects.find(p => p.project_name.toLowerCase() === workedProjName.trim().toLowerCase()) : null;
        const billedProj = billedProjName ? allProjects.find(p => p.project_name.toLowerCase() === billedProjName.trim().toLowerCase()) : null;
        const so = soNum ? serviceOrders.find(s => s.so_number.toLowerCase() === soNum.trim().toLowerCase()) : null;
        const po = poNum ? purchaseOrders.find(p => p.po_number.toLowerCase() === poNum.trim().toLowerCase()) : null;

        const alloc = parseInt(allocStr) || 0;
        if (alloc < 0 || alloc > 100) { errors.push(`Row ${i + 2}: Invalid allocation ${allocStr}`); return; }

        newLines.push({
          month: periodMonth,
          employee_id: emp.id,
          worked_project_id: workedProj?.id || "",
          billed_project_id: billedProj?.id || "",
          so_id: so?.id || "",
          po_id: po?.id || "",
          allocation_pct: alloc,
        });
      });

      if (errors.length > 0) {
        toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "..." : ""}`);
      }
      if (newLines.length > 0) {
        setLines(prev => [...prev, ...newLines]);
        toast.success(`${newLines.length} line(s) imported`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (!openPeriod) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <div className="page-header">
            <div>
              <h1 className="page-title">Deployment Schedules</h1>
              <p className="page-subtitle">No open period found. Open a period in Period Control first.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ============ DETAIL VIEW ============
  if (view === "detail" && selectedSubmission) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <div className="page-header">
            <div>
              <h1 className="page-title">
                {selectedSubmission.schedule_type.charAt(0).toUpperCase() + selectedSubmission.schedule_type.slice(1)} — {selectedSubmission.month}
              </h1>
              <p className="page-subtitle">Revision #{selectedSubmission.revision_no} · {consultants.find(c => c.id === consultantId)?.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedSubmission.status} />
              <Button variant="outline" size="sm" onClick={() => { setView("list"); setSelectedSubmission(null); }}>← Back</Button>
            </div>
          </div>

          {selectedSubmission.reviewer_comments && (
            <div className="mb-4 px-4 py-2 rounded-md bg-accent border text-sm">
              <strong>Reviewer:</strong> {selectedSubmission.reviewer_comments}
            </div>
          )}

          {hasOverAllocation && (
            <div className="flex items-center gap-2 px-4 py-2 mb-4 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertTriangle size={16} />
              <span>One or more employees exceed 100% allocation per month. Fix before submitting.</span>
            </div>
          )}

          {/* Action buttons */}
          {isEditable && (
            <div className="flex items-center gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={addLine}><Plus size={14} className="mr-1.5" />Add Row</Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportTemplate}>
                  <FileSpreadsheet size={14} className="mr-1.5" />Export Template
                </Button>
                <input type="file" ref={importRef} accept=".csv" className="hidden" onChange={handleImportCSV} />
                <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                  <Upload size={14} className="mr-1.5" />Import CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}Save Draft
                </Button>
                <Button size="sm" disabled={hasOverAllocation || submitMutation.isPending || lines.length === 0} onClick={() => submitMutation.mutate()}>
                  {submitMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Send size={14} className="mr-1.5" />}Submit
                </Button>
              </div>
            </div>
          )}

          {!isEditable && (
            <div className="flex items-center gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={handleExportTemplate}>
                <Download size={14} className="mr-1.5" />Export Data
              </Button>
            </div>
          )}

          {/* Lines table */}
          <div className="bg-card rounded-md border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[120px]">Month</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[180px]">Employee</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[120px]">Position</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[160px]">Worked Project</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[160px]">Billed Project</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[140px]">Service Order</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[140px]">Purchase Order</th>
                  <th className="data-table-header text-center px-3 py-2.5 w-20">Alloc %</th>
                  {isEditable && <th className="data-table-header w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No lines yet. Click "Add Row" to start or import a CSV.</td></tr>
                ) : (
                  lines.map((line, idx) => {
                    const emp = employees.find(e => e.id === line.employee_id);
                    const filteredPOs = purchaseOrders.filter(po => !line.so_id || po.so_id === line.so_id);
                    return (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="px-3 py-1.5">
                          <div className="h-8 px-2 text-xs border rounded-md bg-muted flex items-center font-mono text-muted-foreground">
                            {line.month || periodMonth}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={line.employee_id} onValueChange={(v) => updateLine(idx, "employee_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.employee_name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{emp?.employee_name || "—"}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{emp?.positions?.position_name || "—"}</td>
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={line.worked_project_id} onValueChange={(v) => updateLine(idx, "worked_project_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{projectsForType.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{allProjects.find(p => p.id === line.worked_project_id)?.project_name || "—"}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={line.billed_project_id} onValueChange={(v) => updateLine(idx, "billed_project_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{poProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{allProjects.find(p => p.id === line.billed_project_id)?.project_name || "—"}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={line.so_id} onValueChange={(v) => { updateLine(idx, "so_id", v); updateLine(idx, "po_id", ""); }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{serviceOrders.map(so => <SelectItem key={so.id} value={so.id}>{so.so_number}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{serviceOrders.find(s => s.id === line.so_id)?.so_number || "—"}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={line.po_id} onValueChange={(v) => updateLine(idx, "po_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{filteredPOs.map(po => <SelectItem key={po.id} value={po.id}>{po.po_number}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{purchaseOrders.find(p => p.id === line.po_id)?.po_number || "—"}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={line.allocation_pct || ""}
                              onChange={(e) => updateLine(idx, "allocation_pct", Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                              className="h-8 text-xs text-center w-16"
                            />
                          ) : <span className="text-xs font-mono">{line.allocation_pct}%</span>}
                        </td>
                        {isEditable && (
                          <td className="px-2 py-1.5">
                            <button onClick={() => removeLine(idx)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span>{lines.length} line(s)</span>
            <span>·</span>
            <span>Revision #{selectedSubmission.revision_no}</span>
            <span>·</span>
            <span className="capitalize">{selectedSubmission.schedule_type}</span>
            {scheduleType !== "workload" && poProjects.length > 0 && (
              <>
                <span>·</span>
                <span>Projects from PO items ({poProjects.length})</span>
              </>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ============ LIST VIEW ============
  const submittedSubs = submissions.filter(s => s.status === "submitted");

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Deployment Schedules</h1>
            <p className="page-subtitle">All submissions · Period: {periodMonth}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setNewDialogOpen(true)}>
              <Plus size={14} className="mr-1.5" />New Submission
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <Select value={consultantId} onValueChange={setConsultantId}>
            <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="Select consultant" /></SelectTrigger>
            <SelectContent>
              {consultants.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => openReview("approved")}><CheckCircle2 size={14} className="mr-1" />Approve</Button>
              <Button size="sm" variant="outline" onClick={() => openReview("returned")}><RotateCcw size={14} className="mr-1" />Return</Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => openReview("rejected")}><XCircle size={14} className="mr-1" />Reject</Button>
            </div>
          )}
        </div>

        {/* Submissions table */}
        <div className="bg-card rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="data-table-header px-3 py-2.5 w-10">
                  {submittedSubs.length > 0 && (
                    <Checkbox
                      checked={selectedIds.size === submittedSubs.length && submittedSubs.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  )}
                </th>
                <th className="data-table-header text-left px-3 py-2.5">Month</th>
                <th className="data-table-header text-left px-3 py-2.5">Type</th>
                <th className="data-table-header text-center px-3 py-2.5">Rev #</th>
                <th className="data-table-header text-left px-3 py-2.5">Status</th>
                <th className="data-table-header text-left px-3 py-2.5">Submitted</th>
                <th className="data-table-header text-left px-3 py-2.5">Reviewed</th>
                <th className="data-table-header w-10"></th>
              </tr>
            </thead>
            <tbody>
              {submissions.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No submissions found</td></tr>
              ) : (
                submissions.map(sub => (
                  <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2.5">
                      {sub.status === "submitted" && (
                        <Checkbox checked={selectedIds.has(sub.id)} onCheckedChange={() => toggleSelect(sub.id)} />
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{sub.month}</td>
                    <td className="px-3 py-2.5 capitalize">{sub.schedule_type}</td>
                    <td className="px-3 py-2.5 text-center font-mono">#{sub.revision_no}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={sub.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{sub.submitted_on ? new Date(sub.submitted_on).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{sub.reviewed_on ? new Date(sub.reviewed_on).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedSubmission(sub); setView("detail"); }}>
                          <Eye size={14} />
                        </Button>
                        {canDeleteDraft && sub.status === "draft" && (
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(sub)}>
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Submission Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Deployment Submission</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Schedule Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actual">Actual</SelectItem>
                  <SelectItem value="forecast">Forecast</SelectItem>
                  <SelectItem value="baseline">Baseline</SelectItem>
                  <SelectItem value="workload">Workload</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month (from open period)</Label>
              <div className="h-10 px-3 text-sm border rounded-md bg-muted flex items-center font-mono text-muted-foreground">{periodMonth}</div>
            </div>
            <p className="text-xs text-muted-foreground">If a previous submission exists for this type/month, its data will be copied to the new revision.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">{reviewAction} {selectedIds.size} Submission(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Comments (optional)</Label>
              <Textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Add reviewer comments..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => bulkReviewMutation.mutate()} disabled={bulkReviewMutation.isPending}
              variant={reviewAction === "rejected" ? "destructive" : "default"}>
              {bulkReviewMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              Confirm {reviewAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Draft Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft Submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {deleteTarget?.schedule_type} submission for {deleteTarget?.month} (Rev #{deleteTarget?.revision_no}) and all its deployment lines. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
