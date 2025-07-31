import React, { useEffect, useState, useCallback, useRef } from 'react';

console.log('🔥 UNIFIED EDITOR MODULE: File imported/loaded');
import { useParams, useNavigate } from 'react-router-dom';
import { ArticleEditor } from './ArticleEditor';
import { toast } from 'react-hot-toast';
import { 
  unifiedArticleService, 
  UnifiedArticleContent, 
  UnifiedUserContext,
  UnifiedSaveResult 
} from '../lib/unifiedArticleApi';
import { realtimeCollaboration } from '../lib/realtimeCollaboration';
import ArticleAICoPilot from './admin/ArticleAICoPilot';
import { Brain, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLayout } from '../contexts/LayoutContext';


interface UnifiedArticleEditorProps {
  // Optional mode override for specific routing scenarios
  forceMode?: 'admin' | 'user';
}

export const UnifiedArticleEditor: React.FC<UnifiedArticleEditorProps> = ({ forceMode }) => {
  console.log('🎯 UNIFIED EDITOR: UnifiedArticleEditor function called - START');
  
  try {
    console.log('🎯 UNIFIED EDITOR: About to get params');
    const params = useParams<{ id?: string; articleId?: string }>();
    console.log('🎯 UNIFIED EDITOR: Got params:', params);
  const articleId = params.id || params.articleId;
  const navigate = useNavigate();
  const { layout, setAICopilotVisible } = useLayout();
  
  // State management
  const [article, setArticle] = useState<UnifiedArticleContent | null>(null);
  const [userContext, setUserContext] = useState<UnifiedUserContext | null>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCollaborationReady, setIsCollaborationReady] = useState(false);
  
  // AI Co-Pilot states
  const [showAICoPilot, setShowAICoPilot] = useState(false);
  const [currentArticleContent, setCurrentArticleContent] = useState('');
  const [originalAuthorCompany, setOriginalAuthorCompany] = useState<string | null>(null);
  
  // Ref for managing content update timeouts (to prevent excessive API calls)
  const contentUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine UI mode based on user permissions and route
  const uiMode = forceMode || (userContext?.isAdmin ? 'admin' : 'user');

  // Sync local AI copilot state with layout context
  useEffect(() => {
    setAICopilotVisible(showAICoPilot);
  }, [showAICoPilot, setAICopilotVisible]);

  // Handle AI copilot toggle with layout awareness
  const handleAICopilotToggle = useCallback(() => {
    const newState = !showAICoPilot;
    setShowAICoPilot(newState);
    setAICopilotVisible(newState);
  }, [showAICoPilot, setAICopilotVisible]);

  /**
   * Fetch original author's company name for AI copilot filtering
   */
  const fetchOriginalAuthorCompany = useCallback(async (authorUserId: string) => {
    try {
      const { data: authorProfile, error } = await supabase
        .from('user_profiles')
        .select('company_name')
        .eq('id', authorUserId)
        .single();

      if (error) {
        console.error('Error fetching author company:', error);
        return;
      }

      if (authorProfile?.company_name) {
        console.log(`🏢 Setting original author company: "${authorProfile.company_name}"`);
        setOriginalAuthorCompany(authorProfile.company_name);
      }
    } catch (error) {
      console.error('Failed to fetch original author company:', error);
    }
  }, []);

  /**
   * Load article data using unified API
   */
  const loadArticle = useCallback(async () => {
    if (!articleId) {
      setError('Article ID is required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await unifiedArticleService.loadArticle(articleId);
      
      if (!result.success) {
        setError(result.error || 'Failed to load article');
        
        // Redirect based on error type
        const redirectPath = forceMode === 'admin' || userContext?.isAdmin ? '/admin' : '/dashboard';
        if (result.error?.includes('Access denied')) {
          toast.error('You do not have permission to access this article');
          navigate(redirectPath);
        } else if (result.error?.includes('not found')) {
          toast.error('Article not found');
          navigate(redirectPath);
        }
        return;
      }

      setArticle(result.data!);
      setUserContext(result.userContext!);
      setPermissions(result.permissions!);
      setHasUnsavedChanges(false);
      setCurrentArticleContent(result.data!.content || ''); // Initialize content for AI copilot
      
      // Fetch original author's company name for AI copilot filtering
      if (result.data!.user_id) {
        fetchOriginalAuthorCompany(result.data!.user_id);
      }

    } catch (error) {
      console.error('Error loading article:', error);
      setError('Unexpected error loading article');
      toast.error('Failed to load article');
    } finally {
      setLoading(false);
    }
  }, [articleId, navigate, fetchOriginalAuthorCompany]);

  /**
   * Save article using unified API with conflict resolution
   */
  const saveArticle = useCallback(async (
    content: string, 
    options: { 
      editingStatus?: UnifiedArticleContent['editing_status'];
      showToast?: boolean;
      isAutoSave?: boolean;
    } = {}
  ): Promise<UnifiedSaveResult> => {
    if (!articleId) {
      return { success: false, error: 'Article ID is required' };
    }

    console.log('💾 [UNIFIED EDITOR] Starting save:', {
      articleId,
      uiMode,
      contentLength: content?.length,
      userEmail: userContext?.email,
      isAdmin: userContext?.isAdmin,
      isAutoSave: options.isAutoSave,
      options
    });

    try {
      setSaving(true);
      
      const saveOptions = {
        editingStatus: options.editingStatus,
        conflictResolution: options.isAutoSave ? 'merge' as const : 'force' as const
      };

      const result = options.isAutoSave 
        ? await unifiedArticleService.autoSaveArticle(articleId, content)
        : await unifiedArticleService.saveArticle(articleId, content, saveOptions);

      console.log('💾 [UNIFIED EDITOR] Save result:', {
        success: result.success,
        version: result.data?.article_version,
        conflictDetected: result.conflictDetected,
        error: result.error
      });

      if (result.success) {
        setArticle(result.data!);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        
        console.log('✅ [UNIFIED EDITOR] Save completed successfully, article state updated');
        
        if (options.showToast !== false) {
          if (result.conflictDetected && result.resolvedConflict) {
            toast.success('Article saved (conflict resolved)');
          } else {
            toast.success(options.isAutoSave ? 'Auto-saved' : 'Article saved');
          }
        }
      } else {
        console.error('❌ [UNIFIED EDITOR] Save failed:', result.error);
        if (result.conflictDetected) {
          toast.error('Save conflict detected. Please refresh and try again.');
          // Optionally reload the article to get latest version
          await loadArticle();
        } else {
          toast.error(result.error || 'Failed to save article');
        }
      }

      return result;

    } catch (error) {
      console.error('❌ [UNIFIED EDITOR] Error saving article:', error);
      const errorMessage = 'Unexpected error saving article';
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setSaving(false);
    }
  }, [articleId, loadArticle, uiMode, userContext]);



  /**
   * Handle status changes (admin/owner only)
   */
  const handleStatusChange = useCallback(async (status: UnifiedArticleContent['editing_status']) => {
    if (!articleId || !permissions?.canChangeStatus) {
      toast.error('You do not have permission to change article status');
      return;
    }

    try {
      const result = await unifiedArticleService.updateArticleStatus(articleId, status);
      
      if (result.success) {
        setArticle(result.data!);
        toast.success(`Article status changed to ${status}`);
      } else {
        toast.error(result.error || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update article status');
    }
  }, [articleId, permissions]);

  /**
   * Handle content changes to track unsaved changes
   */
  const handleContentChange = useCallback((content: string) => {
    console.log('🔄 UnifiedArticleEditor handleContentChange called, setting hasUnsavedChanges to true');
    setHasUnsavedChanges(true);
    setCurrentArticleContent(content); // Update content for AI copilot
  }, []);

  /**
   * Auto-save functionality
   */
  const handleAutoSave = useCallback(async (content: string) => {
    console.log('🚀 UnifiedArticleEditor handleAutoSave called:', { hasUnsavedChanges, contentLength: content.length });
    
    console.log('✅ Auto-save proceeding...');
    setCurrentArticleContent(content); // Update content for AI copilot
    
    const result = await saveArticle(content, { 
      isAutoSave: true, 
      showToast: false 
    });
    
    // Only clear hasUnsavedChanges if save was successful
    if (result.success) {
      setHasUnsavedChanges(false);
    }
  }, [saveArticle]);

  // Load article immediately on mount (auth check is handled internally)
  useEffect(() => {
    loadArticle();
  }, [loadArticle]);

  // Set up real-time collaboration
  useEffect(() => {
    if (!articleId || !userContext) return;

    const setupCollaboration = async () => {
      try {
        console.log('🔄 Setting up real-time collaboration for article:', articleId);
        
        // Join the article for real-time collaboration
        const userMetadata = {
          name: userContext.email?.split('@')[0] || 'Unknown',
          email: userContext.email,
        };
        
        await realtimeCollaboration.joinArticle(articleId, userMetadata);
        setIsCollaborationReady(true);
        
        console.log('✅ Real-time collaboration ready');
      } catch (error) {
        console.error('❌ Failed to setup collaboration:', error);
      }
    };

    setupCollaboration();

    // Subscribe to content changes
    const unsubscribeContentChange = realtimeCollaboration.onContentChange((payload) => {
      console.log('🔄 [UNIFIED EDITOR] Real-time content change detected:', {
        timestamp: new Date().toISOString(),
        currentArticleId: articleId,
        uiMode,
        userContext: {
          id: userContext?.id,
          email: userContext?.email,
          isAdmin: userContext?.isAdmin
        },
        payload: {
          eventType: payload?.eventType,
          table: payload?.table,
          schema: payload?.schema,
          payloadId: payload?.new?.id,
          lastEditedBy: payload?.new?.last_edited_by,
          version: payload?.new?.article_version
        }
      });
      
      // Only process if this is a content_briefs table update for our article
      if (payload?.table === 'content_briefs' && payload?.new?.id === articleId) {
        const newContent = payload?.new?.article_content;
        const oldContent = payload?.old?.article_content;
        
        console.log('✅ [UNIFIED EDITOR] Processing content change for our article:', {
          oldContentLength: oldContent?.length || 0,
          newContentLength: newContent?.length || 0,
          contentChanged: oldContent !== newContent,
          newVersion: payload?.new?.article_version
        });
        
        // Only update if content actually changed
        if (newContent && oldContent !== newContent) {
          // Enhanced change detection logic to handle admin/user context
          const lastEditedBy = payload?.new?.last_edited_by;
          const currentUserId = userContext?.userId;
          
          // Basic own-change detection
          let isOwnChange = lastEditedBy === currentUserId;
          
          // Special handling for admin mode: if admin is editing on behalf of original author,
          // we still want to see updates from the original author
          if (uiMode === 'admin' && !isOwnChange) {
            // Admin should see all changes from other users (including the original author)
            // Only skip updates if this admin session made the change
            isOwnChange = false;
          }
          
          console.log('🔍 [UNIFIED EDITOR] Enhanced content change analysis:', {
            uiMode,
            lastEditedBy,
            currentUserId,
            isOwnChange,
            shouldUpdateUI: !isOwnChange || uiMode === 'admin',
            payload: {
              eventType: payload?.eventType,
              version: payload?.new?.article_version
            }
          });
          
          // Always update article state with latest data, regardless of who made the change
          // This ensures both editors stay in sync
          if (contentUpdateTimeoutRef.current) {
            clearTimeout(contentUpdateTimeoutRef.current);
            console.log('🔄 [UNIFIED EDITOR] Clearing previous timeout');
          }
          
          contentUpdateTimeoutRef.current = setTimeout(async () => {
            console.log('🚀 [UNIFIED EDITOR] Applying content update...', { 
              uiMode,
              isOwnChange, 
              updateSource: isOwnChange ? 'own change' : 'external change',
              timeElapsed: '300ms debounce completed'
            });
            try {
              // Update article state with new data
              if (article) {
                const updatedArticle = {
                  ...article,
                  content: newContent,
                  article_version: payload?.new?.article_version || article.article_version + 1,
                  last_edited_at: payload?.new?.updated_at || new Date().toISOString(),
                  last_edited_by: payload?.new?.last_edited_by || article.last_edited_by
                };
                
                console.log('📝 [UNIFIED EDITOR] Updating article state:', {
                  uiMode,
                  isOwnChange,
                  oldVersion: article.article_version,
                  newVersion: updatedArticle.article_version,
                  contentLengthDiff: newContent.length - (article.content?.length || 0)
                });
                
                // Update article state - this will provide fresh content to ArticleEditor
                setArticle(updatedArticle);
                
                // Update metadata appropriately
                setLastSaved(new Date());
                
                // Clear unsaved changes logic: 
                // - For regular users: only clear if change came from another user
                // - For admins: always update to latest state to ensure proper sync
                if (!isOwnChange || uiMode === 'admin') {
                  setHasUnsavedChanges(false);
                }
                
                console.log('✅ [UNIFIED EDITOR] Content update applied - ArticleEditor will update');
              }
            } catch (error) {
              console.error('❌ [UNIFIED EDITOR] Failed to apply update:', error);
              // Fallback to full reload if seamless update fails
              console.log('🔄 [UNIFIED EDITOR] Falling back to full article reload...');
              await loadArticle();
            }
          }, 300); // Faster response - 0.3 second debounce
        } else {
          console.log('⏭️ [UNIFIED EDITOR] Content unchanged, skipping update');
        }
      } else {
        console.log('⏭️ [UNIFIED EDITOR] Ignoring content change - not for our article:', {
          reason: payload?.table !== 'content_briefs' ? 'wrong table' : 'wrong article ID',
          payloadTable: payload?.table,
          payloadId: payload?.new?.id,
          ourArticleId: articleId,
          uiMode
        });
      }
    });

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up real-time collaboration');
      unsubscribeContentChange();
      realtimeCollaboration.leaveArticle();
      setIsCollaborationReady(false);
      
      if (contentUpdateTimeoutRef.current) {
        clearTimeout(contentUpdateTimeoutRef.current);
      }
    };
  }, [articleId, userContext?.email, loadArticle]);

  // Loading states
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading article...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-8 max-w-md">
          <h3 className="text-red-400 text-lg font-semibold mb-2">Error Loading Article</h3>
          <p className="text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => navigate(uiMode === 'admin' ? '/admin' : '/dashboard')}
            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // No article loaded
  if (!article || !userContext) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">
          <p>Article not found or access denied</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* DEBUG: Visual confirmation banner */}
      <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 z-50 font-bold">
        🚨 UNIFIED EDITOR LOADED - Changes Applied! 🚨
      </div>
      
      {/* Main content area */}
      <div 
        className="flex-1 flex flex-col transition-all duration-300"
        style={{ 
          width: `${layout.editorWidth}px`,
          maxWidth: showAICoPilot ? 'calc(100vw - 650px)' : '100%'
        }}
      >
        {/* New Header */}
        <div className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-700/50 sticky top-0 z-30">
          {/* Top Bar: Title and Primary Actions */}
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {article.title}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {/* AI Co-Pilot Button */}
              {uiMode === 'admin' && (
                <button
                  onClick={handleAICopilotToggle}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 group ${
                    showAICoPilot
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-lg'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                  }`}
                  title={showAICoPilot ? 'Hide AI Co-Pilot' : 'Show AI Co-Pilot'}
                >
                  <Brain size={16} className="transition-transform duration-300 group-hover:scale-110" />
                  <span>AI Assistant</span>
                  {showAICoPilot && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-purple-400 rounded-full border-2 border-gray-900 animate-pulse" />
                  )}
                </button>
              )}

              {/* Delete Button */}
              {uiMode === 'admin' && permissions?.canDelete && (
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this article?')) {
                      toast.error('Delete functionality not yet implemented');
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-gray-700 hover:border-red-500/30 transition-all duration-300"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Bottom Bar: Status, Version, and Save Info */}
          <div className="px-6 py-3 bg-gray-800/50 border-t border-gray-700/50 flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              {/* Status Dropdown */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-400">Status:</span>
                {permissions?.canChangeStatus ? (
                  <select
                    value={article.editing_status}
                    onChange={(e) => handleStatusChange(e.target.value as UnifiedArticleContent['editing_status'])}
                    className="bg-gray-700/50 text-white px-3 py-1.5 rounded-md border border-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 focus:outline-none transition-all duration-300 appearance-none"
                  >
                    <option value="draft">Draft</option>
                    <option value="editing">Editing</option>
                    <option value="review">Review</option>
                    <option value="final">Final</option>
                    <option value="published">Published</option>
                  </select>
                ) : (
                  <span className="px-3 py-1.5 rounded-md bg-gray-700/50 text-white border border-gray-600">{article.editing_status}</span>
                )}
              </div>

              {/* Version */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-400">Version:</span>
                <span className="text-white font-semibold">v{article.article_version}</span>
              </div>

              {/* Mode */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-400">Mode:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  uiMode === 'admin'
                    ? 'bg-red-900/30 text-red-300 border border-red-500/40'
                    : 'bg-blue-900/30 text-blue-300 border border-blue-500/40'
                }`}>
                  {uiMode === 'admin' ? 'Admin' : 'User'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Permissions */}
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-400">Permissions:</span>
                <div className="flex items-center gap-2 text-xs">
                  {permissions?.canEdit && <span className="px-2 py-1 bg-green-900/30 text-green-300 rounded-full border border-green-500/40">Edit</span>}
                  {permissions?.canChangeStatus && <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded-full border border-blue-500/40">Status</span>}
                  {permissions?.canTransferOwnership && <span className="px-2 py-1 bg-purple-900/30 text-purple-300 rounded-full border border-purple-500/40">Transfer</span>}
                  {permissions?.canDelete && <span className="px-2 py-1 bg-red-900/30 text-red-300 rounded-full border border-red-500/40">Delete</span>}
                </div>
              </div>

              {/* Save Status */}
              <div className="flex items-center gap-2 text-white font-semibold">
                {saving ? (
                  <>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    <span>Saving...</span>
                  </>
                ) : hasUnsavedChanges ? (
                  <>
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    <span>Unsaved changes</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <span>Saved {lastSaved ? lastSaved.toLocaleTimeString() : ''}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Article Editor */}
        <ArticleEditor
          key={`article-${article.id}`} // Stable key - only change when article ID changes
          articleId={articleId!}
          initialContent={article.content}
          onSave={(content) => saveArticle(content, { showToast: true })}
          onAutoSave={handleAutoSave}
          onContentChange={handleContentChange}
          adminMode={uiMode === 'admin'}
          adminUser={userContext.isAdmin ? userContext as any : undefined}
          originalAuthor={article.user_id !== userContext.id ? { 
            id: article.user_id,
            company_name: originalAuthorCompany,
            email: article.user_email || 'unknown@example.com',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            article_count: 0
          } as any : undefined}
          onStatusChange={handleStatusChange}
          onBack={() => navigate(uiMode === 'admin' ? '/admin' : '/dashboard')}
          isAiCopilotOpen={showAICoPilot}
          externalContent={article.content}
          forceContentUpdate={true}
        />
      </div>

      {/* AI Co-Pilot - Admin Only */}
      {uiMode === 'admin' && (
        <ArticleAICoPilot
          isVisible={showAICoPilot}
          onToggle={() => setShowAICoPilot(!showAICoPilot)}
          articleContent={currentArticleContent || article.content}
          articleTitle={article.title || 'Untitled Article'}
          authorCompanyName={originalAuthorCompany}
          onSuggestion={(suggestion) => {
            // Handle AI suggestions - could integrate with editor
            console.log('AI Suggestion:', suggestion);
            toast.success('AI suggestion received! Check the console for details.');
          }}
        />
      )}
    </div>
  );
  } catch (error) {
    console.error('🚨 UNIFIED EDITOR ERROR:', error);
    return <div className="min-h-screen bg-red-900 text-white p-8">
      <h1>UnifiedArticleEditor Error</h1>
      <pre>{String(error)}</pre>
    </div>;
  }
};

export default UnifiedArticleEditor; 