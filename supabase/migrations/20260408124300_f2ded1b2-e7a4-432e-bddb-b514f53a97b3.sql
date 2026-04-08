-- Fix persist_deployment_staging_snapshot to handle large datasets (100K+ rows)
-- by extending statement timeout and batching inserts
CREATE OR REPLACE FUNCTION public.persist_deployment_staging_snapshot(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
DECLARE
  v_session_id uuid;
  v_staging_line_count integer := 0;
  v_staging_distinct_rows integer := 0;
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
  v_batch_inserted integer := 0;
  v_deployment_distinct_rows integer := 0;
  v_cache_result jsonb;
  v_cache_rows integer := 0;
  v_batch_size integer := 5000;
  v_offset integer := 0;
BEGIN
  PERFORM public.assert_can_modify_deployment_submission(p_submission_id);
  PERFORM public.ensure_deployment_import_session(p_submission_id);

  SELECT staging_import_session_id
  INTO v_session_id
  FROM public.deployment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'No staging session available for submission %', p_submission_id;
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT excel_row_id)
  INTO v_staging_line_count, v_staging_distinct_rows
  FROM public.deployment_import_staging
  WHERE submission_id = p_submission_id
    AND import_session_id = v_session_id;

  DELETE FROM public.deployment_lines
  WHERE submission_id = p_submission_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Batch insert from staging to deployment_lines in chunks of 5000
  LOOP
    INSERT INTO public.deployment_lines (
      submission_id,
      consultant_id,
      employee_id,
      worked_project_id,
      billed_project_id,
      po_id,
      po_item_id,
      so_id,
      allocation_pct,
      rate_year,
      man_months,
      notes,
      excel_row_id,
      derived_monthly_rate,
      derived_cost
    )
    SELECT
      submission_id,
      consultant_id,
      employee_id,
      worked_project_id,
      billed_project_id,
      po_id,
      po_item_id,
      so_id,
      allocation_pct,
      rate_year,
      man_months,
      notes,
      excel_row_id,
      derived_monthly_rate,
      derived_cost
    FROM public.deployment_import_staging
    WHERE submission_id = p_submission_id
      AND import_session_id = v_session_id
    ORDER BY excel_row_id, raw_line_id
    LIMIT v_batch_size
    OFFSET v_offset;

    GET DIAGNOSTICS v_batch_inserted = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_batch_inserted;
    v_offset := v_offset + v_batch_size;

    EXIT WHEN v_batch_inserted < v_batch_size;
  END LOOP;

  SELECT COUNT(DISTINCT excel_row_id)
  INTO v_deployment_distinct_rows
  FROM public.deployment_lines
  WHERE submission_id = p_submission_id;

  v_cache_result := public.refresh_deployment_row_cache(p_submission_id);

  SELECT COUNT(*)
  INTO v_cache_rows
  FROM public.deployment_row_cache
  WHERE submission_id = p_submission_id;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'import_session_id', v_session_id,
    'staging_line_count', v_staging_line_count,
    'staging_distinct_excel_rows', v_staging_distinct_rows,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count,
    'deployment_lines_count', v_inserted_count,
    'deployment_lines_distinct_excel_rows', v_deployment_distinct_rows,
    'cache_rows', v_cache_rows,
    'cache_result', v_cache_result,
    'success', v_inserted_count = v_staging_line_count
  );
END;
$function$;

