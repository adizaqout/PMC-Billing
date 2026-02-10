import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, FileSpreadsheet } from "lucide-react";

interface ExcelToolbarProps {
  onExport: () => void;
  onTemplate: () => void;
  onImport: (file: File) => void;
}

export default function ExcelToolbar({ onExport, onTemplate, onImport }: ExcelToolbarProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download size={14} className="mr-1.5" />Export
      </Button>
      <Button variant="outline" size="sm" onClick={onTemplate}>
        <FileSpreadsheet size={14} className="mr-1.5" />Template
      </Button>
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
    </div>
  );
}
