import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import ImportProgressDialog, { type ImportProgress, type ImportError } from "@/components/ImportProgressDialog";
import SmartImportWizard from "@/components/import/SmartImportWizard";
import type { SmartImportConfig } from "@/components/import/types";

interface ExcelToolbarProps {
  onExport: () => void;
  onTemplate: () => void;
  onImport?: (file: File) => void;
  /** Legacy: row-by-row progress import */
  onImportWithProgress?: (
    rows: string[][],
    onProgress: (progress: ImportProgress) => void
  ) => Promise<ImportProgress>;
  onImportComplete?: () => void;
  /** New: smart import wizard config (takes precedence over legacy) */
  smartImportConfig?: SmartImportConfig;
}

export default function ExcelToolbar({ onExport, onTemplate, onImport, onImportWithProgress, onImportComplete, smartImportConfig }: ExcelToolbarProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download size={14} className="mr-1.5" />Export
      </Button>
      <Button variant="outline" size="sm" onClick={onTemplate}>
        <FileSpreadsheet size={14} className="mr-1.5" />Template
      </Button>
      {smartImportConfig ? (
        <SmartImportWizard config={smartImportConfig} />
      ) : onImportWithProgress ? (
        <ImportProgressDialog onImport={onImportWithProgress} onComplete={onImportComplete} />
      ) : onImport ? (
        <>
          <input
            type="file"
            ref={ref}
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
            Import
          </Button>
        </>
      ) : null}
    </div>
  );
}

export type { ImportProgress, ImportError };
