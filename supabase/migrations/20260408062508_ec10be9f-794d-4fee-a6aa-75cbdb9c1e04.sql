
-- Create deployment_row_cache table
CREATE TABLE public.deployment_row_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  excel_row_id text NOT NULL,
  month text,
  employee_id uuid,
  employee_name text,
  position_id uuid,
  position_name text,
  rate numeric,
  man_months numeric DEFAULT 0,
  allocations jsonb DEFAULT '{}'::jsonb,
  total_pct numeric DEFAULT 0,
  validation_error text,
  sort_order integer DEFAULT 0,
  so_id uuid,
  po_id uuid,
  rate_year integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on (submission_id, excel_row_id)
CREATE UNIQUE INDEX idx_drc_submission_row ON public.deployment_row_cache (submission_id, excel_row_id);

-- Fetch index for paginated reads
CREATE INDEX idx_drc_submission_sort ON public.deployment_row_cache (submission_id, sort_order);

-- Enable RLS
ALTER TABLE public.deployment_row_cache ENABLE ROW LEVEL SECURITY;

-- RLS: read access for authenticated users who can access the consultant
CREATE POLICY drc_select ON public.deployment_row_cache
  FOR SELECT TO authenticated
  USING (
    is_superadmin() OR can_access_consultant(
      (SELECT consultant_id FROM public.deployment_submissions WHERE id = deployment_row_cache.submission_id)
    )
  );

-- RLS: insert/update/delete only via SECURITY DEFINER functions
CREATE POLICY drc_modify ON public.deployment_row_cache
  FOR ALL TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Create the refresh function
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
  -- Get submission info
  SELECT id, month, consultant_id INTO v_sub
  FROM deployment_submissions WHERE id = p_submission_id;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('error', 'Submission not found');
  END IF;

  -- Clear existing cache
  DELETE FROM deployment_row_cache WHERE submission_id = p_submission_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Insert aggregated rows from deployment_lines
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
    max(dl.employee_id),
    max(e.employee_name),
    coalesce(max(dl.employee_id), null)::uuid,  -- will be resolved below
    max(pos.position_name),
    max(
      CASE max(dl.rate_year)
        WHEN 1 THEN pos.year_1_rate
        WHEN 2 THEN pos.year_2_rate
        WHEN 3 THEN pos.year_3_rate
        WHEN 4 THEN pos.year_4_rate
        WHEN 5 THEN pos.year_5_rate
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
    max(dl.so_id),
    max(dl.po_id),
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

  -- Fix position_id to actual position UUID
  UPDATE deployment_row_cache drc
  SET position_id = e.position_id
  FROM employees e
  WHERE drc.submission_id = p_submission_id
    AND drc.employee_id = e.id
    AND e.position_id IS NOT NULL;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'inserted', v_inserted,
    'submission_id', p_submission_id
  );
END;
$$;
