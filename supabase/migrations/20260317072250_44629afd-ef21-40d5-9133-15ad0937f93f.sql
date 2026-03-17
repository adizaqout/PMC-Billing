-- Configuration for analytics modules, AI visibility, and saved insights
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select"
ON public.app_settings
FOR SELECT
TO authenticated
USING (is_superadmin() OR has_module_permission('reports', 'read'));

CREATE POLICY "app_settings_insert"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin());

CREATE POLICY "app_settings_update"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

CREATE POLICY "app_settings_delete"
ON public.app_settings
FOR DELETE
TO authenticated
USING (is_superadmin());

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.report_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL UNIQUE,
  report_name text NOT NULL,
  module_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.report_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_catalog_select"
ON public.report_catalog
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "report_catalog_insert"
ON public.report_catalog
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin());

CREATE POLICY "report_catalog_update"
ON public.report_catalog
FOR UPDATE
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

CREATE POLICY "report_catalog_delete"
ON public.report_catalog
FOR DELETE
TO authenticated
USING (is_superadmin());

CREATE TRIGGER update_report_catalog_updated_at
BEFORE UPDATE ON public.report_catalog
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.group_report_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.report_catalog(id) ON DELETE CASCADE,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (group_id, report_id)
);

ALTER TABLE public.group_report_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_report_visibility_select"
ON public.group_report_visibility
FOR SELECT
TO authenticated
USING (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.group_id = group_report_visibility.group_id
  )
);

CREATE POLICY "group_report_visibility_insert"
ON public.group_report_visibility
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin());

CREATE POLICY "group_report_visibility_update"
ON public.group_report_visibility
FOR UPDATE
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

CREATE POLICY "group_report_visibility_delete"
ON public.group_report_visibility
FOR DELETE
TO authenticated
USING (is_superadmin());

CREATE TRIGGER update_group_report_visibility_updated_at
BEFORE UPDATE ON public.group_report_visibility
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.group_feature_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (group_id, feature_key)
);

ALTER TABLE public.group_feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_feature_toggles_select"
ON public.group_feature_toggles
FOR SELECT
TO authenticated
USING (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.group_id = group_feature_toggles.group_id
  )
);

CREATE POLICY "group_feature_toggles_insert"
ON public.group_feature_toggles
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin());

CREATE POLICY "group_feature_toggles_update"
ON public.group_feature_toggles
FOR UPDATE
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

CREATE POLICY "group_feature_toggles_delete"
ON public.group_feature_toggles
FOR DELETE
TO authenticated
USING (is_superadmin());

CREATE TRIGGER update_group_feature_toggles_updated_at
BEFORE UPDATE ON public.group_feature_toggles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.saved_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  prompt text,
  insight_type text NOT NULL DEFAULT 'chart',
  chart_config jsonb,
  summary_markdown text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_pinned_to_dashboard boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_insights_select"
ON public.saved_insights
FOR SELECT
TO authenticated
USING (is_superadmin() OR user_id = auth.uid());

CREATE POLICY "saved_insights_insert"
ON public.saved_insights
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "saved_insights_update"
ON public.saved_insights
FOR UPDATE
TO authenticated
USING (is_superadmin() OR user_id = auth.uid())
WITH CHECK (is_superadmin() OR user_id = auth.uid());

CREATE POLICY "saved_insights_delete"
ON public.saved_insights
FOR DELETE
TO authenticated
USING (is_superadmin() OR user_id = auth.uid());

CREATE TRIGGER update_saved_insights_updated_at
BEFORE UPDATE ON public.saved_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_saved_insights_user_id ON public.saved_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_insights_pinned ON public.saved_insights(user_id, is_pinned_to_dashboard);
CREATE INDEX IF NOT EXISTS idx_group_feature_toggles_group_feature ON public.group_feature_toggles(group_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_group_report_visibility_group ON public.group_report_visibility(group_id);

INSERT INTO public.app_settings (setting_key, setting_value)
VALUES
  ('dashboard_risk_thresholds', jsonb_build_object('amber_remaining_pct', 10, 'red_forecast_over_budget', true)),
  ('approved_visibility', jsonb_build_object('aldar_requires_approved_only', true)),
  ('dashboard_defaults', jsonb_build_object('default_revision_mode', 'latest', 'default_period_mode', 'open_period'))
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.report_catalog (report_key, report_name, module_key, sort_order)
VALUES
  ('portfolio', 'Portfolio', 'reports', 1),
  ('commercial', 'Commercial', 'reports', 2),
  ('deployment', 'Deployment', 'reports', 3),
  ('workflow_audit', 'Workflow Audit', 'reports', 4),
  ('cross_billing', 'Cross-Billing', 'reports', 5),
  ('dashboard', 'Dashboard', 'dashboard', 6),
  ('ai_insights', 'AI Insights', 'ai_insights', 7)
ON CONFLICT (report_key) DO NOTHING;