
-- Step 1: Add consultant_id column to deployment_lines
ALTER TABLE public.deployment_lines ADD COLUMN consultant_id uuid;

-- Step 2: Backfill from deployment_submissions
UPDATE public.deployment_lines dl
SET consultant_id = ds.consultant_id
FROM public.deployment_submissions ds
WHERE dl.submission_id = ds.id;

-- Step 3: Make it NOT NULL after backfill
ALTER TABLE public.deployment_lines ALTER COLUMN consultant_id SET NOT NULL;

-- Step 4: Index for RLS performance
CREATE INDEX IF NOT EXISTS idx_deployment_lines_consultant_id ON public.deployment_lines(consultant_id);

-- Step 5: Auto-populate via trigger on insert
CREATE OR REPLACE FUNCTION public.set_deployment_line_consultant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.consultant_id IS NULL THEN
    SELECT consultant_id INTO NEW.consultant_id
    FROM public.deployment_submissions
    WHERE id = NEW.submission_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_dl_consultant_id
  BEFORE INSERT ON public.deployment_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_deployment_line_consultant_id();

-- Step 6: Drop old slow RLS policies and replace with fast ones
DROP POLICY IF EXISTS dl_select ON public.deployment_lines;
DROP POLICY IF EXISTS dl_insert ON public.deployment_lines;
DROP POLICY IF EXISTS dl_update ON public.deployment_lines;
DROP POLICY IF EXISTS dl_delete ON public.deployment_lines;

CREATE POLICY dl_select ON public.deployment_lines
  FOR SELECT TO authenticated
  USING (is_superadmin() OR can_access_consultant(consultant_id));

CREATE POLICY dl_insert ON public.deployment_lines
  FOR INSERT TO authenticated
  WITH CHECK (is_superadmin() OR (has_module_permission('deployments', 'modify') AND can_access_consultant(consultant_id)));

CREATE POLICY dl_update ON public.deployment_lines
  FOR UPDATE TO authenticated
  USING (is_superadmin() OR (has_module_permission('deployments', 'modify') AND can_access_consultant(consultant_id)));

CREATE POLICY dl_delete ON public.deployment_lines
  FOR DELETE TO authenticated
  USING (is_superadmin() OR (has_module_permission('deployments', 'modify') AND can_access_consultant(consultant_id)));
