
-- Add rate_year and man_months to deployment_lines for the new entry structure
ALTER TABLE public.deployment_lines
  ADD COLUMN IF NOT EXISTS rate_year integer,
  ADD COLUMN IF NOT EXISTS man_months numeric DEFAULT 0;

-- Add constraint for man_months max 1.0
CREATE OR REPLACE FUNCTION public.validate_man_months()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.man_months IS NOT NULL AND NEW.man_months > 1.0 THEN
    RAISE EXCEPTION 'man_months cannot exceed 1.0';
  END IF;
  IF NEW.man_months IS NOT NULL AND NEW.man_months < 0 THEN
    RAISE EXCEPTION 'man_months cannot be negative';
  END IF;
  IF NEW.rate_year IS NOT NULL AND (NEW.rate_year < 1 OR NEW.rate_year > 5) THEN
    RAISE EXCEPTION 'rate_year must be between 1 and 5';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_deployment_line_values
  BEFORE INSERT OR UPDATE ON public.deployment_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_man_months();
