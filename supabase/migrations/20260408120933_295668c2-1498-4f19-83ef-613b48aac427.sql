ALTER TABLE public.deployment_submissions
ADD COLUMN IF NOT EXISTS staging_import_session_id uuid;

CREATE TABLE IF NOT EXISTS public.deployment_import_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.deployment_submissions(id) ON DELETE CASCADE,
  import_session_id uuid NOT NULL,
  raw_line_id text NOT NULL,
  consultant_id uuid NOT NULL,
  employee_id uuid NULL,
  billed_project_id uuid NULL,
  worked_project_id uuid NULL,
  so_id uuid NULL,
  po_id uuid NULL,
  po_item_id uuid NULL,
  allocation_pct numeric NOT NULL DEFAULT 0,
  derived_monthly_rate numeric NULL,
  derived_cost numeric NULL,
  notes text NULL,
  rate_year integer NULL,
  man_months numeric NULL DEFAULT 0,
  excel_row_id text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT deployment_import_staging_session_line_key UNIQUE (submission_id, import_session_id, raw_line_id)
);

CREATE INDEX IF NOT EXISTS idx_deployment_import_staging_submission_session
  ON public.deployment_import_staging (submission_id, import_session_id);

CREATE INDEX IF NOT EXISTS idx_deployment_import_staging_submission_session_excel_row
  ON public.deployment_import_staging (submission_id, import_session_id, excel_row_id);

CREATE INDEX IF NOT EXISTS idx_deployment_submissions_staging_session
  ON public.deployment_submissions (staging_import_session_id);

