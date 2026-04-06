
-- Deduplicate deployment_lines: for each submission+notes group, keep only the newest set
-- Step 1: Remove duplicates from all submissions that have them
WITH ranked AS (
  SELECT id, submission_id, notes,
         ROW_NUMBER() OVER (
           PARTITION BY submission_id, notes, worked_project_id
           ORDER BY created_at DESC
         ) as rn
  FROM public.deployment_lines
  WHERE notes IS NOT NULL
)
DELETE FROM public.deployment_lines
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
