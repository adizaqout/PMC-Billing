import { useState, useMemo } from "react";

export type SortDirection = "asc" | "desc" | null;
export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export function useSort<T>(items: T[], defaultKey?: string, defaultDir?: SortDirection) {
  const [sort, setSort] = useState<SortConfig>({
    key: defaultKey || "",
    direction: defaultDir || null,
  });

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      if (prev.direction === "desc") return { key: "", direction: null };
      return { key, direction: "asc" };
    });
  };

  const sorted = useMemo(() => {
    if (!sort.key || !sort.direction) return items;
    return [...items].sort((a, b) => {
      const aVal = getNestedValue(a, sort.key);
      const bVal = getNestedValue(b, sort.key);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sort.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      const cmp = aStr.localeCompare(bStr);
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [items, sort]);

  return { sorted, sort, toggleSort };
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}
