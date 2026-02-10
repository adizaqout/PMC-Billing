-- Add project_number column to projects table
ALTER TABLE public.projects ADD COLUMN project_number text;

-- Add unique constraint
ALTER TABLE public.projects ADD CONSTRAINT projects_project_number_unique UNIQUE (project_number);

-- Create index for fast lookups
CREATE INDEX idx_projects_project_number ON public.projects (project_number);