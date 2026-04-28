ALTER TABLE public.consultants
  ADD COLUMN IF NOT EXISTS consultant_type text NOT NULL DEFAULT 'PMC';

UPDATE public.consultants SET consultant_type = 'PMC' WHERE consultant_type IS NULL OR consultant_type NOT IN ('PMC','Supervision');

ALTER TABLE public.consultants
  ADD CONSTRAINT consultants_consultant_type_check CHECK (consultant_type IN ('PMC','Supervision'));

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS deployment text NOT NULL DEFAULT 'Projects';

UPDATE public.employees SET deployment = 'Projects' WHERE deployment IS NULL OR deployment NOT IN ('Projects','Office');

ALTER TABLE public.employees
  ADD CONSTRAINT employees_deployment_check CHECK (deployment IN ('Projects','Office'));