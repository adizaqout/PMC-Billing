
-- 1. begin_deployment_import: clears existing lines for a submission (called ONCE before chunked import)
CREATE OR REPLACE FUNCTION public.begin_deployment_import(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM deployment_lines WHERE submission_id = p_submission_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- Also clear cache so UI shows empty during import
  DELETE FROM deployment_row_cache WHERE submission_id = p_submission_id;
  
  RETURN jsonb_build_object('deleted_lines', v_deleted, 'submission_id', p_submission_id);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_deployment_import(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.begin_deployment_import(uuid) TO authenticated;

-- 2. append_deployment_lines_chunk: inserts a chunk of lines WITHOUT deleting anything
CREATE OR REPLACE FUNCTION public.append_deployment_lines_chunk(p_submission_id uuid, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted integer;
  v_input_count integer;
BEGIN
  v_input_count := jsonb_array_length(p_lines);

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

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'input_count', v_input_count,
    'inserted_count', v_inserted,
    'success', v_inserted = v_input_count
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Chunk insert failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

REVOKE ALL ON FUNCTION public.append_deployment_lines_chunk(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.append_deployment_lines_chunk(uuid, jsonb) TO authenticated;

-- 3. finalize_deployment_import: refreshes cache after all chunks are inserted
CREATE OR REPLACE FUNCTION public.finalize_deployment_import(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line_count integer;
  v_distinct_rows integer;
  v_cache_result jsonb;
BEGIN
  -- Count totals for verification
  SELECT count(*) INTO v_line_count FROM deployment_lines WHERE submission_id = p_submission_id;
  SELECT count(DISTINCT excel_row_id) INTO v_distinct_rows FROM deployment_lines WHERE submission_id = p_submission_id;

  -- Refresh cache
  v_cache_result := public.refresh_deployment_row_cache(p_submission_id);

  RETURN jsonb_build_object(
    'total_lines', v_line_count,
    'distinct_excel_rows', v_distinct_rows,
    'cache_result', v_cache_result,
    'submission_id', p_submission_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_deployment_import(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.finalize_deployment_import(uuid) TO authenticated;
