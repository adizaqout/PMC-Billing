DROP FUNCTION IF EXISTS public.save_deployment_lines(uuid, jsonb);

CREATE FUNCTION public.save_deployment_lines(p_submission_id uuid, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_inserted_count INTEGER := 0;
  v_input_count INTEGER;
BEGIN
  v_input_count := jsonb_array_length(p_lines);

  DELETE FROM deployment_lines WHERE submission_id = p_submission_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

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

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'input_count', v_input_count,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count,
    'success', v_inserted_count = v_input_count
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Save failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_deployment_lines(uuid, jsonb) TO authenticated;