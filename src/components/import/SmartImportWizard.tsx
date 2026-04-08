import { useState, useCallback, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, AlertTriangle, CheckCircle2, XCircle, ArrowRight, ArrowLeft, FileSpreadsheet } from "lucide-react";
import { parseExcelFile } from "@/lib/excel-utils";
import { toast } from "sonner";
import type { SmartImportConfig, ImportColumnDef, ImportRecord, ConflictRecord, ImportAction } from "./types";

type Stage = "upload" | "validate" | "conflicts" | "preview" | "executing" | "done";

interface Props {
  config: SmartImportConfig;
}

const normalizeHeader = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

function mapHeaders(headerRow: string[], columns: ImportColumnDef[]): Map<string, number> {
  const map = new Map<string, number>();
  const normalized = headerRow.map(h => normalizeHeader(String(h ?? "")));
  for (const col of columns) {
    const names = [col.header, ...(col.aliases ?? [])];
    for (const name of names) {
      const idx = normalized.indexOf(normalizeHeader(name));
      if (idx >= 0) { map.set(col.key, idx); break; }
    }
  }
  return map;
}

function parseRows(rawRows: string[][], columns: ImportColumnDef[], headerMap: Map<string, number>, config: SmartImportConfig): ImportRecord[] {
  const records: ImportRecord[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    let values: Record<string, string> = {};
    let hasAnyValue = false;
    for (const col of columns) {
      const idx = headerMap.get(col.key);
      const val = idx != null ? String(row[idx] ?? "").trim() : "";
      values[col.key] = val;
      if (val) hasAnyValue = true;
    }
    if (!hasAnyValue) continue;
    // Apply optional value transformation
    if (config.transformValues) {
      values = config.transformValues(values);
    }
    const validationErrors: Record<string, string> = {};
    for (const col of columns) {
      if (col.required && !values[col.key]) {
        validationErrors[col.key] = `${col.header} is required`;
      }
    }
    const record: ImportRecord = { rowIndex: i + 1, values, validationErrors };
    // Apply optional custom validation
    if (config.customValidate) {
      const customErrors = config.customValidate(record);
      Object.assign(record.validationErrors, customErrors);
    }
    records.push(record);
  }
  return records;
}

function detectConflicts(
  records: ImportRecord[],
  existing: Record<string, string>[],
  businessKeys: string[]
): { clean: ImportRecord[]; conflicts: ConflictRecord[] } {
  const clean: ImportRecord[] = [];
  const conflicts: ConflictRecord[] = [];
  for (const rec of records) {
    const match = existing.find(ex =>
      businessKeys.every(k => {
        const a = (rec.values[k] ?? "").toLowerCase();
        const b = (ex[k] ?? "").toLowerCase();
        return a && b && a === b;
      })
    );
    if (match) {
      conflicts.push({
        importRecord: rec,
        existingRecord: match,
        resolution: "existing",
        existingId: match._id,
      });
    } else {
      clean.push(rec);
    }
  }
  return { clean, conflicts };
}

