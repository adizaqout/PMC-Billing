import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import {
  ALL_FILTER_VALUE,
  compareMonth,
  formatMonthLabel,
  getLatestSubmissionIds,
  currency,
} from "@/lib/analytics";

interface CumulativeTrendGadgetProps {
  onRemove?: () => void;
}

export default function CumulativeTrendGadget({ onRemove }: CumulativeTrendGadgetProps) {
  const { data } = useAnalyticsData();
  const [selectedCompany, setSelectedCompany] = useState<string>(ALL_FILTER_VALUE);
  const [startMonth, setStartMonth] = useState<string>(ALL_FILTER_VALUE);
  const [endMonth, setEndMonth] = useState<string>(ALL_FILTER_VALUE);

  // Extract months from deployment line notes (format: "month:YYYY-MM|...")
  const getLineMonth = (notes: string | null, fallbackMonth: string) => {
    const match = notes?.match(/month:([^|]+)/);
    return match?.[1] || fallbackMonth;
  };

  const allMonths = useMemo(() => {
    if (!data) return [];
    const months = new Set<string>();
    const subMap = new Map(data.submissions.map((s) => [s.id, s]));
    for (const line of data.lines) {
      const sub = subMap.get(line.submission_id);
      if (sub) months.add(getLineMonth(line.notes, sub.month));
    }
    return Array.from(months).sort(compareMonth);
  }, [data]);

  const companyOptions = useMemo(() => {
    if (!data) return [];
    return data.consultants.map((c) => ({ value: c.id, label: c.name }));
  }, [data]);

  const trendData = useMemo(() => {
    if (!data) return [];

    const latestIds = getLatestSubmissionIds(data.submissions, false);

    const filteredSubmissions = data.submissions.filter((s) => {
      if (!latestIds.has(s.id)) return false;
      if (selectedCompany !== ALL_FILTER_VALUE && s.consultant_id !== selectedCompany) return false;
      return true;
    });

    const submissionIds = new Set(filteredSubmissions.map((s) => s.id));
    const submissionById = new Map(filteredSubmissions.map((s) => [s.id, s]));

    // Build employee → position rate lookup
    const employeePositionMap = new Map<string, string>();
    for (const emp of data.employees) {
      if (emp.position_id) employeePositionMap.set(emp.id, emp.position_id);
    }
    const positionById = new Map(data.positions.map((p) => [p.id, p]));

    function getRate(positionId: string | undefined, rateYear: number | null) {
      if (!positionId) return 0;
      const pos = positionById.get(positionId);
      if (!pos) return 0;
      const yr = rateYear || 1;
      const rateKey = `year_${yr}_rate` as keyof typeof pos;
      return Number(pos[rateKey] || 0);
    }

    function computeCost(line: typeof data.lines[0]) {
      const positionId = line.employee_id ? employeePositionMap.get(line.employee_id) : undefined;
      const rate = getRate(positionId, line.rate_year);
      const pct = Number(line.allocation_pct || 0) / 100;
      const manMonths = Number(line.man_months || 0);
      return pct * rate * manMonths;
    }

    const actualByMonth = new Map<string, number>();
    const forecastByMonth = new Map<string, number>();
    const baselineByMonth = new Map<string, number>();

    for (const line of data.lines) {
      if (!submissionIds.has(line.submission_id)) continue;
      const sub = submissionById.get(line.submission_id);
      if (!sub) continue;
      const cost = computeCost(line);
      const lineMonth = getLineMonth(line.notes, sub.month);
      if (sub.schedule_type === "actual") actualByMonth.set(lineMonth, (actualByMonth.get(lineMonth) || 0) + cost);
      if (sub.schedule_type === "forecast") forecastByMonth.set(lineMonth, (forecastByMonth.get(lineMonth) || 0) + cost);
      if (sub.schedule_type === "baseline") baselineByMonth.set(lineMonth, (baselineByMonth.get(lineMonth) || 0) + cost);
    }

    const openMonth = data.openPeriod?.month || null;

    let months = allMonths;
    if (startMonth !== ALL_FILTER_VALUE) months = months.filter((m) => m >= startMonth);
    if (endMonth !== ALL_FILTER_VALUE) months = months.filter((m) => m <= endMonth);

    let cumActual = 0;
    let cumForecast = 0;
    let cumBaseline = 0;

    return months.map((month) => {
      cumActual += actualByMonth.get(month) || 0;
      cumForecast += forecastByMonth.get(month) || 0;
      cumBaseline += baselineByMonth.get(month) || 0;

      // Actual: only up to and including the open period
      const showActual = openMonth ? month <= openMonth : true;
      // Forecast: only from the open period onward
      const showForecast = openMonth ? month >= openMonth : true;

      return {
        month: formatMonthLabel(month),
        Actual: showActual ? cumActual : null,
        Forecast: showForecast ? cumForecast : null,
        Baseline: cumBaseline,
      };
    });
  }, [data, selectedCompany, startMonth, endMonth, allMonths]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="text-sm">Forecast, Baseline & Actual Trends</CardTitle>
          <CardDescription>Cumulative cost comparison across schedule types</CardDescription>
        </div>
        {onRemove && (
          <Button variant="outline" size="sm" onClick={onRemove}>
            <Trash2 size={14} className="mr-1.5" />Remove
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All companies</SelectItem>
              {companyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={startMonth} onValueChange={setStartMonth}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Start period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>From start</SelectItem>
              {allMonths.map((m) => (
                <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={endMonth} onValueChange={setEndMonth}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="End period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>To end</SelectItem>
              {allMonths.map((m) => (
                <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {trendData.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No deployment data for the selected filters.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={trendData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                formatter={(value: number, name: string) => [currency(value), name]}
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Forecast"
                stroke="hsl(142, 71%, 35%)"
                strokeWidth={2.5}
                dot={false}
                strokeDasharray="8 4"
              />
              <Line
                type="monotone"
                dataKey="Baseline"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Actual"
                stroke="hsl(0, 72%, 40%)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
