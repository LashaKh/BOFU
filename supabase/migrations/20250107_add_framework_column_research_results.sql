-- Add framework column to research_results table
-- This column stores the selected content framework for each research result

-- Add the framework column if it doesn't exist
ALTER TABLE public.research_results 
ADD COLUMN IF NOT EXISTS framework VARCHAR(50);

-- Add a comment for documentation
COMMENT ON COLUMN public.research_results.framework IS 'Content framework selection: product-walkthrough, differentiation, triple-threat, case-study, or benefit';

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_research_results_framework ON public.research_results(framework);

-- Add a check constraint to ensure only valid framework values are allowed
ALTER TABLE public.research_results 
ADD CONSTRAINT check_valid_framework_research 
CHECK (framework IS NULL OR framework IN (
  'product-walkthrough',
  'differentiation', 
  'triple-threat',
  'case-study',
  'benefit'
)); 