-- Set longer timeout on save_deployment_lines
CREATE OR REPLACE FUNCTION public.save_deployment_lines(p_submission_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
DECLARE
  v_session_id uuid;
  v_consultant_id uuid;
  v_input_count integer := 0;
  v_inserted_count integer := 0;
  v_result jsonb;
BEGIN
  v_consultant_id := public.assert_can_modify_deployment_submission(p_submission_id);

  v_session_id := gen_random_uuid();
  v_input_count := COALESCE(jsonb_array_length(p_lines), 0);

  DELETE FROM public.deployment_import_staging
  WHERE submission_id = p_submission_id;

  UPDATE public.deployment_submissions
  SET staging_import_session_id = v_session_id,
      updated_at = now()
  WHERE id = p_submission_id;

  INSERT INTO public.deployment_import_staging (
    submission_id, import_session_id, raw_line_id, consultant_id, employee_id,
    billed_project_id, worked_project_id, so_id, po_id, po_item_id,
    allocation_pct, derived_monthly_rate, derived_cost, notes,
    rate_year, man_months, excel_row_id, updated_at
  )
  SELECT
    p_submission_id, v_session_id,
    COALESCE(
      NULLIF(line->>'raw_line_id', ''),
      public.normalize_deployment_excel_row_id(line->>'excel_row_id', NULLIF(line->>'employee_id', '')::uuid, line->>'notes')
        || '__' || LPAD(ord::text, 6, '0')
    ),
    COALESCE(NULLIF(line->>'consultant_id', '')::uuid, v_consultant_id),
    NULLIF(line->>'employee_id', '')::uuid,
    NULLIF(line->>'billed_project_id', '')::uuid,
    NULLIF(line->>'worked_project_id', '')::uuid,
    NULLIF(line->>'so_id', '')::uuid,
    NULLIF(line->>'po_id', '')::uuid,
    NULLIF(line->>'po_item_id', '')::uuid,
    COALESCE((line->>'allocation_pct')::numeric, 0),
    NULLIF(line->>'derived_monthly_rate', '')::numeric,
    NULLIF(line->>'derived_cost', '')::numeric,
    line->>'notes',
    NULLIF(line->>'rate_year', '')::integer,
    COALESCE(NULLIF(line->>'man_months', '')::numeric, 0),
    public.normalize_deployment_excel_row_id(line->>'excel_row_id', NULLIF(line->>'employee_id', '')::uuid, line->>'notes'),
    now()
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS payload(line, ord);

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  v_result := public.persist_deployment_staging_snapshot(p_submission_id);

  RETURN v_result || jsonb_build_object(
    'input_count', v_input_count,
    'staged_inserted_count', v_inserted_count
  );
END;
$function$;

-- Set longer timeout on refresh_deployment_row_cache
CREATE OR REPLACE FUNCTION public.refresh_deployment_row_cache(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
DECLARE
  v_deleted integer;
  v_inserted integer;
  v_sub record;
BEGIN
  SELECT id, month, consultant_id INTO v_sub
  FROM deployment_submissions WHERE id = p_submission_id;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('error', 'Submission not found');
  END IF;

  DELETE FROM deployment_row_cache WHERE submission_id = p_submission_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO deployment_row_cache (
    submission_id, excel_row_id, month, employee_id, employee_name,
    position_id, position_name, rate, man_months,
    allocations, total_pct, validation_error, sort_order,
    so_id, po_id, rate_year
  )
  SELECT
    p_submission_id, grp_key,
    coalesce(substring(max(dl.notes) from 'month:([^|]+)'), v_sub.month),
    (max(dl.employee_id::text))::uuid,
    max(e.employee_name),
    (max(e.position_id::text))::uuid,
    max(pos.position_name),
    null::numeric,
    max(dl.man_months),
    jsonb_object_agg(
      coalesce(dl.worked_project_id::text, coalesce(dl.billed_project_id::text, '__none__')),
      dl.allocation_pct
    ) - '__none__',
    sum(dl.allocation_pct),
    CASE WHEN abs(sum(dl.allocation_pct) - 100) > 0.5 
      THEN 'Allocation sums to ' || round(sum(dl.allocation_pct)::numeric, 1) || '%, must be 100%'
      ELSE null
    END,
    row_number() OVER (ORDER BY grp_key),
    (max(dl.so_id::text))::uuid,
    (max(dl.po_id::text))::uuid,
    max(dl.rate_year)
  FROM deployment_lines dl
  CROSS JOIN LATERAL (
    SELECT coalesce(dl.excel_row_id, '__legacy_' || dl.employee_id::text || '|' || coalesce(dl.notes, '')) AS grp_key
  ) k
  LEFT JOIN employees e ON e.id = dl.employee_id
  LEFT JOIN positions pos ON pos.id = e.position_id
  WHERE dl.submission_id = p_submission_id
  GROUP BY grp_key;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE deployment_row_cache drc
  SET rate = CASE drc.rate_year
    WHEN 1 THEN pos.year_1_rate
    WHEN 2 THEN pos.year_2_rate
    WHEN 3 THEN pos.year_3_rate
    WHEN 4 THEN pos.year_4_rate
    WHEN 5 THEN pos.year_5_rate
    ELSE pos.year_1_rate
  END
  FROM positions pos
  WHERE drc.submission_id = p_submission_id
    AND drc.position_id = pos.id;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'inserted', v_inserted,
    'submission_id', p_submission_id
  );
END;
$function$;

-- Set longer timeout on finalize
CREATE OR REPLACE FUNCTION public.finalize_deployment_import(p_submission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '300s'
AS $function$
BEGIN
  RETURN public.persist_deployment_staging_snapshot(p_submission_id);
END;
$function$;

-- Set timeout on append chunk
CREATE OR REPLACE FUNCTION public.append_deployment_lines_chunk(p_submission_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_session_id uuid;
  v_consultant_id uuid;
  v_inserted integer := 0;
  v_input_count integer := 0;
BEGIN
  v_consultant_id := public.assert_can_modify_deployment_submission(p_submission_id);

  SELECT staging_import_session_id INTO v_session_id
  FROM public.deployment_submissions WHERE id = p_submission_id;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'No active import session for submission %', p_submission_id;
  END IF;

  v_input_count := COALESCE(jsonb_array_length(p_lines), 0);

  INSERT INTO public.deployment_import_staging (
    submission_id, import_session_id, raw_line_id, consultant_id, employee_id,
    billed_project_id, worked_project_id, so_id, po_id, po_item_id,
    allocation_pct, derived_monthly_rate, derived_cost, notes,
    rate_year, man_months, excel_row_id, updated_at
  )
  SELECT
    p_submission_id, v_session_id,
    COALESCE(
      NULLIF(line->>'raw_line_id', ''),
      public.normalize_deployment_excel_row_id(line->>'excel_row_id', NULLIF(line->>'employee_id', '')::uuid, line->>'notes')
        || '__' || LPAD(ord::text, 6, '0')
    ),
    COALESCE(NULLIF(line->>'consultant_id', '')::uuid, v_consultant_id),
    NULLIF(line->>'employee_id', '')::uuid,
    NULLIF(line->>'billed_project_id', '')::uuid,
    NULLIF(line->>'worked_project_id', '')::uuid,
    NULLIF(line->>'so_id', '')::uuid,
    NULLIF(line->>'po_id', '')::uuid,
    NULLIF(line->>'po_item_id', '')::uuid,
    COALESCE((line->>'allocation_pct')::numeric, 0),
    NULLIF(line->>'derived_monthly_rate', '')::numeric,
    NULLIF(line->>'derived_cost', '')::numeric,
    line->>'notes',
    NULLIF(line->>'rate_year', '')::integer,
    COALESCE(NULLIF(line->>'man_months', '')::numeric, 0),
    public.normalize_deployment_excel_row_id(line->>'excel_row_id', NULLIF(line->>'employee_id', '')::uuid, line->>'notes'),
    now()
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS payload(line, ord);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'import_session_id', v_session_id,
    'input_count', v_input_count,
    'inserted_count', v_inserted,
    'success', v_inserted = v_input_count
  );
END;
$function$;