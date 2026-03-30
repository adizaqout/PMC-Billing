import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, UserPlus, Briefcase, Link2, Wand2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

export interface ImportErrorRow {
  row: number;
  employee_id_code: string;
  employee_name: string;
  position_id_code: string;
  position_name: string;
  issue_type: "missing_employee" | "missing_position" | "invalid_mapping";
  excel_data: Record<string, string>;
}

interface Props {
  open: boolean;
  errors: ImportErrorRow[];
  consultantId: string;
  positions: { id: string; position_id: string; position_name: string; consultant_id: string }[];
  serviceOrders: { id: string; so_number: string }[];
  onErrorResolved: (error: ImportErrorRow, newRecordId: string) => void;
  onAllResolved: () => void;
  onCancelImport: () => void;
  onRetryImport: () => void;
}

const getErrorKey = (error: ImportErrorRow) =>
  `${error.row}|${error.issue_type}|${error.employee_id_code || ""}|${error.position_id_code || ""}`;

export default function ImportErrorCorrectionDialog({
  open, errors: initialErrors, consultantId, positions, serviceOrders,
  onErrorResolved, onAllResolved, onCancelImport, onRetryImport,
}: Props) {
  const [errors, setErrors] = useState<ImportErrorRow[]>(initialErrors);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [resolvedRows, setResolvedRows] = useState<Set<string>>(new Set());
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Form state for inline edits
  const [empForm, setEmpForm] = useState({ name: "", positionId: "", startDate: new Date().toISOString().split("T")[0], endDate: "", status: "active" });
  const [posForm, setPosForm] = useState({ name: "", year1: "", year2: "", year3: "", year4: "", year5: "", soId: "" });
  const [mapForm, setMapForm] = useState({ positionId: "" });

  useEffect(() => { setErrors(initialErrors); setResolvedRows(new Set()); }, [initialErrors]);

  useEffect(() => {
    if (expandedRow !== null) {
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [expandedRow]);

  const totalErrors = initialErrors.length;
  const resolvedCount = resolvedRows.size;
  const remainingErrors = errors.filter(e => !resolvedRows.has(getErrorKey(e)));
  const allResolved = remainingErrors.length === 0 && totalErrors > 0;

  const missingEmployeeCount = remainingErrors.filter(e => e.issue_type === "missing_employee").length;
  const missingPositionCount = remainingErrors.filter(e => e.issue_type === "missing_position").length;
  const invalidMappingCount = remainingErrors.filter(e => e.issue_type === "invalid_mapping").length;

  const openInlineForm = (error: ImportErrorRow) => {
    const errorKey = getErrorKey(error);
    if (expandedRow === errorKey) { setExpandedRow(null); return; }
    setExpandedRow(errorKey);
    if (error.issue_type === "missing_employee") {
      const matchedPos = positions.find(p => p.position_id.toLowerCase() === error.position_id_code.toLowerCase());
      setEmpForm({ name: error.employee_name, positionId: matchedPos?.id || "", startDate: new Date().toISOString().split("T")[0], endDate: "", status: "active" });
    } else if (error.issue_type === "missing_position") {
      setPosForm({ name: error.position_name, year1: "", year2: "", year3: "", year4: "", year5: "", soId: "" });
    } else {
      const matchedPos = positions.find(p => p.position_id.toLowerCase() === error.position_id_code.toLowerCase());
      setMapForm({ positionId: matchedPos?.id || "" });
    }
  };

  const handleSaveEmployee = async (error: ImportErrorRow) => {
    if (!empForm.name.trim()) { toast.error("Employee name is required"); return; }
    setIsSubmitting(true);
    try {
      const { data, error: dbErr } = await supabase.from("employees").insert({
        consultant_id: consultantId,
        employee_id: error.employee_id_code,
        employee_name: empForm.name.trim(),
        position_id: empForm.positionId || null,
        start_date: empForm.startDate || null,
        end_date: empForm.endDate || null,
        status: empForm.status,
      }).select("id").single();
      if (dbErr) throw dbErr;
      toast.success(`Employee "${empForm.name}" added successfully`);
      setResolvedRows(prev => new Set(prev).add(error.row));
      setExpandedRow(null);
      onErrorResolved(error, data.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to add employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePosition = async (error: ImportErrorRow) => {
    if (!posForm.name.trim()) { toast.error("Position name is required"); return; }
    setIsSubmitting(true);
    try {
      const { data, error: dbErr } = await supabase.from("positions").insert({
        consultant_id: consultantId,
        position_id: error.position_id_code,
        position_name: posForm.name.trim(),
        year_1_rate: posForm.year1 ? parseFloat(posForm.year1) : null,
        year_2_rate: posForm.year2 ? parseFloat(posForm.year2) : null,
        year_3_rate: posForm.year3 ? parseFloat(posForm.year3) : null,
        year_4_rate: posForm.year4 ? parseFloat(posForm.year4) : null,
        year_5_rate: posForm.year5 ? parseFloat(posForm.year5) : null,
        so_id: posForm.soId || null,
      }).select("id").single();
      if (dbErr) throw dbErr;
      toast.success(`Position "${posForm.name}" added successfully`);
      setResolvedRows(prev => new Set(prev).add(error.row));
      setExpandedRow(null);
      onErrorResolved(error, data.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to add position");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFixMapping = async (error: ImportErrorRow) => {
    if (!mapForm.positionId) { toast.error("Select a position"); return; }
    setIsSubmitting(true);
    try {
      // Find the employee by employee_id code
      const { data: emp } = await supabase.from("employees")
        .select("id").eq("consultant_id", consultantId)
        .eq("employee_id", error.employee_id_code).single();
      if (!emp) throw new Error("Employee not found");
      const { error: dbErr } = await supabase.from("employees")
        .update({ position_id: mapForm.positionId }).eq("id", emp.id);
      if (dbErr) throw dbErr;
      toast.success("Employee position mapping updated");
      setResolvedRows(prev => new Set(prev).add(error.row));
      setExpandedRow(null);
      onErrorResolved(error, emp.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to fix mapping");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFixAll = async () => {
    setIsBatchProcessing(true);
    setBatchProgress(0);
    let addedEmps = 0, addedPos = 0, fixedMaps = 0;
    const today = new Date().toISOString().split("T")[0];

    for (let i = 0; i < remainingErrors.length; i++) {
      const err = remainingErrors[i];
      try {
        if (err.issue_type === "missing_employee") {
          const matchedPos = positions.find(p => p.position_id.toLowerCase() === err.position_id_code.toLowerCase());
          await supabase.from("employees").insert({
            consultant_id: consultantId,
            employee_id: err.employee_id_code,
            employee_name: err.employee_name || err.employee_id_code,
            position_id: matchedPos?.id || null,
            start_date: today,
            status: "active",
          });
          addedEmps++;
        } else if (err.issue_type === "missing_position") {
          await supabase.from("positions").insert({
            consultant_id: consultantId,
            position_id: err.position_id_code,
            position_name: err.position_name || err.position_id_code,
            year_1_rate: 0,
          });
          addedPos++;
        } else {
          const matchedPos = positions.find(p => p.position_id.toLowerCase() === err.position_id_code.toLowerCase());
          if (matchedPos) {
            const { data: emp } = await supabase.from("employees")
              .select("id").eq("consultant_id", consultantId)
              .eq("employee_id", err.employee_id_code).single();
            if (emp) {
              await supabase.from("employees").update({ position_id: matchedPos.id }).eq("id", emp.id);
              fixedMaps++;
            }
          }
        }
        setResolvedRows(prev => new Set(prev).add(err.row));
      } catch (e) {
        // Continue with next error
      }
      setBatchProgress(Math.round(((i + 1) / remainingErrors.length) * 100));
    }
    setIsBatchProcessing(false);
    const parts: string[] = [];
    if (addedEmps > 0) parts.push(`${addedEmps} employees`);
    if (addedPos > 0) parts.push(`${addedPos} positions`);
    if (fixedMaps > 0) parts.push(`${fixedMaps} mappings`);
    toast.success(`Added ${parts.join(" and ")}`);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (expandedRow === null) return;
    if (e.key === "Escape") { e.preventDefault(); setExpandedRow(null); }
  }, [expandedRow]);

  const issueBadge = (type: ImportErrorRow["issue_type"]) => {
    switch (type) {
      case "missing_employee": return <Badge variant="destructive" className="text-[10px]">Missing Employee</Badge>;
      case "missing_position": return <Badge className="bg-amber-500 text-white text-[10px]">Missing Position</Badge>;
      case "invalid_mapping": return <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-600">Invalid Mapping</Badge>;
    }
  };

  const actionButton = (error: ImportErrorRow) => {
    switch (error.issue_type) {
      case "missing_employee": return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openInlineForm(error)}><UserPlus size={12} className="mr-1" />Add Employee</Button>;
      case "missing_position": return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openInlineForm(error)}><Briefcase size={12} className="mr-1" />Add Position</Button>;
      case "invalid_mapping": return <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openInlineForm(error)}><Link2 size={12} className="mr-1" />Fix Mapping</Button>;
    }
  };

  const progressPct = totalErrors > 0 ? Math.round((resolvedCount / totalErrors) * 100) : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-[1200px] w-[90vw] max-h-[90vh] flex flex-col"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onKeyDown={handleKeyDown}
          // Hide close button via hiding the default one
          aria-describedby="import-error-desc"
        >
          {/* Hide the default X close button */}
          <style>{`.import-err-dialog [data-radix-collection-item] { display: none; }`}</style>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Deployment Schedule Import — Missing Data
            </DialogTitle>
            <p id="import-error-desc" className="text-sm text-muted-foreground mt-1">
              Found {missingEmployeeCount > 0 ? `${missingEmployeeCount} missing employee(s)` : ""}
              {missingEmployeeCount > 0 && missingPositionCount > 0 ? " and " : ""}
              {missingPositionCount > 0 ? `${missingPositionCount} missing position(s)` : ""}
              {invalidMappingCount > 0 ? ` and ${invalidMappingCount} invalid mapping(s)` : ""}
            </p>
          </DialogHeader>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Resolved {resolvedCount} of {totalErrors} issues</span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          {/* Fix All button */}
          {!allResolved && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleFixAll} disabled={isBatchProcessing || remainingErrors.length === 0}>
                {isBatchProcessing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Wand2 size={14} className="mr-1.5" />}
                Fix All ({remainingErrors.length})
              </Button>
              {isBatchProcessing && (
                <div className="flex-1">
                  <Progress value={batchProgress} className="h-1.5" />
                </div>
              )}
            </div>
          )}

          {allResolved && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <CheckCircle2 size={18} className="text-green-600" />
              <span className="text-sm font-medium text-green-800 dark:text-green-300">All data corrections completed</span>
            </div>
          )}

          {/* Error table */}
          <ScrollArea className="flex-1 min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row #</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Position ID</TableHead>
                  <TableHead>Position Name</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead className="w-36">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((error) => {
                  const isResolved = resolvedRows.has(error.row);
                  const isExpanded = expandedRow === error.row;
                  return (
                    <> 
                      <TableRow
                        key={`row-${error.row}`}
                        className={isResolved
                          ? "bg-green-50/50 dark:bg-green-950/20 opacity-60 transition-all duration-500"
                          : "bg-destructive/5 dark:bg-destructive/10"
                        }
                      >
                        <TableCell className="font-mono text-xs">{error.row}</TableCell>
                        <TableCell className="font-mono text-xs">{error.employee_id_code || "—"}</TableCell>
                        <TableCell className="text-xs">{error.employee_name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{error.position_id_code || "—"}</TableCell>
                        <TableCell className="text-xs">{error.position_name || "—"}</TableCell>
                        <TableCell>{issueBadge(error.issue_type)}</TableCell>
                        <TableCell>
                          {isResolved ? (
                            <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12} />Resolved</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              {actionButton(error)}
                              {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Inline form */}
                      {isExpanded && !isResolved && (
                        <TableRow key={`form-${error.row}`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            {error.issue_type === "missing_employee" && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                  <Label className="text-xs">Employee ID</Label>
                                  <Input value={error.employee_id_code} readOnly className="h-8 text-xs bg-muted mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Employee Name *</Label>
                                  <Input ref={firstInputRef} value={empForm.name} onChange={(e) => setEmpForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs mt-1" onKeyDown={(e) => { if (e.key === "Enter") handleSaveEmployee(error); }} />
                                </div>
                                <div>
                                  <Label className="text-xs">Position</Label>
                                  <Select value={empForm.positionId} onValueChange={(v) => setEmpForm(f => ({ ...f, positionId: v }))}>
                                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                                    <SelectContent>{positions.map(p => <SelectItem key={p.id} value={p.id}>{p.position_id} - {p.position_name}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Start Date</Label>
                                  <Input type="date" value={empForm.startDate} onChange={(e) => setEmpForm(f => ({ ...f, startDate: e.target.value }))} className="h-8 text-xs mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">End Date</Label>
                                  <Input type="date" value={empForm.endDate} onChange={(e) => setEmpForm(f => ({ ...f, endDate: e.target.value }))} className="h-8 text-xs mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Status</Label>
                                  <Select value={empForm.status} onValueChange={(v) => setEmpForm(f => ({ ...f, status: v }))}>
                                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="active">Active</SelectItem>
                                      <SelectItem value="mobilized">Mobilized</SelectItem>
                                      <SelectItem value="demobilized">Demobilized</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end gap-2 col-span-2">
                                  <Button size="sm" onClick={() => handleSaveEmployee(error)} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}Save
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setExpandedRow(null)}>Cancel</Button>
                                </div>
                              </div>
                            )}

                            {error.issue_type === "missing_position" && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                  <Label className="text-xs">Position ID</Label>
                                  <Input value={error.position_id_code} readOnly className="h-8 text-xs bg-muted mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Position Name *</Label>
                                  <Input ref={firstInputRef} value={posForm.name} onChange={(e) => setPosForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs mt-1" onKeyDown={(e) => { if (e.key === "Enter") handleSavePosition(error); }} />
                                </div>
                                <div>
                                  <Label className="text-xs">Year 1 Rate</Label>
                                  <Input type="number" value={posForm.year1} onChange={(e) => setPosForm(f => ({ ...f, year1: e.target.value }))} className="h-8 text-xs mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Year 2 Rate</Label>
                                  <Input type="number" value={posForm.year2} onChange={(e) => setPosForm(f => ({ ...f, year2: e.target.value }))} className="h-8 text-xs mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Year 3 Rate</Label>
                                  <Input type="number" value={posForm.year3} onChange={(e) => setPosForm(f => ({ ...f, year3: e.target.value }))} className="h-8 text-xs mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Year 4 Rate</Label>
                                  <Input type="number" value={posForm.year4} onChange={(e) => setPosForm(f => ({ ...f, year4: e.target.value }))} className="h-8 text-xs mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Year 5 Rate</Label>
                                  <Input type="number" value={posForm.year5} onChange={(e) => setPosForm(f => ({ ...f, year5: e.target.value }))} className="h-8 text-xs mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Service Order</Label>
                                  <Select value={posForm.soId} onValueChange={(v) => setPosForm(f => ({ ...f, soId: v }))}>
                                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                                    <SelectContent>{serviceOrders.map(s => <SelectItem key={s.id} value={s.id}>{s.so_number}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end gap-2 col-span-2">
                                  <Button size="sm" onClick={() => handleSavePosition(error)} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}Save
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setExpandedRow(null)}>Cancel</Button>
                                </div>
                              </div>
                            )}

                            {error.issue_type === "invalid_mapping" && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                  <Label className="text-xs">Employee ID</Label>
                                  <Input value={error.employee_id_code} readOnly className="h-8 text-xs bg-muted mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">Expected Position (from Excel)</Label>
                                  <Input value={`${error.position_id_code} - ${error.position_name}`} readOnly className="h-8 text-xs bg-muted mt-1" />
                                </div>
                                <div>
                                  <Label className="text-xs">New Position *</Label>
                                  <Select value={mapForm.positionId} onValueChange={(v) => setMapForm(f => ({ ...f, positionId: v }))}>
                                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                                    <SelectContent>{positions.map(p => <SelectItem key={p.id} value={p.id}>{p.position_id} - {p.position_name}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end gap-2">
                                  <Button size="sm" onClick={() => handleFixMapping(error)} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}Save
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setExpandedRow(null)}>Cancel</Button>
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => setCancelConfirmOpen(true)}>
              Cancel Import
            </Button>
            <Button onClick={onRetryImport} disabled={!allResolved}>
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
            <AlertDialogAction onClick={() => { setCancelConfirmOpen(false); onCancelImport(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancel Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
