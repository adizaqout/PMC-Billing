CREATE INDEX IF NOT EXISTS idx_deployment_lines_submission_id ON public.deployment_lines(submission_id);
CREATE INDEX IF NOT EXISTS idx_deployment_submissions_consultant_id ON public.deployment_submissions(consultant_id);
CREATE INDEX IF NOT EXISTS idx_deployment_submissions_month_type ON public.deployment_submissions(month, schedule_type);
CREATE INDEX IF NOT EXISTS idx_invoices_consultant_id ON public.invoices(consultant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_month ON public.invoices(invoice_month);
CREATE INDEX IF NOT EXISTS idx_employees_consultant_id ON public.employees(consultant_id);
CREATE INDEX IF NOT EXISTS idx_positions_consultant_id ON public.positions(consultant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_consultant_id ON public.purchase_orders(consultant_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_consultant_id ON public.service_orders(consultant_id);