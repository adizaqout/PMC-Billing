import { useState, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Upload, Save, Send, Plus, X, AlertTriangle } from "lucide-react";

const employees = [
  { id: "E001", name: "Ahmed Al Mansouri", position: "Senior Project Manager" },
  { id: "E002", name: "Sarah Johnson", position: "Cost Engineer" },
  { id: "E003", name: "Mohammed Khan", position: "Planning Engineer" },
  { id: "E004", name: "Lisa Chen", position: "QA/QC Manager" },
  { id: "E005", name: "James Wilson", position: "Project Director" },
];

const allProjects = [
  { id: "PRJ-001", name: "Saadiyat HQ" },
  { id: "PRJ-002", name: "Yas Mall Exp." },
  { id: "PRJ-003", name: "Al Raha Ph.3" },
  { id: "PRJ-004", name: "Marina Tower" },
  { id: "PRJ-005", name: "Central Park" },
  { id: "PRJ-006", name: "Mamsha WF" },
];

type MatrixData = Record<string, Record<string, number>>;

const initialData: MatrixData = {
  E001: { "PRJ-001": 40, "PRJ-002": 30, "PRJ-003": 20 },
  E002: { "PRJ-001": 50, "PRJ-004": 50 },
  E003: { "PRJ-002": 60, "PRJ-003": 40 },
  E004: { "PRJ-001": 30, "PRJ-002": 30, "PRJ-004": 30 },
  E005: { "PRJ-003": 50, "PRJ-005": 50 },
};

export default function DeploymentSchedulePage() {
  const [scheduleType, setScheduleType] = useState("Baseline");
  const [month, setMonth] = useState("2025-01");
  const [consultant, setConsultant] = useState("WSP");
  const [selectedProjects, setSelectedProjects] = useState(["PRJ-001", "PRJ-002", "PRJ-003", "PRJ-004", "PRJ-005"]);
  const [data, setData] = useState<MatrixData>(initialData);
  const [status] = useState("Draft");

  const getRowTotal = useCallback(
    (empId: string) => {
      const row = data[empId] || {};
      return Object.values(row).reduce((sum, v) => sum + (v || 0), 0);
    },
    [data]
  );

  const handleCellChange = (empId: string, projId: string, value: string) => {
    const num = value === "" ? 0 : Math.min(100, Math.max(0, parseInt(value) || 0));
    setData((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] || {}), [projId]: num },
    }));
  };

  const removeProject = (projId: string) => {
    setSelectedProjects((prev) => prev.filter((p) => p !== projId));
  };

  const addProject = (projId: string) => {
    if (!selectedProjects.includes(projId)) {
      setSelectedProjects((prev) => [...prev, projId]);
    }
  };

  const availableProjects = allProjects.filter((p) => !selectedProjects.includes(p.id));
  const visibleProjects = allProjects.filter((p) => selectedProjects.includes(p.id));
  const hasOverAllocation = employees.some((e) => getRowTotal(e.id) > 100);

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Deployment Schedules</h1>
            <p className="page-subtitle">Matrix view — {scheduleType} deployment for {consultant}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Select value={consultant} onValueChange={setConsultant}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WSP">WSP</SelectItem>
              <SelectItem value="AECOM">AECOM</SelectItem>
              <SelectItem value="Mace">Mace</SelectItem>
              <SelectItem value="Faithful+Gould">Faithful+Gould</SelectItem>
            </SelectContent>
          </Select>

          <Select value={scheduleType} onValueChange={setScheduleType}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Baseline">Baseline</SelectItem>
              <SelectItem value="Actual">Actual</SelectItem>
              <SelectItem value="Forecast">Forecast</SelectItem>
              <SelectItem value="Workload">Workload</SelectItem>
            </SelectContent>
          </Select>

          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-8 px-3 text-sm border rounded-md bg-card"
          />

          {availableProjects.length > 0 && (
            <Select onValueChange={addProject}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Plus size={12} /> Add Project Column
                </span>
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm"><Download size={14} className="mr-1.5" />Export</Button>
            <Button variant="outline" size="sm"><Upload size={14} className="mr-1.5" />Import</Button>
            <Button variant="outline" size="sm"><Save size={14} className="mr-1.5" />Save Draft</Button>
            <Button size="sm" disabled={hasOverAllocation}>
              <Send size={14} className="mr-1.5" />Submit
            </Button>
          </div>
        </div>

        {hasOverAllocation && (
          <div className="flex items-center gap-2 px-4 py-2 mb-4 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            <AlertTriangle size={16} />
            <span>One or more employees exceed 100% allocation. Fix before submitting.</span>
          </div>
        )}

        {/* Matrix */}
        <div className="bg-card rounded-md border overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="matrix-cell-header text-left sticky left-0 bg-muted z-10 min-w-[200px]">Employee</th>
                <th className="matrix-cell-header text-left min-w-[140px]">Position</th>
                {visibleProjects.map((p) => (
                  <th key={p.id} className="matrix-cell-header text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="truncate max-w-[80px]" title={p.name}>{p.name}</span>
                      <button
                        onClick={() => removeProject(p.id)}
                        className="opacity-40 hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="matrix-cell-header text-center">Total %</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const total = getRowTotal(emp.id);
                const isOver = total > 100;
                return (
                  <tr key={emp.id} className={isOver ? "matrix-row-over" : ""}>
                    <td className="matrix-cell text-left sticky left-0 bg-card z-10 font-medium text-sm px-2">
                      {emp.name}
                    </td>
                    <td className="matrix-cell text-left text-xs text-muted-foreground px-2">{emp.position}</td>
                    {visibleProjects.map((p) => (
                      <td key={p.id} className="matrix-cell p-0">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={data[emp.id]?.[p.id] || ""}
                          onChange={(e) => handleCellChange(emp.id, p.id, e.target.value)}
                          className="matrix-cell-input"
                          placeholder="–"
                        />
                      </td>
                    ))}
                    <td className={`matrix-row-total ${isOver ? "text-destructive font-bold" : ""}`}>
                      {total}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span>Revision: #1</span>
          <span>·</span>
          <span>Month: {month}</span>
          <span>·</span>
          <span>Type: {scheduleType}</span>
          <span>·</span>
          <span>{employees.length} employees × {visibleProjects.length} projects</span>
        </div>
      </div>
    </AppLayout>
  );
}
