CREATE POLICY deployment_import_staging_select
ON public.deployment_import_staging
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR (
    public.has_module_permission('deployments', 'modify')
    AND public.can_access_consultant(consultant_id)
  )
);

CREATE POLICY deployment_import_staging_insert
ON public.deployment_import_staging
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_superadmin()
  OR (
    public.has_module_permission('deployments', 'modify')
    AND public.can_access_consultant(consultant_id)
  )
);

CREATE POLICY deployment_import_staging_update
ON public.deployment_import_staging
FOR UPDATE
TO authenticated
USING (
  public.is_superadmin()
  OR (
    public.has_module_permission('deployments', 'modify')
    AND public.can_access_consultant(consultant_id)
  )
)
WITH CHECK (
  public.is_superadmin()
  OR (
    public.has_module_permission('deployments', 'modify')
    AND public.can_access_consultant(consultant_id)
  )
);

CREATE POLICY deployment_import_staging_delete
ON public.deployment_import_staging
FOR DELETE
TO authenticated
USING (
  public.is_superadmin()
  OR (
    public.has_module_permission('deployments', 'modify')
    AND public.can_access_consultant(consultant_id)
  )
);