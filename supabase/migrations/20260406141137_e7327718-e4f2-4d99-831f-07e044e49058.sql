
-- Composite index for the main query pattern: filter by submission_id with RLS check on consultant_id
CREATE INDEX IF NOT EXISTS idx_deployment_lines_sub_consultant 
ON deployment_lines(submission_id, consultant_id);

-- Composite index for RLS-first access pattern (consultant_id checked first by RLS, then submission_id filter)
CREATE INDEX IF NOT EXISTS idx_deployment_lines_consultant_sub 
ON deployment_lines(consultant_id, submission_id);

-- Analyze table to update query planner statistics
ANALYZE deployment_lines;
