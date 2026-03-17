-- Dashboard gadget catalog controlled by admins
CREATE TABLE public.dashboard_gadgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gadget_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  gadget_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_width INTEGER NOT NULL DEFAULT 6,
  default_height INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_gadgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_gadgets_select"
ON public.dashboard_gadgets
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "dashboard_gadgets_insert"
ON public.dashboard_gadgets
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin());

CREATE POLICY "dashboard_gadgets_update"
ON public.dashboard_gadgets
FOR UPDATE
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

CREATE POLICY "dashboard_gadgets_delete"
ON public.dashboard_gadgets
FOR DELETE
TO authenticated
USING (is_superadmin());

CREATE TRIGGER update_dashboard_gadgets_updated_at
BEFORE UPDATE ON public.dashboard_gadgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Per-group gadget visibility managed by admins
CREATE TABLE public.group_dashboard_gadget_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  gadget_id UUID NOT NULL REFERENCES public.dashboard_gadgets(id) ON DELETE CASCADE,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, gadget_id)
);

ALTER TABLE public.group_dashboard_gadget_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_dashboard_gadget_visibility_select"
ON public.group_dashboard_gadget_visibility
FOR SELECT
TO authenticated
USING (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.group_id = group_dashboard_gadget_visibility.group_id
  )
);

CREATE POLICY "group_dashboard_gadget_visibility_insert"
ON public.group_dashboard_gadget_visibility
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin());

CREATE POLICY "group_dashboard_gadget_visibility_update"
ON public.group_dashboard_gadget_visibility
FOR UPDATE
TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

CREATE POLICY "group_dashboard_gadget_visibility_delete"
ON public.group_dashboard_gadget_visibility
FOR DELETE
TO authenticated
USING (is_superadmin());

CREATE TRIGGER update_group_dashboard_gadget_visibility_updated_at
BEFORE UPDATE ON public.group_dashboard_gadget_visibility
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Per-user dashboard layout/preferences
CREATE TABLE public.user_dashboard_gadgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  gadget_id UUID NOT NULL REFERENCES public.dashboard_gadgets(id) ON DELETE CASCADE,
  position_x INTEGER NOT NULL DEFAULT 0,
  position_y INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 6,
  height INTEGER NOT NULL DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gadget_id)
);

ALTER TABLE public.user_dashboard_gadgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_dashboard_gadgets_select"
ON public.user_dashboard_gadgets
FOR SELECT
TO authenticated
USING (is_superadmin() OR user_id = auth.uid());

CREATE POLICY "user_dashboard_gadgets_insert"
ON public.user_dashboard_gadgets
FOR INSERT
TO authenticated
WITH CHECK (is_superadmin() OR user_id = auth.uid());

CREATE POLICY "user_dashboard_gadgets_update"
ON public.user_dashboard_gadgets
FOR UPDATE
TO authenticated
USING (is_superadmin() OR user_id = auth.uid())
WITH CHECK (is_superadmin() OR user_id = auth.uid());

CREATE POLICY "user_dashboard_gadgets_delete"
ON public.user_dashboard_gadgets
FOR DELETE
TO authenticated
USING (is_superadmin() OR user_id = auth.uid());

CREATE TRIGGER update_user_dashboard_gadgets_updated_at
BEFORE UPDATE ON public.user_dashboard_gadgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed gadget catalog using existing shared analytics outputs
INSERT INTO public.dashboard_gadgets (gadget_key, title, description, gadget_type, sort_order, default_width, default_height, config)
VALUES
  ('kpi_strip', 'KPI Strip', 'Top-level budget, forecast, variance, and task KPIs.', 'kpi', 10, 12, 1, '{}'::jsonb),
  ('monthly_trend', 'Monthly Trend', 'Actual vs forecast vs baseline by month.', 'chart', 20, 8, 1, '{}'::jsonb),
  ('submission_status', 'Submission Status', 'Submission status distribution for visible data.', 'chart', 30, 4, 1, '{}'::jsonb),
  ('project_risk', 'Project Risk', 'Remaining budget and risk by project.', 'chart', 40, 7, 1, '{}'::jsonb),
  ('my_tasks', 'My Tasks', 'Open tasks from the current filtered scope.', 'table', 50, 5, 1, '{}'::jsonb),
  ('review_queue', 'Review Queue', 'Reviewer work queue for permitted users.', 'table', 60, 4, 1, '{}'::jsonb),
  ('recent_activity', 'Recent Activity', 'Latest visible workflow activity.', 'table', 70, 4, 1, '{}'::jsonb),
  ('exceptions_panel', 'Exceptions Panel', 'Cross-billing and over-allocation exceptions.', 'table', 80, 4, 1, '{}'::jsonb)
ON CONFLICT (gadget_key) DO NOTHING;

-- Default all seeded gadgets visible to existing groups
INSERT INTO public.group_dashboard_gadget_visibility (group_id, gadget_id, is_visible)
SELECT g.id, dg.id, true
FROM public.groups g
CROSS JOIN public.dashboard_gadgets dg
ON CONFLICT (group_id, gadget_id) DO NOTHING;