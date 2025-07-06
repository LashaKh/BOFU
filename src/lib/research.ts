import { supabase } from './supabase';
import { ProductAnalysis } from '../types/product';

export interface ResearchResult {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  data: ProductAnalysis[];
  is_draft: boolean;
}

// Helper function to enrich products with user information
async function enrichProductsWithUserInfo(products: ProductAnalysis[]): Promise<ProductAnalysis[]> {
  try {
    // Get current user
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    
    if (!user) {
      console.log('[research] No authenticated user, skipping user info enrichment');
      return products;
    }

    // Get user profile information
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('company_name, email')
      .eq('id', user.id)
      .single();

    console.log('[research] Enriching products with user info:', {
      userEmail: user.email,
      userUUID: user.id,
      userCompanyName: profileData?.company_name || profileData?.email?.split('@')[1] || 'Unknown'
    });

    // Enrich each product with user information
    return products.map(product => ({
      ...product,
      userEmail: user.email || undefined,
      userUUID: user.id,
      userCompanyName: profileData?.company_name || profileData?.email?.split('@')[1] || undefined,
    }));
  } catch (error) {
    console.error('[research] Error enriching products with user info:', error);
    return products; // Return original products if enrichment fails
  }
}

export async function saveResearchResults(results: ProductAnalysis[], title: string, isDraft = false): Promise<string> {
  try {
    // If results is an array with one item, use it directly, otherwise wrap single result in array
    const rawDataToSave = Array.isArray(results) ? results : [results];
    
    // Enrich products with user information
    const dataToSave = await enrichProductsWithUserInfo(rawDataToSave);
    
    // Generate a unique fingerprint of this data for logging and duplicate detection
    const firstProduct = dataToSave[0] || {};
    const dataFingerprint = `${firstProduct.companyName || ''}-${dataToSave.length}-${Date.now().toString().slice(0, -3)}`;
    
    console.log('[research] Saving research results with fingerprint:', dataFingerprint);
    
    // Check for recent similar research to avoid duplicates (within last 30 seconds)
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: existingEntries, error: fetchError } = await supabase
      .from('research_results')
      .select('id, title, data, created_at')
      .gt('created_at', thirtySecondsAgo)
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      console.error('[research] Error checking for recent entries:', fetchError);
    } else if (existingEntries && existingEntries.length > 0) {
      console.log(`[research] Found ${existingEntries.length} recent entries, checking for duplicates`);
      
      // Check if any recent entry matches our data (same company and product count)
      for (const entry of existingEntries) {
        const entryData = entry.data;
        
        if (Array.isArray(entryData) && 
            entryData.length === dataToSave.length && 
            entryData[0]?.companyName === firstProduct.companyName) {
          
          console.log(`[research] Found potential duplicate: ${entry.id}, returning this ID instead of creating new entry`);
          return entry.id;
        }
      }
    }
    
    // No duplicates found, proceed with saving
    const { data, error } = await supabase
      .from('research_results')
      .insert({
        title,
        data: dataToSave,
        is_draft: isDraft,
        user_id: undefined  // Let the database set this automatically
      })
      .select('id')
      .single();

    if (error) throw error;
    console.log(`[research] Successfully saved research results with ID: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error('Error saving research results:', error);
    throw error;
  }
}

export async function updateResearchResults(id: string, results: ProductAnalysis[], title: string, isDraft = false): Promise<void> {
  try {
    // Enrich products with user information before updating
    const enrichedResults = await enrichProductsWithUserInfo(results);
    
    const { error } = await supabase
      .from('research_results')
      .update({
        title,
        data: enrichedResults,
        is_draft: isDraft
      })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating research results:', error);
    throw error;
  }
}

// Add a function to save an approved product to the approved_products table
export async function saveApprovedProduct(
  researchResultId: string,
  product: ProductAnalysis,
  productIndex: number,
  approvedBy: string
): Promise<string> {
  try {
    console.log('[research] Saving product to approved_products:', { 
      researchResultId, 
      productName: product.productDetails?.name,
      approvedBy
    });

    // Ensure the product data includes user information (enrich if missing)
    let enrichedProduct = product;
    if (!product.userEmail || !product.userUUID) {
      console.log('[research] Product missing user info, enriching...');
      const enrichedProducts = await enrichProductsWithUserInfo([product]);
      enrichedProduct = enrichedProducts[0] || product;
    }

    // Extract framework from product data for separate column
    const framework = enrichedProduct.framework || null;
    console.log('[research] Saving framework to separate column:', framework);
    
    // Insert the approved product into the approved_products table
    const insertData: any = {
      research_result_id: researchResultId,
      product_index: productIndex,
      product_name: enrichedProduct.productDetails?.name || 'Unnamed Product',
      product_description: enrichedProduct.productDetails?.description || '',
      company_name: enrichedProduct.companyName || '',
      approved_by: approvedBy,
      product_data: enrichedProduct,
      reviewed_status: 'pending'
    };
    
    // Add framework to separate column if present
    if (framework) {
      insertData.framework = framework;
    }
    
    const { data, error } = await supabase
      .from('approved_products')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('[research] Error saving approved product:', error);
      throw error;
    }
    
    console.log('[research] Successfully saved to approved_products with id:', data.id);
    return data.id;
  } catch (error) {
    console.error('[research] Error saving approved product:', error);
    throw error;
  }
}

// Function to get all approved products for the admin dashboard
export async function getApprovedProducts(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('approved_products')
      .select(`
        *,
        research_results!inner(
          user_id,
          user_profiles!inner(
            email,
            company_name
          )
        )
      `)
      .order('approved_at', { ascending: false });

    if (error) throw error;
    
    // Enrich product data with user information and source IDs
    return (data || []).map(item => {
      const userProfile = item.research_results?.user_profiles;
      
      // Enhanced framework loading with fallback and debug logging
      const frameworkFromColumn = item.framework;
      const frameworkFromJson = item.product_data?.framework;
      const finalFramework = frameworkFromColumn || frameworkFromJson;
      
      console.log(`[research] Loading product ${item.product_name}:`, {
        frameworkFromColumn,
        frameworkFromJson,
        finalFramework,
        willUseFramework: finalFramework
      });
      
      return {
        ...item,
        product_data: {
          ...item.product_data,
          research_result_id: item.research_result_id,
          product_id: item.product_id,
          // Include framework from approved_products table (with fallback to JSON)
          framework: finalFramework,
          // Add user information to the product data
          userEmail: userProfile?.email,
          userCompanyName: userProfile?.company_name,
          userUUID: item.research_results?.user_id,
        }
      };
    });
  } catch (error) {
    console.error('[research] Error fetching approved products:', error);
    
    // Fallback to simple query if join fails
    try {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('approved_products')
        .select('*')
        .order('approved_at', { ascending: false });

      if (fallbackError) throw fallbackError;
      
      console.log('[research] Using fallback query without user info');
      return (fallbackData || []).map(item => {
        // Enhanced framework loading with fallback and debug logging (fallback query)
        const frameworkFromColumn = item.framework;
        const frameworkFromJson = item.product_data?.framework;
        const finalFramework = frameworkFromColumn || frameworkFromJson;
        
        console.log(`[research] Loading product ${item.product_name} (fallback):`, {
          frameworkFromColumn,
          frameworkFromJson,
          finalFramework,
          willUseFramework: finalFramework
        });
        
        return {
          ...item,
          product_data: {
            ...item.product_data,
            research_result_id: item.research_result_id,
            product_id: item.product_id,
            // Include framework from approved_products table (with fallback to JSON)
            framework: finalFramework
          }
        };
      });
    } catch (fallbackError) {
      console.error('[research] Fallback query also failed:', fallbackError);
      throw fallbackError;
    }
  }
}

// Function to update an approved product's data
export async function updateApprovedProduct(
  id: string,
  updatedProductData: any
): Promise<void> {
  try {
    console.log('[research] Updating approved product:', { id, updatedProductData });
    
    // Log capabilities data to track if images are being preserved
    if (updatedProductData.capabilities && Array.isArray(updatedProductData.capabilities)) {
      console.log('[research] Capabilities data in update:', updatedProductData.capabilities.map((cap: any, index: number) => ({
        index,
        title: cap.title,
        imageCount: cap.images ? cap.images.length : 0,
        images: cap.images || []
      })));
    }
    
    // Extract framework from product data to save in separate column
    const framework = updatedProductData.framework || null;
    console.log('[research] Extracted framework for separate column:', framework);
    
    const updateData: any = {
      product_data: updatedProductData,
      updated_at: new Date().toISOString()
    };
    
    // If framework is provided, update the separate framework column
    if (framework) {
      updateData.framework = framework;
      console.log('[research] Updating framework column with:', framework);
    }
    
    const { error } = await supabase
      .from('approved_products')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[research] Error updating approved product:', error);
      throw error;
    }
    
    console.log('[research] Successfully updated approved product:', id, 'with framework:', framework);
  } catch (error) {
    console.error('[research] Error updating approved product:', error);
    throw error;
  }
}

// Function to update an approved product's review status
export async function updateApprovedProductStatus(
  id: string,
  status: 'pending' | 'reviewed' | 'rejected',
  reviewerId: string,
  comments?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('approved_products')
      .update({
        reviewed_status: status,
        reviewer_id: reviewerId,
        reviewer_comments: comments || null,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('[research] Error updating approved product status:', error);
    throw error;
  }
}

export async function getResearchResults(): Promise<ResearchResult[]> {
  try {
    const { data, error } = await supabase
      .from('research_results')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching research results:', error);
    throw error;
  }
}

export async function getResearchResultById(id: string): Promise<ResearchResult | null> {
  try {
    const { data, error } = await supabase
      .from('research_results')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching research result:', error);
    throw error;
  }
}

export async function deleteResearchResult(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('research_results')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting research result:', error);
    throw error;
  }
}

// Function to delete an approved product
export async function deleteApprovedProduct(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('approved_products')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('[research] Error deleting approved product:', error);
    throw error;
  }
}