ALTER TABLE public.deployment_import_staging ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.normalize_deployment_excel_row_id(
  p_excel_row_id text,
  p_employee_id uuid,
  p_notes text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(p_excel_row_id, ''),
    '__legacy_' || COALESCE(p_employee_id::text, 'none') || '|' || COALESCE(p_notes, '')
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_can_modify_deployment_submission(p_submission_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consultant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT consultant_id INTO v_consultant_id
  FROM public.deployment_submissions
  WHERE id = p_submission_id;

  IF v_consultant_id IS NULL THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR (
      public.has_module_permission('deployments', 'modify')
      AND public.can_access_consultant(v_consultant_id)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to modify this submission';
  END IF;

  RETURN v_consultant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_deployment_import_session(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_copied_count integer := 0;
  v_has_staging boolean := false;
BEGIN
  PERFORM public.assert_can_modify_deployment_submission(p_submission_id);

  SELECT staging_import_session_id
  INTO v_session_id
  FROM public.deployment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    v_session_id := gen_random_uuid();
    UPDATE public.deployment_submissions
    SET staging_import_session_id = v_session_id,
        updated_at = now()
    WHERE id = p_submission_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.deployment_import_staging
    WHERE submission_id = p_submission_id
      AND import_session_id = v_session_id
  ) INTO v_has_staging;

  IF NOT v_has_staging THEN
    INSERT INTO public.deployment_import_staging (
      submission_id,
      import_session_id,
      raw_line_id,
      consultant_id,
      employee_id,
      billed_project_id,
      worked_project_id,
      so_id,
      po_id,
      po_item_id,
      allocation_pct,
      derived_monthly_rate,
      derived_cost,
      notes,
      rate_year,
      man_months,
      excel_row_id
    )
    SELECT
      dl.submission_id,
      v_session_id,
      public.normalize_deployment_excel_row_id(dl.excel_row_id, dl.employee_id, dl.notes)
        || '__'
        || LPAD(
          ROW_NUMBER() OVER (
            PARTITION BY public.normalize_deployment_excel_row_id(dl.excel_row_id, dl.employee_id, dl.notes)
            ORDER BY dl.id
          )::text,
          6,
          '0'
        ),
      dl.consultant_id,
      dl.employee_id,
      dl.billed_project_id,
      dl.worked_project_id,
      dl.so_id,
      dl.po_id,
      dl.po_item_id,
      dl.allocation_pct,
      dl.derived_monthly_rate,
      dl.derived_cost,
      dl.notes,
      dl.rate_year,
      dl.man_months,
      public.normalize_deployment_excel_row_id(dl.excel_row_id, dl.employee_id, dl.notes)
    FROM public.deployment_lines dl
    WHERE dl.submission_id = p_submission_id;

    GET DIAGNOSTICS v_copied_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'import_session_id', v_session_id,
    'copied_line_count', v_copied_count,
    'has_staging_snapshot', v_has_staging OR v_copied_count > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_deployment_import(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_deleted_count integer := 0;
BEGIN
  PERFORM public.assert_can_modify_deployment_submission(p_submission_id);

  v_session_id := gen_random_uuid();

  DELETE FROM public.deployment_import_staging
  WHERE submission_id = p_submission_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  UPDATE public.deployment_submissions
  SET staging_import_session_id = v_session_id,
      updated_at = now()
  WHERE id = p_submission_id;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'import_session_id', v_session_id,
    'deleted_staging_lines', v_deleted_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.append_deployment_lines_chunk(p_submission_id uuid, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_consultant_id uuid;
  v_inserted integer := 0;
  v_input_count integer := 0;
BEGIN
  v_consultant_id := public.assert_can_modify_deployment_submission(p_submission_id);

  SELECT staging_import_session_id
  INTO v_session_id
  FROM public.deployment_submissions
  WHERE id = p_submission_id;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'No active import session for submission %', p_submission_id;
  END IF;

  v_input_count := COALESCE(jsonb_array_length(p_lines), 0);

  INSERT INTO public.deployment_import_staging (
    submission_id,
    import_session_id,
    raw_line_id,
    consultant_id,
    employee_id,
    billed_project_id,
    worked_project_id,
    so_id,
    po_id,
    po_item_id,
    allocation_pct,
    derived_monthly_rate,
    derived_cost,
    notes,
    rate_year,
    man_months,
    excel_row_id,
    updated_at
  )
  SELECT
    p_submission_id,
    v_session_id,
    COALESCE(
      NULLIF(line->>'raw_line_id', ''),
      public.normalize_deployment_excel_row_id(line->>'excel_row_id', NULLIF(line->>'employee_id', '')::uuid, line->>'notes')
        || '__'
        || LPAD(ord::text, 6, '0')
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
$$;

CREATE OR REPLACE FUNCTION public.replace_deployment_staging_page_rows(
  p_submission_id uuid,
  p_original_excel_row_ids text[],
  p_row_sets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_consultant_id uuid;
  v_deleted_lines integer := 0;
  v_inserted_lines integer := 0;
  v_inserted_batch integer := 0;
  v_updated_rows integer := 0;
  v_row_set jsonb;
  v_excel_row_id text;
BEGIN
  v_consultant_id := public.assert_can_modify_deployment_submission(p_submission_id);

  PERFORM public.ensure_deployment_import_session(p_submission_id);

  SELECT staging_import_session_id
  INTO v_session_id
  FROM public.deployment_submissions
  WHERE id = p_submission_id;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'No staging session available for submission %', p_submission_id;
  END IF;

  DELETE FROM public.deployment_import_staging
  WHERE submission_id = p_submission_id
    AND import_session_id = v_session_id
    AND excel_row_id = ANY(COALESCE(p_original_excel_row_ids, ARRAY[]::text[]));
  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;

  FOR v_row_set IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_row_sets, '[]'::jsonb))
  LOOP
    v_excel_row_id := public.normalize_deployment_excel_row_id(
      v_row_set->>'excel_row_id',
      NULL,
      NULL
    );

    IF v_excel_row_id IS NULL OR v_excel_row_id = '__legacy_none|' THEN
      RAISE EXCEPTION 'Each staged row set must include excel_row_id';
    END IF;

    INSERT INTO public.deployment_import_staging (
      submission_id,
      import_session_id,
      raw_line_id,
      consultant_id,
      employee_id,
      billed_project_id,
      worked_project_id,
      so_id,
      po_id,
      po_item_id,
      allocation_pct,
      derived_monthly_rate,
      derived_cost,
      notes,
      rate_year,
      man_months,
      excel_row_id,
      updated_at
    )
    SELECT
      p_submission_id,
      v_session_id,
      COALESCE(
        NULLIF(line->>'raw_line_id', ''),
        v_excel_row_id || '__' || LPAD(ord::text, 6, '0')
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
      v_excel_row_id,
      now()
    FROM jsonb_array_elements(COALESCE(v_row_set->'lines', '[]'::jsonb)) WITH ORDINALITY AS payload(line, ord);

    GET DIAGNOSTICS v_inserted_batch = ROW_COUNT;
    v_inserted_lines := v_inserted_lines + v_inserted_batch;
    v_updated_rows := v_updated_rows + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'submission_id', p_submission_id,
    'import_session_id', v_session_id,
    'deleted_line_count', v_deleted_lines,
    'inserted_line_count', v_inserted_lines,
    'updated_row_count', v_updated_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_deployment_staging_snapshot(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_staging_line_count integer := 0;
  v_staging_distinct_rows integer := 0;
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
  v_deployment_distinct_rows integer := 0;
  v_cache_result jsonb;
  v_cache_rows integer := 0;
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
  ORDER BY excel_row_id, raw_line_id;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

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
$$;

CREATE OR REPLACE FUNCTION public.finalize_deployment_import(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.persist_deployment_staging_snapshot(p_submission_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_deployment_lines(p_submission_id uuid, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    submission_id,
    import_session_id,
    raw_line_id,
    consultant_id,
    employee_id,
    billed_project_id,
    worked_project_id,
    so_id,
    po_id,
    po_item_id,
    allocation_pct,
    derived_monthly_rate,
    derived_cost,
    notes,
    rate_year,
    man_months,
    excel_row_id,
    updated_at
  )
  SELECT
    p_submission_id,
    v_session_id,
    COALESCE(
      NULLIF(line->>'raw_line_id', ''),
      public.normalize_deployment_excel_row_id(line->>'excel_row_id', NULLIF(line->>'employee_id', '')::uuid, line->>'notes')
        || '__'
        || LPAD(ord::text, 6, '0')
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
$$;