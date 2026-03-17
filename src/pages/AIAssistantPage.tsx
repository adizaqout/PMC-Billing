import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Loader2, Pin, Save, Sparkles } from "lucide-react";
import { useAnalyticsModel } from "@/hooks/useAnalyticsModel";
import { defaultAnalyticsFilters } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const SUGGESTIONS = [
  "Summarize current risk hotspots using the same dashboard KPI formulas.",
  "Explain the main drivers of variance to baseline for the current open period.",
  "List cross-billing exceptions and over-allocation risks by priority.",
  "Give me a short executive summary of portfolio, workflow, and commercial performance.",
];

function answerFromPrompt(prompt: string, analytics: ReturnType<typeof useAnalyticsModel>["analytics"]) {
  if (!analytics) return "No analytics data available.";

  const lower = prompt.toLowerCase();
  const lines: string[] = [];
  lines.push(`## AI Insights`);
  lines.push(`Open period: **${analytics.openMonth}**`);
  lines.push("");

  lines.push(`- **Total budget:** ${analytics.kpis.totalBudget.toLocaleString()}`);
  lines.push(`- **Actual billed:** ${analytics.kpis.totalActualBilled.toLocaleString()}`);
  lines.push(`- **Forecast cost:** ${analytics.kpis.totalForecastCost.toLocaleString()}`);
  lines.push(`- **Variance to baseline:** ${analytics.kpis.varianceToBaseline.toLocaleString()}`);
  lines.push(`- **Projects at risk:** ${analytics.kpis.projectsAtRisk}`);
  lines.push("");

  if (lower.includes("risk")) {
    lines.push("### Highest risk projects");
    analytics.projectMetrics.filter((project) => project.risk !== "green").slice(0, 5).forEach((project) => {
      lines.push(`- **${project.name}** · risk: ${project.risk} · remaining ${project.remaining.toLocaleString()} · forecast ${project.forecast.toLocaleString()}`);
    });
    if (!analytics.projectMetrics.some((project) => project.risk !== "green")) lines.push("- No projects are currently flagged as amber or red.");
  }

  if (lower.includes("variance") || lower.includes("baseline")) {
    lines.push("");
    lines.push("### Variance context");
    lines.push(`Forecast minus baseline is **${analytics.kpis.varianceToBaseline.toLocaleString()}** based on the shared KPI engine used in Dashboard and Reports.`);
  }

  if (lower.includes("cross") || lower.includes("exception")) {
    lines.push("");
    lines.push("### Exceptions");
    analytics.crossBilling.slice(0, 5).forEach((row) => {
      lines.push(`- ${row.employee}: ${row.workedProject} → ${row.billedProject} (${row.amount.toLocaleString()})`);
    });
    analytics.overAllocation.slice(0, 5).forEach((row) => {
      lines.push(`- ${row.employee}: ${row.allocation.toFixed(1)}% allocation in ${row.month}`);
    });
    if (analytics.crossBilling.length === 0 && analytics.overAllocation.length === 0) lines.push("- No major exceptions in the applied scope.");
  }

  if (lower.includes("workflow") || lower.includes("executive") || lower.includes("summary")) {
    lines.push("");
    lines.push("### Workflow & delivery summary");
    const lastWorkflow = analytics.workflowAudit.at(-1);
    if (lastWorkflow) {
      lines.push(`- Latest visible month: **${lastWorkflow.month}** with ${lastWorkflow.submitted} submitted, ${lastWorkflow.returned} returned, and ${lastWorkflow.inReview} in review.`);
      lines.push(`- Average review time: **${lastWorkflow.avgReviewDays.toFixed(1)} days**.`);
    }
    lines.push(`- Pending reviews in queue: **${analytics.kpis.pendingReviews}**.`);
  }

  return lines.join("\n");
}

export default function AIAssistantPage() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [title, setTitle] = useState("AI Insight");
  const { analytics, isLoading } = useAnalyticsModel(defaultAnalyticsFilters, false);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!response.trim()) throw new Error("Generate an insight first");
      const { error } = await supabase.from("saved_insights").insert({
        title,
        summary_markdown: response,
        prompt: prompt || "Generated from AI Insights",
        insight_type: "summary",
        is_pinned_to_dashboard: false,
        filters: analytics?.appliedFilters || {},
        user_id: (await supabase.auth.getUser()).data.user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics-data"] });
      toast.success("Insight saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pinnedInsights = useMemo(() => analytics?.savedInsights.filter((item) => item.is_pinned_to_dashboard).slice(0, 4) || [], [analytics]);

  const generate = (nextPrompt: string) => {
    setPrompt(nextPrompt);
    setTitle(nextPrompt.slice(0, 60) || "AI Insight");
    setResponse(answerFromPrompt(nextPrompt, analytics));
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title flex items-center gap-2"><Bot size={22} className="text-primary" />AI Insights</h1>
            <p className="page-subtitle">Uses the same permission-aware aggregated data layer and KPI formulas as Dashboard and Reporting.</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Ask for an insight</CardTitle>
              <CardDescription>No duplicate business logic — this uses the shared analytics engine scoped by backend visibility.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask about risk, variance, workflow, or exceptions..." className="min-h-[120px]" />
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((item) => (
                  <Button key={item} variant="outline" size="sm" onClick={() => generate(item)}>{item}</Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => generate(prompt)} disabled={!prompt.trim() || isLoading}>
                  {isLoading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Sparkles size={14} className="mr-1.5" />}Generate insight
                </Button>
                <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={!response.trim() || saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}Save insight
                </Button>
              </div>
              <div className="rounded-md border bg-muted/30 p-4">
                {response ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{response}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Generate an insight to see a permission-aware summary here.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Shared analytics context</CardTitle>
                <CardDescription>What this AI sees is already filtered by open period and latest-revision logic.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Open period</span><span className="font-medium">{analytics?.openMonth || "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Projects at risk</span><span className="font-medium">{analytics?.kpis.projectsAtRisk || 0}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Pending reviews</span><span className="font-medium">{analytics?.kpis.pendingReviews || 0}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Cross-billing exceptions</span><span className="font-medium">{analytics?.crossBilling.length || 0}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pinned saved insights</CardTitle>
                <CardDescription>Reusable insights available to the dashboard and admin management.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pinnedInsights.map((item) => (
                  <div key={item.id} className="rounded-md border p-3">
                    <div className="mb-1 flex items-center gap-2 text-sm font-medium"><Pin size={14} className="text-primary" />{item.title}</div>
                    <p className="line-clamp-3 text-xs text-muted-foreground">{item.summary_markdown || "No summary."}</p>
                  </div>
                ))}
                {pinnedInsights.length === 0 && <p className="text-sm text-muted-foreground">No pinned insights yet.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
