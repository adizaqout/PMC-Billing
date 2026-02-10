import * as XLSX from "xlsx";

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
}

export function exportToExcel(
  filename: string,
  columns: ExcelColumnDef[],
  rows: Record<string, any>[],
) {
  const headers = columns.map(c => c.header);
  const data = rows.map(r => columns.map(c => r[c.key] ?? ""));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = columns.map(c => ({ wch: c.width || 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename);
}

export function downloadTemplate(
  filename: string,
  columns: ExcelColumnDef[],
  referenceData?: Record<string, string[]>,
) {
  const headers = columns.map(c => c.header);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = columns.map(c => ({ wch: c.width || 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");

  if (referenceData && Object.keys(referenceData).length > 0) {
    const refRows: string[][] = [["--- REFERENCE VALUES ---"]];
    Object.entries(referenceData).forEach(([label, values]) => {
      refRows.push([label, ...values]);
    });
    const refWs = XLSX.utils.aoa_to_sheet(refRows);
    XLSX.utils.book_append_sheet(wb, refWs, "Reference");
  }

  XLSX.writeFile(wb, filename);
}

export interface ImportResult<T> {
  rows: T[];
  errors: { row: number; message: string }[];
}

export function parseExcelFile(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
        resolve(rows as string[][]);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}
