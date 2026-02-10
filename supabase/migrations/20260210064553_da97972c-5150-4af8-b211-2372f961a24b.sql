
-- 1. Configurable lookup table for admin-managed dropdowns
CREATE TABLE public.lookup_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category, value)
);

ALTER TABLE public.lookup_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lookup_select" ON public.lookup_values FOR SELECT USING (true);
CREATE POLICY "lookup_insert" ON public.lookup_values FOR INSERT WITH CHECK (is_superadmin());
CREATE POLICY "lookup_update" ON public.lookup_values FOR UPDATE USING (is_superadmin());
CREATE POLICY "lookup_delete" ON public.lookup_values FOR DELETE USING (is_superadmin());

CREATE TRIGGER update_lookup_values_updated_at
  BEFORE UPDATE ON public.lookup_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed employee statuses
INSERT INTO public.lookup_values (category, value, label, sort_order) VALUES
  ('employee_status', 'active', 'Active', 1),
  ('employee_status', 'inactive', 'Inactive', 2),
  ('employee_status', 'mobilized', 'Mobilized', 3),
  ('employee_status', 'pending', 'Pending', 4),
  ('employee_status', 'terminated', 'Terminated', 5);

-- 3. Seed project types, classifications, entities for admin-configurable dropdowns
INSERT INTO public.lookup_values (category, value, label, sort_order) VALUES
  ('project_type', 'commercial', 'Commercial', 1),
  ('project_type', 'residential', 'Residential', 2),
  ('project_type', 'retail', 'Retail', 3),
  ('project_type', 'mixed_use', 'Mixed Use', 4),
  ('project_type', 'infrastructure', 'Infrastructure', 5),
  ('po_type', 'new', 'New', 1),
  ('po_type', 'revision', 'Revision', 2),
  ('po_type', 'extension', 'Extension', 3),
  ('invoice_status', 'pending', 'Pending', 1),
  ('invoice_status', 'paid', 'Paid', 2),
  ('invoice_status', 'cancelled', 'Cancelled', 3);

-- 4. Change employees.status from record_status enum to text for flexibility
ALTER TABLE public.employees ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.employees ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.employees ALTER COLUMN status SET DEFAULT 'active';
