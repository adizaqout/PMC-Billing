import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function SystemTab() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetchLastSync();
  }, []);

  const fetchLastSync = async () => {
    const { data } = await supabase
      .from("system_sync_log")
      .select("completed_at")
      .eq("sync_type", "deployment_data_sync")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.completed_at) {
      setLastSync(new Date(data.completed_at));
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus("Starting sync...");
    setProgress(5);

    let syncLogId: string | null = null;

    try {
      const user = (await supabase.auth.getUser()).data.user;

      // Step 1: Log sync start
      const { data: syncLog } = await supabase
        .from("system_sync_log")
        .insert({
          sync_type: "deployment_data_sync",
          status: "running",
          triggered_by: user?.id ?? null,
        } as any)
        .select("id")
        .single();

      syncLogId = syncLog?.id ?? null;
      setProgress(10);

      // Step 2: Clear ALL React Query caches
      setSyncStatus("Clearing all cached data...");
      queryClient.clear();
      setProgress(20);

      // Step 3: Fetch all submissions to rebuild cache
      setSyncStatus("Fetching submission list...");
      const { data: submissions, error: subErr } = await supabase
        .from("deployment_submissions")
        .select("id, status, month, consultant_id")
        .order("month", { ascending: false });

      if (subErr) throw subErr;
      setProgress(30);

      if (!submissions || submissions.length === 0) {
        setSyncStatus("No submissions found. Sync complete.");
        setProgress(100);
        if (syncLogId) {
          await supabase
            .from("system_sync_log")
            .update({ status: "completed", completed_at: new Date().toISOString(), records_processed: 0 } as any)
            .eq("id", syncLogId);
        }
        setLastSync(new Date());
        toast.success("Sync completed — no submissions to process");
        setIsSyncing(false);
        return;
      }

      // Step 4: Pre-fetch deployment lines for each submission (batched)
      const total = submissions.length;
      let completed = 0;
      const batchSize = 3;

      for (let i = 0; i < total; i += batchSize) {
        const batch = submissions.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (sub) => {
            try {
              const { data: lines } = await supabase
                .from("deployment_lines")
                .select("id,submission_id,excel_row_id,employee_id,worked_project_id,billed_project_id,allocation_pct,man_months,rate_year,po_id,po_item_id,so_id,notes")
                .eq("submission_id", sub.id);

              queryClient.setQueryData(["deployment-lines", sub.id], lines ?? []);
            } catch {
              // Skip individual failures
            }
            completed++;
          })
        );

        const pct = 30 + Math.round((completed / total) * 65);
        setProgress(pct);
        setSyncStatus(`Rebuilding cache: ${completed}/${total} submissions...`);

        // Small delay to avoid hammering the API
        if (i + batchSize < total) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      // Step 5: Mark sync complete
      setProgress(100);
      setSyncStatus(`✓ Sync completed. ${total} submissions refreshed.`);

      if (syncLogId) {
        await supabase
          .from("system_sync_log")
          .update({ status: "completed", completed_at: new Date().toISOString(), records_processed: total } as any)
          .eq("id", syncLogId);
      }

      setLastSync(new Date());
      toast.success(`Deployment data synced — ${total} submissions refreshed`);
    } catch (error: any) {
      console.error("Sync failed:", error);
      setSyncStatus(`✗ Sync failed: ${error.message}`);
      toast.error("Sync failed: " + error.message);

      if (syncLogId) {
        await supabase
          .from("system_sync_log")
          .update({ status: "failed", completed_at: new Date().toISOString(), error_message: error.message } as any)
          .eq("id", syncLogId);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw size={16} />
            Deployment Data Sync
          </CardTitle>
          <CardDescription>
            Use this to fix corrupted deployment views by clearing all caches and rebuilding data from the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastSync && (
            <p className="text-xs text-muted-foreground">
              Last successful sync:{" "}
              <span className="font-medium text-foreground">
                {lastSync.toLocaleString("en-AE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Dubai",
                })}
              </span>
            </p>
          )}

          <Button
            onClick={handleSync}
            disabled={isSyncing}
            variant="destructive"
            className="gap-2"
          >
            {isSyncing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {isSyncing ? "Syncing..." : "Sync Deployment Data"}
          </Button>

          {syncStatus && (
            <div className="rounded-md border bg-muted/50 p-3 space-y-2">
              <p className="text-sm flex items-center gap-2">
                {syncStatus.startsWith("✓") && <CheckCircle2 size={14} className="text-green-600 shrink-0" />}
                {syncStatus.startsWith("✗") && <XCircle size={14} className="text-destructive shrink-0" />}
                {syncStatus}
              </p>
              {isSyncing && <Progress value={progress} className="h-2" />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
