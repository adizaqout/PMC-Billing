
-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'pmc_user', 'pmc_reviewer', 'aldar_team', 'viewer');
CREATE TYPE public.visibility_mode AS ENUM ('own_company_only', 'see_all_companies');
CREATE TYPE public.permission_level AS ENUM ('no_access', 'read', 'modify');
CREATE TYPE public.schedule_type AS ENUM ('baseline', 'actual', 'forecast', 'workload');
CREATE TYPE public.submission_status AS ENUM ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'returned');
CREATE TYPE public.period_status AS ENUM ('open', 'closed', 'locked');
CREATE TYPE public.invoice_status AS ENUM ('paid', 'pending', 'cancelled');
CREATE TYPE public.record_status AS ENUM ('active', 'inactive');

-- ============================================
-- CORE TABLES
-- ============================================

-- Consultants (companies)
CREATE TABLE public.consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  commercial_registration_no TEXT,
  tax_registration_no TEXT,
  address TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status public.record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES public.consultants(id),
  email TEXT NOT NULL,
  full_name TEXT,
  status public.record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Groups
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES public.consultants(id),
  name TEXT NOT NULL,
  visibility_mode public.visibility_mode NOT NULL DEFAULT 'own_company_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- User Roles (links profiles to groups with a role)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'pmc_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

-- Group Permissions (per module per group)
CREATE TABLE public.group_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  permission public.permission_level NOT NULL DEFAULT 'no_access',
  UNIQUE(group_id, module_name)
);

-- ============================================
-- MASTER DATA TABLES
-- ============================================

-- Framework Agreements
CREATE TABLE public.framework_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id),
  framework_agreement_no TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status public.record_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  entity TEXT,
  portfolio TEXT,
  latest_budget NUMERIC(18,2),
  latest_pmc_budget NUMERIC(18,2),
  previous_pmc_budget NUMERIC(18,2),
  previous_pmc_actual NUMERIC(18,2),
  actual_pmc_to_date NUMERIC(18,2),
  start_date DATE,
  end_date DATE,
  status public.record_status NOT NULL DEFAULT 'active',
  classification TEXT,
  project_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Service Orders
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id),
  framework_id UUID REFERENCES public.framework_agreements(id),
  so_number TEXT NOT NULL,
  so_start_date DATE,
  so_end_date DATE,
  so_value NUMERIC(18,2),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(consultant_id, so_number)
);

-- Purchase Orders
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id),
  so_id UUID REFERENCES public.service_orders(id),
  po_number TEXT NOT NULL UNIQUE,
  revision_number INT DEFAULT 0,
  po_reference TEXT,
  portfolio TEXT,
  type TEXT,
  po_start_date DATE,
  po_end_date DATE,
  po_value NUMERIC(18,2),
  status public.record_status NOT NULL DEFAULT 'active',
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Purchase Order Items
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id),
  po_item_ref TEXT,
  amount NUMERIC(18,2),
  invoiced_to_date NUMERIC(18,2) DEFAULT 0,
  latest_invoice_month TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id),
  invoice_number TEXT NOT NULL,
  invoice_month TEXT NOT NULL,
  po_id UUID REFERENCES public.purchase_orders(id),
  po_item_id UUID REFERENCES public.purchase_order_items(id),
  description TEXT,
  billed_amount_no_vat NUMERIC(18,2),
  cum_billed_amount_no_vat NUMERIC(18,2),
  paid_amount NUMERIC(18,2),
  check_flag BOOLEAN DEFAULT false,
  status public.invoice_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Positions (rate card)
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id),
  so_id UUID REFERENCES public.service_orders(id),
  position_name TEXT NOT NULL,
  total_years_of_exp INT,
  year_1_rate NUMERIC(18,2),
  year_2_rate NUMERIC(18,2),
  year_3_rate NUMERIC(18,2),
  year_4_rate NUMERIC(18,2),
  year_5_rate NUMERIC(18,2),
  effective_from DATE,
  effective_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- Employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id),
  employee_name TEXT NOT NULL,
  position_id UUID REFERENCES public.positions(id),
  experience_years INT,
  status public.record_status NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- DEPLOYMENT TABLES
-- ============================================

-- Period Control
CREATE TABLE public.period_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL UNIQUE,
  status public.period_status NOT NULL DEFAULT 'open',
  opened_by UUID REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deployment Submissions (header)
CREATE TABLE public.deployment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES public.consultants(id),
  month TEXT NOT NULL,
  schedule_type public.schedule_type NOT NULL,
  revision_no INT NOT NULL DEFAULT 1,
  status public.submission_status NOT NULL DEFAULT 'draft',
  submitted_by UUID REFERENCES auth.users(id),
  submitted_on TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_on TIMESTAMPTZ,
  revision_reason TEXT,
  reviewer_comments TEXT,
  period_locked_flag BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(consultant_id, month, schedule_type, revision_no)
);

