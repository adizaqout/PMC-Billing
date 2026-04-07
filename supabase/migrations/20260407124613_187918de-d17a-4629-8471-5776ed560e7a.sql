
CREATE TABLE IF NOT EXISTS public.system_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  records_processed INTEGER,
  triggered_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_log_type_completed ON public.system_sync_log(sync_type, completed_at DESC);

ALTER TABLE public.system_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_log_select" ON public.system_sync_log
  FOR SELECT TO authenticated
  USING (is_superadmin() OR has_module_permission('admin', 'read'));

CREATE POLICY "sync_log_insert" ON public.system_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (is_superadmin() OR has_module_permission('admin', 'modify'));

CREATE POLICY "sync_log_update" ON public.system_sync_log
  FOR UPDATE TO authenticated
  USING (is_superadmin() OR has_module_permission('admin', 'modify'));
