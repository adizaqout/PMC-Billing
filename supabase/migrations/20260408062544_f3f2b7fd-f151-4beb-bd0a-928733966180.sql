
CREATE OR REPLACE FUNCTION public.refresh_deployment_row_cache(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    p_submission_id,
    grp_key,
    coalesce(
      substring(max(dl.notes) from 'month:([^|]+)'),
      v_sub.month
    ),
    (max(dl.employee_id::text))::uuid,
    max(e.employee_name),
    max(e.position_id),
    max(pos.position_name),
    max(
      CASE (max(dl.rate_year) OVER (PARTITION BY grp_key))
        WHEN 1 THEN pos.year_1_rate
        WHEN 2 THEN pos.year_2_rate
        WHEN 3 THEN pos.year_3_rate
        WHEN 4 THEN pos.year_4_rate
        WHEN 5 THEN pos.year_5_rate
        ELSE pos.year_1_rate
      END
    ),
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
    SELECT coalesce(
      dl.excel_row_id,
      '__legacy_' || dl.employee_id::text || '|' || coalesce(dl.notes, '')
    ) AS grp_key
  ) k
  LEFT JOIN employees e ON e.id = dl.employee_id
  LEFT JOIN positions pos ON pos.id = e.position_id
  WHERE dl.submission_id = p_submission_id
  GROUP BY grp_key;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'inserted', v_inserted,
    'submission_id', p_submission_id
  );
END;
$$;