-- Deployment Lines
CREATE TABLE public.deployment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.deployment_submissions(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  billed_project_id UUID REFERENCES public.projects(id),
  worked_project_id UUID REFERENCES public.projects(id),
  so_id UUID REFERENCES public.service_orders(id),
  po_id UUID REFERENCES public.purchase_orders(id),
  po_item_id UUID REFERENCES public.purchase_order_items(id),
  allocation_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
  derived_monthly_rate NUMERIC(18,2),
  derived_cost NUMERIC(18,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- WORKFLOW & NOTIFICATIONS
-- ============================================

-- Workflow Config
CREATE TABLE public.workflow_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_type public.schedule_type NOT NULL,
  apply_scope public.visibility_mode NOT NULL DEFAULT 'own_company_only',
  step1_role public.app_role NOT NULL DEFAULT 'pmc_user',
  step2_role public.app_role NOT NULL DEFAULT 'pmc_reviewer',
  step3_role public.app_role NOT NULL DEFAULT 'aldar_team',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schedule_type)
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Log
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_consultant_id ON public.profiles(consultant_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_group_id ON public.user_roles(group_id);
CREATE INDEX idx_group_permissions_group_id ON public.group_permissions(group_id);
CREATE INDEX idx_employees_consultant_id ON public.employees(consultant_id);
CREATE INDEX idx_deployment_submissions_consultant_month ON public.deployment_submissions(consultant_id, month);
CREATE INDEX idx_deployment_lines_submission_id ON public.deployment_lines(submission_id);
CREATE INDEX idx_deployment_lines_employee_id ON public.deployment_lines(employee_id);
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_user_id, read);
CREATE INDEX idx_invoices_consultant ON public.invoices(consultant_id);
CREATE INDEX idx_service_orders_consultant ON public.service_orders(consultant_id);
CREATE INDEX idx_purchase_orders_consultant ON public.purchase_orders(consultant_id);

-- ============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================

-- Check if current user is superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'superadmin'
  );
$$;

-- Get user's profile
CREATE OR REPLACE FUNCTION public.get_user_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Get user's consultant_id
CREATE OR REPLACE FUNCTION public.get_user_consultant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT consultant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Check if user can access a given consultant's data
CREATE OR REPLACE FUNCTION public.can_access_consultant(target_consultant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.groups g ON ur.group_id = g.id
    WHERE ur.user_id = auth.uid()
    AND (
      g.visibility_mode = 'see_all_companies'
      OR g.consultant_id = target_consultant_id
    )
  )
  OR public.is_superadmin();
$$;

-- Check if user has a specific module permission
CREATE OR REPLACE FUNCTION public.has_module_permission(p_module TEXT, p_level public.permission_level)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_permissions gp
    JOIN public.user_roles ur ON gp.group_id = ur.group_id
    WHERE ur.user_id = auth.uid()
    AND gp.module_name = p_module
    AND (
      gp.permission = p_level
      OR (p_level = 'read' AND gp.permission = 'modify')
    )
  )
  OR public.is_superadmin();
$$;

-- Get consultant_id from deployment_submissions
CREATE OR REPLACE FUNCTION public.get_submission_consultant_id(p_submission_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT consultant_id FROM public.deployment_submissions WHERE id = p_submission_id;
$$;

-- Get consultant_id from purchase_orders
CREATE OR REPLACE FUNCTION public.get_po_consultant_id(p_po_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT consultant_id FROM public.purchase_orders WHERE id = p_po_id;
$$;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_consultants_updated_at BEFORE UPDATE ON public.consultants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_framework_agreements_updated_at BEFORE UPDATE ON public.framework_agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_orders_updated_at BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_order_items_updated_at BEFORE UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_period_control_updated_at BEFORE UPDATE ON public.period_control FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deployment_submissions_updated_at BEFORE UPDATE ON public.deployment_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deployment_lines_updated_at BEFORE UPDATE ON public.deployment_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workflow_config_updated_at BEFORE UPDATE ON public.workflow_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE public.consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- PROFILES
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_superadmin() OR user_id = auth.uid() OR public.can_access_consultant(consultant_id));
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR user_id = auth.uid());

-- CONSULTANTS
CREATE POLICY "consultants_select" ON public.consultants FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(id));
CREATE POLICY "consultants_insert" ON public.consultants FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "consultants_update" ON public.consultants FOR UPDATE TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "consultants_delete" ON public.consultants FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- GROUPS
CREATE POLICY "groups_select" ON public.groups FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "groups_insert" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "groups_update" ON public.groups FOR UPDATE TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "groups_delete" ON public.groups FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- USER_ROLES
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_superadmin() OR user_id = auth.uid());
CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "user_roles_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- GROUP_PERMISSIONS
CREATE POLICY "group_permissions_select" ON public.group_permissions FOR SELECT TO authenticated
  USING (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.group_id = group_permissions.group_id
  ));
