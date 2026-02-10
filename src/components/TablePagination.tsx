import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface TablePaginationProps {
  totalItems: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [5, 10, 20];

export default function TablePagination({ totalItems, pageSize, currentPage, onPageChange, onPageSizeChange }: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => { onPageSizeChange(Number(v)); onPageChange(1); }}>
          <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-2">
          {totalItems === 0 ? "No results" : `${start}–${end} of ${totalItems}`}
        </span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(1)} disabled={currentPage <= 1}><ChevronsLeft size={14} /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}><ChevronLeft size={14} /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}><ChevronRight size={14} /></Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(totalPages)} disabled={currentPage >= totalPages}><ChevronsRight size={14} /></Button>
      </div>
    </div>
  );
}