import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import ImportProgressDialog, { type ImportProgress, type ImportError } from "@/components/ImportProgressDialog";

interface ExcelToolbarProps {
  onExport: () => void;
  onTemplate: () => void;
  onImport: (file: File) => void;
  /** When provided, the import button uses the progress dialog instead of direct import */
  onImportWithProgress?: (
    rows: string[][],
    onProgress: (progress: ImportProgress) => void
  ) => Promise<ImportProgress>;
  onImportComplete?: () => void;
}

export default function ExcelToolbar({ onExport, onTemplate, onImport, onImportWithProgress, onImportComplete }: ExcelToolbarProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download size={14} className="mr-1.5" />Export
      </Button>
      <Button variant="outline" size="sm" onClick={onTemplate}>
        <FileSpreadsheet size={14} className="mr-1.5" />Template
      </Button>
      {onImportWithProgress ? (
        <ImportProgressDialog onImport={onImportWithProgress} onComplete={onImportComplete} />
      ) : (
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
            <Upload size={14} className="mr-1.5" />Import
          </Button>
        </>
      )}
    </div>
  );
}

export type { ImportProgress, ImportError };