CREATE POLICY "group_permissions_insert" ON public.group_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "group_permissions_update" ON public.group_permissions FOR UPDATE TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "group_permissions_delete" ON public.group_permissions FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- FRAMEWORK_AGREEMENTS
CREATE POLICY "fa_select" ON public.framework_agreements FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "fa_insert" ON public.framework_agreements FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('framework_agreements', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "fa_update" ON public.framework_agreements FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('framework_agreements', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "fa_delete" ON public.framework_agreements FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- PROJECTS (global, not consultant-scoped for SELECT)
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR public.has_module_permission('projects', 'modify'));
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR public.has_module_permission('projects', 'modify'));
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- SERVICE_ORDERS
CREATE POLICY "so_select" ON public.service_orders FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "so_insert" ON public.service_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('service_orders', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "so_update" ON public.service_orders FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('service_orders', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "so_delete" ON public.service_orders FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- PURCHASE_ORDERS
CREATE POLICY "po_select" ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "po_insert" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('purchase_orders', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "po_update" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('purchase_orders', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "po_delete" ON public.purchase_orders FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- PURCHASE_ORDER_ITEMS
CREATE POLICY "poi_select" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(public.get_po_consultant_id(po_id)));
CREATE POLICY "poi_insert" ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('purchase_orders', 'modify') AND public.can_access_consultant(public.get_po_consultant_id(po_id))));
CREATE POLICY "poi_update" ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('purchase_orders', 'modify') AND public.can_access_consultant(public.get_po_consultant_id(po_id))));
CREATE POLICY "poi_delete" ON public.purchase_order_items FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- INVOICES
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('invoices', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('invoices', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- POSITIONS
CREATE POLICY "positions_select" ON public.positions FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "positions_insert" ON public.positions FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('positions', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "positions_update" ON public.positions FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('positions', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "positions_delete" ON public.positions FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- EMPLOYEES
CREATE POLICY "employees_select" ON public.employees FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "employees_insert" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('employees', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "employees_update" ON public.employees FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('employees', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "employees_delete" ON public.employees FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- PERIOD_CONTROL
CREATE POLICY "period_select" ON public.period_control FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "period_insert" ON public.period_control FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "period_update" ON public.period_control FOR UPDATE TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "period_delete" ON public.period_control FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- DEPLOYMENT_SUBMISSIONS
CREATE POLICY "ds_select" ON public.deployment_submissions FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(consultant_id));
CREATE POLICY "ds_insert" ON public.deployment_submissions FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('deployments', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "ds_update" ON public.deployment_submissions FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('deployments', 'modify') AND public.can_access_consultant(consultant_id)));
CREATE POLICY "ds_delete" ON public.deployment_submissions FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- DEPLOYMENT_LINES
CREATE POLICY "dl_select" ON public.deployment_lines FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.can_access_consultant(public.get_submission_consultant_id(submission_id)));
CREATE POLICY "dl_insert" ON public.deployment_lines FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR (public.has_module_permission('deployments', 'modify') AND public.can_access_consultant(public.get_submission_consultant_id(submission_id))));
CREATE POLICY "dl_update" ON public.deployment_lines FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR (public.has_module_permission('deployments', 'modify') AND public.can_access_consultant(public.get_submission_consultant_id(submission_id))));
CREATE POLICY "dl_delete" ON public.deployment_lines FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- WORKFLOW_CONFIG
CREATE POLICY "wf_select" ON public.workflow_config FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "wf_insert" ON public.workflow_config FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());
CREATE POLICY "wf_update" ON public.workflow_config FOR UPDATE TO authenticated
  USING (public.is_superadmin());

-- NOTIFICATIONS
CREATE POLICY "notif_select" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_superadmin() OR recipient_user_id = auth.uid());
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR recipient_user_id = auth.uid());

-- AUDIT_LOGS
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_superadmin());
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================
-- SEED DEFAULT WORKFLOW CONFIG
-- ============================================
INSERT INTO public.workflow_config (schedule_type, step1_role, step2_role, step3_role, enabled)
VALUES
  ('baseline', 'pmc_user', 'pmc_reviewer', 'aldar_team', true),
  ('actual', 'pmc_user', 'pmc_reviewer', 'aldar_team', true),
  ('forecast', 'pmc_user', 'pmc_reviewer', 'aldar_team', true),
  ('workload', 'pmc_user', 'pmc_reviewer', 'aldar_team', true);
