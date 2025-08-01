import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings,
  Users,
  CheckSquare,
  UserIcon,
  Calendar,
  BookOpen,
  Shield,
  BarChart3,
  FileText,
  AlertTriangle,
  X,
  Edit3,
  Loader2
} from 'lucide-react';
import { EnhancedArticleList } from '../components/admin/EnhancedArticleList';
import { BulkOperationsPanel } from '../components/admin/BulkOperationsPanel';
import { OwnershipTransferModal } from '../components/admin/OwnershipTransferModal';
import { VersionHistoryModal } from '../components/admin/VersionHistoryModal';
import { MetadataEditorModal } from '../components/admin/MetadataEditorModal';
import { ArticleEditor } from '../components/ArticleEditor';
import type { ArticleListItem, UserProfile } from '../types/adminApi';
import type { UnifiedArticleContent } from '../lib/unifiedArticleApi';
import { unifiedArticleService } from '../lib/unifiedArticleApi';
import { toast } from 'react-hot-toast';
import { 
  auditLogger, 
  logArticleView, 
  logStatusChange, 
  logOwnershipTransfer, 
  logBulkOperation,
  logArticleDelete,
  logArticleExport
} from '../lib/auditLogger';
import { User } from '@supabase/supabase-js';
import { useAdminContext } from '../contexts/AdminContext';
import { BaseModal } from '../components/ui/BaseModal';


// Define props for the page
interface AdminArticleManagementPageProps {
  user?: User | null; // Authenticated Supabase user (optional since we'll use AdminContext)
}

// Interface for article editing modal state
interface ArticleEditingState {
  isOpen: boolean;
  article: ArticleListItem | null;
  originalAuthor: UserProfile | null;
  articleContent: UnifiedArticleContent | null;
  isLoadingContent: boolean;
  contentError: string | null;
}

const mockArticles: ArticleListItem[] = Array.from({ length: 15 }, (_, i) => ({
  id: `article-id-${i + 1}`,
  title: `Sample Article Title ${i + 1}: Exploring Advanced Topics`,
  product_name: i % 3 === 0 ? 'InnovateAI Suite' : (i % 3 === 1 ? 'SynergyCRM Pro' : 'QuantumLeap Analytics'),
  user_id: `user-id-${(i % 5) + 1}`,
  user_email: `user${(i % 5) + 1}@example.com`,
  user_company: `Client Company ${(i % 5) + 1}`,
  editing_status: i % 5 === 0 ? 'draft' : (i % 5 === 1 ? 'editing' : (i % 5 === 2 ? 'review' : (i % 5 === 3 ? 'final' : 'published'))),
  last_edited_by: `user-id-${(i % 5) + 1}`,
  article_version: (i % 3) + 1,
  created_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
  last_edited_at: new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString(),
}));

