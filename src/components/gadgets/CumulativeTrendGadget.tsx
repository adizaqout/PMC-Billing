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

  const allMonths = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.submissions.map((s) => s.month))).sort(compareMonth);
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

    const actualByMonth = new Map<string, number>();
    const forecastByMonth = new Map<string, number>();
    const baselineByMonth = new Map<string, number>();

    for (const line of data.lines) {
      if (!submissionIds.has(line.submission_id)) continue;
      const sub = submissionById.get(line.submission_id);
      if (!sub) continue;
      const cost = Number(line.derived_cost || 0);
      if (sub.schedule_type === "actual") actualByMonth.set(sub.month, (actualByMonth.get(sub.month) || 0) + cost);
      if (sub.schedule_type === "forecast") forecastByMonth.set(sub.month, (forecastByMonth.get(sub.month) || 0) + cost);
      if (sub.schedule_type === "baseline") baselineByMonth.set(sub.month, (baselineByMonth.get(sub.month) || 0) + cost);
    }

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
      return {
        month: formatMonthLabel(month),
        Actual: cumActual,
        Forecast: cumForecast,
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
