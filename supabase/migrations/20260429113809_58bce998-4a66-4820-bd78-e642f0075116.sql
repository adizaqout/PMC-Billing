REVOKE EXECUTE ON FUNCTION public.dashboard_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_overview() TO authenticated;