function AdminArticleManagementPage({ user }: AdminArticleManagementPageProps) {
  console.log('🚀 [ADMIN PAGE] Component mounted/re-rendered');
  
  // Use AdminContext for admin authentication
  const { isAdmin, adminRole, adminId, adminEmail, isLoading: isLoadingAdminProfile } = useAdminContext();
  const [selectedArticles, setSelectedArticles] = useState<ArticleListItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null); // For potential future user filtering
  const [showOwnershipModal, setShowOwnershipModal] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [activeArticleForModal, setActiveArticleForModal] = useState<ArticleListItem | null>(null);
  const [articleEditing, setArticleEditing] = useState<ArticleEditingState>({
    isOpen: false,
    article: null,
    originalAuthor: null,
    articleContent: null,
    isLoadingContent: true,
    contentError: null
  });


  const handleArticleSelectionChange = async (article: ArticleListItem) => {
    const isSelected = selectedArticles.some(a => a.id === article.id);
    if (isSelected) {
      setSelectedArticles(prev => prev.filter(a => a.id !== article.id));
    } else {
      setSelectedArticles(prev => [...prev, article]);
      // Log article view when selected for bulk operations
      await logArticleView(article.id, 'Article selected for bulk operations');
    }
  };

  const clearSelectedArticles = () => {
    setSelectedArticles([]);
  };

  // Real API call functions for bulk operations with audit logging
  const realBulkStatusUpdate = async (articleIds: string[], status: 'draft' | 'editing' | 'review' | 'final' | 'published') => {
    toast.loading(`Updating ${articleIds.length} articles to ${status}...`, { id: 'bulk-status' });
    
    try {
      // Import the real adminBulkApi
      const { adminBulkApi } = await import('../lib/adminApi');
      
      // Log the bulk operation first
      await logBulkOperation(articleIds, 'status_change', { 
        new_status: status,
        operation_type: 'bulk_status_update'
      });

      // Call the real API
      const result = await adminBulkApi.bulkStatusChange(articleIds, status, `Bulk status change to ${status}`);
      
      console.log('Real Bulk Status Update Result:', result);
      
      if (result.successes.length > 0) {
        toast.success(`${result.successes.length} articles updated to ${status}. ${result.failures.length} failed.`, { id: 'bulk-status' });
      } else {
        toast.error(`All ${result.failures.length} articles failed to update.`, { id: 'bulk-status' });
      }
      
      return { 
        successful: result.successes, 
        failed: result.failures 
      };
    } catch (error) {
      console.error('Real bulk status update failed:', error);
      toast.error('Failed to update article statuses', { id: 'bulk-status' });
      throw error;
    }
  };

  const mockBulkDelete = async (articleIds: string[]) => {
    toast.loading(`Deleting ${articleIds.length} articles...`, { id: 'bulk-delete' });
    
    try {
      // Log each deletion
      await Promise.all(
        articleIds.map(articleId => 
          logArticleDelete(articleId, 'Bulk deletion operation')
        )
      );

      return new Promise<{ successful: string[]; failed: { id: string; error: string }[] }>((resolve) => {
        setTimeout(() => {
          const successful = articleIds;
          const failed: { id: string; error: string }[] = [];
          console.log('Mock Bulk Delete:', { successful, failed });
          toast.success(`${successful.length} articles deleted.`, { id: 'bulk-delete' });
          resolve({ successful, failed });
        }, 1500);
      });
    } catch (error) {
      console.error('Audit logging failed for bulk delete:', error);
      toast.error('Failed to log admin action', { id: 'bulk-delete' });
      throw error;
    }
  };

  const mockBulkExport = async (articleIds: string[]) => {
    toast.loading(`Exporting ${articleIds.length} articles...`, { id: 'bulk-export' });
    
    try {
      // Log the export operation
      await logArticleExport(articleIds, 'json');

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          console.log('Mock Bulk Export:', articleIds);
          const blob = new Blob([JSON.stringify(selectedArticles.filter(a => articleIds.includes(a.id)), null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `exported-articles-${Date.now()}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success(`${articleIds.length} articles exported.`, { id: 'bulk-export' });
          resolve();
        }, 1000);
      });
    } catch (error) {
      console.error('Audit logging failed for bulk export:', error);
      toast.error('Failed to log admin action', { id: 'bulk-export' });
      throw error;
    }
  };

  const mockBulkOwnershipTransfer = async (articleIds: string[], newOwnerId: string) => {
    toast.loading(`Transferring ${articleIds.length} articles to ${newOwnerId}...`, { id: 'bulk-transfer' });
    
    try {
      // Log each ownership transfer
      await Promise.all(
        articleIds.map(articleId => {
          const article = selectedArticles.find(a => a.id === articleId);
          return logOwnershipTransfer(
            articleId, 
            article?.user_id || 'unknown', 
            newOwnerId, 
            'Bulk ownership transfer operation'
          );
        })
      );

      return new Promise<{ successful: string[]; failed: { id: string; error: string }[] }>((resolve) => {
        setTimeout(() => {
          const successful = articleIds;
          const failed: { id: string; error: string }[] = [];
          console.log('Mock Bulk Ownership Transfer:', { articleIds, newOwnerId, successful, failed });
          toast.success(`${successful.length} articles transferred.`, { id: 'bulk-transfer' });
          resolve({ successful, failed });
        }, 1500);
      });
    } catch (error) {
      console.error('Audit logging failed for bulk ownership transfer:', error);
      toast.error('Failed to log admin action', { id: 'bulk-transfer' });
      throw error;
    }
  };

  // Article editing handlers
  const handleEditArticle = async (article: ArticleListItem) => {
    console.log('🔥 handleEditArticle called with article:', article.id, article.title);
    try {
      // Fetch the original author's company from user_profiles table
      let userCompanyName = 'Unknown Company';
      try {
        const { supabase } = await import('../lib/supabase');
        const { data: userProfile, error } = await supabase
          .from('user_profiles')
          .select('company_name')
          .eq('id', article.user_id)
          .single();
        
        if (!error && userProfile) {
          userCompanyName = userProfile.company_name || 'Unknown Company';
        }
      } catch (dbError) {
        console.error('Error fetching user company:', dbError);
      }

      // Create user profile for the original author with fetched company
      const originalAuthor: UserProfile = {
        id: article.user_id,
        email: article.user_email || 'unknown@example.com',
        company_name: userCompanyName,
        created_at: article.created_at,
        updated_at: article.updated_at,
        article_count: 0 // This would be fetched from API in real implementation
      };
      setArticleEditing({
        isOpen: true,
        article,
        originalAuthor,
        articleContent: null,
        isLoadingContent: true,
        contentError: null
      });

      console.log('🔥 Modal should now be open, loading article content...');

      // Load the actual article content using admin API
      if (adminId) {
        try {
          const result = await unifiedArticleService.loadArticle(article.id);
          if (!result.success) {
            throw new Error(result.error || 'Failed to load article content');
          }
          const articleContent = result.data;
          
          if (articleContent) {
            console.log('🔥 Article content loaded successfully:', {
              id: articleContent.id,
              title: articleContent.title,
              contentLength: articleContent.content?.length || 0,
              contentPreview: articleContent.content?.substring(0, 100)
            });
            
            setArticleEditing(prev => ({
              ...prev,
              originalAuthor, // Ensure we use the fresh originalAuthor with correct company name
              articleContent,
              isLoadingContent: false,
              contentError: null
            }));
          } else {
            throw new Error('Failed to load article content');
          }
        } catch (contentError) {
          console.error('❌ Error loading article content:', contentError);
          setArticleEditing(prev => ({
            ...prev,
            articleContent: null,
            isLoadingContent: false,
            contentError: contentError instanceof Error ? contentError.message : 'Failed to load article content'
          }));
          toast.error('Failed to load article content for editing');
        }
      } else {
        setArticleEditing(prev => ({
          ...prev,
          articleContent: null,
          isLoadingContent: false,
          contentError: 'Admin profile not available'
        }));
        toast.error('Admin profile not available');
      }

      // Log article editing access
      await logArticleView(article.id, 'Admin opened article for editing');
    } catch (error) {
      console.error('Error opening article for editing:', error);
      toast.error('Failed to open article for editing');
      setArticleEditing({
        isOpen: false,
        article: null,
        originalAuthor: null,
        articleContent: null,
        isLoadingContent: false,
        contentError: null
      });
    }
  };

  const handleCloseEditor = () => {
    setArticleEditing({
      isOpen: false,
      article: null,
      originalAuthor: null,
      articleContent: null,
      isLoadingContent: true,
      contentError: null
    });
  };

  const handleArticleStatusChange = async (status: 'draft' | 'editing' | 'review' | 'final' | 'published') => {
    if (articleEditing.article) {
      try {
        // Log status change
        await logStatusChange(
          articleEditing.article.id,
          articleEditing.article.editing_status,
          status,
          `Admin changed status from ${articleEditing.article.editing_status} to ${status}`
        );
        
        toast.success(`Article status changed to ${status}`);
        // In real implementation, this would update the article in the backend
      } catch (error) {
        console.error('Error changing article status:', error);
        toast.error('Failed to change article status');
      }
    }
  };

  const handleArticleOwnershipTransfer = async (newOwnerId: string) => {
    if (articleEditing.article && articleEditing.originalAuthor) {
      try {
        // Log ownership transfer
        await logOwnershipTransfer(
          articleEditing.article.id,
          articleEditing.originalAuthor.id,
          newOwnerId,
          'Admin transferred ownership during editing'
        );
        
        toast.success('Article ownership transferred');
        // In real implementation, this would update the article ownership in the backend
      } catch (error) {
        console.error('Error transferring ownership:', error);
        toast.error('Failed to transfer ownership');
      }
    }
  };

  const handleAdminNote = async (note: string) => {
    if (articleEditing.article) {
      try {
        // Log admin note
        await auditLogger.logAction(
          articleEditing.article.id,
          'edit',
          'Admin added note during editing',
          { admin_note: note }
        );
        
        toast.success('Admin note saved');
        // In real implementation, this would save the note to the backend
      } catch (error) {
        console.error('Error saving admin note:', error);
        toast.error('Failed to save admin note');
      }
    }
  };

  const handleAutoSave = async (content: string) => {
    console.log('🔥🔥🔥 [ADMIN] AUTOSAVE FUNCTION CALLED! 🔥🔥🔥');
    console.log('🔄 [ADMIN] handleAutoSave called:', {
      hasArticle: !!articleEditing.article,
      hasAdminId: !!adminId,
      hasOriginalAuthor: !!articleEditing.originalAuthor,
      contentLength: content.length,
      articleId: articleEditing.article?.id
    });
    
    if (articleEditing.article && adminId && articleEditing.originalAuthor) {
      try {
        console.log('🔄 [ADMIN] Calling unified API auto-save with:', {
          articleId: articleEditing.article.id,
          adminId,
          originalAuthorId: articleEditing.originalAuthor.id,
          contentLength: content.length
        });
        
        // Use the unified auto-save API
        const result = await unifiedArticleService.autoSave(
          articleEditing.article.id,
          content
        );
        const success = result.success;
        
        if (success) {
          console.log('✅ [ADMIN] Auto-save successful for article:', articleEditing.article.id);
        } else {
          console.error('❌ [ADMIN] Auto-save failed for article:', articleEditing.article.id, result.error);
        }
      } catch (error) {
        console.error('❌ [ADMIN] Error during auto-save:', error);
        // Don't show toast for auto-save errors to avoid interrupting user experience
      }
    } else {
      console.warn('⚠️ [ADMIN] Auto-save skipped - missing required data:', {
        hasArticle: !!articleEditing.article,
        hasAdminId: !!adminId,
        hasOriginalAuthor: !!articleEditing.originalAuthor
      });
    }
  };

  // Modal control functions with audit logging
  const openOwnershipTransferModal = async (article: ArticleListItem) => {
    setActiveArticleForModal(article);
    setShowOwnershipModal(true);
    // Log modal access
    await logArticleView(article.id, 'Opened ownership transfer modal');
  };

  const openVersionHistoryModal = async (article: ArticleListItem) => {
    setActiveArticleForModal(article);
    setShowVersionHistory(true);
    // Log modal access
    await logArticleView(article.id, 'Opened version history modal');
  };

  const openMetadataEditorModal = async (article: ArticleListItem) => {
    setActiveArticleForModal(article);
    setShowMetadataEditor(true);
    // Log modal access
    await logArticleView(article.id, 'Opened metadata editor modal');
  };

  // Handlers for modal completions with audit logging
  const handleOwnershipTransferCompleted = async (newOwnerId: string, newOwner: UserProfile) => {
    if (activeArticleForModal) {
      try {
        // Log the ownership transfer
        await logOwnershipTransfer(
          activeArticleForModal.id,
          activeArticleForModal.user_id,
          newOwnerId,
          `Transferred to ${newOwner.company_name || newOwner.email}`
        );

        toast.success(`Article "${activeArticleForModal?.title}" transferred to ${newOwner.company_name || newOwner.email}`);
        setShowOwnershipModal(false);
        // Here you would typically refetch or update the article list
      } catch (error) {
        console.error('Audit logging failed for ownership transfer:', error);
        toast.error('Failed to log ownership transfer');
      }
    }
  };

  const handleVersionRestored = async (versionId: string, version: any /* ArticleVersion from modal */) => {
    if (activeArticleForModal) {
      try {
        // Log the version restore
        await auditLogger.logAction(
          activeArticleForModal.id,
          'restore',
          `Restored to version ${version.version}`,
          { version_id: versionId, version_number: version.version }
        );

        toast.success(`Article "${activeArticleForModal?.title}" restored to version ${version.version}`);
        setShowVersionHistory(false);
        // Refetch or update
      } catch (error) {
        console.error('Audit logging failed for version restore:', error);
        toast.error('Failed to log version restore');
      }
    }
  };

  const handleMetadataSaved = async (metadata: any /* ArticleMetadata from modal */) => {
    if (activeArticleForModal) {
      try {
        // Log the metadata update
        await auditLogger.logAction(
          activeArticleForModal.id,
          'edit',
          'Updated article metadata',
          { metadata_changes: metadata }
        );

        toast.success(`Metadata for "${activeArticleForModal?.title}" saved.`);
        setShowMetadataEditor(false);
        // Refetch or update
        return Promise.resolve(); // As MetadataEditorModal expects a Promise
      } catch (error) {
        console.error('Audit logging failed for metadata update:', error);
        toast.error('Failed to log metadata update');
        throw error;
      }
    }
    return Promise.resolve();
  };

  if (isLoadingAdminProfile) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-900">
        <Loader2 className="h-12 w-12 animate-spin text-yellow-400" />
        <p className="ml-4 text-white text-lg">Loading your admin profile...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-900 p-8">
        <AlertTriangle className="h-16 w-16 text-red-500 mb-6" />
        <h2 className="text-2xl font-semibold text-white mb-4">Access Denied</h2>
        <p className="text-gray-300 text-center mb-6 max-w-md">
          You don't have admin access to manage articles. 
          Please contact your administrator to request access.
        </p>
        {/* Optionally, add a button to retry or logout */}
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-yellow-400 flex items-center">
            <BookOpen size={32} className="mr-3" /> Article Management
          </h1>
          {/* Add any top-level actions here if needed */}
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="w-full">
        {/* Article List and Bulk Operations */}
        <motion.div 
          className="space-y-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <EnhancedArticleList
            selectedUser={selectedUser} 
            onArticleSelect={handleArticleSelectionChange}
            onEditArticle={handleEditArticle} 
            className="mb-6"
          />
          {selectedArticles.length > 0 && (
            <BulkOperationsPanel
              selectedArticles={selectedArticles}
              onClearSelection={clearSelectedArticles}
              onStatusUpdate={realBulkStatusUpdate}
              onDelete={mockBulkDelete} 
              onExport={mockBulkExport} 
              onOwnershipTransfer={mockBulkOwnershipTransfer}
            />
          )}
        </motion.div>
      </div>

      {/* Article Editor Modal */}
      {articleEditing.isOpen && articleEditing.article && (
        <BaseModal
          isOpen={articleEditing.isOpen}
          onClose={handleCloseEditor}
          title=""
          size="full"
          theme="dark"
          showCloseButton={false}
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-gray-700/50 bg-gradient-to-r from-gray-800 via-gray-800 to-gray-700">
              <div className="px-3 sm:px-6 py-3 sm:py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                    <div className="p-2 sm:p-3 bg-yellow-400/10 rounded-lg sm:rounded-xl border border-yellow-400/20 shadow-lg flex-shrink-0">
                      <Edit3 size={20} className="sm:w-6 sm:h-6 text-yellow-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg sm:text-2xl font-semibold text-white mb-1 sm:mb-2 tracking-wide truncate">
                        {articleEditing.article.title || articleEditing.article.product_name}
                      </h2>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-sm text-gray-400">
                        <div className="flex items-center space-x-2 px-2 py-1 bg-gray-700/30 rounded-lg">
                          <UserIcon size={14} className="flex-shrink-0" />
                          <span className="truncate">
                            Author: <span className="text-gray-300">{articleEditing.originalAuthor?.email || 'Unknown'}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center space-x-2 px-2 py-1 bg-gray-700/30 rounded-lg">
                            <Calendar size={14} className="flex-shrink-0" />
                            <span className="text-xs sm:text-sm">
                              {new Date(articleEditing.article.last_edited_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <FileText size={14} className="text-blue-400 flex-shrink-0" />
                            <span className="text-blue-400 font-medium text-xs sm:text-sm">v{articleEditing.article.article_version}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.05, rotate: 90 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCloseEditor}
                    className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-white transition-all duration-300 border border-gray-600/50 hover:border-gray-500/50 shadow-lg flex-shrink-0"
                  >
                    <X size={18} className="sm:w-[22px] sm:h-[22px]" />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
              <div className="flex-1 p-2 sm:p-4 overflow-auto">
                <div className="h-auto min-h-[600px] w-full rounded-xl bg-white border border-gray-700/50 shadow-inner overflow-auto">
                  {articleEditing.isLoadingContent ? (
                    // Loading state
                    <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-gray-500">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-6"
                      />
                      <motion.p 
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-lg font-medium mb-2"
                      >
                        Loading article content...
                      </motion.p>
                      <motion.p 
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-sm text-gray-400"
                      >
                        Syncing with user's latest version
                      </motion.p>
                    </div>
                  ) : articleEditing.contentError ? (
                    // Error state
                    <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-gray-500">
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6"
                      >
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                      </motion.div>
                      <motion.p 
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="text-lg font-medium mb-2 text-red-600"
                      >
                        Failed to load article content
                      </motion.p>
                      <motion.p 
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-sm text-gray-400 mb-4 text-center max-w-md"
                      >
                        {articleEditing.contentError}
                      </motion.p>
                      <motion.button
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleEditArticle(articleEditing.article!)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Retry Loading
                      </motion.button>
                    </div>
                  ) : articleEditing.articleContent ? (
                    // Article editor with content
                    (() => {
                      
                      // Test the handleAutoSave function
                      console.log('🧪 Testing handleAutoSave function:', {
                        functionExists: typeof handleAutoSave === 'function',
                        functionName: handleAutoSave.name
                      });
                      // Create admin user profile from AdminContext
                      const adminUserProfile: UserProfile = {
                        id: adminId || '',
                        email: adminEmail || '',
                        company_name: 'Admin',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        article_count: 0
                      };

                      // Create a wrapper function to ensure it's properly bound
                      const autoSaveWrapper = async (content: string) => {
                        console.log('🔥🔥🔥 WRAPPER FUNCTION CALLED! 🔥🔥🔥', {
                          timestamp: new Date().toISOString(),
                          contentLength: content?.length || 0,
                          wrapperType: typeof autoSaveWrapper,
                          handleAutoSaveType: typeof handleAutoSave,
                          callStack: (new Error()).stack?.split('\n').slice(1, 4)
                        });
                        console.log('About to call handleAutoSave...', {
                          functionExists: !!handleAutoSave,
                          functionName: handleAutoSave?.name || 'unknown'
                        });
                        
                        // Test if the function exists and is callable
                        if (!handleAutoSave) {
                          console.error('❌ handleAutoSave is null or undefined!');
                          return;
                        }
                        
                        if (typeof handleAutoSave !== 'function') {
                          console.error('❌ handleAutoSave is not a function!', typeof handleAutoSave);
                          return;
                        }
                        
                        try {
                          console.log('🚀 Calling handleAutoSave now...');
                          const result = await handleAutoSave(content);
                          console.log('✅ handleAutoSave completed successfully', { result });
                        } catch (error) {
                          console.error('❌ handleAutoSave failed:', error);
                          throw error;
                        }
                      };

                      return (
                        <ArticleEditor
                          articleId={articleEditing.article.id}
                          initialContent={articleEditing.articleContent.content || ''}
                          adminMode={true}
                          adminUser={adminUserProfile}
                          originalAuthor={articleEditing.originalAuthor}
                          onAutoSave={autoSaveWrapper}
                          onStatusChange={handleArticleStatusChange}
                          onOwnershipTransfer={handleArticleOwnershipTransfer}
                          onAdminNote={handleAdminNote}
                          className="w-full min-h-[600px] overflow-auto"
                        />
                      );
                    })()
                  ) : (
                    // Fallback state
                    <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-gray-500">
                      <AlertTriangle className="w-12 h-12 text-gray-400 mb-4" />
                      <p className="text-lg font-medium mb-2">No content available</p>
                      <p className="text-sm text-gray-400">Unable to load article content</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Enhanced Footer with Admin Badge */}
            <div className="flex-shrink-0 border-t border-gray-700/50 bg-gradient-to-r from-gray-800/80 to-gray-800/60 backdrop-blur-sm">
              <div className="px-3 sm:px-6 py-2 sm:py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div className="flex items-center space-x-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-red-500/10 border border-red-500/20 rounded-full shadow-lg">
                      <Shield size={14} className="sm:w-4 sm:h-4 text-red-400 flex-shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-red-400 tracking-wide">ADMIN MODE</span>
                    </div>
                    <div className="hidden sm:block h-6 w-px bg-gray-600"></div>
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                        <UserIcon size={12} className="sm:w-4 sm:h-4 text-gray-900" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-300 font-medium truncate max-w-48">{adminEmail}</p>
                        <p className="text-xs text-gray-500">Administrator</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-2 sm:gap-4">
                    <div className="px-2 sm:px-3 py-1 bg-gray-700/30 rounded-lg border border-gray-600/30">
                      <p className="text-xs text-gray-400">Powered by <span className="text-blue-400 font-medium">BOFU AI</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </BaseModal>
      )}

      {/* Modals */}
      {activeArticleForModal && adminId && (() => {
        // Create admin user profile from AdminContext
        const currentAdminProfile: UserProfile = {
          id: adminId,
          email: adminEmail || '',
          company_name: 'Admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          article_count: 0
        };

        return (
          <>
            <OwnershipTransferModal
              isOpen={showOwnershipModal}
              onClose={() => setShowOwnershipModal(false)}
              article={activeArticleForModal}
              currentUser={currentAdminProfile} // Use the explicitly typed variable
              onTransferComplete={handleOwnershipTransferCompleted}
            />
            <VersionHistoryModal
              isOpen={showVersionHistory}
              onClose={() => setShowVersionHistory(false)}
              article={activeArticleForModal}
              onRestoreVersion={handleVersionRestored}
            />
            <MetadataEditorModal
              isOpen={showMetadataEditor}
              onClose={() => setShowMetadataEditor(false)}
              article={activeArticleForModal}
              onSaveMetadata={handleMetadataSaved}
            />
          </>
        );
      })()}
    </div>
  );
}

export default AdminArticleManagementPage;
