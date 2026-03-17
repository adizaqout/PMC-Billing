import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ALL_FILTER_VALUE, type AnalyticsFilters } from "@/lib/analytics";

interface FilterOption {
  value: string;
  label: string;
}

interface GlobalFiltersBarProps {
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
  monthOptions: FilterOption[];
  consultantOptions: FilterOption[];
  projectOptions: FilterOption[];
  soOptions: FilterOption[];
  poOptions: FilterOption[];
  positionOptions: FilterOption[];
  showScenario?: boolean;
  showSubmissionStatus?: boolean;
}

function FilterSelect({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5 min-w-[150px]">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function GlobalFiltersBar({
  filters,
  onChange,
  monthOptions,
  consultantOptions,
  projectOptions,
  soOptions,
  poOptions,
  positionOptions,
  showScenario = true,
  showSubmissionStatus = true,
}: GlobalFiltersBarProps) {
  const setFilter = <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="rounded-md border bg-card p-4 mb-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Global Filters</h2>
          <p className="text-xs text-muted-foreground">All visuals respect period, permission, and company visibility rules.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onChange({
          month: ALL_FILTER_VALUE,
          consultantId: ALL_FILTER_VALUE,
          projectId: ALL_FILTER_VALUE,
          soId: ALL_FILTER_VALUE,
          poId: ALL_FILTER_VALUE,
          positionId: ALL_FILTER_VALUE,
          submissionStatus: ALL_FILTER_VALUE,
          scenario: ALL_FILTER_VALUE,
        })}>
          Reset
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect label="Month" value={filters.month} options={monthOptions} onValueChange={(value) => setFilter("month", value)} />
        <FilterSelect label="Company" value={filters.consultantId} options={consultantOptions} onValueChange={(value) => setFilter("consultantId", value)} />
        <FilterSelect label="Project" value={filters.projectId} options={projectOptions} onValueChange={(value) => setFilter("projectId", value)} />
        <FilterSelect label="SO" value={filters.soId} options={soOptions} onValueChange={(value) => setFilter("soId", value)} />
        <FilterSelect label="PO" value={filters.poId} options={poOptions} onValueChange={(value) => setFilter("poId", value)} />
        <FilterSelect label="Position Group" value={filters.positionId} options={positionOptions} onValueChange={(value) => setFilter("positionId", value)} />
        {showSubmissionStatus && (
          <FilterSelect
            label="Submission Status"
            value={filters.submissionStatus}
            options={[
              { value: ALL_FILTER_VALUE, label: "All statuses" },
              { value: "draft", label: "Draft" },
              { value: "submitted", label: "Submitted" },
              { value: "in_review", label: "In Review" },
              { value: "approved", label: "Approved" },
              { value: "returned", label: "Returned" },
              { value: "rejected", label: "Rejected" },
            ]}
            onValueChange={(value) => setFilter("submissionStatus", value)}
          />
        )}
        {showScenario && (
          <FilterSelect
            label="Scenario"
            value={filters.scenario}
            options={[
              { value: ALL_FILTER_VALUE, label: "All scenarios" },
              { value: "baseline", label: "Baseline" },
              { value: "actual", label: "Actual" },
              { value: "forecast", label: "Forecast" },
              { value: "workload", label: "Workload" },
            ]}
            onValueChange={(value) => setFilter("scenario", value)}
          />
        )}
      </div>
    </div>
  );
}
