
DROP POLICY IF EXISTS ds_delete ON public.deployment_submissions;
CREATE POLICY ds_delete ON public.deployment_submissions
  FOR DELETE TO authenticated
  USING (
    (is_superadmin() OR (has_module_permission('deployments'::text, 'modify'::permission_level) AND can_access_consultant(consultant_id)))
    AND (status IN ('draft', 'rejected'))
  );
