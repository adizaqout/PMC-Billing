import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, XCircle, Upload, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseExcelFile } from "@/lib/excel-utils";

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportProgress {
  total: number;
  processed: number;
  created: number;
  errors: ImportError[];
}

interface ImportProgressDialogProps {
  onImport: (
    rows: string[][],
    onProgress: (progress: ImportProgress) => void
  ) => Promise<ImportProgress>;
  onComplete?: () => void;
}

export default function ImportProgressDialog({ onImport, onComplete }: ImportProgressDialogProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"confirm" | "progress" | "done">("confirm");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ImportProgress>({ total: 0, processed: 0, created: 0, errors: [] });
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage("confirm");
    setFile(null);
    setProgress({ total: 0, processed: 0, created: 0, errors: [] });
  };

  const handleFileSelect = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setStage("confirm");
      setOpen(true);
    }
    e.target.value = "";
  };

  const handleProceed = async () => {
    if (!file) return;
    setStage("progress");
    try {
      const rows = await parseExcelFile(file);
      if (rows.length < 2) {
        setProgress({ total: 0, processed: 0, created: 0, errors: [{ row: 0, message: "File is empty or has no data rows" }] });
        setStage("done");
        return;
      }
      const result = await onImport(rows, (p) => setProgress({ ...p }));
      setProgress(result);
      setStage("done");
      onComplete?.();
    } catch (err) {
      console.error("Import error:", err);
      setProgress(prev => ({ ...prev, errors: [...prev.errors, { row: 0, message: err instanceof Error ? err.message : "Failed to parse file" }] }));
      setStage("done");
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <>
      <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
      <Button variant="outline" size="sm" onClick={handleFileSelect}>
        <Upload size={14} className="mr-1.5" />Import
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v && stage !== "progress") handleClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {stage === "confirm" && "Import Data"}
              {stage === "progress" && "Importing..."}
              {stage === "done" && "Import Complete"}
            </DialogTitle>
          </DialogHeader>

          {stage === "confirm" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-300">Warning</p>
                  <p className="text-amber-700 dark:text-amber-400 mt-0.5">Existing data may be replaced by imported records. Make sure your file is correct before proceeding.</p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                File: <span className="font-medium text-foreground">{file?.name}</span>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleProceed}>Proceed with Import</Button>
              </DialogFooter>
            </div>
          )}

          {stage === "progress" && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-primary" />
                <span className="text-sm">Processing row {progress.processed} of {progress.total}...</span>
              </div>
              <Progress value={pct} className="h-2" />
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="text-green-600">{progress.created} created</span>
                {progress.errors.length > 0 && <span className="text-destructive">{progress.errors.length} errors</span>}
              </div>
            </div>
          )}

          {stage === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 size={16} />
                  <span className="font-medium">{progress.created} imported</span>
                </div>
                {progress.errors.length > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <XCircle size={16} />
                    <span className="font-medium">{progress.errors.length} errors</span>
                  </div>
                )}
              </div>

              {progress.errors.length > 0 && (
                <ScrollArea className="h-40 rounded-md border p-3">
                  <div className="space-y-1.5">
                    {progress.errors.map((err, idx) => (
                      <div key={idx} className="text-xs text-destructive">
                        {err.row > 0 ? `Row ${err.row}: ` : ""}{err.message}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {progress.errors.length === 0 && progress.created > 0 && (
                <p className="text-sm text-muted-foreground">All records imported successfully.</p>
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
