ALTER TABLE public.deployment_lines ADD COLUMN excel_row_id TEXT;
CREATE INDEX idx_deployment_lines_excel_row_id ON public.deployment_lines(excel_row_id);