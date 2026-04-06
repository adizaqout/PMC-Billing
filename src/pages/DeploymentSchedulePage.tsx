import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import ColumnVisibilityToggle, { useColumnVisibility, type ColumnDef } from "@/components/ColumnVisibilityToggle";
import ColumnFilter from "@/components/ColumnFilter";
import SortableHeader from "@/components/SortableHeader";
import TablePagination from "@/components/TablePagination";
import { useSort } from "@/hooks/useSort";
import { usePagination } from "@/hooks/usePagination";
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
import { Save, Send, Plus, Trash2, Eye, Loader2, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import type { SmartImportConfig, ImportColumnDef, ImportRecord } from "@/components/import/types";

type Submission = Tables<"deployment_submissions"> & { consultants?: { short_name: string } | null };
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
  const [isProcessingRows, setIsProcessingRows] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected" | "returned">("approved");
  const [reviewComment, setReviewComment] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [subSearch, setSubSearch] = useState("");
  const [subColFilters, setSubColFilters] = useState<Record<string, string>>({});
  const setSubColFilter = (key: string, value: string) => setSubColFilters(prev => ({ ...prev, [key]: value }));
  const subTableCols: ColumnDef[] = [
    { key: "month", label: "Month" }, { key: "type", label: "Type" }, { key: "rev", label: "Rev #" },
    { key: "status", label: "Status" }, { key: "submitted", label: "Submitted" }, { key: "reviewed", label: "Reviewed" },
  ];
  const { visibleColumns: subVisibleCols, setVisibleColumns: setSubVisibleCols } = useColumnVisibility(subTableCols);

  // Detail view state
  const [detailSearch, setDetailSearch] = useState("");
  const [detailColFilters, setDetailColFilters] = useState<Record<string, string>>({});
  const setDetailColFilter = (key: string, value: string) => setDetailColFilters(prev => ({ ...prev, [key]: value }));
  const detailTableCols: ColumnDef[] = [
    { key: "month", label: "Month" }, { key: "emp_id", label: "Emp ID" }, { key: "emp_name", label: "Employee Name" },
    { key: "pos_id", label: "Position ID" }, { key: "pos_name", label: "Position Name" },
    { key: "rate_year", label: "Rate Year" }, { key: "rate", label: "Rate" }, { key: "man_months", label: "Man-Months" },
  ];
  const { visibleColumns: detailVisibleCols, setVisibleColumns: setDetailVisibleCols } = useColumnVisibility(detailTableCols);

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
      const { data, error } = await supabase.from("consultants").select("id, short_name").eq("status", "active").order("short_name");
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
        .select("*, consultants(short_name)")
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
      const { data, error } = await supabase.from("employees").select("*, positions(position_name)").eq("consultant_id", consultantId).order("employee_name");
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!consultantId,
  });

  // All employees (any status) for import validation — so "pending" employees are also recognized
  const { data: allEmployees = [] } = useQuery({
    queryKey: ["deployment-all-employees", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase.from("employees").select("*, positions(position_name)").eq("consultant_id", consultantId).order("employee_name");
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
      const { data, error } = await supabase.from("purchase_orders").select("id, po_number, consultant_id, so_id, project_id").eq("consultant_id", consultantId).eq("status", "active");
      if (error) throw error;
      return data as (PurchaseOrder & { project_id: string | null })[];
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

  const { data: frameworkAgreements = [] } = useQuery({
    queryKey: ["deployment-fas", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase.from("framework_agreements").select("id, framework_agreement_no, start_date, end_date").eq("consultant_id", consultantId).eq("status", "active");
      if (error) throw error;
      return data as { id: string; framework_agreement_no: string; start_date: string | null; end_date: string | null }[];
    },
    enabled: !!consultantId,
  });

  // Fetch admin-defined period constraints for this consultant
  const { data: adminConstraints = [] } = useQuery({
    queryKey: ["consultant-period-constraints", consultantId],
    queryFn: async () => {
      if (!consultantId) return [];
      const { data, error } = await supabase.from("consultant_period_constraints").select("*").eq("consultant_id", consultantId);
      if (error) throw error;
      return data as { id: string; consultant_id: string; schedule_type: string; min_month: string | null; max_month: string | null }[];
    },
    enabled: !!consultantId,
  });

  const scheduleType = selectedSubmission?.schedule_type || newType;

  // Compute earliest framework start month (YYYY-MM) for month constraints
  const frameworkStartMonth = useMemo(() => {
    const starts = frameworkAgreements.map(fa => fa.start_date).filter(Boolean) as string[];
    if (starts.length === 0) return null;
    starts.sort();
    const earliest = starts[0]; // YYYY-MM-DD
    return earliest.slice(0, 7); // YYYY-MM
  }, [frameworkAgreements]);

  // Month min/max based on schedule type, with admin overrides
  const getMonthConstraints = (type: string) => {
    const fwStart = frameworkStartMonth || undefined;
    const adminRule = adminConstraints.find(c => c.schedule_type === type);

    switch (type) {
      case "actual":
      case "workload":
        return { min: fwStart, max: periodMonth || undefined };
      case "forecast": {
        // Default: min is next month after period, no max
        let min: string | undefined;
        if (periodMonth) {
          const [y, m] = periodMonth.split("-").map(Number);
          min = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
        } else {
          min = fwStart;
        }
        let max: string | undefined;
        // Admin overrides
        if (adminRule?.min_month) min = adminRule.min_month;
        if (adminRule?.max_month) max = adminRule.max_month;
        return { min, max };
      }
      case "baseline": {
        let min = fwStart;
        let max: string | undefined;
        // Admin overrides
        if (adminRule?.min_month) min = adminRule.min_month;
        if (adminRule?.max_month) max = adminRule.max_month;
        return { min, max };
      }
      default:
        return { min: fwStart, max: undefined };
    }
  };

  const monthConstraints = getMonthConstraints(scheduleType);

  // Derive project columns from POs (via project_id on PO)
  const poProjectIds = useMemo(() => {
    const ids = new Set<string>();
    purchaseOrders.forEach(po => { if ((po as any).project_id) ids.add((po as any).project_id); });
    poItems.forEach(pi => { if (pi.project_id) ids.add(pi.project_id); });
    return ids;
  }, [purchaseOrders, poItems]);

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
  // Fetch ALL lines for selected submission (paginate past Supabase 1000-row limit)
  const { data: existingLines = [] } = useQuery({
    queryKey: ["deployment-lines", selectedSubmission?.id],
    queryFn: async () => {
      if (!selectedSubmission) return [];
      const allLines: DeploymentLine[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("deployment_lines")
          .select("*")
          .eq("submission_id", selectedSubmission.id)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allLines.push(...(data as DeploymentLine[]));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return allLines;
    },
    enabled: !!selectedSubmission,
  });

  // Convert DB lines to UI rows (group by employee_id+month — each employee per month has multiple lines for different projects)
  const buildUIRows = (lines: DeploymentLine[]): UIRow[] => {
    if (lines.length === 0) return [];

    // Single-pass separation using Map for O(1) grouping
    const newGrouped = new Map<string, DeploymentLine[]>();
    const legacyGrouped = new Map<string, DeploymentLine[]>();
    let nullCounter = 0;

    for (const l of lines) {
      const excelRowId = (l as any).excel_row_id as string | null;
      if (excelRowId) {
        const existing = newGrouped.get(excelRowId);
        if (existing) existing.push(l);
        else newGrouped.set(excelRowId, [l]);
      } else {
        const notesStr = (l as any).notes as string | null;
        const monthFromNotes = notesStr?.match(/month:([^|]+)/)?.[1];
        const empCodeFromNotes = notesStr?.match(/emp:([^|]+)/)?.[1];
        let key: string;
        if (l.employee_id) {
          key = monthFromNotes ? `${l.employee_id}|${monthFromNotes}` : l.employee_id;
        } else if (empCodeFromNotes && monthFromNotes) {
          key = `${empCodeFromNotes}|${monthFromNotes}`;
        } else {
          key = `__null_${++nullCounter}`;
        }
        const existing = legacyGrouped.get(key);
        if (existing) existing.push(l);
        else legacyGrouped.set(key, [l]);
      }
    }

    // Pre-build employee lookup Map for O(1) access
    const employeeMap = new Map(employees.map(e => [e.id, e]));

    const buildFromGroup = (grouped: Map<string, DeploymentLine[]>): UIRow[] => {
      const result: UIRow[] = new Array(grouped.size);
      let idx = 0;
      for (const [, grpLines] of grouped) {
        const first = grpLines[0];
        const empId = first.employee_id || "";
        const notesStr = (first as any).notes as string | null;
        const monthFromNotes = notesStr?.match(/month:([^|]+)/)?.[1];
        const allocations: Record<string, number> = {};
        let maxManMonths = 0;
        let maxRateYear = 0;
        for (const l of grpLines) {
          const projId = l.worked_project_id || l.billed_project_id;
          if (projId) allocations[projId] = Math.round(Number(l.allocation_pct) * 100) / 100;
          const mm = Number(l.man_months) || 0;
          if (mm > maxManMonths) maxManMonths = mm;
          const ry = Number(l.rate_year) || 0;
          if (ry > maxRateYear) maxRateYear = ry;
        }
        const posFromNotes = notesStr?.match(/posId:([^|]+)/)?.[1];
        result[idx++] = {
          _key: newRowKey(),
          month: monthFromNotes || selectedSubmission?.month || first.submission_id,
          employee_id: empId,
          position_id: employeeMap.get(empId)?.position_id || posFromNotes || first.po_item_id || "",
          rate_year: maxRateYear || 1,
          man_months: maxManMonths,
          so_id: first.so_id || "",
          po_id: first.po_id || "",
          allocations,
        };
      }
      return result;
    };

    const newUIRows = buildFromGroup(newGrouped);
    const legacyUIRows = buildFromGroup(legacyGrouped);

    // Pre-allocate combined array
    const combined = new Array<UIRow>(newUIRows.length + legacyUIRows.length);
    for (let i = 0; i < newUIRows.length; i++) combined[i] = newUIRows[i];
    for (let i = 0; i < legacyUIRows.length; i++) combined[newUIRows.length + i] = legacyUIRows[i];
    return combined;
  };

  useEffect(() => {
    if (!selectedSubmission) return;
    if (existingLines.length === 0) {
      setRows([]);
      setIsProcessingRows(false);
      return;
    }
    // For large datasets, yield to browser to show loading UI
    if (existingLines.length > 200) {
      setIsProcessingRows(true);
      const timer = setTimeout(() => {
        setRows(buildUIRows(existingLines));
        setIsProcessingRows(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    setRows(buildUIRows(existingLines));
  }, [existingLines, selectedSubmission, employees]);

  const isEditable = selectedSubmission && ["draft", "returned"].includes(selectedSubmission.status);

  // ---- Mutations ----

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!consultantId || !periodMonth) throw new Error("Select consultant and ensure period is open");

      // Check if latest submission for this type/month is in a non-revisable state
      const { data: latest } = await supabase
        .from("deployment_submissions")
        .select("id, revision_no, status")
        .eq("consultant_id", consultantId)
        .eq("schedule_type", newType as any)
        .eq("month", periodMonth)
        .order("revision_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest && ["approved", "submitted", "in_review"].includes(latest.status)) {
        throw new Error(`Cannot create a new revision — the latest submission is "${latest.status.replace("_", " ")}". Only rejected or returned submissions can be revised.`);
      }

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
        .select("*, consultants(short_name)")
        .single();
      if (error) throw error;

      // Only copy lines from a previous APPROVED revision (not rejected/returned)
      if (latest?.id && latest.status === "approved") {
        const allOldLines: any[] = [];
        const PAGE = 1000;
        let from = 0;
        while (true) {
          const { data } = await supabase.from("deployment_lines").select("*").eq("submission_id", latest.id).range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          allOldLines.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        if (allOldLines.length > 0) {
          const BATCH = 200;
          for (let b = 0; b < allOldLines.length; b += BATCH) {
            const batch = allOldLines.slice(b, b + BATCH).map(l => ({
              submission_id: newSub.id,
              consultant_id: consultantId,
              employee_id: l.employee_id,
              worked_project_id: l.worked_project_id,
              billed_project_id: l.billed_project_id,
              po_id: l.po_id,
              po_item_id: l.po_item_id,
              so_id: l.so_id,
              allocation_pct: l.allocation_pct,
              rate_year: l.rate_year,
              man_months: l.man_months,
              notes: l.notes,
              excel_row_id: l.excel_row_id || null,
            }));
            await supabase.from("deployment_lines").insert(batch);
          }
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
      const allowEmpty = selectedSubmission.schedule_type === "baseline" || selectedSubmission.schedule_type === "forecast";
      rows.forEach((row, rowIdx) => {
        if (!row.employee_id && !allowEmpty) return;
        const hasAllocations = Object.values(row.allocations).some(v => v > 0);
        if (!hasAllocations && row.man_months <= 0) return;

        // Build notes for grouping (all types need month for proper row grouping)
        const empCode = row.employee_id
          ? (employees.find(e => e.id === row.employee_id) as any)?.employee_id || row.employee_id
          : `PH-${rowIdx + 1}`;
        const groupNote = `emp:${empCode}|month:${row.month}|posId:${row.position_id || ""}`;

        // Create one deployment_line per project allocation
        const projEntries = Object.entries(row.allocations).filter(([, pct]) => pct > 0);
        if (projEntries.length === 0) {
          toInsert.push({
            submission_id: selectedSubmission.id,
            consultant_id: consultantId,
            employee_id: row.employee_id || null,
            worked_project_id: null,
            billed_project_id: null,
            po_id: row.po_id || null,
            po_item_id: null,
            so_id: row.so_id || null,
            allocation_pct: 0,
            rate_year: row.rate_year,
            man_months: row.man_months,
            notes: groupNote,
          });
        } else {
          projEntries.forEach(([projId, pct]) => {
            const poItemId = poItemByProject[projId] || null;
            const poId = poItemId ? (poByItem[poItemId] || row.po_id || null) : (row.po_id || null);
            toInsert.push({
              submission_id: selectedSubmission.id,
              consultant_id: consultantId,
              employee_id: row.employee_id || null,
              worked_project_id: projId,
              billed_project_id: projId,
              po_id: poId,
              po_item_id: poItemId,
              so_id: row.so_id || null,
              allocation_pct: pct,
              rate_year: row.rate_year,
              man_months: row.man_months,
              notes: groupNote,
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
      if (allocationErrors.length > 0) throw new Error("Cannot submit with validation errors. Please fix all errors first.");
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

  // Default month for new rows based on schedule type
  const defaultMonth = useMemo(() => {
    const constraints = getMonthConstraints(scheduleType);
    if (scheduleType === "forecast" && periodMonth) {
      const [y, m] = periodMonth.split("-").map(Number);
      return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
    if (scheduleType === "baseline") {
      return constraints.min || periodMonth || "";
    }
    // actual / workload — default to period month
    return periodMonth || constraints.min || "";
  }, [scheduleType, periodMonth, frameworkStartMonth, adminConstraints]);

  // Generate month options for the dropdown based on constraints
  const monthOptions = useMemo(() => {
    const constraints = getMonthConstraints(scheduleType);
    const options: string[] = [];
    const now = new Date();
    // Start from min or 2 years ago
    let startYear = now.getFullYear() - 2;
    let startMon = 1;
    if (constraints.min) {
      const [y, m] = constraints.min.split("-").map(Number);
      startYear = y;
      startMon = m;
    }
    // End at max or 2 years ahead
    let endYear = now.getFullYear() + 2;
    let endMon = 12;
    if (constraints.max) {
      const [y, m] = constraints.max.split("-").map(Number);
      endYear = y;
      endMon = m;
    }
    for (let y = startYear; y <= endYear; y++) {
      const ms = y === startYear ? startMon : 1;
      const me = y === endYear ? endMon : 12;
      for (let m = ms; m <= me; m++) {
        options.push(`${y}-${String(m).padStart(2, "0")}`);
      }
    }
    return options;
  }, [scheduleType, periodMonth, frameworkStartMonth, adminConstraints]);

  const formatMonthLabel = (m: string) => {
    if (!m) return "";
    const [y, mo] = m.split("-").map(Number);
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${monthNames[mo - 1]} ${y}`;
  };

  const addRow = () => {
    setRows(prev => [...prev, {
      _key: newRowKey(),
      month: defaultMonth,
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
    const allowEmptyEmployee = scheduleType === "baseline" || scheduleType === "forecast";
    
    // Check for duplicate employee per month
    const empMonthMap = new Map<string, number>();
    
    rows.forEach((row, idx) => {
      if (!row.employee_id && !allowEmptyEmployee) return;
      
      // Duplicate employee per month check
      if (row.employee_id) {
        const empMonthKey = `${row.employee_id}|${row.month}`;
        if (empMonthMap.has(empMonthKey)) {
          const emp = employees.find(e => e.id === row.employee_id);
          errors.push(`Row ${idx + 1} (${emp?.employee_name || "Unknown"}): duplicate entry for month ${row.month}`);
        }
        empMonthMap.set(empMonthKey, idx);
      }
      
      const rawSum = Object.values(row.allocations).reduce((a, b) => a + b, 0);
      const sum = Math.round(rawSum * 100) / 100; // fix floating point
      // Skip 100% allocation check for placeholder rows (no employee) in baseline/forecast
      const isPlaceholder = !row.employee_id && allowEmptyEmployee;
      if (sum > 0 && Math.abs(sum - 100) > 0.5 && !isPlaceholder) {
        const emp = employees.find(e => e.id === row.employee_id);
        errors.push(`Row ${idx + 1} (${emp?.employee_name || "Unknown"}): allocation sums to ${sum}%, must be 100%`);
      }
      if (row.man_months > 1) {
        errors.push(`Row ${idx + 1}: man-months exceeds 1.0`);
      }
      // Validate month against constraints
      if (row.month) {
        if (monthConstraints.min && row.month < monthConstraints.min) {
          errors.push(`Row ${idx + 1}: month ${row.month} is before allowed start (${monthConstraints.min})`);
        }
        if (monthConstraints.max && row.month > monthConstraints.max) {
          errors.push(`Row ${idx + 1}: month ${row.month} is after allowed end (${monthConstraints.max})`);
        }
      }
    });
    return errors;
  }, [rows, employees, monthConstraints]);

  const hasErrors = allocationErrors.length > 0;

  const openReview = (action: "approved" | "rejected" | "returned") => {
    setReviewAction(action); setReviewComment(""); setReviewDialogOpen(true);
  };

  // ---- Excel ----
  const getExcelColumns = (): ExcelColumnDef[] => {
    const base: ExcelColumnDef[] = [
      { header: "Month", key: "month", width: 12 },
      { header: "Employee ID", key: "employee_id_code", width: 16 },
      { header: "Employee Name", key: "employee_name", width: 25 },
      { header: "Position ID", key: "position_id_code", width: 16 },
      { header: "Position Name", key: "position_name", width: 20 },
      { header: "Rate Year (1-5)", key: "rate_year", width: 14 },
      { header: "Man-Months (max 1.0)", key: "man_months", width: 18 },
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
      const rec: Record<string, any> = {
        month: row.month || defaultMonth,
        employee_id_code: (emp as any)?.employee_id || "",
        employee_name: emp?.employee_name || (!row.employee_id && (scheduleType === "baseline" || scheduleType === "forecast") ? "TBD" : ""),
        position_id_code: pos?.position_id || "",
        position_name: pos?.position_name || "",
        rate_year: row.rate_year,
        man_months: row.man_months,
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
      "Employee IDs": employees.map(e => `${(e as any).employee_id || ""} — ${e.employee_name}`),
      "Position IDs": positions.map(p => `${p.position_id} — ${p.position_name}`),
      "Projects": projectColumns.map(p => projLabel(p)),
    };
    downloadTemplate(`deployment-template-${scheduleType}.xlsx`, cols, refData);
    toast.success("Template downloaded");
  };

  // ---- Smart Import Config ----
  const normalizeMonth = (raw: string): string => {
    if (!raw) return "";
    const num = Number(raw);
    if (!isNaN(num) && num > 10000) {
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 7);
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) {
      const parts = raw.split("/");
      let year = parseInt(parts[2]);
      if (year < 100) year += 2000;
      return `${year}-${parts[0].padStart(2, "0")}`;
    }
    return raw;
  };

  let _phCounter = 0;
  const buildDeploymentLines = (rec: Record<string, string>, submissionId: string, excelRowId?: string) => {
    const empIdCode = rec.employee_id?.trim();
    const emp = empIdCode ? allEmployees.find(e => (e as any).employee_id?.toLowerCase() === empIdCode.toLowerCase()) : undefined;
    const posIdCode = rec.position_id?.trim();
    const pos = posIdCode ? positions.find(p => p.position_id.toLowerCase() === posIdCode.toLowerCase()) : null;
    const rateYear = parseInt((rec.rate_year || "").replace(/[^0-9]/g, "")) || 1;
    const manMonths = parseFloat(rec.man_months || "") || 0;
    const rowMonth = rec.month || "";
    const effectiveEmpCode = empIdCode || `PH-${Date.now()}-${++_phCounter}`;
    const posId = pos?.id || "";
    const groupNote = `emp:${effectiveEmpCode}|month:${rowMonth}|posId:${posId}${excelRowId ? `|excelRow:${excelRowId}` : ""}`;

    const projEntries: [string, number][] = [];
    projectColumns.forEach(p => {
      const val = parseFloat(rec[`proj_${p.id}`] || "") || 0;
      if (val > 0) projEntries.push([p.id, val]);
    });

    const lines: any[] = [];
    if (projEntries.length === 0) {
      lines.push({
        submission_id: submissionId,
        consultant_id: consultantId,
        employee_id: emp?.id || null,
        worked_project_id: null, billed_project_id: null,
        po_id: null, po_item_id: null, so_id: null,
        allocation_pct: 0, rate_year: rateYear, man_months: manMonths,
        notes: groupNote,
        excel_row_id: excelRowId || null,
      });
    } else {
      projEntries.forEach(([projId, pct]) => {
        const poItemId = poItemByProject[projId] || null;
        const poId = poItemId ? (poByItem[poItemId] || null) : null;
        lines.push({
          submission_id: submissionId,
          consultant_id: consultantId,
          employee_id: emp?.id || null,
          worked_project_id: projId, billed_project_id: projId,
          po_id: poId, po_item_id: poItemId, so_id: null,
          allocation_pct: pct, rate_year: rateYear, man_months: manMonths,
          notes: groupNote,
          excel_row_id: excelRowId || null,
        });
      });
    }
    return lines;
  };

  const deploymentSmartImportConfig: SmartImportConfig | undefined = useMemo(() => {
    if (!selectedSubmission) return undefined;
    const isBaseline = scheduleType === "baseline";
    const isForecast = scheduleType === "forecast";
    const allowEmptyEmployee = isBaseline || isForecast;

    const columns: ImportColumnDef[] = [
      { header: "Month", key: "month", required: true },
      { header: "Employee ID", key: "employee_id", required: !allowEmptyEmployee, aliases: ["Emp ID"] },
      { header: "Employee Name", key: "employee_name", aliases: ["Emp Name"] },
      { header: "Position ID", key: "position_id", aliases: ["Pos ID"] },
      { header: "Position Name", key: "position_name", aliases: ["Pos Name"] },
      { header: "Rate Year (1-5)", key: "rate_year", aliases: ["Rate Year"] },
      { header: "Man-Months (max 1.0)", key: "man_months", aliases: ["Man-Months", "Man Months", "ManMonths"] },
    ];
    projectColumns.forEach(p => {
      columns.push({ header: `% ${projLabel(p)}`, key: `proj_${p.id}` });
    });

    return {
      entityName: "Deployment Lines",
      columns,
      businessKeys: ["employee_id", "month"],
      transformValues: (values) => {
        values.month = normalizeMonth(values.month);
        // Normalize allocations: if values look like decimals (sum <= 1), convert to percentages
        const projKeys = projectColumns.map(p => `proj_${p.id}`);
        const allocValues = projKeys.map(k => parseFloat(values[k] || "") || 0).filter(v => v > 0);
        if (allocValues.length > 0) {
          const sum = allocValues.reduce((a, b) => a + b, 0);
          if (sum <= 1.0 + 0.005) {
            // All values are decimals (e.g. 0.5 = 50%), multiply by 100
            for (const k of projKeys) {
              const v = parseFloat(values[k] || "") || 0;
              if (v > 0) values[k] = String(Math.round(v * 100 * 100) / 100);
            }
          }
        }
        return values;
      },
      customValidate: (record) => {
        const errors: Record<string, string> = {};
        const empId = record.values.employee_id?.trim();
        if (empId) {
          const emp = allEmployees.find(e => (e as any).employee_id?.toLowerCase() === empId.toLowerCase());
          if (!emp) errors.employee_id = `Employee ID "${empId}" not found`;
        }
        const posId = record.values.position_id?.trim();
        if (posId) {
          const pos = positions.find(p => p.position_id.toLowerCase() === posId.toLowerCase());
          if (!pos) errors.position_id = `Position ID "${posId}" not found`;
        }
        const rateYear = parseInt((record.values.rate_year || "").replace(/[^0-9]/g, ""));
        if (record.values.rate_year && (isNaN(rateYear) || rateYear < 1 || rateYear > 5)) {
          errors.rate_year = "Rate Year must be 1-5";
        }
        const mm = parseFloat(record.values.man_months || "");
        if (record.values.man_months && !isNaN(mm) && mm > 1) {
          errors.man_months = "Man-Months cannot exceed 1.0";
        }
        return errors;
      },
      fetchExisting: async () => {
        return rows.map(row => {
          const emp = employees.find(e => e.id === row.employee_id);
          const pos = positions.find(p => p.id === row.position_id);
          const rec: Record<string, string> = {
            _id: row._key,
            month: row.month,
            employee_id: (emp as any)?.employee_id || "",
            employee_name: emp?.employee_name || "",
            position_id: pos?.position_id || "",
            position_name: pos?.position_name || "",
            rate_year: String(row.rate_year),
            man_months: String(row.man_months),
          };
          projectColumns.forEach(p => {
            rec[`proj_${p.id}`] = row.allocations[p.id] ? String(row.allocations[p.id]) : "";
          });
          return rec;
        });
      },
      executeInsert: async (rec) => {
        if (!selectedSubmission) return "No submission selected";
        return insertDeploymentRow(rec);
      },
      executeUpdate: async (existingId, rec) => {
        if (!selectedSubmission) return "No submission selected";
        const existingRow = rows.find(r => r._key === existingId);
        if (existingRow) {
          const emp = employees.find(e => e.id === existingRow.employee_id);
          const empCode = (emp as any)?.employee_id || "";
          const notesPattern = `emp:${empCode}|month:${existingRow.month}`;
          if (empCode && existingRow.month) {
            const { data: matchingLines } = await supabase
              .from("deployment_lines")
              .select("id, notes")
              .eq("submission_id", selectedSubmission.id);
            if (matchingLines) {
              const idsToDelete = matchingLines
                .filter(l => (l.notes || "").includes(notesPattern))
                .map(l => l.id);
              if (idsToDelete.length > 0) {
                await supabase.from("deployment_lines").delete().in("id", idsToDelete);
              }
            }
          }
        }
        return insertDeploymentRow(rec);
      },
      executeBatchInsert: async (records) => {
        if (!selectedSubmission) return records.map((_, i) => ({ index: i, message: "No submission selected" }));
        const batchUUID = crypto.randomUUID().split("-")[0]; // short prefix
        const allLines: any[] = [];
        const recIndexMap: number[] = [];
        for (let ri = 0; ri < records.length; ri++) {
          const rec = records[ri];
          const excelRowId = `${batchUUID}_${(ri + 1).toString().padStart(4, "0")}`;
          const lines = buildDeploymentLines(rec, selectedSubmission.id, excelRowId);
          for (const line of lines) {
            allLines.push(line);
            recIndexMap.push(ri);
          }
        }
        const errors: { index: number; message: string }[] = [];
        const BATCH = 500;
        for (let i = 0; i < allLines.length; i += BATCH) {
          const chunk = allLines.slice(i, i + BATCH);
          const { error } = await supabase.from("deployment_lines").insert(chunk);
          if (error) {
            const failedIndices = new Set(recIndexMap.slice(i, i + BATCH));
            for (const idx of failedIndices) {
              if (!errors.find(e => e.index === idx)) {
                errors.push({ index: idx, message: error.message });
              }
            }
          }
        }
        return errors;
      },
      executeBatchUpdate: async (updates) => {
        if (!selectedSubmission) return updates.map((_, i) => ({ index: i, message: "No submission selected" }));
        // Delete existing lines for all affected employee-month combos in one go
        const { data: allExistingLines } = await supabase
          .from("deployment_lines")
          .select("id, notes")
          .eq("submission_id", selectedSubmission.id);
        if (allExistingLines) {
          const idsToDelete: string[] = [];
          for (const upd of updates) {
            const existingRow = rows.find(r => r._key === upd.existingId);
            if (existingRow) {
              const emp = employees.find(e => e.id === existingRow.employee_id);
              const empCode = (emp as any)?.employee_id || "";
              const notesPattern = `emp:${empCode}|month:${existingRow.month}`;
              if (empCode && existingRow.month) {
                for (const l of allExistingLines) {
                  if ((l.notes || "").includes(notesPattern) && !idsToDelete.includes(l.id)) {
                    idsToDelete.push(l.id);
                  }
                }
              }
            }
          }
          if (idsToDelete.length > 0) {
            for (let i = 0; i < idsToDelete.length; i += 500) {
              await supabase.from("deployment_lines").delete().in("id", idsToDelete.slice(i, i + 500));
            }
          }
        }
        // Now batch insert all replacement lines with excel_row_id
        const batchUUID = crypto.randomUUID().split("-")[0];
        const allLines: any[] = [];
        const recIndexMap: number[] = [];
        for (let ri = 0; ri < updates.length; ri++) {
          const excelRowId = `${batchUUID}_${(ri + 1).toString().padStart(4, "0")}`;
          const lines = buildDeploymentLines(updates[ri].record, selectedSubmission.id, excelRowId);
          for (const line of lines) {
            allLines.push(line);
            recIndexMap.push(ri);
          }
        }
        const errors: { index: number; message: string }[] = [];
        const BATCH = 500;
        for (let i = 0; i < allLines.length; i += BATCH) {
          const chunk = allLines.slice(i, i + BATCH);
          const { error } = await supabase.from("deployment_lines").insert(chunk);
          if (error) {
            const failedIndices = new Set(recIndexMap.slice(i, i + BATCH));
            for (const idx of failedIndices) {
              if (!errors.find(e => e.index === idx)) {
                errors.push({ index: idx, message: error.message });
              }
            }
          }
        }
        return errors;
      },
      onComplete: () => {
        queryClient.invalidateQueries({ queryKey: ["deployment-lines"] });
        if (selectedSubmission) {
          (async () => {
            const allLines: DeploymentLine[] = [];
            const PAGE_SIZE = 1000;
            let from = 0;
            while (true) {
              const { data } = await supabase
                .from("deployment_lines")
                .select("*")
                .eq("submission_id", selectedSubmission.id)
                .range(from, from + PAGE_SIZE - 1);
              if (!data || data.length === 0) break;
              allLines.push(...(data as DeploymentLine[]));
              if (data.length < PAGE_SIZE) break;
              from += PAGE_SIZE;
            }
            setRows(buildUIRows(allLines));
          })();
        }
      },
    };
  }, [selectedSubmission, scheduleType, allEmployees, employees, positions, projectColumns, rows, poItemByProject, poByItem]);

  const insertDeploymentRow = async (rec: Record<string, string>, excelRowId?: string): Promise<string | null> => {
    if (!selectedSubmission) return "No submission selected";
    const lines = buildDeploymentLines(rec, selectedSubmission.id, excelRowId);
    const { error } = await supabase.from("deployment_lines").insert(lines);
    return error ? error.message : null;
  };

  // ---- List view hooks (must be before any early return) ----
  const submittedSubs = submissions.filter(s => s.status === "submitted");

  const filteredSubs = submissions.filter((s) => {
    const monthLabel = formatMonthLabel(s.month).toLowerCase();
    if (subSearch) {
      const q = subSearch.toLowerCase();
      if (!s.month.includes(q) && !monthLabel.includes(q) && !s.schedule_type.includes(q) && !s.status.includes(q)) return false;
    }
    if (subColFilters.month && !s.month.toLowerCase().includes(subColFilters.month.toLowerCase()) && !monthLabel.includes(subColFilters.month.toLowerCase())) return false;
    if (subColFilters.type && !s.schedule_type.toLowerCase().includes(subColFilters.type.toLowerCase())) return false;
    if (subColFilters.status && !s.status.toLowerCase().includes(subColFilters.status.toLowerCase())) return false;
    return true;
  });
  const { sorted: sortedSubs, sort: subSort, toggleSort: toggleSubSort } = useSort(filteredSubs, "month", "desc");
  const { paginatedItems: paginatedSubs, pageSize: subPageSize, setPageSize: setSubPageSize, currentPage: subCurrentPage, setCurrentPage: setSubCurrentPage, totalItems: subTotalItems } = usePagination(sortedSubs);

  // ---- Detail view filtering & pagination (must be before any early return) ----
  const filteredDetailRows = useMemo(() => {
    return rows.filter(row => {
      const monthLabel = formatMonthLabel(row.month || "").toLowerCase();
      if (detailSearch) {
        const q = detailSearch.toLowerCase();
        const emp = employees.find(e => e.id === row.employee_id);
        const pos = positions.find(p => p.id === row.position_id);
        const match = (row.month || "").includes(q) ||
          monthLabel.includes(q) ||
          ((emp as any)?.employee_id || "").toLowerCase().includes(q) ||
          (emp?.employee_name || "").toLowerCase().includes(q) ||
          (pos?.position_id || "").toLowerCase().includes(q) ||
          (pos?.position_name || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (detailColFilters.month && !(row.month || "").toLowerCase().includes(detailColFilters.month.toLowerCase()) && !monthLabel.includes(detailColFilters.month.toLowerCase())) return false;
      if (detailColFilters.emp_id) {
        const emp = employees.find(e => e.id === row.employee_id);
        if (!((emp as any)?.employee_id || "").toLowerCase().includes(detailColFilters.emp_id.toLowerCase())) return false;
      }
      if (detailColFilters.emp_name) {
        const emp = employees.find(e => e.id === row.employee_id);
        if (!(emp?.employee_name || "").toLowerCase().includes(detailColFilters.emp_name.toLowerCase())) return false;
      }
      if (detailColFilters.pos_id) {
        const pos = positions.find(p => p.id === row.position_id);
        if (!(pos?.position_id || "").toLowerCase().includes(detailColFilters.pos_id.toLowerCase())) return false;
      }
      if (detailColFilters.pos_name) {
        const pos = positions.find(p => p.id === row.position_id);
        if (!(pos?.position_name || "").toLowerCase().includes(detailColFilters.pos_name.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, detailSearch, detailColFilters, employees, positions]);

  const { sorted: sortedDetailRows, sort: detailSort, toggleSort: toggleDetailSort } = useSort(filteredDetailRows, "month", "asc");
  const { paginatedItems: paginatedDetailRows, pageSize: detailPageSize, setPageSize: setDetailPageSize, currentPage: detailCurrentPage, setCurrentPage: setDetailCurrentPage, totalItems: detailTotalItems } = usePagination(sortedDetailRows, 20);

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
          {/* Detail view content */}
          <div className="page-header">
            <div>
              <h1 className="page-title">
                {selectedSubmission.schedule_type.charAt(0).toUpperCase() + selectedSubmission.schedule_type.slice(1)} — {selectedSubmission.month}
              </h1>
              <p className="page-subtitle">Revision #{selectedSubmission.revision_no} · {consultants.find(c => c.id === consultantId)?.short_name}</p>
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
                <ColumnVisibilityToggle columns={detailTableCols} visibleColumns={detailVisibleCols} onChange={setDetailVisibleCols} />
                <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} smartImportConfig={deploymentSmartImportConfig} />
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
              <ColumnVisibilityToggle columns={detailTableCols} visibleColumns={detailVisibleCols} onChange={setDetailVisibleCols} />
              <ExcelToolbar onExport={handleExport} onTemplate={handleTemplate} onImport={() => {}} />
            </div>
          )}

          {/* Lines table */}
          {isProcessingRows ? (
            <div className="bg-card rounded-md border">
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={24} className="animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Processing {existingLines.length} records…</span>
              </div>
              <div className="px-4 pb-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-8 rounded bg-muted animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
          <div className="bg-card rounded-md border">
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search rows..." value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
              <span className="text-xs text-muted-foreground">{filteredDetailRows.length} of {rows.length} rows</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  {detailVisibleCols.has("month") && <th className="data-table-header text-left px-3 py-2.5 min-w-[100px]"><SortableHeader label="Month" sortKey="month" currentKey={detailSort.key} direction={detailSort.direction} onSort={toggleDetailSort}><ColumnFilter value={detailColFilters.month || ""} onChange={(v) => setDetailColFilter("month", v)} label="Month" /></SortableHeader></th>}
                  {detailVisibleCols.has("emp_id") && <th className="data-table-header text-left px-3 py-2.5 min-w-[100px]"><SortableHeader label="Emp ID" sortKey="employee_id" currentKey={detailSort.key} direction={detailSort.direction} onSort={toggleDetailSort}><ColumnFilter value={detailColFilters.emp_id || ""} onChange={(v) => setDetailColFilter("emp_id", v)} label="Emp ID" /></SortableHeader></th>}
                  {detailVisibleCols.has("emp_name") && <th className="data-table-header text-left px-3 py-2.5 min-w-[160px]"><SortableHeader label="Employee Name" sortKey="employee_id" currentKey={detailSort.key} direction={detailSort.direction} onSort={toggleDetailSort}><ColumnFilter value={detailColFilters.emp_name || ""} onChange={(v) => setDetailColFilter("emp_name", v)} label="Employee" /></SortableHeader></th>}
                  {detailVisibleCols.has("pos_id") && <th className="data-table-header text-left px-3 py-2.5 min-w-[100px]"><SortableHeader label="Position ID" sortKey="position_id" currentKey={detailSort.key} direction={detailSort.direction} onSort={toggleDetailSort}><ColumnFilter value={detailColFilters.pos_id || ""} onChange={(v) => setDetailColFilter("pos_id", v)} label="Pos ID" /></SortableHeader></th>}
                  {detailVisibleCols.has("pos_name") && <th className="data-table-header text-left px-3 py-2.5 min-w-[140px]"><SortableHeader label="Position Name" sortKey="position_id" currentKey={detailSort.key} direction={detailSort.direction} onSort={toggleDetailSort}><ColumnFilter value={detailColFilters.pos_name || ""} onChange={(v) => setDetailColFilter("pos_name", v)} label="Position" /></SortableHeader></th>}
                  {detailVisibleCols.has("rate_year") && <th className="data-table-header text-center px-3 py-2.5 min-w-[90px]"><SortableHeader label="Rate Year" sortKey="rate_year" currentKey={detailSort.key} direction={detailSort.direction} onSort={toggleDetailSort} /></th>}
                  {detailVisibleCols.has("rate") && <th className="data-table-header text-center px-3 py-2.5 min-w-[80px]">Rate</th>}
                  {detailVisibleCols.has("man_months") && <th className="data-table-header text-center px-3 py-2.5 min-w-[100px]"><SortableHeader label="Man-Months" sortKey="man_months" currentKey={detailSort.key} direction={detailSort.direction} onSort={toggleDetailSort} /></th>}
                  {projectColumns.map(p => (
                    <th key={p.id} className="data-table-header text-center px-2 py-2.5 min-w-[100px]">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-xs truncate max-w-[100px] cursor-help">{p.project_number || p.project_name.slice(0, 10)}</div>
                          </TooltipTrigger>
                          <TooltipContent><p>{p.project_name}</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">%</div>
                    </th>
                  ))}
                  <th className="data-table-header text-center px-2 py-2.5 w-14">Sum%</th>
                  {isEditable && <th className="data-table-header w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {paginatedDetailRows.length === 0 ? (
                  <tr><td colSpan={detailVisibleCols.size + projectColumns.length + 1 + (isEditable ? 1 : 0)} className="text-center py-12 text-muted-foreground">{rows.length === 0 ? 'No rows yet. Click "Add Row" or import from Excel.' : "No rows match the current filters."}</td></tr>
                ) : (
                  paginatedDetailRows.map((row) => {
                    const realIdx = rows.findIndex(r => r._key === row._key);
                    const emp = employees.find(e => e.id === row.employee_id);
                    const pos = positions.find(p => p.id === row.position_id);
                    const rate = getRateForRow(row);
                    const allocSum = Object.values(row.allocations).reduce((a, b) => a + b, 0);

                    return (
                      <tr key={row._key} className="border-b last:border-0 hover:bg-muted/50">
                        {detailVisibleCols.has("month") && (
                          <td className="px-3 py-1.5">
                            {isEditable ? (
                              <Select value={row.month || defaultMonth || ""} onValueChange={(v) => updateRow(realIdx, "month", v)}>
                                <SelectTrigger className="h-8 text-xs w-[140px]">
                                  <SelectValue placeholder="Select month">{formatMonthLabel(row.month || defaultMonth || "")}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {monthOptions.map(m => (
                                    <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="h-8 px-2 text-xs border rounded-md bg-muted flex items-center font-mono text-muted-foreground">
                                {formatMonthLabel(row.month || defaultMonth)}
                              </div>
                            )}
                          </td>
                        )}
                        {detailVisibleCols.has("emp_id") && (
                          <td className="px-3 py-1.5">
                            <span className="text-xs font-mono text-muted-foreground">{(emp as any)?.employee_id || "—"}</span>
                          </td>
                        )}
                        {detailVisibleCols.has("emp_name") && (
                          <td className="px-3 py-1.5">
                            {isEditable ? (
                              <Select value={row.employee_id || "__empty__"} onValueChange={(v) => updateRow(realIdx, "employee_id", v === "__empty__" ? "" : v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                  {(scheduleType === "baseline" || scheduleType === "forecast") && (
                                    <SelectItem value="__empty__"><span className="italic text-muted-foreground">TBD</span></SelectItem>
                                  )}
                                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.employee_name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : <span className="text-xs">{emp?.employee_name || (!row.employee_id && (scheduleType === "baseline" || scheduleType === "forecast") ? "TBD" : "—")}</span>}
                          </td>
                        )}
                        {detailVisibleCols.has("pos_id") && (
                          <td className="px-3 py-1.5">
                            <span className="text-xs font-mono text-muted-foreground">{pos?.position_id || "—"}</span>
                          </td>
                        )}
                        {detailVisibleCols.has("pos_name") && (
                          <td className="px-3 py-1.5">
                            {isEditable ? (
                               <Select value={row.position_id} onValueChange={(v) => updateRow(realIdx, "position_id", v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>{positions.map(p => <SelectItem key={p.id} value={p.id}>{p.position_id ? `${p.position_id} - ${p.position_name}` : p.position_name}</SelectItem>)}</SelectContent>
                              </Select>
                            ) : <span className="text-xs">{pos?.position_name || "—"}</span>}
                          </td>
                        )}
                        {detailVisibleCols.has("rate_year") && (
                          <td className="px-3 py-1.5">
                            {isEditable ? (
                              <Select value={String(row.rate_year)} onValueChange={(v) => updateRow(realIdx, "rate_year", parseInt(v))}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map(y => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : <span className="text-xs text-center block">Year {row.rate_year}</span>}
                          </td>
                        )}
                        {detailVisibleCols.has("rate") && (
                          <td className="px-3 py-1.5 text-center">
                            <span className="text-xs font-mono text-muted-foreground">
                              {rate != null ? rate.toLocaleString() : "—"}
                            </span>
                          </td>
                        )}
                        {detailVisibleCols.has("man_months") && (
                          <td className="px-3 py-1.5">
                            {isEditable ? (
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                max={1}
                                value={row.man_months}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateRow(realIdx, "man_months", isNaN(val) ? 0 : Math.min(1, Math.max(0, val)));
                                }}
                                className="h-8 text-xs text-center w-20"
                              />
                            ) : <span className="text-xs font-mono text-center block">{row.man_months}</span>}
                          </td>
                        )}
                        {projectColumns.map(p => (
                          <td key={p.id} className="px-2 py-1.5">
                            {isEditable ? (
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={row.allocations[p.id] || ""}
                                onChange={(e) => updateAllocation(realIdx, p.id, parseInt(e.target.value) || 0)}
                                className="h-8 text-xs text-center w-16"
                              />
                            ) : <span className="text-xs font-mono text-center block">{row.allocations[p.id] || ""}</span>}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-center">
                          <span className={`text-xs font-mono font-semibold ${allocSum > 0 && allocSum !== 100 ? "text-destructive" : "text-muted-foreground"}`}>
                            {allocSum > 0 ? `${allocSum}%` : ""}
                          </span>
                        </td>
                        {isEditable && (
                          <td className="px-2 py-1.5">
                            <button onClick={() => removeRow(realIdx)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
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
            {filteredDetailRows.length > 0 && <TablePagination totalItems={detailTotalItems} pageSize={detailPageSize} currentPage={detailCurrentPage} onPageChange={setDetailCurrentPage} onPageSizeChange={setDetailPageSize} />}
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span>{rows.length} total row(s)</span>
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

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Deployment Schedules</h1>
            <p className="page-subtitle">All submissions · Period: {periodMonth}</p>
          </div>
          <div className="flex items-center gap-2">
            <ColumnVisibilityToggle columns={subTableCols} visibleColumns={subVisibleCols} onChange={setSubVisibleCols} />
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
              {consultants.map(c => <SelectItem key={c.id} value={c.id}>{c.short_name}</SelectItem>)}
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
        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search submissions..." value={subSearch} onChange={(e) => setSubSearch(e.target.value)} className="pl-9 h-8 text-sm" /></div>
            <span className="text-xs text-muted-foreground">{filteredSubs.length} records</span>
          </div>
          <div className="overflow-x-auto">
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
                {subVisibleCols.has("month") && <th className="data-table-header text-left px-3 py-2.5"><SortableHeader label="Month" sortKey="month" currentKey={subSort.key} direction={subSort.direction} onSort={toggleSubSort}><ColumnFilter value={subColFilters.month || ""} onChange={(v) => setSubColFilter("month", v)} label="Month" /></SortableHeader></th>}
                {subVisibleCols.has("type") && <th className="data-table-header text-left px-3 py-2.5"><SortableHeader label="Type" sortKey="schedule_type" currentKey={subSort.key} direction={subSort.direction} onSort={toggleSubSort}><ColumnFilter value={subColFilters.type || ""} onChange={(v) => setSubColFilter("type", v)} label="Type" /></SortableHeader></th>}
                {subVisibleCols.has("rev") && <th className="data-table-header text-center px-3 py-2.5"><SortableHeader label="Rev #" sortKey="revision_no" currentKey={subSort.key} direction={subSort.direction} onSort={toggleSubSort} /></th>}
                {subVisibleCols.has("status") && <th className="data-table-header text-left px-3 py-2.5"><SortableHeader label="Status" sortKey="status" currentKey={subSort.key} direction={subSort.direction} onSort={toggleSubSort}><ColumnFilter value={subColFilters.status || ""} onChange={(v) => setSubColFilter("status", v)} label="Status" /></SortableHeader></th>}
                {subVisibleCols.has("submitted") && <th className="data-table-header text-left px-3 py-2.5"><SortableHeader label="Submitted" sortKey="submitted_on" currentKey={subSort.key} direction={subSort.direction} onSort={toggleSubSort} /></th>}
                {subVisibleCols.has("reviewed") && <th className="data-table-header text-left px-3 py-2.5"><SortableHeader label="Reviewed" sortKey="reviewed_on" currentKey={subSort.key} direction={subSort.direction} onSort={toggleSubSort} /></th>}
                <th className="data-table-header w-10"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedSubs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No submissions found</td></tr>
              ) : (
                paginatedSubs.map(sub => (
                  <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2.5">
                      {sub.status === "submitted" && (
                        <Checkbox checked={selectedIds.has(sub.id)} onCheckedChange={() => toggleSelect(sub.id)} />
                      )}
                    </td>
                    {subVisibleCols.has("month") && <td className="px-3 py-2.5 font-mono text-xs">{sub.month}</td>}
                    {subVisibleCols.has("type") && <td className="px-3 py-2.5 capitalize">{sub.schedule_type}</td>}
                    {subVisibleCols.has("rev") && <td className="px-3 py-2.5 text-center font-mono">#{sub.revision_no}</td>}
                    {subVisibleCols.has("status") && <td className="px-3 py-2.5"><StatusBadge status={sub.status} /></td>}
                    {subVisibleCols.has("submitted") && <td className="px-3 py-2.5 text-xs text-muted-foreground">{sub.submitted_on ? new Date(sub.submitted_on).toLocaleDateString() : "—"}</td>}
                    {subVisibleCols.has("reviewed") && <td className="px-3 py-2.5 text-xs text-muted-foreground">{sub.reviewed_on ? new Date(sub.reviewed_on).toLocaleDateString() : "—"}</td>}
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
          {filteredSubs.length > 0 && <TablePagination totalItems={subTotalItems} pageSize={subPageSize} currentPage={subCurrentPage} onPageChange={setSubCurrentPage} onPageSizeChange={setSubPageSize} />}
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