export default function SmartImportWizard({ config }: Props) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ImportRecord[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [cleanRecords, setCleanRecords] = useState<ImportRecord[]>([]);
  const [progress, setProgress] = useState({ total: 0, done: 0, created: 0, updated: 0, errors: [] as { row: number; message: string }[] });
  const [isProcessing, setIsProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStage("upload");
    setFile(null);
    setRecords([]);
    setConflicts([]);
    setCleanRecords([]);
    setProgress({ total: 0, done: 0, created: 0, updated: 0, errors: [] });
    setIsProcessing(false);
  }, []);

  const handleClose = () => { setOpen(false); setTimeout(reset, 200); };

  const handleFileSelect = useCallback(() => { fileRef.current?.click(); }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setStage("upload"); setOpen(true); }
    e.target.value = "";
  };

  // Step 1→2: Parse file and validate
  const handleParseFile = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const rawRows = await parseExcelFile(file);
      if (rawRows.length < 2) { toast.error("File is empty"); setIsProcessing(false); return; }
      const headerMap = mapHeaders(rawRows[0], config.columns);
      const parsed = parseRows(rawRows, config.columns, headerMap, config);
      if (parsed.length === 0) { toast.error("No valid rows found"); setIsProcessing(false); return; }
      setRecords(parsed);
      const hasErrors = parsed.some(r => Object.keys(r.validationErrors).length > 0);
      setStage(hasErrors ? "validate" : "conflicts");
      if (!hasErrors) await runConflictDetection(parsed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2→3: After validation fixes, detect conflicts
  const runConflictDetection = async (recs: ImportRecord[]) => {
    setIsProcessing(true);
    try {
      const existing = await config.fetchExisting();
      const { clean, conflicts: found } = detectConflicts(recs, existing, config.businessKeys);
      setCleanRecords(clean);
      setConflicts(found);
      setStage(found.length > 0 ? "conflicts" : "preview");
    } catch (err) {
      toast.error("Failed to check for conflicts");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleValidationNext = async () => {
    const hasErrors = records.some(r => Object.keys(r.validationErrors).length > 0);
    if (hasErrors) { toast.error("Please fix all validation errors first"); return; }
    await runConflictDetection(records);
  };

  const handleConflictsNext = () => { setStage("preview"); };

  // Build final action list
  const actions: ImportAction[] = useMemo(() => {
    const list: ImportAction[] = [];
    for (const rec of cleanRecords) {
      list.push({ type: "insert", record: rec });
    }
    for (const c of conflicts) {
      if (c.resolution === "import") {
        list.push({ type: "update", record: c.importRecord, existingId: c.existingId });
      } else {
        list.push({ type: "skip", record: c.importRecord, existingId: c.existingId });
      }
    }
    return list;
  }, [cleanRecords, conflicts]);

  const activeActions = useMemo(() => actions.filter(a => a.type !== "skip"), [actions]);

  // Step 5: Execute (batch-aware)
  const handleExecute = async () => {
    setStage("executing");
    const inserts = activeActions.filter(a => a.type === "insert");
    const updates = activeActions.filter(a => a.type === "update" && a.existingId);
    const total = inserts.length + updates.length;
    const prog = { total, done: 0, created: 0, updated: 0, errors: [] as { row: number; message: string }[] };
    setProgress(prog);

    // Call beforeImport once before any writes
    if (config.beforeImport) {
      try {
        await config.beforeImport();
        console.log("[SmartImport] beforeImport completed");
      } catch (err) {
        console.error("[SmartImport] beforeImport failed:", err);
        prog.errors.push({ row: 0, message: `Pre-import setup failed: ${err instanceof Error ? err.message : String(err)}` });
        setProgress({ ...prog });
        setStage("done");
        return;
      }
    }

    const CHUNK = 200;

    // Batch inserts
    if (inserts.length > 0 && config.executeBatchInsert) {
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);
        const errs = await config.executeBatchInsert(chunk.map(a => a.record.values));
        for (const e of errs) {
          prog.errors.push({ row: chunk[e.index]?.record.rowIndex ?? 0, message: e.message });
        }
        prog.created += chunk.length - errs.length;
        prog.done += chunk.length;
        setProgress({ ...prog });
      }
    } else {
      for (const action of inserts) {
        const err = await config.executeInsert(action.record.values);
        if (err) prog.errors.push({ row: action.record.rowIndex, message: err });
        else prog.created++;
        prog.done++;
        setProgress({ ...prog });
      }
    }

    // Batch updates
    if (updates.length > 0 && config.executeBatchUpdate) {
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        const errs = await config.executeBatchUpdate(
          chunk.map(a => ({ existingId: a.existingId!, record: a.record.values }))
        );
        for (const e of errs) {
          prog.errors.push({ row: chunk[e.index]?.record.rowIndex ?? 0, message: e.message });
        }
        prog.updated += chunk.length - errs.length;
        prog.done += chunk.length;
        setProgress({ ...prog });
      }
    } else {
      for (const action of updates) {
        const err = await config.executeUpdate(action.existingId!, action.record.values);
        if (err) prog.errors.push({ row: action.record.rowIndex, message: err });
        else prog.updated++;
        prog.done++;
        setProgress({ ...prog });
      }
    }

    setStage("done");
    config.onComplete();
  };

  // Update a record's value (validation step)
  const updateRecordValue = (rowIndex: number, key: string, value: string) => {
    setRecords(prev => prev.map(r => {
      if (r.rowIndex !== rowIndex) return r;
      const newValues = { ...r.values, [key]: value };
      // Re-run basic validation
      const newErrors: Record<string, string> = {};
      for (const col of config.columns) {
        if (col.required && !newValues[col.key]?.trim()) {
          newErrors[col.key] = `${col.header} is required`;
        }
      }
      // Re-run custom validation
      const updatedRecord = { ...r, values: newValues, validationErrors: newErrors };
      if (config.customValidate) {
        Object.assign(updatedRecord.validationErrors, config.customValidate(updatedRecord));
      }
      return updatedRecord;
    }));
  };

  const setAllConflictResolutions = (resolution: "existing" | "import") => {
    setConflicts(prev => prev.map(c => ({ ...c, resolution })));
  };

  const toggleConflictResolution = (idx: number) => {
    setConflicts(prev => prev.map((c, i) =>
      i === idx ? { ...c, resolution: c.resolution === "existing" ? "import" : "existing" } : c
    ));
  };

  const validationErrorRecords = records.filter(r => Object.keys(r.validationErrors).length > 0);
  const errorColumns = useMemo(() => {
    const keys = new Set<string>();
    validationErrorRecords.forEach(r => Object.keys(r.validationErrors).forEach(k => keys.add(k)));
    return config.columns.filter(c => keys.has(c.key) || c.required);
  }, [validationErrorRecords, config.columns]);

  const displayColumns = config.columns.filter(c => c.required || config.businessKeys.includes(c.key));
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
      <Button variant="outline" size="sm" onClick={handleFileSelect}>
        <Upload size={14} className="mr-1.5" />Import
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v && stage !== "executing") handleClose(); }}>
        <DialogContent className={stage === "validate" || stage === "conflicts" || stage === "preview" ? "sm:max-w-4xl h-[85vh] max-h-[85vh] !flex !flex-col overflow-hidden" : "sm:max-w-md"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} />
              {stage === "upload" && `Import ${config.entityName}`}
              {stage === "validate" && "Fix Validation Errors"}
              {stage === "conflicts" && "Resolve Conflicts"}
              {stage === "preview" && "Preview Import"}
              {stage === "executing" && "Importing..."}
              {stage === "done" && "Import Complete"}
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: Upload */}
          {stage === "upload" && (
            <div className="space-y-4">
              {file && (
                <div className="p-3 rounded-md border bg-muted/30">
                  <p className="text-sm">File: <span className="font-medium">{file.name}</span></p>
                </div>
              )}
              <div className="flex items-start gap-3 p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <AlertTriangle size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p>The import wizard will validate your data, detect conflicts with existing records, and let you review all changes before applying.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleParseFile} disabled={!file || isProcessing}>
                  {isProcessing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <ArrowRight size={14} className="mr-1.5" />}
                  Parse & Validate
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2: Validation */}
          {stage === "validate" && (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="destructive">{validationErrorRecords.length} row(s) with errors</Badge>
                <span className="text-xs text-muted-foreground">Fix the highlighted fields below</span>
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-xs">Row</TableHead>
                      {errorColumns.map(col => (
                        <TableHead key={col.key} className="text-xs">{col.header}{col.required && " *"}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationErrorRecords.map(rec => (
                      <TableRow key={rec.rowIndex}>
                        <TableCell className="text-xs font-mono text-muted-foreground">{rec.rowIndex}</TableCell>
                        {errorColumns.map(col => (
                          <TableCell key={col.key} className="p-1">
                            <Input
                              value={rec.values[col.key] ?? ""}
                              onChange={(e) => updateRecordValue(rec.rowIndex, col.key, e.target.value)}
                              className={`h-7 text-xs ${rec.validationErrors[col.key] ? "border-destructive bg-destructive/5" : ""}`}
                              placeholder={rec.validationErrors[col.key] || col.header}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter className="mt-3">
                <Button variant="outline" onClick={() => setStage("upload")}><ArrowLeft size={14} className="mr-1.5" />Back</Button>
                <Button onClick={handleValidationNext} disabled={isProcessing}>
                  {isProcessing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <ArrowRight size={14} className="mr-1.5" />}
                  Next: Check Conflicts
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Conflicts */}
          {stage === "conflicts" && (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge variant="secondary">{conflicts.length} conflict(s) found</Badge>
                <span className="text-xs text-muted-foreground">{cleanRecords.length} new record(s) will be added</span>
                <div className="ml-auto flex gap-1.5">
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setAllConflictResolutions("existing")}>Keep All Existing</Button>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setAllConflictResolutions("import")}>Replace All with New</Button>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-xs">Use New</TableHead>
                      <TableHead className="w-16 text-xs">Row</TableHead>
                      {displayColumns.map(col => (
                        <TableHead key={col.key} className="text-xs">
                          <div className="space-y-0.5">
                            <span>{col.header}</span>
                            <div className="flex gap-1">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">Existing</Badge>
                              <Badge variant="default" className="text-[9px] px-1 py-0">New</Badge>
                            </div>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conflicts.map((c, idx) => (
                      <TableRow key={idx} className={c.resolution === "import" ? "bg-primary/5" : ""}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={c.resolution === "import"}
                            onCheckedChange={() => toggleConflictResolution(idx)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{c.importRecord.rowIndex}</TableCell>
                        {displayColumns.map(col => {
                          const existing = c.existingRecord[col.key] ?? "";
                          const incoming = c.importRecord.values[col.key] ?? "";
                          const changed = existing.toLowerCase() !== incoming.toLowerCase();
                          return (
                            <TableCell key={col.key} className="text-xs">
                              <div className="space-y-0.5">
                                <div className={`text-muted-foreground ${changed ? "line-through" : ""}`}>{existing || "—"}</div>
                                <div className={changed ? "font-medium text-primary" : "text-muted-foreground"}>{incoming || "—"}</div>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter className="mt-3">
                <Button variant="outline" onClick={() => setStage("validate")}><ArrowLeft size={14} className="mr-1.5" />Back</Button>
                <Button onClick={handleConflictsNext}><ArrowRight size={14} className="mr-1.5" />Next: Preview</Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 4: Preview */}
          {stage === "preview" && (
            <div className="flex flex-col min-h-0 flex-1">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-md border bg-green-50 dark:bg-green-950/30 text-center">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">{actions.filter(a => a.type === "insert").length}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">New Records</div>
                </div>
                <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/30 text-center">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{actions.filter(a => a.type === "update").length}</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">Updates</div>
                </div>
                <div className="p-3 rounded-md border bg-muted/30 text-center">
                  <div className="text-2xl font-bold text-muted-foreground">{actions.filter(a => a.type === "skip").length}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
              </div>
              {activeActions.length > 0 && (
                <div className="max-h-[50vh] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 text-xs">Action</TableHead>
                        <TableHead className="w-16 text-xs">Row</TableHead>
                        {displayColumns.map(col => (
                          <TableHead key={col.key} className="text-xs">{col.header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeActions.map((action, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant={action.type === "insert" ? "default" : "secondary"} className="text-[10px]">
                              {action.type === "insert" ? "New" : "Update"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{action.record.rowIndex}</TableCell>
                          {displayColumns.map(col => (
                            <TableCell key={col.key} className="text-xs">{action.record.values[col.key] || "—"}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {activeActions.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">No changes to apply. All conflicts resolved to keep existing records.</div>
              )}
              <DialogFooter className="mt-3">
                <Button variant="outline" onClick={() => setStage(conflicts.length > 0 ? "conflicts" : "upload")}><ArrowLeft size={14} className="mr-1.5" />Back</Button>
                <Button onClick={handleExecute} disabled={activeActions.length === 0}>
                  <CheckCircle2 size={14} className="mr-1.5" />
                  Confirm & Import ({activeActions.length})
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 5: Executing */}
          {stage === "executing" && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-primary" />
                <span className="text-sm">Processing {progress.done} of {progress.total}...</span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex gap-4 text-xs text-muted-foreground">
                {progress.created > 0 && <span className="text-green-600">{progress.created} created</span>}
                {progress.updated > 0 && <span className="text-blue-600">{progress.updated} updated</span>}
                {progress.errors.length > 0 && <span className="text-destructive">{progress.errors.length} errors</span>}
              </div>
            </div>
          )}

          {/* Step 6: Done */}
          {stage === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                {progress.created > 0 && (
                  <div className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle2 size={16} /><span className="font-medium">{progress.created} created</span>
                  </div>
                )}
                {progress.updated > 0 && (
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <CheckCircle2 size={16} /><span className="font-medium">{progress.updated} updated</span>
                  </div>
                )}
                {progress.errors.length > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <XCircle size={16} /><span className="font-medium">{progress.errors.length} errors</span>
                  </div>
                )}
              </div>
              {progress.errors.length > 0 && (
                <ScrollArea className="h-40 rounded-md border p-3">
                  <div className="space-y-1.5">
                    {progress.errors.map((err, idx) => (
                      <div key={idx} className="text-xs text-destructive">Row {err.row}: {err.message}</div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {progress.errors.length === 0 && (progress.created > 0 || progress.updated > 0) && (
                <p className="text-sm text-muted-foreground">All records processed successfully.</p>
              )}
              <DialogFooter>
                <Button onClick={handleClose}>Close</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
