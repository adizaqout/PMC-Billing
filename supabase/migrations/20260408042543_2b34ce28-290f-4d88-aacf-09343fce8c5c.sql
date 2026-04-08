
-- Composite covering index for optimized deployment_lines queries
CREATE INDEX IF NOT EXISTS idx_deployment_lines_submission_excel
ON public.deployment_lines(submission_id, excel_row_id)
INCLUDE (employee_id, worked_project_id, allocation_pct, man_months, rate_year, notes, po_id, so_id);

-- Transactional save function: atomic delete + insert
CREATE OR REPLACE FUNCTION public.save_deployment_lines(
  p_submission_id UUID,
  p_lines JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete existing lines for this submission
  DELETE FROM deployment_lines
  WHERE submission_id = p_submission_id;

  -- Insert new lines from JSONB array
  INSERT INTO deployment_lines (
    submission_id, consultant_id, employee_id, worked_project_id,
    billed_project_id, po_id, po_item_id, so_id,
    allocation_pct, rate_year, man_months, notes, excel_row_id
  )
  SELECT
    p_submission_id,
    (line->>'consultant_id')::UUID,
    NULLIF(line->>'employee_id', '')::UUID,
    NULLIF(line->>'worked_project_id', '')::UUID,
    NULLIF(line->>'billed_project_id', '')::UUID,
    NULLIF(line->>'po_id', '')::UUID,
    NULLIF(line->>'po_item_id', '')::UUID,
    NULLIF(line->>'so_id', '')::UUID,
    COALESCE((line->>'allocation_pct')::NUMERIC, 0),
    (line->>'rate_year')::INTEGER,
    COALESCE((line->>'man_months')::NUMERIC, 0),
    line->>'notes',
    NULLIF(line->>'excel_row_id', '')
  FROM jsonb_array_elements(p_lines) AS line;
END;
$$;

-- Analyze to update planner statistics
ANALYZE public.deployment_lines;
