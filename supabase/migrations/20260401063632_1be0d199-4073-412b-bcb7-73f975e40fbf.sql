
-- Fix 1: dl_delete - change from public to authenticated and add consultant isolation
DROP POLICY IF EXISTS dl_delete ON public.deployment_lines;
CREATE POLICY dl_delete ON public.deployment_lines
  FOR DELETE TO authenticated
  USING (
    is_superadmin() OR (
      has_module_permission('deployments'::text, 'modify'::permission_level) AND
      can_access_consultant(get_submission_consultant_id(submission_id))
    )
  );

-- Fix 2: ds_delete - change from public to authenticated and add consultant isolation
DROP POLICY IF EXISTS ds_delete ON public.deployment_submissions;
CREATE POLICY ds_delete ON public.deployment_submissions
  FOR DELETE TO authenticated
  USING (
    (is_superadmin() OR (
      has_module_permission('deployments'::text, 'modify'::permission_level) AND
      can_access_consultant(consultant_id)
    ))
    AND status = 'draft'::submission_status
  );
