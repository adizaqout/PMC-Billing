import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Columns3 } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean; // defaults to true
}

interface Props {
  columns: ColumnDef[];
  visibleColumns: Set<string>;
  onChange: (visible: Set<string>) => void;
}

export function useColumnVisibility(columns: ColumnDef[]) {
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key))
  );
  return { visibleColumns, setVisibleColumns };
}

export default function ColumnVisibilityToggle({ columns, visibleColumns, onChange }: Props) {
  const toggle = (key: string) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      // Don't allow hiding all columns
      if (next.size <= 1) return;
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  const showAll = () => onChange(new Set(columns.map(c => c.key)));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Columns3 size={14} className="mr-1.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 pointer-events-auto" align="end">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium text-muted-foreground">Show/Hide Columns</span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={showAll}
          >
            Show All
          </button>
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {columns.map(col => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-sm"
            >
              <Checkbox
                checked={visibleColumns.has(col.key)}
                onCheckedChange={() => toggle(col.key)}
              />
              <span className="truncate">{col.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
