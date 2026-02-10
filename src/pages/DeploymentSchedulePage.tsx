import { useState, useEffect } from "react";
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
import { Download, Upload, Save, Send, Plus, Trash2, Eye, Loader2, CheckCircle2, XCircle, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

type Submission = Tables<"deployment_submissions"> & { consultants?: { name: string } | null };
type DeploymentLine = Tables<"deployment_lines">;
type Period = Tables<"period_control">;
type Employee = Tables<"employees"> & { positions?: { position_name: string } | null };
type Project = { id: string; project_name: string };
type PurchaseOrder = { id: string; po_number: string; consultant_id: string; so_id: string | null };
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

  // Load employees, projects, POs, SOs for detail view
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

  const { data: allProjects = [] } = useQuery({
    queryKey: ["deployment-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, project_name").eq("status", "active").order("project_name");
      if (error) throw error;
      return data as Project[];
    },
  });

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

      // Find latest submission of this type to copy from
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
      // Delete old lines and re-insert
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
      const updatePayload: any = {
        status: reviewAction,
        reviewed_on: new Date().toISOString(),
        reviewed_by: user?.id || null,
        reviewer_comments: reviewComment || null,
      };
      const { error } = await supabase.from("deployment_submissions").update(updatePayload).in("id", ids);
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
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const submittedSubs = submissions.filter(s => s.status === "submitted");
    if (selectedIds.size === submittedSubs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submittedSubs.map(s => s.id)));
    }
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
    setReviewAction(action);
    setReviewComment("");
    setReviewDialogOpen(true);
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
                <Button variant="outline" size="sm"><Download size={14} className="mr-1.5" />Export</Button>
                <Button variant="outline" size="sm"><Upload size={14} className="mr-1.5" />Import</Button>
                <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}Save Draft
                </Button>
                <Button size="sm" disabled={hasOverAllocation || submitMutation.isPending || lines.length === 0} onClick={() => submitMutation.mutate()}>
                  {submitMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Send size={14} className="mr-1.5" />}Submit
                </Button>
              </div>
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
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No lines yet. Click "Add Row" to start.</td></tr>
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
                              <SelectContent>{allProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{allProjects.find(p => p.id === line.worked_project_id)?.project_name || "—"}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={line.billed_project_id} onValueChange={(v) => updateLine(idx, "billed_project_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{allProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}</SelectContent>
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

          <div className="mt-4 text-xs text-muted-foreground">
            {lines.length} line(s) · Revision #{selectedSubmission.revision_no} · {selectedSubmission.schedule_type}
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

          {/* Bulk review actions */}
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
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedSubmission(sub); setView("detail"); }}>
                        <Eye size={14} />
                      </Button>
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
    </AppLayout>
  );
}
