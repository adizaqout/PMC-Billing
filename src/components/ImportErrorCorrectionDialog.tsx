import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  UserPlus,
  Wand2,
} from "lucide-react";

export interface DistinctImportError {
  key: string;
  employee_id_code: string;
  employee_name: string;
  position_id_code: string;
  position_name: string;
  issue_type: "missing_employee" | "missing_position" | "invalid_mapping";
  affected_rows: number[];
  affected_count: number;
  excel_data: Record<string, string>;
}

interface Props {
  open: boolean;
  errors: DistinctImportError[];
  consultantId: string;
  totalImportRows: number;
  positions: { id: string; position_id: string; position_name: string; consultant_id: string }[];
  serviceOrders: { id: string; so_number: string }[];
  onErrorResolved: (error: DistinctImportError) => void;
  onCancelImport: () => void;
  onRetryImport: () => void;
}

type EmployeeRef = { id: string; employee_id: string | null; position_id: string | null };
type PositionRef = { id: string; position_id: string; position_name: string };

const normalize = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

export default function ImportErrorCorrectionDialog({
  open,
  errors: initialErrors,
  consultantId,
  totalImportRows,
  positions,
  serviceOrders,
  onErrorResolved,
  onCancelImport,
  onRetryImport,
}: Props) {
  const [errors, setErrors] = useState<DistinctImportError[]>(initialErrors);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set());
  const [fadingKeys, setFadingKeys] = useState<Set<string>>(new Set());
  const [initialDistinctCount, setInitialDistinctCount] = useState(initialErrors.length);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const errorsRef = useRef<DistinctImportError[]>(initialErrors);
  const resolvedKeysRef = useRef<Set<string>>(new Set());

  const [empForm, setEmpForm] = useState({
    name: "",
    positionId: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    status: "active",
  });
  const [posForm, setPosForm] = useState({
    name: "",
    year1: "",
    year2: "",
    year3: "",
    year4: "",
    year5: "",
    soId: "",
  });
  const [mapForm, setMapForm] = useState({ positionId: "" });

  useEffect(() => {
    setErrors(initialErrors);
    errorsRef.current = initialErrors;
    setInitialDistinctCount(initialErrors.length);
    setResolvedKeys(new Set());
    resolvedKeysRef.current = new Set();
    setFadingKeys(new Set());
    setExpandedKey(null);
  }, [initialErrors]);

  useEffect(() => {
    errorsRef.current = errors;
  }, [errors]);

  useEffect(() => {
    resolvedKeysRef.current = resolvedKeys;
  }, [resolvedKeys]);

  useEffect(() => {
    if (!expandedKey) return;
    const timer = setTimeout(() => firstInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [expandedKey]);

  const removeResolvedError = useCallback((errorKey: string) => {
    setFadingKeys((prev) => {
      const next = new Set(prev);
      next.add(errorKey);
      return next;
    });

    window.setTimeout(() => {
      setErrors((prev) => prev.filter((err) => err.key !== errorKey));
      setFadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(errorKey);
        return next;
      });
    }, 1000);
  }, []);

  const markDistinctErrorResolved = useCallback(
    (error: DistinctImportError) => {
      if (resolvedKeysRef.current.has(error.key)) return;

      setResolvedKeys((prev) => {
        const next = new Set(prev);
        next.add(error.key);
        return next;
      });

      removeResolvedError(error.key);
      onErrorResolved(error);
    },
    [onErrorResolved, removeResolvedError],
  );

  const remainingErrors = useMemo(
    () => errors.filter((error) => !resolvedKeys.has(error.key)),
    [errors, resolvedKeys],
  );

  const resolvedDistinctCount = Math.max(0, initialDistinctCount - remainingErrors.length);
  const allResolved = remainingErrors.length === 0 && initialDistinctCount > 0;
  const progressPct = initialDistinctCount > 0 ? Math.round((resolvedDistinctCount / initialDistinctCount) * 100) : 0;

  const summary = useMemo(() => {
    const byType = {
      missingEmployeeDistinct: 0,
      missingEmployeeRows: 0,
      missingPositionDistinct: 0,
      missingPositionRows: 0,
      invalidMappingDistinct: 0,
      invalidMappingRows: 0,
    };

    remainingErrors.forEach((error) => {
      if (error.issue_type === "missing_employee") {
        byType.missingEmployeeDistinct += 1;
        byType.missingEmployeeRows += error.affected_count;
      } else if (error.issue_type === "missing_position") {
        byType.missingPositionDistinct += 1;
        byType.missingPositionRows += error.affected_count;
      } else {
        byType.invalidMappingDistinct += 1;
        byType.invalidMappingRows += error.affected_count;
      }
    });

    return byType;
  }, [remainingErrors]);

  const getRowsLabel = (rows: number[]) => {
    if (rows.length <= 12) return rows.join(", ");
    return `${rows.slice(0, 12).join(", ")} …`;
  };

  const issueBadge = (type: DistinctImportError["issue_type"]) => {
    if (type === "missing_employee") return <Badge variant="destructive" className="text-[10px]">Missing Employee</Badge>;
    if (type === "missing_position") return <Badge variant="secondary" className="text-[10px]">Missing Position</Badge>;
    return <Badge variant="outline" className="text-[10px]">Invalid Mapping</Badge>;
  };

  const isRowPending = (errorKey: string) => savingKey === errorKey || (isBatchProcessing && !resolvedKeys.has(errorKey));

  const openInlineForm = (error: DistinctImportError) => {
    if (expandedKey === error.key) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey(error.key);

    if (error.issue_type === "missing_employee") {
      const matchedPosition = positions.find(
        (position) => normalize(position.position_id) === normalize(error.position_id_code),
      );
      setEmpForm({
        name: error.employee_name,
        positionId: matchedPosition?.id || "",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        status: "active",
      });
      return;
    }

    if (error.issue_type === "missing_position") {
      setPosForm({
        name: error.position_name,
        year1: "",
        year2: "",
        year3: "",
        year4: "",
        year5: "",
        soId: "",
      });
      return;
    }

    const matchedPosition = positions.find(
      (position) => normalize(position.position_id) === normalize(error.position_id_code),
    );
    setMapForm({ positionId: matchedPosition?.id || "" });
  };

  const fetchLatestReferences = useCallback(async (): Promise<{ employees: EmployeeRef[]; positions: PositionRef[] }> => {
    const [employeesRes, positionsRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_id, position_id")
        .eq("consultant_id", consultantId)
        .in("status", ["active", "mobilized"]),
      supabase
        .from("positions")
        .select("id, position_id, position_name")
        .eq("consultant_id", consultantId),
    ]);

    if (employeesRes.error) throw employeesRes.error;
    if (positionsRes.error) throw positionsRes.error;

    return {
      employees: (employeesRes.data || []) as EmployeeRef[],
      positions: (positionsRes.data || []) as PositionRef[],
    };
  }, [consultantId]);

  const findPositionByCode = (positionRows: PositionRef[], positionCode: string) =>
    positionRows.find((position) => normalize(position.position_id) === normalize(positionCode));

  const findEmployeeByCode = (employeeRows: EmployeeRef[], employeeCode: string) =>
    employeeRows.find((employee) => normalize(employee.employee_id) === normalize(employeeCode));

  const refreshResolvedIssues = useCallback(async () => {
    if (!open || errorsRef.current.length === 0) return;

    try {
      const { employees: employeeRows, positions: positionRows } = await fetchLatestReferences();
      const unresolved = errorsRef.current.filter((error) => !resolvedKeysRef.current.has(error.key));
      const autoResolved: DistinctImportError[] = [];

      unresolved.forEach((error) => {
        const expectedPosition = error.position_id_code
          ? findPositionByCode(positionRows, error.position_id_code)
          : undefined;
        const employee = error.employee_id_code
          ? findEmployeeByCode(employeeRows, error.employee_id_code)
          : undefined;

        if (error.issue_type === "missing_position" && expectedPosition) {
          autoResolved.push(error);
        }

        if (error.issue_type === "missing_employee" && employee) {
          autoResolved.push(error);
        }

        if (
          error.issue_type === "invalid_mapping" &&
          employee &&
          expectedPosition &&
          employee.position_id === expectedPosition.id
        ) {
          autoResolved.push(error);
        }
      });

      if (autoResolved.length > 0) {
        autoResolved.forEach((error) => markDistinctErrorResolved(error));
        toast.success(`Detected ${autoResolved.length} externally resolved issue(s)`);
      }
    } catch {
      // Silent polling fallback
    }
  }, [fetchLatestReferences, markDistinctErrorResolved, open]);

  useEffect(() => {
    if (!open) return;
    refreshResolvedIssues();
    const interval = window.setInterval(refreshResolvedIssues, 4000);
    return () => window.clearInterval(interval);
  }, [open, refreshResolvedIssues]);

  const handleSavePosition = async (error: DistinctImportError) => {
    if (!posForm.name.trim()) {
      toast.error("Position name is required");
      return;
    }

    setSavingKey(error.key);

    try {
      const { positions: positionRows } = await fetchLatestReferences();
      const existingPosition = findPositionByCode(positionRows, error.position_id_code);
      let positionId = existingPosition?.id;

      if (!positionId) {
        const { data, error: insertError } = await supabase
          .from("positions")
          .insert({
            consultant_id: consultantId,
            position_id: error.position_id_code,
            position_name: posForm.name.trim(),
            year_1_rate: posForm.year1 ? parseFloat(posForm.year1) : null,
            year_2_rate: posForm.year2 ? parseFloat(posForm.year2) : null,
            year_3_rate: posForm.year3 ? parseFloat(posForm.year3) : null,
            year_4_rate: posForm.year4 ? parseFloat(posForm.year4) : null,
            year_5_rate: posForm.year5 ? parseFloat(posForm.year5) : null,
            so_id: posForm.soId || null,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        positionId = data.id;
      }

      markDistinctErrorResolved(error);
      setExpandedKey(null);
      toast.success(
        `Position "${error.position_id_code}" added and mapped to ${error.affected_count} deployment row${error.affected_count === 1 ? "" : "s"}`,
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to add position");
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveEmployee = async (error: DistinctImportError) => {
    if (!empForm.name.trim()) {
      toast.error("Employee name is required");
      return;
    }

    if (!empForm.positionId) {
      toast.warning("Employee added but needs position assignment");
      return;
    }

    setSavingKey(error.key);

    try {
      const { employees: employeeRows } = await fetchLatestReferences();
      const existingEmployee = findEmployeeByCode(employeeRows, error.employee_id_code);

      if (existingEmployee) {
        const { error: updateError } = await supabase
          .from("employees")
          .update({
            employee_name: empForm.name.trim(),
            position_id: empForm.positionId,
            start_date: empForm.startDate || null,
            end_date: empForm.endDate || null,
            status: empForm.status,
          })
          .eq("id", existingEmployee.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("employees").insert({
          consultant_id: consultantId,
          employee_id: error.employee_id_code,
          employee_name: empForm.name.trim(),
          position_id: empForm.positionId,
          start_date: empForm.startDate || null,
          end_date: empForm.endDate || null,
          status: empForm.status,
        });

        if (insertError) throw insertError;
      }

      markDistinctErrorResolved(error);
      setExpandedKey(null);
      toast.success(
        `Employee "${error.employee_name || error.employee_id_code}" added and mapped to ${error.affected_count} deployment row${error.affected_count === 1 ? "" : "s"}`,
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to add employee");
    } finally {
      setSavingKey(null);
    }
  };

  const handleFixMapping = async (error: DistinctImportError) => {
    if (!mapForm.positionId) {
      toast.error("Select a position");
      return;
    }

    setSavingKey(error.key);

    try {
      const { employees: employeeRows } = await fetchLatestReferences();
      const existingEmployee = findEmployeeByCode(employeeRows, error.employee_id_code);

      if (!existingEmployee) throw new Error(`Employee ${error.employee_id_code} not found`);

      const { error: updateError } = await supabase
        .from("employees")
        .update({ position_id: mapForm.positionId })
        .eq("id", existingEmployee.id);

      if (updateError) throw updateError;

      markDistinctErrorResolved(error);
      setExpandedKey(null);
      toast.success(
        `Employee mapping fixed for ${error.affected_count} deployment row${error.affected_count === 1 ? "" : "s"}`,
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to fix mapping");
    } finally {
      setSavingKey(null);
    }
  };

  const handleFixAll = async () => {
    setIsBatchProcessing(true);
    setBatchProgress(0);

    const unresolved = [...remainingErrors];
    const positionIssues = unresolved.filter((error) => error.issue_type === "missing_position");
    const employeeIssues = unresolved.filter((error) => error.issue_type === "missing_employee");
    const mappingIssues = unresolved.filter((error) => error.issue_type === "invalid_mapping");

    const totalSteps = unresolved.length || 1;
    let doneSteps = 0;
    const failKeys = new Set<string>();
    const resolvedInBatch: DistinctImportError[] = [];

    const createdPositionIdByCode = new Map<string, string>();
    const today = new Date().toISOString().split("T")[0];

    const advanceProgress = () => {
      doneSteps += 1;
      setBatchProgress(Math.round((doneSteps / totalSteps) * 100));
    };

    try {
      const initialRefs = await fetchLatestReferences();
      initialRefs.positions.forEach((position) => createdPositionIdByCode.set(normalize(position.position_id), position.id));

      for (const issue of positionIssues) {
        try {
          const existingId = createdPositionIdByCode.get(normalize(issue.position_id_code));
          if (!existingId) {
            const { data, error: insertError } = await supabase
              .from("positions")
              .insert({
                consultant_id: consultantId,
                position_id: issue.position_id_code,
                position_name: issue.position_name || issue.position_id_code,
                year_1_rate: 0,
              })
              .select("id")
              .single();

            if (insertError) throw insertError;
            createdPositionIdByCode.set(normalize(issue.position_id_code), data.id);
          }
          resolvedInBatch.push(issue);
        } catch {
          failKeys.add(issue.key);
        }
        advanceProgress();
      }

      let latestEmployees = (await fetchLatestReferences()).employees;

      for (const issue of employeeIssues) {
        try {
          const assignedPositionId = createdPositionIdByCode.get(normalize(issue.position_id_code)) || "";

          if (!assignedPositionId) {
            throw new Error("missing_position_assignment");
          }

          const existingEmployee = findEmployeeByCode(latestEmployees, issue.employee_id_code);

          if (existingEmployee) {
            const { error: updateError } = await supabase
              .from("employees")
              .update({ position_id: assignedPositionId })
              .eq("id", existingEmployee.id);
            if (updateError) throw updateError;
          } else {
            const { error: insertError } = await supabase.from("employees").insert({
              consultant_id: consultantId,
              employee_id: issue.employee_id_code,
              employee_name: issue.employee_name || issue.employee_id_code,
              position_id: assignedPositionId,
              start_date: today,
              status: "active",
            });
            if (insertError) throw insertError;
          }

          resolvedInBatch.push(issue);
        } catch (error: any) {
          if (error?.message === "missing_position_assignment") {
            toast.warning("Employee added but needs position assignment");
          }
          failKeys.add(issue.key);
        }
        advanceProgress();
      }

      latestEmployees = (await fetchLatestReferences()).employees;

      for (const issue of mappingIssues) {
        try {
          const expectedPositionId = createdPositionIdByCode.get(normalize(issue.position_id_code)) || "";
          const existingEmployee = findEmployeeByCode(latestEmployees, issue.employee_id_code);

          if (!expectedPositionId || !existingEmployee) throw new Error("mapping_not_resolvable");

          const { error: updateError } = await supabase
            .from("employees")
            .update({ position_id: expectedPositionId })
            .eq("id", existingEmployee.id);

          if (updateError) throw updateError;
          resolvedInBatch.push(issue);
        } catch {
          failKeys.add(issue.key);
        }
        advanceProgress();
      }

      resolvedInBatch
        .filter((issue) => !failKeys.has(issue.key))
        .forEach((issue) => markDistinctErrorResolved(issue));

      const resolvedCount = resolvedInBatch.filter((issue) => !failKeys.has(issue.key)).length;
      if (resolvedCount > 0) {
        toast.success(`Resolved ${resolvedCount} distinct issue(s)`);
      }

      if (failKeys.size > 0) {
        toast.error(`Could not resolve ${failKeys.size} distinct issue(s)`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Fix All failed");
    } finally {
      setIsBatchProcessing(false);
      setBatchProgress(0);
    }
  };

  const actionButton = (error: DistinctImportError) => {
    const pending = isRowPending(error.key);

    if (error.issue_type === "missing_employee") {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openInlineForm(error)} disabled={pending}>
          {pending ? <Loader2 size={12} className="mr-1 animate-spin" /> : <UserPlus size={12} className="mr-1" />}
          Add Employee
        </Button>
      );
    }

    if (error.issue_type === "missing_position") {
      return (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openInlineForm(error)} disabled={pending}>
          {pending ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Briefcase size={12} className="mr-1" />}
          Add Position
        </Button>
      );
    }

    return (
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openInlineForm(error)} disabled={pending}>
        {pending ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Link2 size={12} className="mr-1" />}
        Fix Mapping
      </Button>
    );
  };

  const summaryLine = useMemo(() => {
    const parts: string[] = [];

    if (summary.missingPositionDistinct > 0) {
      parts.push(`${summary.missingPositionDistinct} missing position${summary.missingPositionDistinct === 1 ? "" : "s"} affecting ${summary.missingPositionRows} row${summary.missingPositionRows === 1 ? "" : "s"}`);
    }

    if (summary.missingEmployeeDistinct > 0) {
      parts.push(`${summary.missingEmployeeDistinct} missing employee${summary.missingEmployeeDistinct === 1 ? "" : "s"} affecting ${summary.missingEmployeeRows} row${summary.missingEmployeeRows === 1 ? "" : "s"}`);
    }

    if (summary.invalidMappingDistinct > 0) {
      parts.push(`${summary.invalidMappingDistinct} invalid mapping${summary.invalidMappingDistinct === 1 ? "" : "s"} affecting ${summary.invalidMappingRows} row${summary.invalidMappingRows === 1 ? "" : "s"}`);
    }

    if (parts.length === 0) return "All data corrections completed.";
    if (parts.length === 1) return `Found ${parts[0]}.`;
    return `Found ${parts.slice(0, -1).join(" and ")} and ${parts[parts.length - 1]}.`;
  }, [summary]);

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-[1200px] w-[90vw] max-h-[90vh] flex flex-col"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          aria-describedby="import-error-desc"
        >
          <DialogHeader>
            <DialogTitle>Deployment Schedule Import — Missing Data</DialogTitle>
            <p id="import-error-desc" className="mt-1 text-sm text-muted-foreground">
              {summaryLine}
            </p>
          </DialogHeader>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Resolved {resolvedDistinctCount} of {initialDistinctCount} distinct issues</span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          {!allResolved && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleFixAll} disabled={isBatchProcessing || remainingErrors.length === 0}>
                {isBatchProcessing ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Wand2 size={14} className="mr-1.5" />}
                Fix All ({remainingErrors.length})
              </Button>
              <Button size="sm" variant="outline" onClick={refreshResolvedIssues} disabled={isBatchProcessing}>
                Re-check
              </Button>
              {isBatchProcessing && (
                <div className="flex-1">
                  <Progress value={batchProgress} className="h-1.5" />
                </div>
              )}
            </div>
          )}

          {allResolved && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-accent/20 p-3">
              <CheckCircle2 size={18} className="text-primary animate-in fade-in-0 zoom-in-95 duration-300" />
              <span className="text-sm font-medium text-foreground">
                All data corrections completed. Ready to import {totalImportRows} deployment row{totalImportRows === 1 ? "" : "s"}.
              </span>
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0">
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Position ID</TableHead>
                    <TableHead>Position Name</TableHead>
                    <TableHead>Issue Type</TableHead>
                    <TableHead>Affected Rows</TableHead>
                    <TableHead className="w-44">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((error) => {
                    const isResolved = resolvedKeys.has(error.key);
                    const isExpanded = expandedKey === error.key;
                    const isFading = fadingKeys.has(error.key);

                    return (
                      <Fragment key={`group-${error.key}`}>
                        <TableRow className={isResolved ? `bg-accent/20 transition-opacity duration-700 ${isFading ? "opacity-0" : "opacity-100"}` : "bg-destructive/5"}>
                          <TableCell className="font-mono text-xs">{error.employee_id_code || "—"}</TableCell>
                          <TableCell className="text-xs">{error.employee_name || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{error.position_id_code || "—"}</TableCell>
                          <TableCell className="text-xs">{error.position_name || "—"}</TableCell>
                          <TableCell>{issueBadge(error.issue_type)}</TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px]">
                                  {error.affected_count} row{error.affected_count === 1 ? "" : "s"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Rows: {getRowsLabel(error.affected_rows)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {isResolved ? (
                              <span className="flex items-center gap-1 text-xs text-primary">
                                <CheckCircle2 size={12} />Resolved
                              </span>
                            ) : (
                              <div className="flex items-center gap-1">
                                {actionButton(error)}
                                {isExpanded ? (
                                  <ChevronUp size={14} className="text-muted-foreground" />
                                ) : (
                                  <ChevronDown size={14} className="text-muted-foreground" />
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>

                        {isExpanded && !isResolved && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-4">
                              {error.issue_type === "missing_employee" && (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                  <div>
                                    <Label className="text-xs">Employee ID</Label>
                                    <Input value={error.employee_id_code} readOnly className="mt-1 h-8 bg-muted text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Employee Name *</Label>
                                    <Input
                                      ref={firstInputRef}
                                      value={empForm.name}
                                      onChange={(event) => setEmpForm((form) => ({ ...form, name: event.target.value }))}
                                      className="mt-1 h-8 text-xs"
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") handleSaveEmployee(error);
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Map to Position *</Label>
                                    <Select value={empForm.positionId} onValueChange={(value) => setEmpForm((form) => ({ ...form, positionId: value }))}>
                                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                      <SelectContent>
                                        {positions.map((position) => (
                                          <SelectItem key={position.id} value={position.id}>
                                            {position.position_id} - {position.position_name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Start Date</Label>
                                    <Input
                                      type="date"
                                      value={empForm.startDate}
                                      onChange={(event) => setEmpForm((form) => ({ ...form, startDate: event.target.value }))}
                                      className="mt-1 h-8 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">End Date</Label>
                                    <Input
                                      type="date"
                                      value={empForm.endDate}
                                      onChange={(event) => setEmpForm((form) => ({ ...form, endDate: event.target.value }))}
                                      className="mt-1 h-8 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Status</Label>
                                    <Select value={empForm.status} onValueChange={(value) => setEmpForm((form) => ({ ...form, status: value }))}>
                                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="mobilized">Mobilized</SelectItem>
                                        <SelectItem value="demobilized">Demobilized</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="col-span-2 flex items-end gap-2">
                                    <Button size="sm" onClick={() => handleSaveEmployee(error)} disabled={savingKey === error.key}>
                                      {savingKey === error.key ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setExpandedKey(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {error.issue_type === "missing_position" && (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                  <div>
                                    <Label className="text-xs">Position ID</Label>
                                    <Input value={error.position_id_code} readOnly className="mt-1 h-8 bg-muted text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Position Name *</Label>
                                    <Input
                                      ref={firstInputRef}
                                      value={posForm.name}
                                      onChange={(event) => setPosForm((form) => ({ ...form, name: event.target.value }))}
                                      className="mt-1 h-8 text-xs"
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") handleSavePosition(error);
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Year 1 Rate</Label>
                                    <Input type="number" value={posForm.year1} onChange={(event) => setPosForm((form) => ({ ...form, year1: event.target.value }))} className="mt-1 h-8 text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Year 2 Rate</Label>
                                    <Input type="number" value={posForm.year2} onChange={(event) => setPosForm((form) => ({ ...form, year2: event.target.value }))} className="mt-1 h-8 text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Year 3 Rate</Label>
                                    <Input type="number" value={posForm.year3} onChange={(event) => setPosForm((form) => ({ ...form, year3: event.target.value }))} className="mt-1 h-8 text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Year 4 Rate</Label>
                                    <Input type="number" value={posForm.year4} onChange={(event) => setPosForm((form) => ({ ...form, year4: event.target.value }))} className="mt-1 h-8 text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Year 5 Rate</Label>
                                    <Input type="number" value={posForm.year5} onChange={(event) => setPosForm((form) => ({ ...form, year5: event.target.value }))} className="mt-1 h-8 text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Service Order</Label>
                                    <Select value={posForm.soId} onValueChange={(value) => setPosForm((form) => ({ ...form, soId: value }))}>
                                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                      <SelectContent>
                                        {serviceOrders.map((serviceOrder) => (
                                          <SelectItem key={serviceOrder.id} value={serviceOrder.id}>{serviceOrder.so_number}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="col-span-2 flex items-end gap-2">
                                    <Button size="sm" onClick={() => handleSavePosition(error)} disabled={savingKey === error.key}>
                                      {savingKey === error.key ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setExpandedKey(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {error.issue_type === "invalid_mapping" && (
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                  <div>
                                    <Label className="text-xs">Employee ID</Label>
                                    <Input value={error.employee_id_code} readOnly className="mt-1 h-8 bg-muted text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Expected Position</Label>
                                    <Input value={`${error.position_id_code} - ${error.position_name}`} readOnly className="mt-1 h-8 bg-muted text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Map to Position *</Label>
                                    <Select value={mapForm.positionId} onValueChange={(value) => setMapForm((form) => ({ ...form, positionId: value }))}>
                                      <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                      <SelectContent>
                                        {positions.map((position) => (
                                          <SelectItem key={position.id} value={position.id}>
                                            {position.position_id} - {position.position_name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-end gap-2">
                                    <Button size="sm" onClick={() => handleFixMapping(error)} disabled={savingKey === error.key}>
                                      {savingKey === error.key ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setExpandedKey(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          </ScrollArea>

          <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel Import
            </Button>
            <Button onClick={onRetryImport} disabled={!allResolved} className={allResolved ? "animate-pulse" : ""}>
              <CheckCircle2 size={14} className="mr-1.5" />Continue Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel import?</AlertDialogTitle>
            <AlertDialogDescription>
              Any added records will remain but the deployment schedule will not be imported.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCancelConfirmOpen(false);
                onCancelImport();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
