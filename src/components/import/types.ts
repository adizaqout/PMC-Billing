export interface ImportColumnDef {
  header: string;
  key: string;
  required?: boolean;
  type?: "string" | "number" | "date";
  /** Alternative header names to match (e.g. ["Y1 Rate", "Year 1 Rate"]) */
  aliases?: string[];
}

export interface ImportRecord {
  /** Row index (1-based, from Excel) */
  rowIndex: number;
  /** Parsed values keyed by ImportColumnDef.key */
  values: Record<string, string>;
  /** Validation errors: key → message */
  validationErrors: Record<string, string>;
}

export interface ConflictRecord {
  importRecord: ImportRecord;
  existingRecord: Record<string, string>;
  /** Which version to keep: "existing" | "import" */
  resolution: "existing" | "import";
  /** UUID of existing record */
  existingId: string;
}

export interface ImportAction {
  type: "insert" | "update" | "skip";
  record: ImportRecord;
  existingId?: string;
}

export interface SmartImportConfig {
  /** Display name (e.g. "Employees") */
  entityName: string;
  /** Column definitions for the import */
  columns: ImportColumnDef[];
  /**
   * Keys used for conflict detection against existing records.
   * These are ImportColumnDef.key values.
   */
  businessKeys: string[];
  /**
   * Fetch existing records as flat key-value maps.
   * Must include an `_id` key with the UUID.
   */
  fetchExisting: () => Promise<Record<string, string>[]>;
  /**
   * Execute a single insert. Return error message or null on success.
   */
  executeInsert: (record: Record<string, string>) => Promise<string | null>;
  /**
   * Execute a single update. Return error message or null on success.
   */
  executeUpdate: (existingId: string, record: Record<string, string>) => Promise<string | null>;
  /**
   * Optional: Execute inserts in bulk. Return array of { index, message } errors.
   * When provided, the wizard uses this instead of row-by-row executeInsert.
   */
  executeBatchInsert?: (records: Record<string, string>[]) => Promise<{ index: number; message: string }[]>;
  /**
   * Optional: Execute updates in bulk. Return array of { index, message } errors.
   * When provided, the wizard uses this instead of row-by-row executeUpdate.
   */
  executeBatchUpdate?: (updates: { existingId: string; record: Record<string, string> }[]) => Promise<{ index: number; message: string }[]>;
  /**
   * Optional: called once before any inserts/updates begin.
   * Use to clear existing data for the target scope.
   */
  beforeImport?: () => Promise<void>;
  /** Called after import completes to refresh data */
  onComplete: () => void;
  /**
   * Optional: transform raw parsed values (e.g. normalize dates).
   * Called after parsing, before validation and conflict detection.
   */
  transformValues?: (values: Record<string, string>) => Record<string, string>;
  /**
   * Optional: return additional validation errors beyond required-field checks.
   * Called per record after basic validation.
   */
  customValidate?: (record: ImportRecord) => Record<string, string>;
}
