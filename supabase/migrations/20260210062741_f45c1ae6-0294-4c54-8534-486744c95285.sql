
-- Fix overly permissive INSERT policies
-- Notifications: only authenticated users can insert, and only for valid recipients
DROP POLICY "notif_insert" ON public.notifications;
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR public.has_module_permission('deployments', 'modify'));

-- Audit logs: only the system (via security definer functions) should insert
DROP POLICY "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
