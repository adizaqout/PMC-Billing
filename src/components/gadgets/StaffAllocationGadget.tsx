import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useAnalyticsData } from "@/hooks/useAnalyticsData";
import { getLatestSubmissionIds } from "@/lib/analytics";

const COLORS = [
  "hsl(210, 70%, 30%)",
  "hsl(100, 55%, 40%)",
  "hsl(195, 70%, 55%)",
  "hsl(35, 80%, 50%)",
  "hsl(280, 50%, 45%)",
  "hsl(0, 60%, 45%)",
  "hsl(160, 50%, 40%)",
  "hsl(45, 90%, 50%)",
];

interface StaffAllocationGadgetProps {
  onRemove?: () => void;
}

export default function StaffAllocationGadget({ onRemove }: StaffAllocationGadgetProps) {
  const { data } = useAnalyticsData();
  const [scheduleType, setScheduleType] = useState<string>("actual");

  const chartData = useMemo(() => {
    if (!data) return { rows: [], functions: [] };

    const openMonth = data.openPeriod?.month;
    if (!openMonth) return { rows: [], functions: [] };

    const latestIds = getLatestSubmissionIds(data.submissions, false);

    // Find submissions for the open month and selected schedule type
    const relevantSubs = data.submissions.filter(
      (s) =>
        latestIds.has(s.id) &&
        s.month === openMonth &&
        s.schedule_type === scheduleType,
    );
    const subIds = new Set(relevantSubs.map((s) => s.id));

    // Build lookups
    const employeeById = new Map(data.employees.map((e) => [e.id, e]));
    const positionById = new Map(data.positions.map((p) => [p.id, p]));
    const projectById = new Map(data.projects.map((p) => [p.id, p]));

    // Count unique employees per project per function
    // Key: projectId -> functionName -> Set<employeeId>
    const projectFunctionStaff = new Map<string, Map<string, Set<string>>>();

    for (const line of data.lines) {
      if (!subIds.has(line.submission_id)) continue;
      const projId = line.billed_project_id || line.worked_project_id;
      if (!projId) continue;

      const emp = line.employee_id ? employeeById.get(line.employee_id) : null;
      const posId = emp?.position_id;
      const pos = posId ? positionById.get(posId) : null;
      const fn = (pos as any)?.function || "Unassigned";
      const empKey = line.employee_id || `line-${line.id}`;

      if (!projectFunctionStaff.has(projId)) {
        projectFunctionStaff.set(projId, new Map());
      }
      const fnMap = projectFunctionStaff.get(projId)!;
      if (!fnMap.has(fn)) fnMap.set(fn, new Set());
      fnMap.get(fn)!.add(empKey);
    }

    // Collect all unique functions
    const allFunctions = new Set<string>();
    projectFunctionStaff.forEach((fnMap) => {
      fnMap.forEach((_, fn) => allFunctions.add(fn));
    });
    const functions = Array.from(allFunctions).sort();

    // Build chart rows
    const rows: Record<string, any>[] = [];
    projectFunctionStaff.forEach((fnMap, projId) => {
      const proj = projectById.get(projId);
      const row: Record<string, any> = {
        name: proj?.project_name || "Unknown",
      };
      functions.forEach((fn) => {
        row[fn] = fnMap.get(fn)?.size || 0;
      });
      rows.push(row);
    });

    // Sort by total staff descending
    rows.sort((a, b) => {
      const totalA = functions.reduce((s, fn) => s + (a[fn] || 0), 0);
      const totalB = functions.reduce((s, fn) => s + (b[fn] || 0), 0);
      return totalB - totalA;
    });

    return { rows, functions };
  }, [data, scheduleType]);

  const openMonthLabel = data?.openPeriod?.month
    ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(
        new Date(
          Number(data.openPeriod.month.split("-")[0]),
          Number(data.openPeriod.month.split("-")[1]) - 1,
          1,
        ),
      )
    : "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="text-sm">Staff Allocation by Project & Function</CardTitle>
          <CardDescription>
            Number of staff for {openMonthLabel} grouped by project and position function
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {onRemove && (
            <Button variant="outline" size="sm" onClick={onRemove}>
              <Trash2 size={14} className="mr-1.5" />
              Remove
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={scheduleType} onValueChange={setScheduleType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="baseline">Baseline</SelectItem>
            <SelectItem value="actual">Actual</SelectItem>
            <SelectItem value="forecast">Forecast</SelectItem>
          </SelectContent>
        </Select>

        {chartData.rows.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No staff allocation data for {openMonthLabel} ({scheduleType}).
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={chartData.rows}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                angle={-25}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                allowDecimals={false}
                label={{
                  value: "Number of Staff",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
                }}
              />
              <Tooltip />
              <Legend />
              {chartData.functions.map((fn, i) => (
                <Bar
                  key={fn}
                  dataKey={fn}
                  stackId="staff"
                  fill={COLORS[i % COLORS.length]}
                  radius={
                    i === chartData.functions.length - 1
                      ? [4, 4, 0, 0]
                      : [0, 0, 0, 0]
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
