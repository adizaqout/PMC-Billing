CREATE INDEX IF NOT EXISTS idx_deployment_lines_submission_billed_cost
ON public.deployment_lines (submission_id, billed_project_id)
INCLUDE (derived_cost);

CREATE INDEX IF NOT EXISTS idx_deployment_submissions_latest_lookup
ON public.deployment_submissions (consultant_id, month, schedule_type, revision_no DESC)
INCLUDE (id, status, submitted_on, created_at, updated_at);

CREATE OR REPLACE FUNCTION public.dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE
  v_open_month text;
  v_total_budget numeric := 0;
  v_actual numeric := 0;
  v_forecast numeric := 0;
  v_baseline numeric := 0;
  v_active_total int := 0;
  v_active_pmc int := 0;
  v_active_supervision int := 0;
  v_deployed_projects int := 0;
  v_deployed_office int := 0;
  v_my_open_tasks int := 0;
  v_pending_reviews int := 0;
  v_projects_at_risk int := 0;
  v_amber_threshold numeric := 10;
  v_status_counts jsonb := '[]'::jsonb;
  v_monthly_trend jsonb := '[]'::jsonb;
  v_project_metrics jsonb := '[]'::jsonb;
  v_task_rows jsonb := '[]'::jsonb;
  v_review_queue jsonb := '[]'::jsonb;
  v_workforce_consultant jsonb := '[]'::jsonb;
  v_profile jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT month INTO v_open_month
  FROM public.period_control
  WHERE status = 'open'
  ORDER BY month DESC
  LIMIT 1;

  IF v_open_month IS NULL THEN
    v_open_month := to_char(now(), 'YYYY-MM');
  END IF;

  SELECT COALESCE((setting_value->>'amber_remaining_pct')::numeric, 10)
  INTO v_amber_threshold
  FROM public.app_settings
  WHERE setting_key = 'dashboard_risk_thresholds'
  LIMIT 1;

  WITH is_admin AS (
    SELECT public.is_superadmin() AS yes
  ),
  allowed_consultants AS (
    SELECT c.id, c.short_name, c.consultant_type
    FROM public.consultants c
    CROSS JOIN is_admin a
    WHERE a.yes
       OR EXISTS (
         SELECT 1
         FROM public.user_roles ur
         JOIN public.groups g ON g.id = ur.group_id
         WHERE ur.user_id = v_uid
           AND (g.visibility_mode = 'see_all_companies' OR g.consultant_id = c.id)
       )
  ),
  latest AS MATERIALIZED (
    SELECT DISTINCT ON (s.consultant_id, s.month, s.schedule_type)
      s.id, s.consultant_id, s.month, s.schedule_type, s.status, s.submitted_on, s.created_at, s.updated_at
    FROM public.deployment_submissions s
    JOIN allowed_consultants ac ON ac.id = s.consultant_id
    ORDER BY s.consultant_id, s.month, s.schedule_type, s.revision_no DESC
  ),
  line_costs AS MATERIALIZED (
    SELECT
      dl.submission_id,
      dl.billed_project_id,
      SUM(COALESCE(dl.derived_cost, 0)) AS cost
    FROM public.deployment_lines dl
    JOIN latest l ON l.id = dl.submission_id
    GROUP BY dl.submission_id, dl.billed_project_id
  ),
  cost_by_submission AS MATERIALIZED (
    SELECT submission_id, SUM(cost) AS cost
    FROM line_costs
    GROUP BY submission_id
  ),
  scoped_projects AS MATERIALIZED (
    SELECT p.id, p.project_name, COALESCE(p.latest_pmc_budget, 0) AS latest_pmc_budget
    FROM public.projects p
  ),
  totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN l.schedule_type = 'actual' THEN cbs.cost ELSE 0 END), 0) AS actual,
      COALESCE(SUM(CASE WHEN l.schedule_type = 'forecast' AND l.month > v_open_month THEN cbs.cost ELSE 0 END), 0) AS forecast,
      COALESCE(SUM(CASE WHEN l.schedule_type = 'baseline' THEN cbs.cost ELSE 0 END), 0) AS baseline
    FROM latest l
    LEFT JOIN cost_by_submission cbs ON cbs.submission_id = l.id
  ),
  workforce AS (
    SELECT
      COUNT(*) FILTER (WHERE e.active) AS active_total,
      COUNT(*) FILTER (WHERE e.active AND ac.consultant_type = 'PMC') AS active_pmc,
      COUNT(*) FILTER (WHERE e.active AND ac.consultant_type = 'Supervision') AS active_supervision,
      COUNT(*) FILTER (WHERE e.active AND COALESCE(e.deployment, 'Projects') = 'Projects') AS deployed_projects,
      COUNT(*) FILTER (WHERE e.active AND e.deployment = 'Office') AS deployed_office
    FROM public.employees e
    JOIN allowed_consultants ac ON ac.id = e.consultant_id
  ),
  task_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('draft','returned','submitted','in_review')) AS my_open_tasks,
      COUNT(*) FILTER (WHERE status = 'submitted') AS pending_reviews
    FROM latest
  ),
  status_counts AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', status::text, 'value', cnt) ORDER BY status::text), '[]'::jsonb) AS data
    FROM (
      SELECT status, COUNT(*) AS cnt
      FROM latest
      GROUP BY status
    ) s
  ),
  trend AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'month', month,
      'actual', actual,
      'forecast', forecast,
      'baseline', baseline
    ) ORDER BY month), '[]'::jsonb) AS data
    FROM (
      SELECT
        l.month,
        COALESCE(SUM(CASE WHEN l.schedule_type = 'actual' THEN cbs.cost ELSE 0 END), 0) AS actual,
        COALESCE(SUM(CASE WHEN l.schedule_type = 'forecast' THEN cbs.cost ELSE 0 END), 0) AS forecast,
        COALESCE(SUM(CASE WHEN l.schedule_type = 'baseline' THEN cbs.cost ELSE 0 END), 0) AS baseline
      FROM latest l
      LEFT JOIN cost_by_submission cbs ON cbs.submission_id = l.id
      GROUP BY l.month
    ) m
  ),
  project_costs AS MATERIALIZED (
    SELECT
      lc.billed_project_id AS project_id,
      COALESCE(SUM(lc.cost) FILTER (WHERE l.schedule_type = 'actual'), 0) AS actual,
      COALESCE(SUM(lc.cost) FILTER (WHERE l.schedule_type = 'forecast' AND l.month > v_open_month), 0) AS forecast
    FROM line_costs lc
    JOIN latest l ON l.id = lc.submission_id
    WHERE lc.billed_project_id IS NOT NULL
    GROUP BY lc.billed_project_id
  ),
  project_metrics AS (
    SELECT
      sp.id,
      sp.project_name AS name,
      sp.latest_pmc_budget AS budget,
      COALESCE(pc.actual, 0) AS actual,
      COALESCE(pc.forecast, 0) AS forecast,
      sp.latest_pmc_budget - COALESCE(pc.actual, 0) AS remaining,
      CASE
        WHEN COALESCE(pc.forecast, 0) > sp.latest_pmc_budget THEN 'red'
        WHEN sp.latest_pmc_budget > 0 AND sp.latest_pmc_budget - COALESCE(pc.actual, 0) < sp.latest_pmc_budget * (v_amber_threshold / 100) THEN 'amber'
        ELSE 'green'
      END AS risk
    FROM scoped_projects sp
    LEFT JOIN project_costs pc ON pc.project_id = sp.id
  ),
  project_payload AS (
    SELECT
      COUNT(*) FILTER (WHERE risk <> 'green') AS at_risk,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'budget', budget,
        'actual', actual,
        'forecast', forecast,
        'remaining', remaining,
        'risk', risk
      ) ORDER BY remaining ASC), '[]'::jsonb) AS data
    FROM project_metrics
  ),
  tasks AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'type', l.schedule_type::text,
      'month', l.month,
      'consultant', ac.short_name,
      'status', l.status::text,
      'dueDate', l.submitted_on
    ) ORDER BY l.month DESC), '[]'::jsonb) AS data
    FROM latest l
    LEFT JOIN allowed_consultants ac ON ac.id = l.consultant_id
    WHERE l.status IN ('draft','returned','submitted','in_review')
  ),
  reviews AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'company', ac.short_name,
      'month', l.month,
      'scheduleType', l.schedule_type::text
    ) ORDER BY l.month DESC), '[]'::jsonb) AS data
    FROM latest l
    LEFT JOIN allowed_consultants ac ON ac.id = l.consultant_id
    WHERE l.status = 'submitted'
  ),
  workforce_consultant AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', short_name, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS data
    FROM (
      SELECT ac.short_name, COUNT(*) AS cnt
      FROM public.employees e
      JOIN allowed_consultants ac ON ac.id = e.consultant_id
      WHERE e.active
      GROUP BY ac.short_name
    ) wc
  )
  SELECT
    (SELECT COALESCE(SUM(latest_pmc_budget), 0) FROM scoped_projects),
    totals.actual,
    totals.forecast,
    totals.baseline,
    workforce.active_total,
    workforce.active_pmc,
    workforce.active_supervision,
    workforce.deployed_projects,
    workforce.deployed_office,
    task_counts.my_open_tasks,
    task_counts.pending_reviews,
    status_counts.data,
    trend.data,
    project_payload.at_risk,
    project_payload.data,
    tasks.data,
    reviews.data,
    workforce_consultant.data
  INTO
    v_total_budget,
    v_actual,
    v_forecast,
    v_baseline,
    v_active_total,
    v_active_pmc,
    v_active_supervision,
    v_deployed_projects,
    v_deployed_office,
    v_my_open_tasks,
    v_pending_reviews,
    v_status_counts,
    v_monthly_trend,
    v_projects_at_risk,
    v_project_metrics,
    v_task_rows,
    v_review_queue,
    v_workforce_consultant
  FROM totals, workforce, task_counts, status_counts, trend, project_payload, tasks, reviews, workforce_consultant;

  SELECT to_jsonb(p.*)
  INTO v_profile
  FROM (
    SELECT full_name, consultant_id
    FROM public.profiles
    WHERE user_id = v_uid
    LIMIT 1
  ) p;

  RETURN jsonb_build_object(
    'openMonth', v_open_month,
    'amberThreshold', v_amber_threshold,
    'profile', v_profile,
    'kpis', jsonb_build_object(
      'totalBudget', COALESCE(v_total_budget, 0),
      'totalActualBilled', COALESCE(v_actual, 0),
      'totalForecastCost', COALESCE(v_forecast, 0),
      'totalBaselineCost', COALESCE(v_baseline, 0),
      'remainingBudget', COALESCE(v_total_budget, 0) - COALESCE(v_actual, 0),
      'forecastRemaining', COALESCE(v_total_budget, 0) - COALESCE(v_forecast, 0),
      'varianceToBaseline', COALESCE(v_forecast, 0) - COALESCE(v_baseline, 0),
      'activeEmployees', COALESCE(v_active_total, 0),
      'activePmc', COALESCE(v_active_pmc, 0),
      'activeSupervision', COALESCE(v_active_supervision, 0),
      'deployedProjects', COALESCE(v_deployed_projects, 0),
      'deployedOffice', COALESCE(v_deployed_office, 0),
      'myOpenTasks', COALESCE(v_my_open_tasks, 0),
      'pendingReviews', COALESCE(v_pending_reviews, 0),
      'projectsAtRisk', COALESCE(v_projects_at_risk, 0)
    ),
    'statusCounts', COALESCE(v_status_counts, '[]'::jsonb),
    'monthlyTrend', COALESCE(v_monthly_trend, '[]'::jsonb),
    'projectMetrics', COALESCE(v_project_metrics, '[]'::jsonb),
    'taskRows', COALESCE(v_task_rows, '[]'::jsonb),
    'reviewQueue', COALESCE(v_review_queue, '[]'::jsonb),
    'workforceByConsultant', COALESCE(v_workforce_consultant, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_overview() TO authenticated;