import { useState, useCallback, useEffect } from "react";
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
import { Download, Upload, Save, Send, Plus, X, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Employee = Tables<"employees"> & { positions?: { position_name: string } | null };
type Project = { id: string; project_name: string };
type Submission = Tables<"deployment_submissions">;
type DeploymentLine = Tables<"deployment_lines">;
type Period = Tables<"period_control">;

type MatrixData = Record<string, Record<string, number>>;

export default function DeploymentSchedulePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [scheduleType, setScheduleType] = useState<string>("baseline");
  const [consultantId, setConsultantId] = useState<string>("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [data, setData] = useState<MatrixData>({});
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);

  // Load open period
  const { data: openPeriod } = useQuery({
    queryKey: ["open-period"],
    queryFn: async () => {
      const { data, error } = await supabase.from("period_control").select("*").eq("status", "open").limit(1).single();
      if (error) return null;
      return data as Period;
    },
  });

  const month = openPeriod?.month || "";

  // Load consultants
  const { data: consultants = [] } = useQuery({
    queryKey: ["consultants-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("consultants").select("id, name").eq("status", "active").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  // Auto-select first consultant
  useEffect(() => {
    if (!consultantId && consultants.length > 0) setConsultantId(consultants[0].id);
  }, [consultants, consultantId]);

  // Load employees for selected consultant
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

  // Load projects
  const { data: allProjects = [] } = useQuery({
    queryKey: ["deployment-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, project_name").eq("status", "active").order("project_name");
      if (error) throw error;
      return data as Project[];
    },
  });

  // Load existing submission
  const { data: submission } = useQuery({
    queryKey: ["deployment-submission", consultantId, month, scheduleType],
    queryFn: async () => {
      if (!consultantId || !month) return null;
      const { data, error } = await supabase.from("deployment_submissions")
        .select("*")
        .eq("consultant_id", consultantId)
        .eq("month", month)
        .eq("schedule_type", scheduleType as any)
        .order("revision_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Submission | null;
    },
    enabled: !!consultantId && !!month,
  });

  // Load deployment lines for submission
  const { data: lines = [] } = useQuery({
    queryKey: ["deployment-lines", submission?.id],
    queryFn: async () => {
      if (!submission) return [];
      const { data, error } = await supabase.from("deployment_lines").select("*").eq("submission_id", submission.id);
      if (error) throw error;
      return data as DeploymentLine[];
    },
    enabled: !!submission,
  });

  // Populate matrix from lines
  useEffect(() => {
    setCurrentSubmission(submission || null);
    if (lines.length > 0) {
      const matrix: MatrixData = {};
      const projSet = new Set<string>();
      lines.forEach(l => {
        if (!matrix[l.employee_id]) matrix[l.employee_id] = {};
        if (l.worked_project_id) {
          matrix[l.employee_id][l.worked_project_id] = Number(l.allocation_pct);
          projSet.add(l.worked_project_id);
        }
      });
      setData(matrix);
      if (projSet.size > 0) setSelectedProjects(Array.from(projSet));
    } else {
      setData({});
    }
  }, [lines, submission]);

  const getRowTotal = useCallback(
    (empId: string) => {
      const row = data[empId] || {};
      return Object.values(row).reduce((sum, v) => sum + (v || 0), 0);
    },
    [data]
  );

  const handleCellChange = (empId: string, projId: string, value: string) => {
    const num = value === "" ? 0 : Math.min(100, Math.max(0, parseInt(value) || 0));
    setData((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] || {}), [projId]: num },
    }));
  };

  const removeProject = (projId: string) => {
    setSelectedProjects((prev) => prev.filter((p) => p !== projId));
  };

  const addProject = (projId: string) => {
    if (!selectedProjects.includes(projId)) {
      setSelectedProjects((prev) => [...prev, projId]);
    }
  };

  // Save draft
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!consultantId || !month) throw new Error("Select consultant and ensure period is open");
      let subId = currentSubmission?.id;
      if (!subId) {
        const { data: newSub, error } = await supabase.from("deployment_submissions").insert({
          consultant_id: consultantId,
          month,
          schedule_type: scheduleType as any,
          status: "draft" as any,
          created_by: user?.id || null,
        }).select("id").single();
        if (error) throw error;
        subId = newSub.id;
      }
      // Delete existing lines and re-insert
      await supabase.from("deployment_lines").delete().eq("submission_id", subId);
      const linesToInsert: any[] = [];
      for (const [empId, projects] of Object.entries(data)) {
        for (const [projId, pct] of Object.entries(projects)) {
          if (pct > 0) {
            linesToInsert.push({ submission_id: subId, employee_id: empId, worked_project_id: projId, allocation_pct: pct });
          }
        }
      }
      if (linesToInsert.length > 0) {
        const { error } = await supabase.from("deployment_lines").insert(linesToInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployment-submission"] });
      queryClient.invalidateQueries({ queryKey: ["deployment-lines"] });
      toast.success("Draft saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Submit
  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync();
      if (!currentSubmission?.id) {
        // Re-fetch after save
        const { data: sub } = await supabase.from("deployment_submissions")
          .select("id")
          .eq("consultant_id", consultantId)
          .eq("month", month)
          .eq("schedule_type", scheduleType as any)
          .order("revision_no", { ascending: false })
          .limit(1)
          .single();
        if (sub) {
          const { error } = await supabase.from("deployment_submissions").update({ status: "submitted" as any, submitted_on: new Date().toISOString(), submitted_by: user?.id || null }).eq("id", sub.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("deployment_submissions").update({ status: "submitted" as any, submitted_on: new Date().toISOString(), submitted_by: user?.id || null }).eq("id", currentSubmission.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployment-submission"] });
      toast.success("Submitted for review");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const availableProjects = allProjects.filter((p) => !selectedProjects.includes(p.id));
  const visibleProjects = allProjects.filter((p) => selectedProjects.includes(p.id));
  const hasOverAllocation = employees.some((e) => getRowTotal(e.id) > 100);
  const status = currentSubmission?.status || "draft";

  if (!openPeriod) {
    return (
      <AppLayout>
        <div className="animate-fade-in">
          <div className="page-header">
            <div>
              <h1 className="page-title">Deployment Schedules</h1>
              <p className="page-subtitle">No open period found. Please open a period first in Period Control.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Deployment Schedules</h1>
            <p className="page-subtitle">Matrix view — {scheduleType} deployment for {month}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Select value={consultantId} onValueChange={setConsultantId}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Select consultant" /></SelectTrigger>
            <SelectContent>
              {consultants.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={scheduleType} onValueChange={setScheduleType}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baseline">Baseline</SelectItem>
              <SelectItem value="actual">Actual</SelectItem>
              <SelectItem value="forecast">Forecast</SelectItem>
              <SelectItem value="workload">Workload</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-8 px-3 text-sm border rounded-md bg-card flex items-center font-mono text-muted-foreground">
            {month}
          </div>

          {availableProjects.length > 0 && (
            <Select onValueChange={addProject}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Plus size={12} /> Add Project Column
                </span>
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm"><Download size={14} className="mr-1.5" />Export</Button>
            <Button variant="outline" size="sm"><Upload size={14} className="mr-1.5" />Import</Button>
            <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}Save Draft
            </Button>
            <Button size="sm" disabled={hasOverAllocation || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
              {submitMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Send size={14} className="mr-1.5" />}Submit
            </Button>
          </div>
        </div>

        {hasOverAllocation && (
          <div className="flex items-center gap-2 px-4 py-2 mb-4 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertTriangle size={16} />
            <span>One or more employees exceed 100% allocation. Fix before submitting.</span>
          </div>
        )}

        {/* Matrix */}
        <div className="bg-card rounded-md border overflow-x-auto">
          {employees.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No active employees for selected consultant</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="matrix-cell-header text-left sticky left-0 bg-muted z-10 min-w-[200px]">Employee</th>
                  <th className="matrix-cell-header text-left min-w-[140px]">Position</th>
                  {visibleProjects.map((p) => (
                    <th key={p.id} className="matrix-cell-header text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="truncate max-w-[80px]" title={p.project_name}>{p.project_name}</span>
                        <button onClick={() => removeProject(p.id)} className="opacity-40 hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="matrix-cell-header text-center">Total %</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const total = getRowTotal(emp.id);
                  const isOver = total > 100;
                  return (
                    <tr key={emp.id} className={isOver ? "matrix-row-over" : ""}>
                      <td className="matrix-cell text-left sticky left-0 bg-card z-10 font-medium text-sm px-2">
                        {emp.employee_name}
                      </td>
                      <td className="matrix-cell text-left text-xs text-muted-foreground px-2">{emp.positions?.position_name || "—"}</td>
                      {visibleProjects.map((p) => (
                        <td key={p.id} className="matrix-cell p-0">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={data[emp.id]?.[p.id] || ""}
                            onChange={(e) => handleCellChange(emp.id, p.id, e.target.value)}
                            className="matrix-cell-input"
                            placeholder="–"
                          />
                        </td>
                      ))}
                      <td className={`matrix-row-total ${isOver ? "text-destructive font-bold" : ""}`}>
                        {total}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span>Revision: #{currentSubmission?.revision_no || 1}</span>
          <span>·</span>
          <span>Month: {month}</span>
          <span>·</span>
          <span>Type: {scheduleType}</span>
          <span>·</span>
          <span>{employees.length} employees × {visibleProjects.length} projects</span>
        </div>
      </div>
    </AppLayout>
  );
}
