import ExcelJS from "exceljs";
import Papa from "papaparse";

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
}

function normalizeCellValue(value: unknown): string | number | boolean | Date {
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

async function saveWorkbook(filename: string, workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  const arrayBuffer = buffer instanceof ArrayBuffer
    ? buffer
    : Uint8Array.from(buffer).buffer;
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportToExcel(
  filename: string,
  columns: ExcelColumnDef[],
  rows: Record<string, any>[],
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Data");

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 18,
  }));

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle" };

  rows.forEach((row) => {
    worksheet.addRow(
      Object.fromEntries(
        columns.map((column) => [column.key, normalizeCellValue(row[column.key])]),
      ),
    );
  });

  await saveWorkbook(filename, workbook);
}

export async function downloadTemplate(
  filename: string,
  columns: ExcelColumnDef[],
  referenceData?: Record<string, string[]>,
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Template");

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 18,
  }));
  worksheet.getRow(1).font = { bold: true };

  if (referenceData && Object.keys(referenceData).length > 0) {
    const referenceSheet = workbook.addWorksheet("Reference");
    referenceSheet.addRow(["--- REFERENCE VALUES ---"]);
    Object.entries(referenceData).forEach(([label, values]) => {
      referenceSheet.addRow([label, ...values]);
    });
    referenceSheet.columns = [{ width: 24 }, ...Array.from({ length: 10 }, () => ({ width: 18 }))];
  }

  await saveWorkbook(filename, workbook);
}

export interface ImportResult<T> {
  rows: T[];
  errors: { row: number; message: string }[];
}

function excelSerialDateToIso(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  return dateInfo.toISOString().split("T")[0];
}

function normalizeImportedCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

async function parseExcelWorkbook(file: File): Promise<string[][]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as Array<unknown>;
    const cells = values.slice(1).map(normalizeImportedCell);
    const hasContent = cells.some((cell) => cell !== "");
    if (hasContent) rows.push(cells);
  });

  return rows;
}

async function parseCsvFile(file: File): Promise<string[][]> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }

  return result.data.map((row) => row.map((cell) => normalizeImportedCell(cell)));
}

export async function parseExcelFile(file: File): Promise<string[][]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return parseCsvFile(file);
  }

  if (extension === "xlsx") {
    return parseExcelWorkbook(file);
  }

  throw new Error("Unsupported file type. Please upload a .xlsx or .csv file.");
}
