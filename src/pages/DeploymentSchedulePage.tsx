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
import { Save, Send, Plus, Trash2, Eye, Loader2, CheckCircle2, XCircle, RotateCcw, AlertTriangle } from "lucide-react";
import { exportToExcel, downloadTemplate, parseExcelFile, type ExcelColumnDef } from "@/lib/excel-utils";
import ExcelToolbar from "@/components/ExcelToolbar";
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
type Position = Tables<"positions">;

// A UI row: one employee-month combination with allocations across project columns
interface UIRow {
  _key: string; // UI key
  month: string;
  employee_id: string;
  position_id: string;
  rate_year: number; // 1-5
  man_months: number; // 0-1.0
  so_id: string;
  po_id: string;
  // project_id -> allocation_pct (0-100, sum should be 100)
  allocations: Record<string, number>;
}

const projLabel = (p: Project) => p.project_number ? `${p.project_number} - ${p.project_name}` : p.project_name;

let rowCounter = 0;
const newRowKey = () => `row-${++rowCounter}-${Date.now()}`;

export default function DeploymentSchedulePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [consultantId, setConsultantId] = useState("");
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newType, setNewType] = useState<string>("actual");
  const [rows, setRows] = useState<UIRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected" | "returned">("approved");
  const [reviewComment, setReviewComment] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);

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

  const { data: openPeriod } = useQuery({
    queryKey: ["open-period"],
    queryFn: async () => {
      const { data, error } = await supabase.from("period_control").select("*").eq("status", "open").limit(1).single();
      if (error) return null;
      return data as Period;
    },
  });

  const periodMonth = openPeriod?.month || "";

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

  const { data: positions = [] } = useQuery({
    queryKey: ["deployment-positions", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase.from("positions").select("*").eq("consultant_id", consultantId).order("position_name");
      if (error) throw error;
      return data as Position[];
    },
    enabled: !!consultantId,
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: ["deployment-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, project_name, project_number").eq("status", "active").order("project_name");
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

  const scheduleType = selectedSubmission?.schedule_type || newType;

  // Derive project columns from PO items (unique projects)
  const poProjectIds = useMemo(() => {
    const ids = new Set<string>();
    poItems.forEach(pi => { if (pi.project_id) ids.add(pi.project_id); });
    return ids;
  }, [poItems]);

  const poProjects = useMemo(() => allProjects.filter(p => poProjectIds.has(p.id)), [allProjects, poProjectIds]);

  // Project columns for the table
  const projectColumns: Project[] = useMemo(() => {
    if (scheduleType === "workload") return allProjects;
    return poProjects.length > 0 ? poProjects : [];
  }, [scheduleType, poProjects, allProjects]);

  // Map: po_item_id -> project_id for saving
  const poItemByProject = useMemo(() => {
    const map: Record<string, string> = {};
    poItems.forEach(pi => {
      if (pi.project_id) map[pi.project_id] = pi.id;
    });
    return map;
  }, [poItems]);

  // Map: po_item -> po_id
  const poByItem = useMemo(() => {
    const map: Record<string, string> = {};
    poItems.forEach(pi => { map[pi.id] = pi.po_id; });
    return map;
  }, [poItems]);

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

  // Convert DB lines to UI rows (group by employee_id — each employee has multiple lines for different projects)
  useEffect(() => {
    if (!selectedSubmission) return;
    if (existingLines.length === 0) { setRows([]); return; }

    // Group lines by employee_id (each group = 1 UI row)
    const grouped: Record<string, DeploymentLine[]> = {};
    existingLines.forEach(l => {
      const key = l.employee_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(l);
    });

    const uiRows: UIRow[] = Object.entries(grouped).map(([empId, lines]) => {
      const first = lines[0];
      const allocations: Record<string, number> = {};
      lines.forEach(l => {
        const projId = l.worked_project_id || l.billed_project_id;
        if (projId) allocations[projId] = Number(l.allocation_pct);
      });
      return {
        _key: newRowKey(),
        month: selectedSubmission.month,
        employee_id: empId,
        position_id: employees.find(e => e.id === empId)?.position_id || first.po_item_id || "",
        rate_year: (first as any).rate_year || 1,
        man_months: (first as any).man_months ?? 0,
        so_id: first.so_id || "",
        po_id: first.po_id || "",
        allocations,
      };
    });
    setRows(uiRows);
  }, [existingLines, selectedSubmission, employees]);

  const isEditable = selectedSubmission && ["draft", "returned"].includes(selectedSubmission.status);

  // ---- Mutations ----

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
            po_item_id: l.po_item_id,
            so_id: l.so_id,
            allocation_pct: l.allocation_pct,
            rate_year: (l as any).rate_year,
            man_months: (l as any).man_months,
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSubmission) throw new Error("No submission selected");
      await supabase.from("deployment_lines").delete().eq("submission_id", selectedSubmission.id);

      const toInsert: any[] = [];
      rows.forEach(row => {
        if (!row.employee_id) return;
        const hasAllocations = Object.values(row.allocations).some(v => v > 0);
        if (!hasAllocations && row.man_months <= 0) return;

        // Create one deployment_line per project allocation
        const projEntries = Object.entries(row.allocations).filter(([, pct]) => pct > 0);
        if (projEntries.length === 0) {
          // Save row even without project allocations (just employee + man_months)
          toInsert.push({
            submission_id: selectedSubmission.id,
            employee_id: row.employee_id,
            worked_project_id: null,
            billed_project_id: null,
            po_id: row.po_id || null,
            po_item_id: null,
            so_id: row.so_id || null,
            allocation_pct: 0,
            rate_year: row.rate_year,
            man_months: row.man_months,
          });
        } else {
          projEntries.forEach(([projId, pct]) => {
            const poItemId = poItemByProject[projId] || null;
            const poId = poItemId ? (poByItem[poItemId] || row.po_id || null) : (row.po_id || null);
            toInsert.push({
              submission_id: selectedSubmission.id,
              employee_id: row.employee_id,
              worked_project_id: projId,
              billed_project_id: projId,
              po_id: poId,
              po_item_id: poItemId,
              so_id: row.so_id || null,
              allocation_pct: pct,
              rate_year: row.rate_year,
              man_months: row.man_months,
            });
          });
        }
      });

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

  const deleteMutation = useMutation({
    mutationFn: async (subId: string) => {
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

  // ---- Row helpers ----
  const addRow = () => {
    setRows(prev => [...prev, {
      _key: newRowKey(),
      month: periodMonth,
      employee_id: "",
      position_id: "",
      rate_year: 1,
      man_months: 0,
      so_id: "",
      po_id: "",
      allocations: {},
    }]);
  };

  const updateRow = (idx: number, field: keyof UIRow, value: any) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      // Auto-populate position when employee changes
      if (field === "employee_id") {
        const emp = employees.find(e => e.id === value);
        if (emp?.position_id) updated.position_id = emp.position_id;
      }
      return updated;
    }));
  };

  const updateAllocation = (rowIdx: number, projectId: string, pct: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const newAlloc = { ...r.allocations, [projectId]: Math.max(0, Math.min(100, pct)) };
      if (pct <= 0) delete newAlloc[projectId];
      return { ...r, allocations: newAlloc };
    }));
  };

  const removeRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    const submittedSubs = submissions.filter(s => s.status === "submitted");
    if (selectedIds.size === submittedSubs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(submittedSubs.map(s => s.id)));
  };

  // Validation
  const allocationErrors = useMemo(() => {
    const errors: string[] = [];
    rows.forEach((row, idx) => {
      if (!row.employee_id) return;
      const sum = Object.values(row.allocations).reduce((a, b) => a + b, 0);
      if (sum > 0 && sum !== 100) {
        const emp = employees.find(e => e.id === row.employee_id);
        errors.push(`Row ${idx + 1} (${emp?.employee_name || "Unknown"}): allocation sums to ${sum}%, must be 100%`);
      }
      if (row.man_months > 1) {
        errors.push(`Row ${idx + 1}: man-months exceeds 1.0`);
      }
    });
    return errors;
  }, [rows, employees]);

  const hasErrors = allocationErrors.length > 0;

  const openReview = (action: "approved" | "rejected" | "returned") => {
    setReviewAction(action); setReviewComment(""); setReviewDialogOpen(true);
  };

  // ---- Excel ----
  const getExcelColumns = (): ExcelColumnDef[] => {
    const base: ExcelColumnDef[] = [
      { header: "Employee Name", key: "employee_name", width: 25 },
      { header: "Position", key: "position_name", width: 20 },
      { header: "Rate Year (1-5)", key: "rate_year", width: 14 },
      { header: "Man-Months (max 1.0)", key: "man_months", width: 18 },
      { header: "Service Order", key: "so_number", width: 18 },
      { header: "Purchase Order", key: "po_number", width: 18 },
    ];
    // Add project columns
    projectColumns.forEach(p => {
      base.push({ header: `% ${projLabel(p)}`, key: `proj_${p.id}`, width: 20 });
    });
    return base;
  };

  const handleExport = () => {
    const cols = getExcelColumns();
    const data = rows.map(row => {
      const emp = employees.find(e => e.id === row.employee_id);
      const pos = positions.find(p => p.id === row.position_id);
      const so = serviceOrders.find(s => s.id === row.so_id);
      const po = purchaseOrders.find(p => p.id === row.po_id);
      const rec: Record<string, any> = {
        employee_name: emp?.employee_name || "",
        position_name: pos?.position_name || "",
        rate_year: row.rate_year,
        man_months: row.man_months,
        so_number: so?.so_number || "",
        po_number: po?.po_number || "",
      };
      projectColumns.forEach(p => {
        rec[`proj_${p.id}`] = row.allocations[p.id] || "";
      });
      return rec;
    });
    exportToExcel(`deployment-${scheduleType}-${periodMonth}.xlsx`, cols, data);
    toast.success("Exported to Excel");
  };

  const handleTemplate = () => {
    const cols = getExcelColumns();
    const refData: Record<string, string[]> = {
      "Employees": employees.map(e => e.employee_name),
      "Positions": positions.map(p => p.position_name),
      "Service Orders": serviceOrders.map(s => s.so_number),
      "Purchase Orders": purchaseOrders.map(p => p.po_number),
      "Projects": projectColumns.map(p => projLabel(p)),
    };
    downloadTemplate(`deployment-template-${scheduleType}.xlsx`, cols, refData);
    toast.success("Template downloaded");
  };

  const handleImport = async (file: File) => {
    try {
      const rawRows = await parseExcelFile(file);
      if (rawRows.length < 2) { toast.error("File is empty"); return; }

      const headers = rawRows[0].map(h => String(h).trim().toLowerCase());
      const dataRows = rawRows.slice(1).filter(r => r[0] && !String(r[0]).startsWith("---"));
      const errors: string[] = [];
      const newRows: UIRow[] = [];

      dataRows.forEach((row, i) => {
        const get = (key: string) => {
          const idx = headers.findIndex(h => h.includes(key));
          return idx >= 0 ? String(row[idx] || "").trim() : "";
        };

        const empName = get("employee");
        if (!empName) return;

        const emp = employees.find(e => e.employee_name.toLowerCase() === empName.toLowerCase());
        if (!emp) { errors.push(`Row ${i + 2}: Employee "${empName}" not found`); return; }

        const posName = get("position");
        const pos = posName ? positions.find(p => p.position_name.toLowerCase() === posName.toLowerCase()) : null;

        const rateYear = parseInt(get("rate year")) || 1;
        if (rateYear < 1 || rateYear > 5) { errors.push(`Row ${i + 2}: Invalid rate year`); return; }

        const manMonths = parseFloat(get("man-months") || get("man_months") || get("manmonths")) || 0;
        if (manMonths > 1) { errors.push(`Row ${i + 2}: Man-months exceeds 1.0`); return; }

        const soNum = get("service order");
        const so = soNum ? serviceOrders.find(s => s.so_number.toLowerCase() === soNum.toLowerCase()) : null;

        const poNum = get("purchase order");
        const po = poNum ? purchaseOrders.find(p => p.po_number.toLowerCase() === poNum.toLowerCase()) : null;

        // Parse project allocation columns (headers starting with %)
        const allocations: Record<string, number> = {};
        headers.forEach((h, colIdx) => {
          if (h.startsWith("% ") || h.startsWith("%")) {
            const projPart = h.replace(/^%\s*/, "");
            const proj = projectColumns.find(p =>
              projLabel(p).toLowerCase() === projPart.toLowerCase() ||
              p.project_name.toLowerCase() === projPart.toLowerCase() ||
              (p.project_number && p.project_number.toLowerCase() === projPart.toLowerCase())
            );
            if (proj) {
              const val = parseFloat(String(row[colIdx] || "")) || 0;
              if (val > 0) allocations[proj.id] = val;
            }
          }
        });

        newRows.push({
          _key: newRowKey(),
          month: periodMonth,
          employee_id: emp.id,
          position_id: pos?.id || emp.position_id || "",
          rate_year: rateYear,
          man_months: manMonths,
          so_id: so?.id || "",
          po_id: po?.id || "",
          allocations,
        });
      });

      if (errors.length > 0) {
        toast.error(`${errors.length} error(s): ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "..." : ""}`);
      }
      if (newRows.length > 0) {
        setRows(prev => [...prev, ...newRows]);
        toast.success(`${newRows.length} row(s) imported`);
      }
    } catch (err) {
      toast.error("Failed to parse file");
    }
  };

  // ---- Render ----

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
    const getRateForRow = (row: UIRow) => {
      const pos = positions.find(p => p.id === row.position_id);
      if (!pos) return null;
      const rateKey = `year_${row.rate_year}_rate` as keyof Position;
      return pos[rateKey] as number | null;
    };

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

          {hasErrors && (
            <div className="flex items-start gap-2 px-4 py-2 mb-4 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                {allocationErrors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {isEditable && (
            <div className="flex items-center gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={addRow}><Plus size={14} className="mr-1.5" />Add Row</Button>
              <div className="ml-auto flex items-center gap-2">
                <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={handleImport} />
                <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}Save Draft
                </Button>
                <Button size="sm" disabled={hasErrors || submitMutation.isPending || rows.length === 0} onClick={() => submitMutation.mutate()}>
                  {submitMutation.isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Send size={14} className="mr-1.5" />}Submit
                </Button>
              </div>
            </div>
          )}

          {!isEditable && (
            <div className="flex items-center gap-2 mb-4">
              <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={() => {}} />
            </div>
          )}

          {/* Lines table */}
          <div className="bg-card rounded-md border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[100px]">Month</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[180px]">Employee</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[160px]">Position</th>
                  <th className="data-table-header text-center px-3 py-2.5 min-w-[90px]">Rate Year</th>
                  <th className="data-table-header text-center px-3 py-2.5 min-w-[80px]">Rate</th>
                  <th className="data-table-header text-center px-3 py-2.5 min-w-[100px]">Man-Months</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[130px]">SO</th>
                  <th className="data-table-header text-left px-3 py-2.5 min-w-[130px]">PO</th>
                  {projectColumns.map(p => (
                    <th key={p.id} className="data-table-header text-center px-2 py-2.5 min-w-[100px]" title={projLabel(p)}>
                      <div className="text-xs truncate max-w-[100px]">{p.project_number || p.project_name.slice(0, 10)}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">%</div>
                    </th>
                  ))}
                  <th className="data-table-header text-center px-2 py-2.5 w-14">Sum%</th>
                  {isEditable && <th className="data-table-header w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={9 + projectColumns.length + (isEditable ? 1 : 0)} className="text-center py-12 text-muted-foreground">No rows yet. Click "Add Row" or import from Excel.</td></tr>
                ) : (
                  rows.map((row, idx) => {
                    const emp = employees.find(e => e.id === row.employee_id);
                    const pos = positions.find(p => p.id === row.position_id);
                    const rate = getRateForRow(row);
                    const allocSum = Object.values(row.allocations).reduce((a, b) => a + b, 0);
                    const filteredPOs = purchaseOrders.filter(po => !row.so_id || po.so_id === row.so_id);

                    return (
                      <tr key={row._key} className="border-b last:border-0 hover:bg-muted/50">
                        {/* Month */}
                        <td className="px-3 py-1.5">
                          <div className="h-8 px-2 text-xs border rounded-md bg-muted flex items-center font-mono text-muted-foreground">
                            {row.month || periodMonth}
                          </div>
                        </td>
                        {/* Employee */}
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={row.employee_id} onValueChange={(v) => updateRow(idx, "employee_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.employee_name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{emp?.employee_name || "—"}</span>}
                        </td>
                        {/* Position */}
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={row.position_id} onValueChange={(v) => updateRow(idx, "position_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{positions.map(p => <SelectItem key={p.id} value={p.id}>{p.position_name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{pos?.position_name || "—"}</span>}
                        </td>
                        {/* Rate Year */}
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={String(row.rate_year)} onValueChange={(v) => updateRow(idx, "rate_year", parseInt(v))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map(y => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : <span className="text-xs text-center block">Year {row.rate_year}</span>}
                        </td>
                        {/* Rate (derived, read-only) */}
                        <td className="px-3 py-1.5 text-center">
                          <span className="text-xs font-mono text-muted-foreground">
                            {rate != null ? rate.toLocaleString() : "—"}
                          </span>
                        </td>
                        {/* Man-Months */}
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              max={1}
                              value={row.man_months || ""}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                updateRow(idx, "man_months", isNaN(val) ? 0 : Math.min(1, Math.max(0, val)));
                              }}
                              className="h-8 text-xs text-center w-20"
                            />
                          ) : <span className="text-xs font-mono text-center block">{row.man_months}</span>}
                        </td>
                        {/* SO */}
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={row.so_id} onValueChange={(v) => { updateRow(idx, "so_id", v); updateRow(idx, "po_id", ""); }}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{serviceOrders.map(so => <SelectItem key={so.id} value={so.id}>{so.so_number}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{serviceOrders.find(s => s.id === row.so_id)?.so_number || "—"}</span>}
                        </td>
                        {/* PO */}
                        <td className="px-3 py-1.5">
                          {isEditable ? (
                            <Select value={row.po_id} onValueChange={(v) => updateRow(idx, "po_id", v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>{filteredPOs.map(po => <SelectItem key={po.id} value={po.id}>{po.po_number}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <span className="text-xs">{purchaseOrders.find(p => p.id === row.po_id)?.po_number || "—"}</span>}
                        </td>
                        {/* Project allocation columns */}
                        {projectColumns.map(p => (
                          <td key={p.id} className="px-2 py-1.5">
                            {isEditable ? (
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={row.allocations[p.id] || ""}
                                onChange={(e) => updateAllocation(idx, p.id, parseInt(e.target.value) || 0)}
                                className="h-8 text-xs text-center w-16"
                              />
                            ) : <span className="text-xs font-mono text-center block">{row.allocations[p.id] || ""}</span>}
                          </td>
                        ))}
                        {/* Sum */}
                        <td className="px-2 py-1.5 text-center">
                          <span className={`text-xs font-mono font-semibold ${allocSum > 0 && allocSum !== 100 ? "text-destructive" : "text-muted-foreground"}`}>
                            {allocSum > 0 ? `${allocSum}%` : ""}
                          </span>
                        </td>
                        {isEditable && (
                          <td className="px-2 py-1.5">
                            <button onClick={() => removeRow(idx)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
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
            <span>{rows.length} row(s)</span>
            <span>·</span>
            <span>Revision #{selectedSubmission.revision_no}</span>
            <span>·</span>
            <span className="capitalize">{selectedSubmission.schedule_type}</span>
            <span>·</span>
            <span>{projectColumns.length} project column(s)</span>
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
