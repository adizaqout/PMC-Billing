-- Drop existing delete policy and create a new one allowing superadmin and admin to delete draft submissions
DROP POLICY IF EXISTS "ds_delete" ON public.deployment_submissions;

CREATE POLICY "ds_delete"
ON public.deployment_submissions
FOR DELETE
USING (
  (is_superadmin() OR has_module_permission('deployments'::text, 'modify'::permission_level))
  AND status = 'draft'
);

-- Also allow admin/superadmin to delete deployment lines for draft submissions
DROP POLICY IF EXISTS "dl_delete" ON public.deployment_lines;

CREATE POLICY "dl_delete"
ON public.deployment_lines
FOR DELETE
USING (
  is_superadmin() OR has_module_permission('deployments'::text, 'modify'::permission_level)
);