import { useState, useMemo } from "react";

export function usePagination<T>(items: T[], defaultSize = 10) {
  const [pageSize, setPageSize] = useState(defaultSize);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return { paginatedItems, pageSize, setPageSize, currentPage: safePage, setCurrentPage, totalItems: items.length };
}