CREATE OR REPLACE FUNCTION public.get_deployment_rows(p_submission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_data ORDER BY (row_data->>'excel_row_id')), '[]'::jsonb)
  INTO result
  FROM (
    SELECT jsonb_build_object(
      'excel_row_id', grp_key,
      'employee_id', max(dl.employee_id::text),
      'po_id', max(dl.po_id::text),
      'so_id', max(dl.so_id::text),
      'rate_year', max(dl.rate_year),
      'man_months', max(dl.man_months),
      'notes', max(dl.notes),
      'allocations', jsonb_object_agg(
        coalesce(dl.worked_project_id::text, coalesce(dl.billed_project_id::text, '__none__')),
        dl.allocation_pct
      ),
      'total_pct', sum(dl.allocation_pct)
    ) AS row_data
    FROM deployment_lines dl,
    LATERAL (SELECT coalesce(dl.excel_row_id, '__legacy_' || dl.employee_id::text || '|' || coalesce(dl.notes, '')) AS grp_key) k
    WHERE dl.submission_id = p_submission_id
    GROUP BY grp_key
  ) sub;

  RETURN result;
END;
$$;