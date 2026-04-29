-- Server-side aggregation RPC for the Dashboard Overview tab.
-- Returns a single JSONB payload with all KPIs / lists needed for instant render.
CREATE OR REPLACE FUNCTION public.dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_open_month text;
  v_total_budget numeric;
  v_actual numeric;
  v_forecast numeric;
  v_baseline numeric;
  v_active_total int;
  v_active_pmc int;
  v_active_supervision int;
  v_deployed_projects int;
  v_deployed_office int;
  v_my_open_tasks int;
  v_pending_reviews int;
  v_projects_at_risk int;
  v_amber_threshold numeric := 10;
  v_status_counts jsonb;
  v_monthly_trend jsonb;
  v_project_metrics jsonb;
  v_task_rows jsonb;
  v_review_queue jsonb;
  v_workforce_consultant jsonb;
  v_profile jsonb;
  v_uid uuid := auth.uid();
BEGIN
  -- Open period
  SELECT month INTO v_open_month FROM period_control WHERE status = 'open' LIMIT 1;
  IF v_open_month IS NULL THEN v_open_month := to_char(now(), 'YYYY-MM'); END IF;

  -- Amber threshold from settings
  SELECT COALESCE((setting_value->>'amber_remaining_pct')::numeric, 10)
    INTO v_amber_threshold
    FROM app_settings WHERE setting_key = 'dashboard_risk_thresholds' LIMIT 1;

  -- Latest revision per (consultant,month,schedule)
  WITH latest AS (
    SELECT DISTINCT ON (consultant_id, month, schedule_type)
      id, consultant_id, month, schedule_type, status, submitted_on, reviewed_on, created_at
    FROM deployment_submissions
    ORDER BY consultant_id, month, schedule_type, revision_no DESC
  ),
  line_costs AS (
    SELECT submission_id, SUM(COALESCE(derived_cost,0)) AS cost
    FROM deployment_lines GROUP BY submission_id
  )
  SELECT
    COALESCE(SUM(CASE WHEN l.schedule_type='actual' THEN lc.cost END),0),
    COALESCE(SUM(CASE WHEN l.schedule_type='forecast' AND l.month > v_open_month THEN lc.cost END),0),
    COALESCE(SUM(CASE WHEN l.schedule_type='baseline' THEN lc.cost END),0)
  INTO v_actual, v_forecast, v_baseline
  FROM latest l LEFT JOIN line_costs lc ON lc.submission_id = l.id;

  SELECT COALESCE(SUM(latest_pmc_budget),0) INTO v_total_budget FROM projects;

  -- Workforce
  SELECT 
    COUNT(*) FILTER (WHERE e.active),
    COUNT(*) FILTER (WHERE e.active AND c.consultant_type = 'PMC'),
    COUNT(*) FILTER (WHERE e.active AND c.consultant_type = 'Supervision'),
    COUNT(*) FILTER (WHERE e.active AND COALESCE(e.deployment,'Projects') = 'Projects'),
    COUNT(*) FILTER (WHERE e.active AND e.deployment = 'Office')
  INTO v_active_total, v_active_pmc, v_active_supervision, v_deployed_projects, v_deployed_office
  FROM employees e LEFT JOIN consultants c ON c.id = e.consultant_id;

  -- Workforce by consultant (active counts grouped by short_name)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', short_name, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
    INTO v_workforce_consultant
  FROM (
    SELECT c.short_name, COUNT(*) AS cnt
    FROM employees e JOIN consultants c ON c.id = e.consultant_id
    WHERE e.active GROUP BY c.short_name
  ) t;

  -- Tasks: latest submissions in open/active workflow
  WITH latest AS (
    SELECT DISTINCT ON (consultant_id, month, schedule_type)
      id, consultant_id, month, schedule_type, status, submitted_on, reviewed_on, created_at, updated_at
    FROM deployment_submissions
    ORDER BY consultant_id, month, schedule_type, revision_no DESC
  )
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('draft','returned','submitted','in_review')),
    COUNT(*) FILTER (WHERE status = 'submitted')
  INTO v_my_open_tasks, v_pending_reviews
  FROM latest;

  -- Submission status counts (latest only)
  WITH latest AS (
    SELECT DISTINCT ON (consultant_id, month, schedule_type)
      id, status
    FROM deployment_submissions
    ORDER BY consultant_id, month, schedule_type, revision_no DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', status::text, 'value', cnt)), '[]'::jsonb)
  INTO v_status_counts
  FROM (SELECT status, COUNT(*) AS cnt FROM latest GROUP BY status) s;

  -- Monthly trend (actual/forecast/baseline by month)
  WITH latest AS (
    SELECT DISTINCT ON (consultant_id, month, schedule_type)
      id, month, schedule_type
    FROM deployment_submissions
    ORDER BY consultant_id, month, schedule_type, revision_no DESC
  ),
  line_costs AS (
    SELECT submission_id, SUM(COALESCE(derived_cost,0)) AS cost
    FROM deployment_lines GROUP BY submission_id
  ),
  by_month AS (
    SELECT l.month,
      SUM(CASE WHEN l.schedule_type='actual' THEN COALESCE(lc.cost,0) END) AS actual,
      SUM(CASE WHEN l.schedule_type='forecast' THEN COALESCE(lc.cost,0) END) AS forecast,
      SUM(CASE WHEN l.schedule_type='baseline' THEN COALESCE(lc.cost,0) END) AS baseline
    FROM latest l LEFT JOIN line_costs lc ON lc.submission_id = l.id
    GROUP BY l.month
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month', month,
    'actual', COALESCE(actual,0),
    'forecast', COALESCE(forecast,0),
    'baseline', COALESCE(baseline,0)
  ) ORDER BY month), '[]'::jsonb) INTO v_monthly_trend FROM by_month;

  -- Project metrics (budget/actual/forecast/remaining/risk)
  WITH latest AS (
    SELECT DISTINCT ON (consultant_id, month, schedule_type)
      id, month, schedule_type
    FROM deployment_submissions
    ORDER BY consultant_id, month, schedule_type, revision_no DESC
  ),
  proj_actual AS (
    SELECT dl.billed_project_id AS pid, SUM(COALESCE(dl.derived_cost,0)) AS amt
    FROM deployment_lines dl JOIN latest l ON l.id = dl.submission_id
    WHERE l.schedule_type='actual' GROUP BY dl.billed_project_id
  ),
  proj_forecast AS (
    SELECT dl.billed_project_id AS pid, SUM(COALESCE(dl.derived_cost,0)) AS amt
    FROM deployment_lines dl JOIN latest l ON l.id = dl.submission_id
    WHERE l.schedule_type='forecast' AND l.month > v_open_month
    GROUP BY dl.billed_project_id
  ),
  metrics AS (
    SELECT p.id, p.project_name AS name,
      COALESCE(p.latest_pmc_budget,0) AS budget,
      COALESCE(pa.amt,0) AS actual,
      COALESCE(pf.amt,0) AS forecast,
      COALESCE(p.latest_pmc_budget,0) - COALESCE(pa.amt,0) AS remaining
    FROM projects p
    LEFT JOIN proj_actual pa ON pa.pid = p.id
    LEFT JOIN proj_forecast pf ON pf.pid = p.id
  )
  SELECT 
    COUNT(*) FILTER (WHERE forecast > budget OR (budget > 0 AND remaining < budget * (v_amber_threshold/100))),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'budget', budget, 'actual', actual,
      'forecast', forecast, 'remaining', remaining,
      'risk', CASE WHEN forecast > budget THEN 'red'
                   WHEN budget > 0 AND remaining < budget*(v_amber_threshold/100) THEN 'amber'
                   ELSE 'green' END
    ) ORDER BY remaining ASC), '[]'::jsonb)
  INTO v_projects_at_risk, v_project_metrics
  FROM metrics;

  -- Task rows (latest submissions in workflow states), with consultant short name
  WITH latest AS (
    SELECT DISTINCT ON (s.consultant_id, s.month, s.schedule_type)
      s.id, s.consultant_id, s.month, s.schedule_type, s.status, s.submitted_on, s.created_at, s.updated_at
    FROM deployment_submissions s
    ORDER BY s.consultant_id, s.month, s.schedule_type, s.revision_no DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'type', l.schedule_type::text,
    'month', l.month,
    'consultant', c.short_name,
    'status', l.status::text,
    'dueDate', l.submitted_on
  ) ORDER BY l.month DESC), '[]'::jsonb) INTO v_task_rows
  FROM latest l LEFT JOIN consultants c ON c.id = l.consultant_id
  WHERE l.status IN ('draft','returned','submitted','in_review');

  -- Review queue (submitted only)
  WITH latest AS (
    SELECT DISTINCT ON (s.consultant_id, s.month, s.schedule_type)
      s.id, s.consultant_id, s.month, s.schedule_type, s.status
    FROM deployment_submissions s
    ORDER BY s.consultant_id, s.month, s.schedule_type, s.revision_no DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'company', c.short_name,
    'month', l.month,
    'scheduleType', l.schedule_type::text
  ) ORDER BY l.month DESC), '[]'::jsonb) INTO v_review_queue
  FROM latest l LEFT JOIN consultants c ON c.id = l.consultant_id
  WHERE l.status = 'submitted';

  -- Profile
  SELECT to_jsonb(p.*) INTO v_profile
  FROM (SELECT full_name, consultant_id FROM profiles WHERE user_id = v_uid LIMIT 1) p;

  RETURN jsonb_build_object(
    'openMonth', v_open_month,
    'amberThreshold', v_amber_threshold,
    'profile', v_profile,
    'kpis', jsonb_build_object(
      'totalBudget', v_total_budget,
      'totalActualBilled', v_actual,
      'totalForecastCost', v_forecast,
      'totalBaselineCost', v_baseline,
      'remainingBudget', v_total_budget - v_actual,
      'forecastRemaining', v_total_budget - v_forecast,
      'varianceToBaseline', v_forecast - v_baseline,
      'activeEmployees', v_active_total,
      'activePmc', v_active_pmc,
      'activeSupervision', v_active_supervision,
      'deployedProjects', v_deployed_projects,
      'deployedOffice', v_deployed_office,
      'myOpenTasks', v_my_open_tasks,
      'pendingReviews', v_pending_reviews,
      'projectsAtRisk', v_projects_at_risk
    ),
    'statusCounts', v_status_counts,
    'monthlyTrend', v_monthly_trend,
    'projectMetrics', v_project_metrics,
    'taskRows', v_task_rows,
    'reviewQueue', v_review_queue,
    'workforceByConsultant', v_workforce_consultant
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_overview() TO authenticated;