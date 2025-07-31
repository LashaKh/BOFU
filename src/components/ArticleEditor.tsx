import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';

console.log('🔥 ARTICLE EDITOR MODULE: File imported/loaded');
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ImageWithResize } from '../extensions/ImageExtension';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Save, 
  Download, 
  Upload, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Type, 
  List, 
  ListOrdered, 
  Quote, 
  Code, 
  Table as TableIcon, 
  Palette, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  Strikethrough, 
  Highlighter, 
  Undo, 
  Redo, 
  ChevronDown, 
  Check, 
  Loader2, 
  Monitor, 
  Maximize2, 
  Minimize2, 
  Focus as FocusIcon, 
  Eye, 
  MoreVertical,
  MessageSquare,
  User,
  Users,
  Upload as UploadIcon,
  AlertCircle,
  CheckCircle,
  X,
  Search,
  Keyboard,
  History,
  MessageCircle,
  Sparkles,
  Columns,
  CheckSquare,
  Grid3X3,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Settings,
  PaintBucket,
  ArrowLeft,
} from 'lucide-react';
import { ExportButton } from './ui/ExportButton';
import { MediaLibrarySelector } from './ui/MediaLibrarySelector';
import { LinkTooltip } from './ui/LinkTooltip';
import { CommentingSystem, ArticleComment } from './ui/CommentingSystem';
import { ImageResizer } from './ui/ImageResizer';
import { InlineCommentingExtension } from './ui/InlineCommentingExtension';
import { CommentHighlightExtension } from '../extensions/CommentHighlightExtension';
import { ToolbarButton } from './ui/ToolbarButton';
import { ArticleColorPicker } from './ui/ArticleColorPicker';
import { StatusIndicator } from './ui/StatusIndicator';
import { ToolbarSeparator } from './ui/ToolbarSeparator';
import { LinkEditor } from './ui/LinkEditor';
import { useTheme } from '../hooks/useTheme';
import { getTextNodeAtOffset, getTextOffset, htmlToMarkdown } from '../lib/textUtils';
import { loadArticleContent, saveArticleContent, ArticleContent, autoSaveArticleContentAsAdmin, saveArticleContentAsAdmin } from '../lib/articleApi';
import { adminArticlesApi } from '../lib/adminApi';
import { getArticleComments, subscribeToComments } from '../lib/commentApi';
import { debounce } from 'lodash';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { supabase } from '../lib/supabase';
import UserPresence from './ui/UserPresence';
// import CollaborativeCursors from './ui/CollaborativeCursors'; // Removed per user request
import { realtimeCollaboration } from '../lib/realtimeCollaboration';
import { useLayout } from '../contexts/LayoutContext';
import { useUserCompany } from '../contexts/ProfileContext';

// Import enhanced CSS styles
import '../styles/article-editor-enhanced.css';
import '../styles/image-editor.css';

// Define UserProfile interface
interface UserProfile {
  id: string;
  email: string;
  company_name?: string;
  role?: string;
  avatar_url?: string;
  status?: 'viewing' | 'editing' | 'idle';
}




