
-- Table to store admin-defined min/max month constraints per consultant for deployment schedule types
CREATE TABLE public.consultant_period_constraints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  consultant_id UUID NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('baseline', 'forecast')),
  min_month TEXT, -- YYYY-MM format
  max_month TEXT, -- YYYY-MM format
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(consultant_id, schedule_type)
);

-- Enable RLS
ALTER TABLE public.consultant_period_constraints ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read period constraints"
  ON public.consultant_period_constraints FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Modify access for admins/superadmins
CREATE POLICY "Admins can manage period constraints"
  ON public.consultant_period_constraints FOR ALL
  USING (public.is_superadmin() OR public.has_module_permission('admin', 'modify'));

-- Trigger for updated_at
CREATE TRIGGER update_consultant_period_constraints_updated_at
  BEFORE UPDATE ON public.consultant_period_constraints
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
