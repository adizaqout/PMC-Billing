import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "@/hooks/useSort";

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentKey: string;
  direction: SortDirection;
  onSort: (key: string) => void;
  children?: React.ReactNode;
}

export default function SortableHeader({ label, sortKey, currentKey, direction, onSort, children }: SortableHeaderProps) {
  const active = currentKey === sortKey && direction != null;

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
        title={`Sort by ${label}`}
      >
        {label}
        {active && direction === "asc" && <ArrowUp size={12} className="text-primary" />}
        {active && direction === "desc" && <ArrowDown size={12} className="text-primary" />}
        {!active && <ArrowUpDown size={10} className="opacity-30" />}
      </button>
      {children}
    </span>
  );
}