// Enhanced Undo/Redo History Panel with better design
const UndoRedoHistoryPanel = ({ editor }: { editor: any }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const updateCounts = () => {
      // Access history from editor if available
      const history = editor.extensionManager.extensions.find((ext: any) => ext.name === 'history');
      if (history) {
        // Mock counts for demonstration
        setUndoCount(Math.min(editor.can().undo() ? 5 : 0, 5));
        setRedoCount(Math.min(editor.can().redo() ? 3 : 0, 3));
      }
    };

    updateCounts();
    editor.on('transaction', updateCounts);

    return () => {
      editor.off('transaction', updateCounts);
    };
  }, [editor]);

  const handleBulkUndo = (steps: number) => {
    for (let i = 0; i < steps && editor?.can().undo(); i++) {
      editor.chain().undo().run();
    }
    setShowHistory(false);
  };

  const handleBulkRedo = (steps: number) => {
    for (let i = 0; i < steps && editor?.can().redo(); i++) {
      editor.chain().redo().run();
    }
    setShowHistory(false);
  };

  return (
    <div className="relative flex items-center space-x-1">
      <ToolbarButton
        icon={Undo}
        label={`Undo${undoCount > 0 ? ` (${undoCount})` : ''}`}
        onClick={() => editor?.chain().focus().undo().run()}
        disabled={!editor?.can().undo()}
        variant="ghost"
        badge={undoCount > 0 ? undoCount : undefined}
      />
      <ToolbarButton
        icon={Redo}
        label={`Redo${redoCount > 0 ? ` (${redoCount})` : ''}`}
        onClick={() => editor?.chain().focus().redo().run()}
        disabled={!editor?.can().redo()}
        variant="ghost"
        badge={redoCount > 0 ? redoCount : undefined}
      />
      <ToolbarButton
        icon={History}
        label="History Options"
        onClick={() => setShowHistory(!showHistory)}
        variant="ghost"
        size="sm"
      />

      {/* History Dropdown */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 min-w-[200px]"
          >
            <div className="space-y-1">
              <div className="text-xs font-medium text-gray-500 px-2 py-1">
                Bulk Operations
              </div>
              {[1, 5, 10, 20].map((steps) => (
                <div key={`undo-${steps}`} className="flex space-x-1">
                  <button
                    onClick={() => handleBulkUndo(steps)}
                    disabled={!editor?.can().undo()}
                    className="flex-1 text-left px-2 py-1 text-xs hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Undo {steps} steps
                  </button>
                  <button
                    onClick={() => handleBulkRedo(steps)}
                    disabled={!editor?.can().redo()}
                    className="flex-1 text-left px-2 py-1 text-xs hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Redo {steps} steps
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};



// Simple type for user profile
interface UserProfile {
  id: string;
  email: string;
  company_name?: string;
  role?: string;
  avatar_url?: string;
  status?: 'viewing' | 'editing' | 'idle';
}


const autoSaveArticleContent = async (
  articleId: string, 
  content: string, 
  adminMode: boolean = false, 
  adminUserId?: string, 
  originalAuthorId?: string
) => {
  if (adminMode && adminUserId && originalAuthorId) {
    const success = await autoSaveArticleContentAsAdmin(articleId, content, adminUserId, originalAuthorId);
    return {
      success,
      error: success ? undefined : 'Failed to save as admin'
    };
  }
  return saveArticleContent(articleId, content);
};

interface ArticleEditorProps {
  articleId?: string;
  initialContent?: string;
  onSave?: (content: string) => void;
  onAutoSave?: (content: string) => void;
  onContentChange?: (content: string) => void;
  className?: string;
  // Admin-specific props
  adminMode?: boolean;
  adminUser?: UserProfile | null;
  originalAuthor?: UserProfile | null;
  onStatusChange?: (status: 'draft' | 'editing' | 'review' | 'final' | 'published') => void;
  onOwnershipTransfer?: (newOwnerId: string) => void;
  onAdminNote?: (note: string) => void;
  isAiCopilotOpen?: boolean;
  onBack?: () => void;
  // Real-time collaboration props
  externalContent?: string;
  forceContentUpdate?: boolean;
}

type ViewMode = 'editor' | 'preview' | 'split';
type FocusMode = 'normal' | 'focused' | 'zen';




const ArticleEditorComponent: React.FC<ArticleEditorProps> = ({
  articleId,
  initialContent = '',
  onSave,
  onAutoSave,
  onContentChange,
  className = '',
  // Admin-specific props
  adminMode = false,
  adminUser,
  originalAuthor,
  onStatusChange,
  onOwnershipTransfer,
  onAdminNote,
  isAiCopilotOpen = false,
  onBack,
  // Real-time collaboration props
  externalContent,
  forceContentUpdate = false
}) => {
  console.log('🎯 BASIC RENDER: ArticleEditor function called');
  
  // Layout context for responsive sidebar handling
  const { layout, setCommentsSidebarVisible } = useLayout();
  
  // Get user company for media library access
  const userCompany = useUserCompany();
  
  // Component lifecycle logging
  useEffect(() => {
    console.log('🚀 [ARTICLE EDITOR] Component mounted/remounted:', {
      articleId,
      initialContentLength: initialContent.length,
      adminMode,
      timestamp: new Date().toISOString()
    });
    
    return () => {
      console.log('🛑 [ARTICLE EDITOR] Component unmounting:', {
        articleId,
        adminMode,
        timestamp: new Date().toISOString()
      });
    };
  }, []); // Empty deps means this runs only on mount/unmount
  // Enhanced theme management
  const { theme } = useTheme();
  
  // UI State with better organization
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [focusMode, setFocusMode] = useState<FocusMode>('normal');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showLinkTooltip, setShowLinkTooltip] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState('#000000');
  const [currentHighlightColor, setCurrentHighlightColor] = useState('#fef08a');
  
  // Content and Save State
  const [content, setContent] = useState(initialContent);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Force re-render counter for ensuring UI updates
  const [updateCounter, setUpdateCounter] = useState(0);
  
  // Comments and Collaboration
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [textSelection, setTextSelection] = useState<{ start: number; end: number; text: string; range?: Range } | null>(null);
  const [linkData, setLinkData] = useState<any>(null);
  
  // Real-time Collaboration State
  const [isCollaborationReady, setIsCollaborationReady] = useState(false);
  
  // Image Selection State
  const [selectedImage, setSelectedImage] = useState<{
    element: HTMLImageElement;
    node: any;
    pos: number;
    position: { x: number; y: number; width: number; height: number };
  } | null>(null);
  
  // Word count and stats
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [readingTime, setReadingTime] = useState(0);


  // Update image position on scroll
  useEffect(() => {
    if (!selectedImage) return;

    const updateImagePosition = () => {
      if (selectedImage) {
        const rect = selectedImage.element.getBoundingClientRect();
        
        setSelectedImage(prev => prev ? {
          ...prev,
          position: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          }
        } : null);
      }
    };

    window.addEventListener('scroll', updateImagePosition, { passive: true });
    window.addEventListener('resize', updateImagePosition, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateImagePosition);
      window.removeEventListener('resize', updateImagePosition);
    };
  }, [selectedImage]);

  const [article, setArticle] = useState<ArticleContent | null>(null);
  const mounted = useRef(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [linkTooltip, setLinkTooltip] = useState<{
    show: boolean;
    data: any | null;
    position: { x: number; y: number };
  }>({ show: false, data: null, position: { x: 0, y: 0 } });

  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  
  // Use a ref to access current comments without causing re-renders
  const commentsRef = useRef<ArticleComment[]>([]);
  
  // Update the ref whenever comments change
  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  // Sync comments sidebar state with layout context - use useRef to prevent infinite loops
  const previousShowComments = useRef(showComments);
  useEffect(() => {
    if (previousShowComments.current !== showComments) {
      setCommentsSidebarVisible(showComments);
      previousShowComments.current = showComments;
    }
  }, [showComments, setCommentsSidebarVisible]);

  const loadComments = useCallback(async () => {
    if (!articleId) return;
    try {
      const fetchedComments = await getArticleComments(articleId);
      // Ensure comment status types are correct
      const typedComments = fetchedComments.map(comment => ({
        ...comment,
        status: comment.status as "active" | "resolved" | "archived"
      }));
      setComments(typedComments);
    } catch (error) {
      console.error('❌ Error loading comments in ArticleEditor:', error);
    }
  }, [articleId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Real-time subscription for comment updates
  useEffect(() => {
    if (!articleId) return;

    console.log('💬 [ADMIN] Setting up real-time subscription for comments on article:', articleId);
    
    const unsubscribe = subscribeToComments(articleId, (updatedComments) => {
      console.log('💬 [ADMIN] Real-time comment update detected:', updatedComments.length, 'comments');
      
      // Update the comments state
      const typedComments = updatedComments.map(comment => ({
        ...comment,
        status: comment.status as "active" | "resolved" | "archived"
      }));
      setComments(typedComments);
    });

    // Cleanup subscription on unmount
    return () => {
      console.log('💬 [ADMIN] Cleaning up real-time subscription for comments');
      unsubscribe();
    };
  }, [articleId]);

  // Text selection tracking for inline comments
  useEffect(() => {
    if (!editorRef.current) return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setTextSelection(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const selectedTextContent = selection.toString().trim();

      if (!selectedTextContent || selectedTextContent.length < 3) {
        setTextSelection(null);
        return;
      }

      // Check if selection is within the editor
      if (!editorRef.current || !editorRef.current.contains(range.commonAncestorContainer)) {
        setTextSelection(null);
        return;
      }

      // Calculate text offsets
      const editorTextContent = editorRef.current.textContent || '';
      const startNode = getTextNodeAtOffset(editorRef.current, 0);
      
      if (startNode) {
        const startOffset = getTextOffset(editorRef.current, range.startContainer, range.startOffset);
        const endOffset = startOffset + selectedTextContent.length;

        setTextSelection({
          start: startOffset,
          end: endOffset,
          text: selectedTextContent,
          range: range.cloneRange()
        });
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editorRef]);

  // Initialize real-time collaboration when articleId is available
  useEffect(() => {
    if (!articleId) return;

    const initializeCollaboration = async () => {
      try {
        // Get current user info for metadata
        const { data: { user } } = await supabase.auth.getUser();
        const userMetadata = {
          name: adminUser?.email?.split('@')[0] || user?.email?.split('@')[0],
          email: adminUser?.email || user?.email,
          avatar_url: user?.user_metadata?.avatar_url
        };
        
        // Join the article for real-time collaboration
        await realtimeCollaboration.joinArticle(articleId, userMetadata);
        setIsCollaborationReady(true);
        console.log('✅ Joined real-time collaboration for article:', articleId);
      } catch (error) {
        console.error('Failed to initialize collaboration:', error);
      }
    };

    initializeCollaboration();

    // Cleanup on unmount
    return () => {
      realtimeCollaboration.leaveArticle();
      setIsCollaborationReady(false);
      console.log('👋 Left real-time collaboration');
    };
  }, [articleId, adminUser]);


  // Load article content when articleId is provided
  useEffect(() => {
    let isMounted = true;

    const loadArticleData = async () => {
      if (!articleId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        console.log('🔄 Loading article content...', { articleId, adminMode });

        let articleData;

        if (adminMode) {
          // Use admin API to load article
          const result = await adminArticlesApi.getArticle(articleId);
          if (result.error || !result.data) {
            console.error('❌ Error loading article as admin:', result.error);
            setIsLoading(false);
            return;
          }
          articleData = {
            id: result.data.id,
            title: result.data.title,
            content: result.data.article_content,
            editing_status: result.data.editing_status,
            last_edited_at: result.data.last_edited_at,
            last_edited_by: result.data.last_edited_by,
            article_version: result.data.article_version,
            user_id: result.data.user_id,
            product_name: result.data.product_name,
            created_at: result.data.created_at,
            updated_at: result.data.updated_at
          };
        } else {
          // Use regular user API to load article
          const result = await loadArticleContent(articleId);
          if (!result.success || !result.data) {
            console.error('❌ Error loading article content:', result.error);
            setIsLoading(false);
            return;
          }
          articleData = result.data;
        }

        if (isMounted && articleData) {
          console.log('✅ Article loaded successfully:', articleData.id);
          setArticle(articleData);
          
          // Set initial content if not already set
          if (articleData.content && !content) {
            setContent(articleData.content);
            // Note: Editor will be updated in a separate useEffect when editor is ready
          }
        }
      } catch (error) {
        console.error('❌ Error loading article:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadArticleData();

    return () => {
      isMounted = false;
    };
  }, [articleId, adminMode]);

  // Create stable comment click handler with layout context integration
  const handleCommentClick = useCallback((comment) => {
    console.log('🔥 handleCommentClick called with comment:', comment.id);
    console.log('📊 Current state - highlightedCommentId:', highlightedCommentId, 'showComments:', showComments);
    
    // Always set the highlighted comment (no toggle when clicking from highlighted text)
    setHighlightedCommentId(comment.id);
    
    // Open the comments sidebar using both methods for compatibility
    setShowComments(true);
    setCommentsSidebarVisible(true);
    
    console.log('✅ Updated state - setting highlightedCommentId to:', comment.id, 'and opening sidebar');
    
    // Scroll to the comment in the sidebar after a brief delay to ensure sidebar is open
    setTimeout(() => {
      scrollToCommentInSidebar(comment.id);
    }, 300);
  }, [setHighlightedCommentId, setShowComments, setCommentsSidebarVisible, highlightedCommentId, showComments]);
  
  // Function to scroll to a specific comment in the sidebar
  const scrollToCommentInSidebar = useCallback((commentId: string) => {
    console.log('📍 Scrolling to comment in sidebar:', commentId);
    
    // Find the comment element in the sidebar
    const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (commentElement) {
      // Find the closest scrollable container (likely the sidebar content area)
      const scrollContainer = commentElement.closest('.overflow-y-auto') || 
                            commentElement.closest('[class*="scroll"]') ||
                            document.querySelector('.comments-sidebar-container');
      
      if (scrollContainer) {
        console.log('🎯 Found scroll container, scrolling to comment:', commentId);
        
        // Calculate the position relative to the scroll container
        const containerRect = scrollContainer.getBoundingClientRect();
        const commentRect = commentElement.getBoundingClientRect();
        const relativeTop = commentRect.top - containerRect.top + scrollContainer.scrollTop;
        
        // Scroll to the comment with some offset for better visibility
        const scrollTop = Math.max(0, relativeTop - 100);
        
        scrollContainer.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });
        
        console.log('✅ Scrolled to comment in sidebar:', { commentId, scrollTop });
      } else {
        // Fallback: use scrollIntoView
        console.log('🔄 Using fallback scrollIntoView for comment:', commentId);
        commentElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    } else {
      console.warn('⚠️ Comment element not found in sidebar:', commentId);
    }
  }, []);

  // Enhanced editor-specific click handler for comments
  useEffect(() => {
    console.log('🔧 Enhanced click handler useEffect running:', {
      hasEditorRef: !!editorRef.current,
      commentsLength: comments.length
    });
    
    if (!editorRef.current) {
      console.log('❌ No editorRef.current, skipping click handler setup');
      return;
    }

    const editorElement = editorRef.current;
    console.log('✅ Setting up click handlers on editor element:', editorElement);
    
    const handleEditorMouseDown = (event: MouseEvent) => {
      console.log('🎯 Editor mousedown detected:', { 
        target: event.target, 
        type: event.type,
        clientX: event.clientX,
        clientY: event.clientY,
        timestamp: Date.now()
      });
      
      const target = event.target as HTMLElement;
      
      // First check direct target
      if (target.classList?.contains('comment-highlight-tiptap')) {
        const commentId = target.getAttribute('data-comment-id');
        const comment = comments.find(c => c.id === commentId);
        
        console.log('🎯 DIRECT TARGET is comment highlight:', { commentId, comment: !!comment });
        
        if (comment && comment.status !== 'resolved') {
          console.log('✅ Editor mousedown DIRECT: Calling handleCommentClick for:', comment.id);
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          
          // Clear any text selection
          if ('getSelection' in window) {
            window.getSelection()?.removeAllRanges();
          }
          
          handleCommentClick(comment);
          return;
        }
      }
      
      // Then check elements at point
      try {
        const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
        console.log('🔍 All elements at click point:', elementsAtPoint.map(el => ({ 
          tag: el.tagName, 
          classes: Array.from(el.classList || []),
          isCommentHighlight: el.classList.contains('comment-highlight-tiptap'),
          commentId: el.getAttribute('data-comment-id')
        })));
        
        // Look for comment highlights in the elements at click point
        for (const element of elementsAtPoint) {
          if (element.classList.contains('comment-highlight-tiptap')) {
            const commentId = element.getAttribute('data-comment-id');
            const comment = comments.find(c => c.id === commentId);
            
            console.log('🎯 Found comment at click point:', { commentId, comment: !!comment, status: comment?.status });
            
            if (comment && comment.status !== 'resolved') {
              console.log('✅ Editor mousedown ELEMENTS_AT_POINT: Calling handleCommentClick for:', comment.id);
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
              
              // Clear any text selection
              if ('getSelection' in window) {
                window.getSelection()?.removeAllRanges();
              }
              
              handleCommentClick(comment);
              return;
            }
            break;
          }
        }
      } catch (error) {
        console.error('Error in elementsFromPoint:', error);
      }
      
      // Finally check DOM traversal
      let commentElement = target;
      for (let i = 0; i < 5 && commentElement; i++) {
        if (commentElement.classList?.contains('comment-highlight-tiptap')) {
          const commentId = commentElement.getAttribute('data-comment-id');
          const comment = comments.find(c => c.id === commentId);
          
          console.log('🎯 Found comment via DOM traversal:', { commentId, comment: !!comment, level: i });
          
          if (comment && comment.status !== 'resolved') {
            console.log('✅ Editor mousedown DOM_TRAVERSAL: Calling handleCommentClick for:', comment.id);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            // Clear any text selection
            if ('getSelection' in window) {
              window.getSelection()?.removeAllRanges();
            }
            
            handleCommentClick(comment);
            return;
          }
          break;
        }
        commentElement = commentElement.parentElement as HTMLElement;
      }
      
      console.log('🔍 No comment highlight found at click location');
    };

    // Add mousedown listener to the editor with high priority  
    editorElement.addEventListener('mousedown', handleEditorMouseDown, true);
    console.log('✅ Mousedown listener attached to editor');
    
    // Debug: Immediate check for comments and highlights
    console.log('🔍 IMMEDIATE DEBUG CHECK:', {
      commentsLength: comments.length,
      commentsWithSelectedText: comments.filter(c => c.selected_text).length,
      editorHasContent: !!editorElement.textContent,
      editorContentLength: editorElement.textContent?.length || 0,
      editorHtml: editorElement.innerHTML.substring(0, 200) + '...'
    });
    
    // Add a global test function for manual debugging
    (window as any).testCommentClick = () => {
      const highlights = document.querySelectorAll('.comment-highlight-tiptap');
      console.log('🧪 MANUAL TEST - Found highlights:', highlights.length);
      
      highlights.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        console.log(`🧪 Highlight ${i}:`, {
          element: el,
          commentId: el.getAttribute('data-comment-id'),
          text: el.textContent?.substring(0, 30),
          isVisible: rect.width > 0 && rect.height > 0,
          position: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          style: el.getAttribute('style'),
          computedStyle: {
            pointerEvents: getComputedStyle(el).pointerEvents,
            cursor: getComputedStyle(el).cursor,
            zIndex: getComputedStyle(el).zIndex
          }
        });
      });
      
      if (highlights.length > 0) {
        console.log('🧪 Try clicking on the first highlight programmatically...');
        const firstHighlight = highlights[0] as HTMLElement;
        const rect = firstHighlight.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Simulate a click
        const clickEvent = new MouseEvent('click', {
          clientX: centerX,
          clientY: centerY,
          bubbles: true,
          cancelable: true
        });
        firstHighlight.dispatchEvent(clickEvent);
        console.log('🧪 Programmatic click dispatched!');
      }
    };
    
    console.log('🧪 Test function added! Type testCommentClick() in console to debug');
    
    // Also add it immediately to window for testing
    setTimeout(() => {
      (window as any).testCommentClick = (window as any).testCommentClick || (() => {
        console.log('🧪 Emergency test function - searching entire document...');
        const highlights = document.querySelectorAll('.comment-highlight-tiptap');
        console.log('🧪 Found highlights in entire document:', highlights.length);
        
        if (highlights.length === 0) {
          console.log('🚨 NO HIGHLIGHTS FOUND! Checking if comments exist in React state...');
          console.log('🔍 Available global variables:', Object.keys(window).filter(k => k.includes('comment') || k.includes('Comment')));
        }
        
        return highlights;
      });
    }, 1000);
    
    // Debug: Log comment highlights in DOM every few seconds
    const debugInterval = setInterval(() => {
      const highlights = editorElement.querySelectorAll('.comment-highlight-tiptap');
      console.log('📋 Periodic highlight check:', {
        highlightCount: highlights.length,
        commentsCount: comments.length,
        editorContentLength: editorElement.textContent?.length || 0
      });
      
      if (highlights.length > 0) {
        console.log('📋 Comment highlights in DOM:', Array.from(highlights).map(el => ({
          id: el.getAttribute('data-comment-id'),
          text: el.textContent?.substring(0, 20) + '...',
          style: el.getAttribute('style'),
          classes: Array.from(el.classList),
          isVisible: el.offsetWidth > 0 && el.offsetHeight > 0
        })));
      }
    }, 3000);
    
    // Test if ANY clicks are being detected
    const handleEditorClickTest = (event: MouseEvent) => {
      console.log('🔥 CLICK TEST: Any click detected on editor!', {
        target: event.target,
        clientX: event.clientX,
        clientY: event.clientY,
        timestamp: Date.now()
      });
      handleEditorMouseDown(event);
    };
    
    editorElement.addEventListener('click', handleEditorClickTest, true);
    console.log('✅ Click listener attached to editor');

    return () => {
      editorElement.removeEventListener('mousedown', handleEditorMouseDown, true);
      editorElement.removeEventListener('click', handleEditorClickTest, true);
      clearInterval(debugInterval);
      console.log('🧹 Click handlers removed from editor');
    };
  }, [editorRef, comments, handleCommentClick]);

  const getEditorExtensions = useMemo(() => {
    return [
      StarterKit.configure({
        history: {
          depth: 100,
          newGroupDelay: 500,
        },
        // Disable extensions we'll add individually to avoid duplicates
        strike: false,
        horizontalRule: false,
        codeBlock: false,
        bulletList: false, // Disable built-in bullet list
        orderedList: false, // Disable built-in ordered list
        listItem: false, // Disable built-in list item
        paragraph: {
          HTMLAttributes: {
            class: 'text-base leading-relaxed',
          },
        },
      }),
      ImageWithResize.configure({
        inline: true,
        allowBase64: true,
        allowResize: true,
      }),
      // Custom list extensions with proper CSS classes
      ListItem.configure({
        HTMLAttributes: {
          style: 'margin: 0.25rem 0; display: list-item;',
        },
      }),
      BulletList.configure({
        HTMLAttributes: {
          class: 'bullet-list',
          style: 'list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0;',
        },
      }),
      OrderedList.configure({
        HTMLAttributes: {
          class: 'ordered-list',
          style: 'list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0;',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['ftp', 'mailto'],
        HTMLAttributes: {
          class: 'text-blue-600 hover:text-blue-700 transition-colors cursor-pointer',
        },
      }),
      Highlight.configure({ 
        multicolor: true,
        HTMLAttributes: {
          class: 'text-highlight'
        }
      }),
      Typography,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      CommentHighlightExtension.configure({
        comments: [], // We'll update this dynamically
        highlightedCommentId: null, // We'll update this dynamically
        onCommentClick: () => {}, // We'll update this dynamically
      }),
    ];
  }, []); // No dependencies - extensions are stable

  // Comment highlighting is now handled by CommentHighlightExtension

  const editor = useEditor({
    extensions: getEditorExtensions,
    content: content,
    editable: true,
    autofocus: true,
    editorProps: {
      attributes: {
        class: `prose max-w-none focus:outline-none p-6 editor-scrollbar`,
        'data-testid': 'article-editor-content',
        contenteditable: 'true', // Explicitly ensure contenteditable
        spellcheck: 'false', // Disable spellcheck to prevent Grammarly interference
      },
      handleKeyDown: (view, event) => {
        console.log('🎹 Key event in editor:', event.key, event.type);
        return false; // Allow normal key handling
      },
      handleClick: (view, pos, event) => {
        console.log('🖱️ Click event in editor:', pos);
        // Ensure editor gets focus on click using view
        if (view && !view.hasFocus()) {
          view.focus();
        }
        return false; // Allow normal click handling
      },
    },
    onUpdate: ({ editor }) => {
      const newContent = editor.getHTML();
      if (newContent !== content) { // Only update if content actually changed
        console.log('✏️ Editor content updated:', newContent.length, 'characters');
        
        // Batch state updates to prevent multiple re-renders
        requestAnimationFrame(() => {
          setContent(newContent);
          setHasUnsavedChanges(true);
          
          // Call the onContentChange callback if provided
          if (onContentChange) {
            console.log('🔄 ArticleEditor calling onContentChange callback');
            onContentChange(newContent);
          }
        });
        
        // Trigger auto-save without waiting for state updates
        if (articleId && newContent.trim() !== content.trim()) {
          console.log('🔄 Triggering debouncedAutoSave...', { articleId, newContentLength: newContent.trim().length, oldContentLength: content.trim().length });
          debouncedAutoSave(newContent);
        }
      }
    },
    onCreate: ({ editor }) => {
      console.log('🎯 Editor created successfully', { 
        isEditable: editor.isEditable, 
        isFocused: editor.isFocused 
      });
      
      
      // Force focus after a short delay to ensure editor is ready
      setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.focus();
          console.log('🎯 Editor focused programmatically');
        }
      }, 100);
    },
    onFocus: () => {
      console.log('🎯 Editor received focus');
    },
    onBlur: () => {
      console.log('🎯 Editor lost focus');
    },
  }, []); // ✅ FIXED: No dependencies to prevent editor recreation

  // Image operation handlers - defined after editor
  const handleImageResize = useCallback((width: number, height: number) => {
    if (!selectedImage || !editor) return;
    
    console.log('🔄 Resizing image:', { width, height, pos: selectedImage.pos });
    
    // Update the image node attributes
    editor.chain().focus().updateAttributes('imageWithResize', {
      width: Math.round(width),
      height: Math.round(height),
    }).run();
    
    // Update the selected image position
    setTimeout(() => {
      if (selectedImage) {
        const rect = selectedImage.element.getBoundingClientRect();
        
        setSelectedImage(prev => prev ? {
          ...prev,
          position: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          }
        } : null);
      }
    }, 50);
  }, [selectedImage, editor]);

  const handleImageDelete = useCallback(() => {
    if (!selectedImage || !editor) return;
    
    if (window.confirm('Delete this image?')) {
      console.log('🗑️ Deleting image at position:', selectedImage.pos);
      editor.chain().focus().deleteRange({ 
        from: selectedImage.pos, 
        to: selectedImage.pos + 1 
      }).run();
      setSelectedImage(null);
    }
  }, [selectedImage, editor]);

  const handleImageEditCaption = useCallback(() => {
    if (!selectedImage || !editor) return;
    
    const currentCaption = selectedImage.node.attrs.caption || '';
    const newCaption = window.prompt('Enter image caption:', currentCaption);
    
    if (newCaption !== null) {
      console.log('📝 Updating image caption:', newCaption);
      editor.chain().focus().updateAttributes('imageWithResize', {
        caption: newCaption,
      }).run();
    }
  }, [selectedImage, editor]);

  const handleImageClose = useCallback(() => {
    console.log('❌ Closing image resizer');
    setSelectedImage(null);
  }, []);

  // Add a manual focus handler for the editor container
  const handleEditorContainerClick = useCallback((e: React.MouseEvent) => {
    console.log('🖱️ Editor container clicked');
    
    // Check if click is on an image or image controls
    const target = e.target as HTMLElement;
    const isImageClick = target.tagName === 'IMG' || 
                        target.closest('.image-resizer-overlay') ||
                        target.closest('.image-resize-handle') ||
                        target.classList.contains('resize-handle') ||
                        target.classList.contains('toolbar-button');
    
    // Deselect image if clicking elsewhere
    if (!isImageClick && selectedImage) {
      console.log('🖼️ Deselecting image due to outside click');
      setSelectedImage(null);
    }
    
    if (editor && !editor.isDestroyed) {
      // Small delay to ensure click event completes
      setTimeout(() => {
        editor.commands.focus();
        console.log('🎯 Editor focused from container click');
      }, 10);
    }
  }, [editor, selectedImage]);

  // Update comment highlighting when highlighted comment changes
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // Use a timeout to batch comment updates and prevent excessive re-renders
      const timeoutId = setTimeout(() => {
        console.log('🔍 Updating highlighted comment:', highlightedCommentId);
        
        // Try to update the extension directly
        const extension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'commentHighlight');
        if (extension) {
          console.log('✅ Found commentHighlight extension, updating highlightedCommentId');
          extension.storage.highlightedCommentId = highlightedCommentId;
          
          // Force re-render of decorations
          editor.view.dispatch(editor.state.tr);
          console.log('✅ Forced decoration refresh for highlight');
        } else {
          console.warn('⚠️ commentHighlight extension not found');
          
          // Try using command as fallback
          if (editor.commands.updateHighlightedComment) {
            console.log('✅ Using updateHighlightedComment command as fallback');
            editor.chain().focus().updateHighlightedComment(highlightedCommentId).run();
          }
        }
      }, 50); // Slightly longer delay to ensure extension is loaded
      
      return () => clearTimeout(timeoutId);
    }
  }, [editor, highlightedCommentId]);

  // Update comment data when comments change
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // Use a timeout to batch comment updates and prevent excessive re-renders
      const timeoutId = setTimeout(() => {
        console.log('🔍 Updating comments in editor, count:', comments.length);
        
        // Try to update the extension directly
        const extension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'commentHighlight');
        if (extension) {
          console.log('✅ Found commentHighlight extension, updating storage');
          extension.storage.comments = comments;
          extension.storage.onCommentClick = handleCommentClick;
          
          // Force re-render of decorations by dispatching an empty transaction
          editor.view.dispatch(editor.state.tr);
          console.log('✅ Forced decoration refresh');
        } else {
          console.warn('⚠️ commentHighlight extension not found');
          
          // Try using commands as fallback
          const chain = editor.chain().focus();
          
          // Check if updateComments command exists
          if (editor.commands.updateComments) {
            console.log('✅ Using updateComments command as fallback');
            chain.updateComments(comments);
          }
          
          // Check if updateOnCommentClick command exists
          if (editor.commands.updateOnCommentClick) {
            console.log('✅ Using updateOnCommentClick command as fallback');
            chain.updateOnCommentClick(handleCommentClick);
          }
          
          // Run the chain
          chain.run();
        }
      }, 50); // Slightly longer delay to ensure extension is loaded
      
      return () => clearTimeout(timeoutId);
    }
  }, [editor, comments, handleCommentClick]);

  // Update user status when actively editing (simplified - no cursor positioning)
  useEffect(() => {
    if (!editor || !isCollaborationReady) return;

    const handleTransaction = () => {
      // Update status to editing on any transaction (typing, formatting, etc.)
      if (articleId) {
        realtimeCollaboration.updatePresence(articleId, 'editing');
      }
    };

    // Add event listeners only if editor exists
    if (!editor) return;
    
    editor.on('transaction', handleTransaction);

    return () => {
      if (editor) {
        editor.off('transaction', handleTransaction);
      }
    };
  }, [editor, isCollaborationReady, articleId]);

  // Cleanup for imageSelected event listener
  useEffect(() => {
    const handleImageSelected = (event: CustomEvent) => {
      const { imageElement, node, pos } = event.detail;
      console.log('🖼️ ArticleEditor: Received imageSelected event', { imageElement, node, pos });
      
      // Calculate image position for overlay (using fixed positioning, so no scroll offset needed)
      const rect = imageElement.getBoundingClientRect();
      
      setSelectedImage({
        element: imageElement,
        node: node,
        pos: pos,
        position: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        }
      });
    };

    if (editor?.view?.dom) {
      editor.view.dom.addEventListener('imageSelected', handleImageSelected as EventListener);
      
      return () => {
        if (editor?.view?.dom) {
          editor.view.dom.removeEventListener('imageSelected', handleImageSelected as EventListener);
        }
      };
    }
  }, [editor]);
  
  // Auto-save functionality with stable debounced function
  const debouncedAutoSave = useMemo(
    () => {
      console.log('🔧 Creating new debouncedAutoSave function...');
      return debounce(async (content: string) => {
      console.log('🚀 debouncedAutoSave function executing...', { articleId, contentLength: content.trim().length });
      
      if (!articleId || !content.trim()) {
        console.log('⚠️ debouncedAutoSave early return:', { hasArticleId: !!articleId, hasContent: !!content.trim() });
        return;
      }
      
      try {
        // Set auto-saving state optimistically without causing re-renders
        setIsAutoSaving(true);
        
        // Get current values without creating dependencies
        const currentOnAutoSave = onAutoSave;
        const currentAdminMode = adminMode;
        const currentAdminUser = adminUser;
        const currentOriginalAuthor = originalAuthor;

        // Use unified auto-save function if provided, otherwise fallback to old API
        if (currentOnAutoSave) {
          console.log('🔄 Using unified auto-save function for:', { adminMode: currentAdminMode, articleId });
          await currentOnAutoSave(content);
          console.log('✅ onAutoSave function completed successfully');
          
          // Update status smoothly without causing layout shifts
          setTimeout(() => {
            setSaveStatus('saved');
            setLastSaved(new Date());
            setHasUnsavedChanges(false);
          }, 0);
        } else {
          console.warn('⚠️ No unified auto-save function provided, falling back to old API');
          const result = await autoSaveArticleContent(articleId, content, currentAdminMode, currentAdminUser?.id, currentOriginalAuthor?.id);
          
          // Update status after a microtask to prevent layout thrashing
          setTimeout(() => {
            if (result.success) {
              setSaveStatus('saved');
              setLastSaved(new Date());
              setHasUnsavedChanges(false);
            } else {
              setSaveStatus('error');
              console.error('Auto-save failed:', result.error);
            }
          }, 0);
        }
      } catch (error) {
        setTimeout(() => {
          setSaveStatus('error');
          console.error('Auto-save error:', error);
        }, 0);
      } finally {
        // Always clear auto-saving state
        setTimeout(() => {
          setIsAutoSaving(false);
        }, 100);
      }
      }, 3000);
    },
    [articleId] // Only include absolutely necessary stable dependencies
  );

  // Manual save functionality
  const handleSave = async () => {
    if (!editor || !articleId) return;
    
    const currentContent = editor.getHTML();
    
    try {
      setIsAutoSaving(true);
      setSaveStatus('saving');
      
      // Use the unified save function passed from UnifiedArticleEditor
      if (onSave) {
        console.log('🔄 Using unified save function for:', { adminMode, articleId });
        await onSave(currentContent);
        
        // The UnifiedArticleEditor handles the save result and status
        setSaveStatus('saved');
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      } else {
        // Fallback to old API if no unified save function provided
        console.warn('⚠️ No unified save function provided, falling back to old API');
        
        let result;
        if (adminMode && adminUser?.id && originalAuthor?.id) {
          const adminResult = await saveArticleContentAsAdmin(
            articleId, 
            currentContent, 
            adminUser.id, 
            originalAuthor.id, 
            'editing'
          );
          result = {
            success: !!adminResult,
            error: adminResult ? undefined : 'Failed to save as admin'
          };
        } else {
          result = await saveArticleContent(articleId, currentContent);
        }
        
        if (result.success) {
          setSaveStatus('saved');
          setLastSaved(new Date());
          setHasUnsavedChanges(false);
        } else {
          setSaveStatus('error');
          console.error('Save failed:', result.error);
        }
      }
    } catch (error) {
      setSaveStatus('error');
      console.error('Save error:', error);
    } finally {
      setIsAutoSaving(false);
    }
  };

  // Enhanced word count calculation
  const updateWordCount = useCallback((content: string) => {
    const text = content.replace(/<[^>]*>/g, '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const reading = Math.ceil(words / 200); // 200 words per minute
    
    setWordCount(words);
    setCharCount(chars);
    setReadingTime(reading);
  }, []);

  // Monitor content changes for word count
  useEffect(() => {
    if (content) {
      updateWordCount(content);
    }
  }, [content, updateWordCount]);

  const hasAdminUser = useMemo(() => !!adminUser, [adminUser]);
  const hasOriginalAuthor = useMemo(() => originalAuthor?.id === adminUser?.id, [originalAuthor, adminUser]);

  // Handle image insert
  const handleImageInsert = (imageUrl: string, metadata?: { altText?: string; caption?: string; width?: number; height?: number }) => {
    if (editor) {
      editor.chain().focus().setImage({ 
        src: imageUrl,
        alt: metadata?.altText || '',
        caption: metadata?.caption || '',
        width: metadata?.width,
        height: metadata?.height
      }).run();
    }
  };

  // Handle edit link
  const handleEditLink = (linkData: any) => {
    setLinkData(linkData);
    setShowLinkEditor(true);
  };

  // Handle link save from modal
  const handleLinkSave = (url: string, text: string) => {
    if (!editor) return;
    
    if (text) {
      // Insert link with custom text
      editor.chain().focus().insertContent(`<a href="${url}">${text}</a>`).run();
    } else {
      // Set link for selected text or insert URL as text
      if (editor.state.selection.empty) {
        editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
      } else {
        editor.chain().focus().setLink({ href: url }).run();
      }
    }
    
    setShowLinkEditor(false);
    setLinkData(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      if (isCtrlOrCmd) {
        switch (event.key) {
          case 's':
            event.preventDefault();
            handleSave();
            break;
          case 'm':
            event.preventDefault();
            setShowComments(!showComments);
            break;
        }
      }

      // Escape key
      if (event.key === 'Escape') {
        setShowImageUpload(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showComments]);

  // Auto-show comments if there are existing comments
  useEffect(() => {
    if (comments.length > 0 && !showComments) {
      setShowComments(true);
    }
  }, [comments.length]);

  // Cleanup debounced save on unmount
  useEffect(() => {
    return () => {
      debouncedAutoSave.cancel();
    };
  }, [debouncedAutoSave]);

  // Update editor content when external content changes (real-time collaboration)
  useEffect(() => {
    if (editor && !editor.isDestroyed && externalContent !== undefined) {
      const shouldUpdateContent = forceContentUpdate || (content !== externalContent && !isAutoSaving);
      
      if (shouldUpdateContent) {
        console.log('🔄 [ARTICLE EDITOR] Setting editor content from external update:', {
          currentContentLength: content?.length || 0,
          externalContentLength: externalContent.length,
          forceUpdate: forceContentUpdate,
          isAutoSaving,
          timestamp: new Date().toISOString()
        });
        
        // Update editor content without emitting update event to prevent loops
        setTimeout(() => {
          if (editor && !editor.isDestroyed && !isAutoSaving) {
            editor.commands.setContent(externalContent, false); // false = don't emit update event
            setContent(externalContent);
          }
        }, 0);
      }
    }
  }, [editor, externalContent, forceContentUpdate, isAutoSaving]);

  // Initial content load from article prop (for first load)
  useEffect(() => {
    if (editor && !editor.isDestroyed && article && article.content && !content) {
      console.log('🔄 [ARTICLE EDITOR] Setting initial content from article:', {
        articleId: article.id,
        articleVersion: article.article_version,
        contentLength: article.content.length,
        adminMode,
        timestamp: new Date().toISOString()
      });
      
      setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(article.content, false);
          setContent(article.content);
        }
      }, 0);
    }
  }, [editor, article?.id, article?.content]); // Only run on initial load

  // Focus management effect - ensure editor is focusable
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // Double-check editable state
      if (!editor.isEditable) {
        console.log('⚠️ Editor not editable, making it editable');
        editor.setEditable(true);
      }
      
      // Log editor state for debugging
      console.log('📊 Editor state:', {
        isEditable: editor.isEditable,
        isFocused: editor.isFocused,
        isEmpty: editor.isEmpty,
        canEdit: editor.can().insertContent('test')
      });
    }
  }, [editor]);


  // Enhanced command handlers that maintain selection and focus
  const executeCommand = useCallback((commandFn: () => any, commandName: string) => {
    if (!editor || editor.isDestroyed) {
      console.error('❌ Editor not available for command:', commandName);
      return false;
    }

    try {
      console.log('🎯 Executing command:', commandName, {
        hasSelection: !editor.state.selection.empty,
        selectionFrom: editor.state.selection.from,
        selectionTo: editor.state.selection.to,
        isFocused: editor.isFocused,
        isEditable: editor.isEditable
      });

      // Store the current selection
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to);
      
      console.log('📝 Selected text:', selectedText);

      // Execute the command
      const result = commandFn();
      
      console.log('✅ Command executed:', commandName, result);
      
      // Debug: Log the current HTML to see what's being generated
      if (commandName.includes('List')) {
        const currentHTML = editor.getHTML();
        console.log('🔍 Current HTML after list command:', currentHTML.substring(Math.max(0, currentHTML.length - 500)));
        
        // Debug: Check for ul and ol elements specifically
        const ulMatches = currentHTML.match(/<ul[^>]*>/g);
        const olMatches = currentHTML.match(/<ol[^>]*>/g);
        const liMatches = currentHTML.match(/<li[^>]*>/g);
        
        console.log('🔍 Found UL elements:', ulMatches);
        console.log('🔍 Found OL elements:', olMatches);
        console.log('🔍 Found LI elements:', liMatches);
        
        // Debug: Search for any list elements in the full HTML
        if (currentHTML.includes('<ul') || currentHTML.includes('<ol')) {
          const listStart = Math.max(0, currentHTML.search(/<[uo]l/));
          const listEnd = Math.min(currentHTML.length, listStart + 1000);
          console.log('🔍 List HTML section:', currentHTML.substring(listStart, listEnd));
        }
      }
      
      // Force editor focus and UI update
      if (!editor.isFocused) {
        editor.commands.focus();
      }
      
      // Force editor to update its internal state and trigger re-render
      setTimeout(() => {
        editor.commands.focus();
        // Trigger a content update to force re-render
        const currentContent = editor.getHTML();
        setContent(currentContent);
        console.log('🔄 Forced UI update after command:', commandName);
      }, 10);
      
      return result;
    } catch (error) {
      console.error('❌ Error executing command:', commandName, error);
      return false;
    }
  }, [editor]);

  const toggleBold = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleBold().run(), 'toggleBold');
  }, [editor, executeCommand]);

  const toggleItalic = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleItalic().run(), 'toggleItalic');
  }, [editor, executeCommand]);

  const toggleUnderline = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleUnderline().run(), 'toggleUnderline');
  }, [editor, executeCommand]);

  const toggleStrike = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleStrike().run(), 'toggleStrike');
  }, [editor, executeCommand]);

  const setTextColor = useCallback((color: string) => {
    return executeCommand(() => editor?.chain().focus().setColor(color).run(), `setColor(${color})`);
  }, [editor, executeCommand]);

  const setHighlight = useCallback((color: string) => {
    return executeCommand(() => editor?.chain().focus().toggleHighlight({ color }).run(), `setHighlight(${color})`);
  }, [editor, executeCommand]);

  const toggleHeading = useCallback((level: 1 | 2 | 3 | 4) => {
    return executeCommand(() => editor?.chain().focus().toggleHeading({ level }).run(), `toggleHeading(${level})`);
  }, [editor, executeCommand]);

  const toggleBulletList = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleBulletList().run(), 'toggleBulletList');
  }, [editor, executeCommand]);

  const toggleOrderedList = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleOrderedList().run(), 'toggleOrderedList');
  }, [editor, executeCommand]);

  const setTextAlign = useCallback((alignment: 'left' | 'center' | 'right') => {
    return executeCommand(() => editor?.chain().focus().setTextAlign(alignment).run(), `setTextAlign(${alignment})`);
  }, [editor, executeCommand]);

  const toggleBlockquote = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleBlockquote().run(), 'toggleBlockquote');
  }, [editor, executeCommand]);

  const toggleCodeBlock = useCallback(() => {
    return executeCommand(() => editor?.chain().focus().toggleCodeBlock().run(), 'toggleCodeBlock');
  }, [editor, executeCommand]);


  // Render main toolbar
  const renderMainToolbar = () => (
      <div 
        className={`
          ${focusMode === 'zen' ? 'hidden' : 'block'}
          bg-white backdrop-blur-xl border-b border-gray-200/50 px-6 py-4
          sticky top-0 z-[9999] shadow-sm
        `}
    >
      {/* Top toolbar row */}
      <div className={`${isAiCopilotOpen || layout.screenSize === 'mobile' || showComments ? 'flex flex-wrap items-center gap-2 justify-between' : 'flex items-center justify-between'} mb-4`}>
        {/* Left: File operations */}
        <div className="flex items-center gap-3">
          {onBack && (
            <ToolbarButton
              icon={ArrowLeft}
              label="Go Back"
              onClick={onBack}
              variant="ghost"
              size="md"
            >
              Back
            </ToolbarButton>
          )}
          <ToolbarButton
            icon={Save}
            label="Save (Ctrl+S)"
            onClick={handleSave}
            disabled={isAutoSaving}
            variant="primary"
            size="md"
          >
            Save
          </ToolbarButton>
          
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1 gap-1">
            <ExportButton 
              editor={editor}
              articleTitle={article?.title || 'Untitled Article'}
              articleId={articleId}
            />
            <ToolbarButton
              icon={Upload}
              label="Import"
              onClick={() => setShowImageUpload(true)}
              variant="ghost"
              size="sm"
            />
          </div>
        </div>

        {/* Center: Status indicator */}
        <div className="flex items-center gap-3">
          <StatusIndicator 
            status={saveStatus}
            isAutoSaving={isAutoSaving}
            lastSaved={lastSaved}
          />
          {articleId && (
            <UserPresence articleId={articleId} />
          )}
        </div>

        {/* Right: View and settings controls */}
        <div className="flex items-center gap-3">
          {/* Focus and theme controls */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1 gap-1">
            <ToolbarButton
              icon={MessageCircle}
              label="Toggle Comments (Ctrl+M)"
              isActive={showComments}
              onClick={() => setShowComments(!showComments)}
              variant={showComments ? 'primary' : 'ghost'}
              size="sm"
              badge={comments.length > 0 ? comments.length : undefined}
            />
            <ToolbarButton
              icon={focusMode === 'zen' ? Minimize2 : Maximize2}
              label={focusMode === 'zen' ? 'Exit Zen Mode' : 'Zen Mode'}
              onClick={() => setFocusMode(focusMode === 'zen' ? 'normal' : 'zen')}
              variant="ghost"
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Main formatting toolbar */}
      <div className={`${isAiCopilotOpen || layout.screenSize === 'mobile' || showComments ? 'flex flex-wrap items-center gap-2 justify-between' : 'flex items-center justify-between'}`}>
        {/* Left: Primary formatting tools */}
        <div className="flex items-center gap-3">
          {/* Undo/Redo */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1">
            <UndoRedoHistoryPanel editor={editor} />
          </div>

          <ToolbarSeparator />

          {/* Text formatting */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1">
            <ToolbarButton
              icon={Bold}
              label="Bold (Ctrl+B)"
              isActive={editor?.isActive('bold')}
              onClick={toggleBold}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={Italic}
              label="Italic (Ctrl+I)"
              isActive={editor?.isActive('italic')}
              onClick={toggleItalic}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={UnderlineIcon}
              label="Underline (Ctrl+U)"
              isActive={editor?.isActive('underline')}
              onClick={toggleUnderline}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={Strikethrough}
              label="Strikethrough"
              isActive={editor?.isActive('strike')}
              onClick={toggleStrike}
              variant="ghost"
              size="sm"
            />
          </div>

          <ToolbarSeparator />

          {/* Headings */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1">
            <ToolbarButton
              icon={Heading1}
              label="Heading 1"
              isActive={editor?.isActive('heading', { level: 1 })}
              onClick={() => toggleHeading(1)}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={Heading2}
              label="Heading 2"
              isActive={editor?.isActive('heading', { level: 2 })}
              onClick={() => toggleHeading(2)}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={Heading3}
              label="Heading 3"
              isActive={editor?.isActive('heading', { level: 3 })}
              onClick={() => toggleHeading(3)}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={Heading4}
              label="Heading 4"
              isActive={editor?.isActive('heading', { level: 4 })}
              onClick={() => toggleHeading(4)}
              variant="ghost"
              size="sm"
            />
          </div>

          <ToolbarSeparator />

          {/* Lists and alignment */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1">
            <ToolbarButton
              icon={List}
              label="Bullet List"
              isActive={editor?.isActive('bulletList')}
              onClick={toggleBulletList}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={ListOrdered}
              label="Numbered List"
              isActive={editor?.isActive('orderedList')}
              onClick={toggleOrderedList}
              variant="ghost"
              size="sm"
            />
          </div>

          <ToolbarSeparator />

          {/* Text alignment */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1">
            <ToolbarButton
              icon={AlignLeft}
              label="Align Left"
              isActive={editor?.isActive({ textAlign: 'left' })}
              onClick={() => setTextAlign('left')}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={AlignCenter}
              label="Align Center"
              isActive={editor?.isActive({ textAlign: 'center' })}
              onClick={() => setTextAlign('center')}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={AlignRight}
              label="Align Right"
              isActive={editor?.isActive({ textAlign: 'right' })}
              onClick={() => setTextAlign('right')}
              variant="ghost"
              size="sm"
            />
          </div>
        </div>

        {/* Right: Advanced tools and stats */}
        <div className="flex items-center gap-3">
          {/* Insert tools */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1">
            <ToolbarButton
              icon={LinkIcon}
              label="Insert Link"
              isActive={editor?.isActive('link')}
              onClick={() => {
                const selectedText = editor?.state.doc.textBetween(
                  editor.state.selection.from,
                  editor.state.selection.to
                );
                setSelectedText(selectedText || '');
                setShowLinkEditor(true);
              }}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={ImageIcon}
              label="Insert Image"
              onClick={() => setShowImageUpload(true)}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={TableIcon}
              label="Insert Table"
              onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={Quote}
              label="Quote"
              isActive={editor?.isActive('blockquote')}
              onClick={toggleBlockquote}
              variant="ghost"
              size="sm"
            />
            <ToolbarButton
              icon={Code}
              label="Code Block"
              isActive={editor?.isActive('codeBlock')}
              onClick={toggleCodeBlock}
              variant="ghost"
              size="sm"
            />
          </div>

          <ToolbarSeparator />

          {/* Text styling */}
          <div className="flex items-center bg-gray-200/90 rounded-xl p-1">
            <ArticleColorPicker
              onColorSelect={(color) => {
                setTextColor(color);
                setCurrentTextColor(color);
              }}
              currentColor={currentTextColor}
              type="text"
            />
            <ArticleColorPicker
              onColorSelect={(color) => {
                setHighlight(color);
                setCurrentHighlightColor(color);
              }}
              currentColor={currentHighlightColor}
              type="highlight"
            />
          </div>

          <ToolbarSeparator />

          {/* Word count and stats */}
          <div className="text-sm text-gray-700 bg-gray-200/80 px-3 py-2 rounded-lg backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <span className="font-medium">{wordCount} words</span>
              <span>{charCount} chars</span>
              <span>{readingTime} min read</span>
              {showComments && (
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" />
                  <span>{comments.length}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Prevent unwanted scrolling behavior
  useEffect(() => {
    const preventScrollOnClick = (e: Event) => {
      // Check if the click target is a toolbar button
      const target = e.target as HTMLElement;
      if (target && target.closest('[role="button"]') || target.closest('button')) {
        // Prevent any scroll-related behavior
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Add scroll prevention
    document.addEventListener('scroll', (e) => {
      // If we detect unwanted scrolling during button clicks, prevent it
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
        e.preventDefault();
      }
    }, { passive: false });

    const handleBeforeUnload = () => {
      if (hasUnsavedChanges) {
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`
          ${isFullscreen ? 'fixed inset-0 z-50' : 'relative'}
          ${className}
          bg-gray-50
          w-full flex flex-col
          ${focusMode === 'zen' ? 'h-screen' : ''}
        `}
        style={{
          ...(focusMode === 'zen' && {
            overflow: 'auto',
          })
        }}
      >
        {/* Custom styles for heading hierarchy */}
        <style dangerouslySetInnerHTML={{
          __html: `
            .article-editor-content h1 {
              font-size: 2.5rem !important;
              font-weight: 700 !important;
              line-height: 1.2 !important;
              margin-top: 2rem !important;
              margin-bottom: 1rem !important;
            }
            .article-editor-content h2 {
              font-size: 2rem !important;
              font-weight: 600 !important;
              line-height: 1.3 !important;
              margin-top: 1.75rem !important;
              margin-bottom: 0.875rem !important;
            }
            .article-editor-content h3 {
              font-size: 1.5rem !important;
              font-weight: 600 !important;
              line-height: 1.4 !important;
              margin-top: 1.5rem !important;
              margin-bottom: 0.75rem !important;
            }
            .article-editor-content h4 {
              font-size: 1.25rem !important;
              font-weight: 600 !important;
              line-height: 1.5 !important;
              margin-top: 1.25rem !important;
              margin-bottom: 0.625rem !important;
            }
            .article-editor-content p {
              font-size: 1.125rem !important;
              line-height: 1.7 !important;
              margin-bottom: 1rem !important;
            }
          `
        }} />

        {/* Sticky toolbar */}
        {renderMainToolbar()}

        {/* Main content area with proper layout - Make wider overall */}
        <div 
          className="flex-1 flex overflow-hidden transition-all duration-300" 
          style={{ 
            maxWidth: '100%',
            width: layout.screenSize === 'mobile' && showComments ? 'calc(100% - 300px)' : '100%'
          }}
        >
        {/* Editor area - takes most space */}
        <div 
          className={`flex-1 flex flex-col min-w-0 ${focusMode === 'zen' ? 'overflow-y-auto' : 'overflow-hidden'} transition-all duration-300`} 
          style={{ 
            minWidth: layout.screenSize === 'mobile' ? '100%' : showComments ? '60%' : '100%',
            maxWidth: showComments ? `calc(100% - ${layout.commentsSidebarWidth}px)` : '100%'
          }}
        >
          {/* Editor container - properly contained with overflow handling */}
          <div className={`flex-1 ${focusMode === 'zen' ? 'overflow-y-auto' : 'overflow-y-auto'}`} style={{ position: 'relative' }}>
            <div 
              ref={editorRef}
              data-editor="true"
              className={`
                px-8 min-h-full relative
                bg-white text-gray-900
                ${focusMode === 'zen' ? 'prose-2xl max-w-5xl mx-auto' : 'prose-xl max-w-none'}
                ${isMobile ? 'prose-lg' : ''}
                w-full leading-relaxed
                article-editor-content
              `}
              onClick={handleEditorContainerClick}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              style={{
                paddingTop: focusMode === 'zen' ? '32px' : '32px',
                scrollBehavior: 'auto', // Prevent smooth scrolling that might interfere
                ...(focusMode === 'zen' && {
                  minHeight: '100vh',
                  paddingBottom: '50vh', // Extra space for zen mode scrolling
                })
              }}
            >
              {/* Collaborative Cursors Overlay removed per user request */}
              
              <EditorContent 
                editor={editor} 
                className={`
                  prose prose-xl max-w-none focus:outline-none
                  ${focusMode === 'zen' ? 'prose-2xl max-w-5xl mx-auto' : 'prose-xl max-w-none'}
                  ${isMobile ? 'prose-lg' : ''}
                  w-full leading-relaxed
                `}
                style={{
                  lineHeight: focusMode === 'zen' ? '2' : '1.8',
                  fontSize: '18px',
                  paddingBottom: '2rem', // Minimal bottom padding
                  maxWidth: focusMode === 'zen' ? '1400px' : 'none',
                  margin: focusMode === 'zen' ? '0 auto' : '0',
                  pointerEvents: 'auto', // Ensure pointer events are enabled
                  userSelect: 'text', // Ensure text selection is enabled
                  cursor: 'text', // Show text cursor
                  minHeight: '200px', // Ensure minimum height for clicking
                }}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
              />
              
              {/* Empty state hint */}
              {editor?.isEmpty && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute top-12 left-12 text-gray-400 pointer-events-none select-none"
                >
                  <div className="space-y-6">
                    <div className="flex items-center space-x-3">
                      <Sparkles size={20} className="text-blue-400 animate-pulse-glow" />
                      <span className="text-xl font-light">Start writing your article here...</span>
                    </div>
                    {article?.product_name && (
                      <div className="text-base text-gray-500 max-w-2xl">
                        <div className="font-medium text-gray-600 mb-3 text-lg">Article: {article.product_name}</div>
                        <div className="space-y-3">
                          <div className="flex items-start space-x-3">
                            <span className="text-blue-500 mt-1">💡</span>
                            <div>
                              <strong>This article was created from a Google Doc.</strong> The content is currently empty in our editor.
                            </div>
                          </div>
                          <div className="ml-8 space-y-2 text-sm">
                            <div>• <strong>Start typing here</strong> to create new content</div>
                            <div>• <strong>Copy & paste</strong> from the Google Doc if you want to edit it here</div>
                            <div>• <strong>Use "Open Google Doc"</strong> button to view the original</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Inline Comments - Always rendered for seamless UX */}
        {articleId && (
          <InlineCommentingExtension
            articleId={articleId}
            editorRef={editorRef}
            selectedText={textSelection}
            comments={comments}
            onCommentsChange={setComments}
            getMarkerPosition={(start, end, ref) => {
              // Import the positioning logic from CommentingSystem
              if (!ref.current) return null;
              
              try {
                const editorTextContent = ref.current.textContent || '';
                const startNode = getTextNodeAtOffset(ref.current, start);
                const endNode = getTextNodeAtOffset(ref.current, end);
                
                if (!startNode || !endNode) return null;
                
                const range = document.createRange();
                range.setStart(startNode.node, startNode.offset);
                range.setEnd(endNode.node, endNode.offset);
                
                const rect = range.getBoundingClientRect();
                const editorRect = ref.current.getBoundingClientRect();
                
                return {
                  top: rect.top - editorRect.top,
                  left: rect.left - editorRect.left,
                  width: rect.width,
                  height: rect.height
                };
              } catch (error) {
                console.warn('Failed to calculate marker position:', error);
                return null;
              }
            }}
            onCommentClick={handleCommentClick}
            onCommentStatusChange={async (commentId, status) => {
              try {
                // Update comment status
                const updatedComments = comments.map(c => 
                  c.id === commentId ? { ...c, status: status as "active" | "resolved" | "archived" } : c
                );
                setComments(updatedComments);
              } catch (error) {
                console.error('Failed to update comment status:', error);
              }
            }}
            inlineMode={true}
          />
        )}

        {/* Comments area - wider and properly constrained for scrolling */}
        {showComments && articleId && (
          <div 
            className="flex-shrink-0 border-l border-gray-200 bg-gray-50 transition-all duration-300" 
            style={{ 
              width: layout.screenSize === 'mobile' ? '300px' : `${layout.commentsSidebarWidth}px`,
              maxWidth: layout.screenSize === 'mobile' ? '300px' : `${layout.commentsSidebarWidth}px`,
              minWidth: layout.screenSize === 'mobile' ? '300px' : `${layout.commentsSidebarWidth}px`
            }}
          >
            <CommentingSystem
              key={`comments-${articleId}`}
              articleId={articleId}
              editorRef={editorRef}
              comments={comments}
              onCommentsChange={setComments}
              highlightedCommentId={highlightedCommentId}
              onHighlightComment={setHighlightedCommentId}
              adminMode={adminMode}
              adminUser={adminUser}
              inlineMode={true}
              editor={editor}
            />
          </div>
        )}
      </div>

      {/* Floating action button for zen mode */}
      <AnimatePresence>
        {focusMode === 'zen' && (
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            onClick={() => setFocusMode('normal')}
            className="fixed top-6 right-6 bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-600 transition-colors z-50"
          >
            <X size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Link Editor Modal */}
      <AnimatePresence>
        {showLinkEditor && (
          <LinkEditor
            isOpen={showLinkEditor}
            onClose={() => {
              setShowLinkEditor(false);
              setLinkData(null);
            }}
            onSave={handleLinkSave}
            initialUrl={linkData?.href || ''}
            initialText={selectedText}
          />
        )}
      </AnimatePresence>

      {/* Image Upload Modal */}
      {showImageUpload && (
        <MediaLibrarySelector
          onImageInsert={handleImageInsert}
          onClose={() => setShowImageUpload(false)}
          articleId={articleId}
          companyName={adminMode ? originalAuthor?.company_name || userCompany : userCompany}
        />
      )}

      {/* Link Tooltip */}
      {showLinkTooltip && linkData && editor && (
        <LinkTooltip
          editor={editor}
          isVisible={showLinkTooltip}
          linkData={linkData}
          position={linkTooltip.position}
          onEdit={() => handleEditLink(linkData)}
          onClose={() => setShowLinkTooltip(false)}
        />
      )}

      {/* Image Resizer */}
      {selectedImage && (
        <ImageResizer
          imageElement={selectedImage.element}
          position={selectedImage.position}
          onResize={handleImageResize}
          onClose={handleImageClose}
          onDelete={handleImageDelete}
          onEditCaption={handleImageEditCaption}
        />
      )}
      </motion.div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const ArticleEditor = React.memo(ArticleEditorComponent, (prevProps, nextProps) => {
  // Custom comparison function to prevent re-renders when only unimportant props change
  return (
    prevProps.articleId === nextProps.articleId &&
    prevProps.initialContent === nextProps.initialContent &&
    prevProps.adminMode === nextProps.adminMode &&
    prevProps.adminUser?.id === nextProps.adminUser?.id &&
    prevProps.originalAuthor?.id === nextProps.originalAuthor?.id &&
    prevProps.isAiCopilotOpen === nextProps.isAiCopilotOpen
  );
});