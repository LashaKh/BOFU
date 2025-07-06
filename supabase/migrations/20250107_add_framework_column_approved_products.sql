-- Add framework column to approved_products table
-- This column stores the selected content framework for each approved product

-- Add the framework column if it doesn't exist
ALTER TABLE public.approved_products 
ADD COLUMN IF NOT EXISTS framework VARCHAR(50);

-- Add a comment for documentation
COMMENT ON COLUMN public.approved_products.framework IS 'Content framework selection: product-walkthrough, differentiation, triple-threat, case-study, or benefit';

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_approved_products_framework ON public.approved_products(framework);

-- Add a check constraint to ensure only valid framework values are allowed
ALTER TABLE public.approved_products 
ADD CONSTRAINT check_valid_framework 
CHECK (framework IS NULL OR framework IN (
  'product-walkthrough',
  'differentiation', 
  'triple-threat',
  'case-study',
  'benefit'
)); 