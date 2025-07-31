import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { MessageCircle, MessageSquare, CheckCircle, Archive, MoreHorizontal, Settings, BarChart3, X, Plus, Filter, Search, Clock, Users, TrendingUp, AlertCircle, ChevronDown, ChevronUp, Sparkles, Eye, EyeOff } from 'lucide-react';
import { 
  ArticleComment, 
  getArticleComments,
  updateCommentStatus,
  resolveCommentWithReason,
  bulkUpdateCommentStatus,
  getCommentsWithMetrics,
  createComment,
  createCommentWithMentions,
  updateComment
} from '../../lib/commentApi';

import { CommentPopover } from './CommentPopover';
import { CommentThread } from './CommentThread';
import { CommentResolutionPanel } from './CommentResolutionPanel';
import { InlineCommentingExtension } from './InlineCommentingExtension';

import { supabase } from '../../lib/supabase';
import { AnimatePresence, motion } from 'framer-motion';
import { BaseModal } from './BaseModal';

export type { ArticleComment };

interface CommentingSystemProps {
  articleId: string;
  editorRef: React.RefObject<HTMLElement>;
  comments: ArticleComment[];
  onCommentsChange: (comments: ArticleComment[]) => void;
  highlightedCommentId: string | null;
  onHighlightComment: (commentId: string | null) => void;
  showResolutionPanel?: boolean;
  adminMode?: boolean;
  adminUser?: {
    id: string;
    email: string;
    company_name?: string;
  } | null;
  inlineMode?: boolean; // Enable inline commenting instead of modal
  editor?: any; // TipTap editor instance
}

interface TextSelection {
  start: number;
  end: number;
  text: string;
  range?: Range; // Make range optional since it's not serializable
}

// Enhanced global interaction state management
const GLOBAL_INTERACTION_KEY = 'commentSystemInteraction';

const setGlobalInteractionState = (isInteracting: boolean) => {
  try {
    sessionStorage.setItem(GLOBAL_INTERACTION_KEY, String(isInteracting));
    console.log('🔧 Global interaction state set:', isInteracting);
  } catch (error) {
    console.warn('Could not save interaction state:', error);
  }
};

const getGlobalInteractionState = (): boolean => {
  try {
    const stored = sessionStorage.getItem(GLOBAL_INTERACTION_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
};

// Memoized CommentingSystem with enhanced comparison and debugging
const CommentingSystemComponent = React.memo(({
  articleId,
  editorRef,
  comments,
  onCommentsChange,
  highlightedCommentId,
  onHighlightComment,
  adminMode = false,
  showResolutionPanel = false,
  adminUser = null,
  inlineMode = false,
  editor,
}: CommentingSystemProps) => {
  // Use a more specific console log that includes render timestamp
  const renderTimestamp = Date.now();
  console.log('🎯 CommentingSystem rendered:', { 
    articleId, 
    hasEditorRef: !!editorRef?.current, 
    showResolutionPanel, 
    adminMode,
    commentsCount: comments.length,
    renderTimestamp,
    highlightedCommentId
  });

  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  const [selectedComment, setSelectedComment] = useState<ArticleComment | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [contentDriftDetected, setContentDriftDetected] = useState(false);
  const [layoutStable, setLayoutStable] = useState(false);

  const isCreatingCommentRef = useRef(false);
  const pendingSelectionRef = useRef<TextSelection | null>(null);

  // Enhanced interaction tracking with multiple approaches
  const isInteractingWithCommentUIRef = useRef(false);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setInteractionFlag = useCallback((isInteracting: boolean, duration = 800) => {
    console.log('🔧 Setting interaction flag:', isInteracting, 'for', duration, 'ms');
    
    // Clear any existing timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    
    // Set both local and global state
    isInteractingWithCommentUIRef.current = isInteracting;
    setGlobalInteractionState(isInteracting);
    
    if (isInteracting) {
      // Auto-clear after specified duration
      interactionTimeoutRef.current = setTimeout(() => {
        console.log('🔧 Auto-clearing interaction flag after', duration, 'ms');
        isInteractingWithCommentUIRef.current = false;
        setGlobalInteractionState(false);
      }, duration);
    }
  }, []);

  // Global state management functions
  const getGlobalPopoverState = () => {
    try {
      const stored = sessionStorage.getItem('commentPopoverState');
      return stored ? JSON.parse(stored) : { showPopover: false };
    } catch {
      return { showPopover: false };
    }
  };

  const setGlobalPopoverState = (state: any) => {
    try {
      sessionStorage.setItem('commentPopoverState', JSON.stringify(state));
    } catch (error) {
      console.warn('Could not save popover state:', error);
    }
  };

  const clearGlobalPopoverState = () => {
    console.log('🗑️ Cleared global popover state');
    try {
      sessionStorage.removeItem('commentPopoverState');
    } catch (error) {
      console.warn('Could not clear popover state:', error);
    }
  };

  // Calculate comment metrics based on the comments passed as props
  const commentMetrics = useMemo(() => {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    
    return {
      total: comments.length,
      active: comments.filter(c => c.status === 'active').length,
      resolved: comments.filter(c => c.status === 'resolved').length,
      archived: comments.filter(c => c.status === 'archived').length,
      recent: comments.filter(c => new Date(c.created_at).getTime() > hourAgo).length
    };
  }, [comments]);

  // Load comments function that triggers parent to refresh
  const loadComments = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log('📥 Loading comments for article:', articleId);
      // Use basic comments API to avoid permission issues
      const fetchedComments = await getArticleComments(articleId);
      console.log('📥 Loaded comments:', fetchedComments.length, 'comments');
      onCommentsChange(fetchedComments);
      
      // Reset content drift detection when loading fresh comments
      setContentDriftDetected(false);
    } catch (error) {
      console.error('❌ Error loading comments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [articleId, onCommentsChange]);

  // Set up real-time subscription only (no initial loading since we get comments as props)
  useEffect(() => {
    console.log('🔔 Setting up comment subscription for:', articleId);
    const subscription = supabase
      .channel(`article_comments_${articleId}`)
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'article_comments', filter: `article_id=eq.${articleId}` },
        (payload) => {
          console.log('🔄 Comment change detected:', payload);
          console.log('🔄 Event type:', payload.eventType);
          console.log('🔄 Changed data:', payload.new || payload.old);
          loadComments();
        }
      )
      .subscribe();

    return () => {
      console.log('🔌 Cleaning up comment subscription');
      subscription.unsubscribe();
    };
  }, [articleId, loadComments]);

  // Detect when layout has stabilized after sidebar loading
  useEffect(() => {
    // Wait for the component to render and layout to stabilize
    const stabilizeLayout = () => {
      // Use multiple checks to ensure layout is really stable
      setTimeout(() => {
        console.log('🎯 Layout stabilization check 1...');
        if (editorRef.current) {
          // Force a reflow to ensure layout is complete
          const editorWidth = editorRef.current.offsetWidth;
          console.log('📐 Editor width after stabilization:', editorWidth);
          
          // Wait a bit more to be absolutely sure
          setTimeout(() => {
            console.log('🎯 Layout stabilization check 2...');
            setLayoutStable(true);
            console.log('✅ Layout marked as stable - markers can now render');
          }, 300);
        }
      }, 100);
    };

    // Initial stabilization
    stabilizeLayout();

    // Also re-stabilize when comments change (sidebar content changes)
    const debounceTimer = setTimeout(stabilizeLayout, 200);

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [comments.length, isExpanded, editorRef]);

  // Set up text selection monitoring with enhanced interaction checking
  useEffect(() => {
    if (!editorRef.current) return;

    console.log('🔍 Setting up selection change listener');
    const handleSelectionChange = () => {
      // Enhanced interaction checking - check both local and global state
      const localInteracting = isCreatingCommentRef.current || showPopover;
      const globalInteracting = getGlobalInteractionState();
      const globalPopoverState = getGlobalPopoverState();
      
      if (localInteracting || globalInteracting || globalPopoverState.showPopover || isInteractingWithCommentUIRef.current) {
        console.log('🚫 Skipping selection change - interaction detected', {
          localInteracting,
          globalInteracting,
          globalPopover: globalPopoverState.showPopover,
          uiInteraction: isInteractingWithCommentUIRef.current
        });
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        console.log('🔍 Empty selection, clearing');
        setSelectedText(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const selectedTextContent = selection.toString().trim();

      if (!selectedTextContent) {
        console.log('🔍 Empty selection, clearing');
        setSelectedText(null);
        return;
      }

      // Check if selection is within the editor
      if (!editorRef.current || !editorRef.current.contains(range.commonAncestorContainer)) {
        console.log('🔍 Selection outside editor, clearing');
        setSelectedText(null);
        return;
      }

      const editorTextContent = editorRef.current.textContent || '';
      
      // EXTENSIVE DEBUGGING: Log everything to understand the mismatch
      console.log('🔍 DETAILED selection analysis:', {
        selectedText: selectedTextContent,
        selectedLength: selectedTextContent.length,
        rangeText: range.toString(),
        rangeLength: range.toString().length,
        rangeStartContainer: range.startContainer.nodeType === Node.TEXT_NODE ? 
          `TEXT: "${range.startContainer.textContent?.substring(0, 50)}..."` : 
          `ELEMENT: ${range.startContainer.nodeName}`,
        rangeEndContainer: range.endContainer.nodeType === Node.TEXT_NODE ? 
          `TEXT: "${range.endContainer.textContent?.substring(0, 50)}..."` : 
          `ELEMENT: ${range.endContainer.nodeName}`,
        rangeStartOffset: range.startOffset,
        rangeEndOffset: range.endOffset,
        editorLength: editorTextContent.length,
        editorSample: editorTextContent.substring(0, 200) + '...',
        commonAncestor: range.commonAncestorContainer.nodeName
      });

      if (selectedTextContent.length >= 3) {
        // ROBUST APPROACH: Use direct text matching as the primary method
        // This avoids all the complex position calculation issues
        
        const editorText = editorTextContent;
        console.log('🔍 ROBUST selection processing:', {
          selectedText: selectedTextContent,
          selectedLength: selectedTextContent.length,
          editorLength: editorText.length,
          editorSample: editorText.substring(0, 200) + '...'
        });
        
        // PRIMARY: Try exact text match
        let textPosition = editorText.indexOf(selectedTextContent);
        let matchMethod = 'exact';
        
        // FALLBACK 1: Try with normalized whitespace
        if (textPosition === -1) {
          const normalizedSelected = selectedTextContent.replace(/\s+/g, ' ').trim();
          const normalizedEditor = editorText.replace(/\s+/g, ' ');
          const normalizedIndex = normalizedEditor.indexOf(normalizedSelected);
          
          if (normalizedIndex !== -1) {
            textPosition = convertNormalizedIndexToOriginal(editorText, normalizedIndex);
            matchMethod = 'normalized';
          }
        }
        
        // FALLBACK 2: Try partial matching for very long selections
        if (textPosition === -1 && selectedTextContent.length > 50) {
          const firstPart = selectedTextContent.substring(0, 30).trim();
          const firstPartIndex = editorText.indexOf(firstPart);
          
          if (firstPartIndex !== -1) {
            // Check if the rest of the selection matches from this position
            const potentialMatch = editorText.substring(firstPartIndex, firstPartIndex + selectedTextContent.length);
            const normalizedPotential = potentialMatch.replace(/\s+/g, ' ').trim();
            const normalizedSelected = selectedTextContent.replace(/\s+/g, ' ').trim();
            
            if (normalizedPotential === normalizedSelected) {
              textPosition = firstPartIndex;
              matchMethod = 'partial';
            }
          }
        }
        
        if (textPosition !== -1 && textPosition + selectedTextContent.length <= editorText.length) {
          // Validate the match
          const foundText = editorText.substring(textPosition, textPosition + selectedTextContent.length);
          const normalizedFound = foundText.replace(/\s+/g, ' ').trim();
          const normalizedSelected = selectedTextContent.replace(/\s+/g, ' ').trim();
          
          console.log('🔍 Text match validation:', {
            method: matchMethod,
            position: textPosition,
            endPosition: textPosition + selectedTextContent.length,
            selectedText: selectedTextContent.substring(0, 50) + '...',
            foundText: foundText.substring(0, 50) + '...',
            exactMatch: selectedTextContent === foundText,
            normalizedMatch: normalizedSelected === normalizedFound
          });
          
          if (selectedTextContent === foundText || normalizedSelected === normalizedFound) {
            const newSelection: TextSelection = {
              start: textPosition,
              end: textPosition + selectedTextContent.length,
              text: selectedTextContent,
              range: range.cloneRange()
            };
            
            console.log(`✅ ROBUST selection found using ${matchMethod} match:`, newSelection);
            setSelectedText(newSelection);
          } else {
            console.error('❌ Text match validation failed:', { 
              selectedText: selectedTextContent.substring(0, 100),
              foundText: foundText.substring(0, 100),
              normalizedSelected: normalizedSelected.substring(0, 100),
              normalizedFound: normalizedFound.substring(0, 100)
            });
            setSelectedText(null);
          }
        } else {
          console.error('❌ ROBUST selection FAILED - text not found in editor:', { 
            selectedText: selectedTextContent.substring(0, 100),
            textPosition,
            editorLength: editorText.length,
            editorSample: editorText.substring(0, 300) + '...'
          });
          setSelectedText(null);
        }
      } else {
        console.log('🔍 Selection too short, clearing');
        setSelectedText(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    return () => {
      console.log('🔌 Cleaning up selection change listener');
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [editorRef, showPopover]);

  const handleCreateComment = (selection: TextSelection) => {
    console.log('💬 Creating comment for selection:', {
      text: selection.text.substring(0, 50) + '...',
      start: selection.start,
      end: selection.end,
      length: selection.text.length
    });
    
    // **CRITICAL DEBUG: Verify the selection data integrity**
    const editorContent = editorRef.current?.textContent || '';
    const actualTextAtCoordinates = editorContent.substring(selection.start, selection.end);
    console.log('🔍 Verifying selection integrity:', {
      selectedText: selection.text.substring(0, 50) + '...',
      actualTextAtCoords: actualTextAtCoordinates.substring(0, 50) + '...',
      coordinatesMatch: selection.text === actualTextAtCoordinates,
      editorLength: editorContent.length
    });
    
    isCreatingCommentRef.current = true;
    pendingSelectionRef.current = selection;
    
    setSelectedText(selection);
    setSelectedComment(null);
    
    // Popover will auto-center, no need to calculate position
    setPopoverPosition({ x: 0, y: 0 }); // Not used anymore but keeping for compatibility
    
    // Open the comment popup
    setShowPopover(true);
  };

  // Enhanced scroll to commented text in the editor with better highlighting detection
  const scrollToCommentText = useCallback((comment: ArticleComment) => {
    if (!editorRef.current || !comment.selected_text) {
      console.log('⚠️ Cannot scroll: missing editor ref or selected text');
      return;
    }

    try {
      console.log('📍 Scrolling to comment text:', comment.selected_text.substring(0, 50) + '...');
      
      // Small delay to ensure highlighting has been applied
      setTimeout(() => {
        const editorElement = editorRef.current;
        if (!editorElement) return;

        // First try to find highlighted text by comment ID (most accurate)
        const commentSpecificElement = editorElement.querySelector(`[data-comment-id="${comment.id}"]`);
        if (commentSpecificElement) {
          console.log('🎯 Found comment-specific highlighted element, scrolling...');
          commentSpecificElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
          return;
        }

        // Second try: find highlighted text by class and content match
        const highlightedElements = editorElement.querySelectorAll('.comment-highlight-tiptap');
        
        for (const element of highlightedElements) {
          const elementText = element.textContent || '';
          const elementCommentId = element.getAttribute('data-comment-id');
          
          // Check both comment ID and text content for accuracy
          if (elementCommentId === comment.id || 
              elementText.includes(comment.selected_text) || 
              comment.selected_text.includes(elementText)) {
            console.log('🎯 Found highlighted element by content match, scrolling...');
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
            return;
          }
        }

        // Fallback: search through all text nodes
        const textContent = editorElement.textContent || '';
        const textIndex = textContent.indexOf(comment.selected_text);
        
        if (textIndex === -1) {
          console.log('⚠️ Comment text not found in editor');
          return;
        }

        // Try to find an element containing this text
        const walker = document.createTreeWalker(
          editorElement,
          NodeFilter.SHOW_TEXT,
          null
        );

        let currentPosition = 0;
        let targetElement = null;

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const nodeText = node.textContent || '';
          const nodeStart = currentPosition;
          const nodeEnd = currentPosition + nodeText.length;

          // Check if our target text falls within this node
          if (textIndex >= nodeStart && textIndex < nodeEnd) {
            targetElement = node.parentElement;
            break;
          }

          currentPosition = nodeEnd;
        }

        if (targetElement) {
          console.log('🎯 Found target element via text search, scrolling...');
          
          // Scroll the target element into view with smooth behavior
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        } else {
          console.log('⚠️ Could not find target element for text');
        }
      }, 100); // Small delay to ensure highlighting is applied

    } catch (error) {
      console.error('❌ Error scrolling to comment text:', error);
    }
  }, [editorRef]);

  // Enhanced comment click handler with immediate interaction flag setting
  const handleCommentClick = useCallback((comment: ArticleComment, fromHighlightedText: boolean = false) => {
    // Prevent clicks during delete operations
    if (loadingAction === `delete-${comment.id}`) {
      console.log('🚫 Ignoring click - comment is being deleted:', comment.id);
      return;
    }
    
    console.log('🖱️ Comment clicked:', comment.id, 'From highlighted text:', fromHighlightedText);
    
    // Set interaction flag IMMEDIATELY to prevent any selection changes
    setInteractionFlag(true, 1000);
    
    // Different behavior based on where the click came from
    if (fromHighlightedText) {
      // When clicking from highlighted text, always select the comment (no toggle)
      console.log('🎯 Selecting comment from highlighted text:', comment.id);
      onHighlightComment(comment.id);
      
      // Don't scroll when clicking from highlighted text (user is already looking at it)
    } else {
      // When clicking from sidebar, toggle selection
      if (highlightedCommentId === comment.id) {
        console.log('🔄 Deselecting comment:', comment.id);
        onHighlightComment(null);
      } else {
        console.log('🔄 Selecting comment:', comment.id);
        onHighlightComment(comment.id);
        
        // Scroll to the commented text in the editor
        scrollToCommentText(comment);
      }
    }
  }, [highlightedCommentId, onHighlightComment, setInteractionFlag, scrollToCommentText]);

  // Wrapper for CommentHighlightExtension to indicate clicks from highlighted text
  const handleCommentClickFromHighlight = useCallback((comment: ArticleComment) => {
    console.log('🌟 HIGHLIGHT CLICK: handleCommentClickFromHighlight called!', comment.id);
    handleCommentClick(comment, true);
  }, [handleCommentClick]);

  // Update the TipTap extension with the click handler
  useEffect(() => {
    if (editor && editor.commands.updateOnCommentClick) {
      console.log('📝 Updating CommentHighlightExtension click handler');
      editor.commands.updateOnCommentClick(handleCommentClickFromHighlight);
    }
  }, [editor, handleCommentClickFromHighlight]);

  const handleClosePopover = () => {
    console.log('❌ Closing popover');
    setShowPopover(false);
    setSelectedComment(null);
    setSelectedText(null);
    isCreatingCommentRef.current = false;
    pendingSelectionRef.current = null;
    clearGlobalPopoverState();
    onHighlightComment(null);
  };

  const handleCommentSubmit = async (content: string, isEdit: boolean = false) => {
    console.log('📝 Submitting comment:', { content, selectedText, selectedComment, isEdit });
    
    try {
      if (isEdit && selectedComment) {
        // Updating an existing comment
        console.log('✏️ Updating existing comment:', selectedComment.id);
        
        const result = await updateComment(selectedComment.id, {
          content: content.trim()
        });
        
        if (result) {
          console.log('✅ Comment updated successfully:', result);
          await loadComments(); // Refresh comments
          handleClosePopover();
        } else {
          console.error('❌ Failed to update comment');
        }
      } else if (selectedText && !selectedComment) {
        // Creating a new comment with mention support
        console.log('🆕 Creating new comment with coordinates:', {
          articleId,
          content: content.trim().substring(0, 50) + '...',
          selection_start: selectedText.start,
          selection_end: selectedText.end,
          selected_text: selectedText.text.substring(0, 50) + '...'
        });
        
        // Use the regular createComment API with selected_text
        const result = await createComment({
          article_id: articleId,
          content: content.trim(),
          content_type: 'text',
          selection_start: selectedText.start,
          selection_end: selectedText.end,
          selected_text: selectedText.text // Store the original selected text
        });
        
        // **CRITICAL DEBUG: Verify what was actually saved**
        console.log('💾 Comment creation result:', {
          success: !!result,
          savedCoordinates: {
            start: result.selection_start,
            end: result.selection_end
          },
          savedSelectedText: result.selected_text?.substring(0, 50) + '...',
          originalSelection: {
            text: selectedText.text.substring(0, 50) + '...',
            start: selectedText.start,
            end: selectedText.end
          },
          currentEditorLength: editorRef.current?.textContent?.length || 0
        });
        
        // **FINAL VERIFICATION: Check the text at saved coordinates**
        if (editorRef.current) {
          const editorContent = editorRef.current.textContent || '';
          const textAtSavedCoords = editorContent.substring(selectedText.start, selectedText.end);
          console.log('✅ Final verification - text at saved coordinates:', {
            savedText: textAtSavedCoords.substring(0, 50) + '...',
            originalSelectedText: selectedText.text.substring(0, 50) + '...',
            storedSelectedText: result.selected_text?.substring(0, 50) + '...',
            coordsMatch: textAtSavedCoords === selectedText.text,
            storedTextMatch: result.selected_text === selectedText.text
          });
        }
        
        if (result) {
          console.log('✅ Comment created successfully with stored coordinates and selected text:', {
            id: result.id,
            stored_start: result.selection_start,
            stored_end: result.selection_end,
            stored_selected_text: result.selected_text?.substring(0, 50) + '...',
            original_start: selectedText.start,
            original_end: selectedText.end,
            coordinates_match: result.selection_start === selectedText.start && result.selection_end === selectedText.end,
            selected_text_match: result.selected_text === selectedText.text
          });
          await loadComments(); // Refresh comments
          handleClosePopover();
        } else {
          console.error('❌ Failed to create comment');
        }
      } else if (selectedComment) {
        // Creating a reply to an existing comment with mention support
        console.log('💬 Creating reply to comment:', selectedComment.id);
        
        const result = await createCommentWithMentions(
          articleId,
          content.trim(),
          'text',
          undefined, // no image file
          undefined, // no selection start
          undefined, // no selection end
          selectedComment.id // parent comment for reply
        );
        
        if (result) {
          console.log('✅ Reply created successfully:', result);
          await loadComments(); // Refresh comments to show the new reply
          handleClosePopover();
        } else {
          console.error('❌ Failed to create reply');
        }
      }
    } catch (error) {
      console.error('❌ Error in handleCommentSubmit:', error);
    } finally {
      isCreatingCommentRef.current = false;
      pendingSelectionRef.current = null;
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    console.log('🗑️ Deleting comment:', commentId);
    
    // Find the comment to check ownership
    const commentToDelete = comments.find(c => c.id === commentId) || 
                           comments.find(c => c.replies?.find(r => r.id === commentId));
    const actualComment = commentToDelete?.id === commentId ? commentToDelete : 
                         commentToDelete?.replies?.find(r => r.id === commentId);
    
    console.log('🔍 Comment to delete details:', {
      commentId,
      foundComment: !!actualComment,
      commentUserId: actualComment?.user_id,
      commentStatus: actualComment?.status,
      userInfo: actualComment?.user
    });
    
    setInteractionFlag(true, 1000);

    try {
      setLoadingAction(`delete-${commentId}`);
      
      // Optimistically remove the comment from local state immediately
      const removeCommentFromList = (commentList: ArticleComment[]): ArticleComment[] => {
        return commentList.filter(comment => {
          if (comment.id === commentId) {
            return false; // Remove this comment
          }
          if (comment.replies && comment.replies.length > 0) {
            comment.replies = removeCommentFromList(comment.replies);
          }
          return true;
        });
      };
      
      const updatedComments = removeCommentFromList(comments);
      onCommentsChange(updatedComments);
      
      console.log('✅ Comment removed optimistically, deleting from database...');
      
      // Get current user for debugging
      const { data: currentUser } = await supabase.auth.getUser();
      console.log('👤 Current user info:', {
        userId: currentUser?.user?.id,
        email: currentUser?.user?.email
      });
      
      // Actually delete the comment using the API
      console.log('🔄 Attempting database deletion for comment:', commentId);
      const { data, error } = await supabase
        .from('article_comments')
        .delete()
        .eq('id', commentId)
        .select(); // Add select to see what was deleted
      
      if (error) {
        console.error('❌ Database deletion error:', error);
        console.error('❌ Error details:', { code: error.code, message: error.message, details: error.details });
        // Revert optimistic update on error
        await loadComments();
        throw error;
      }
      
      console.log('✅ Database deletion response:', { data, deletedCount: data?.length || 0 });
      
      if (!data || data.length === 0) {
        console.warn('⚠️ No rows were deleted - comment may not exist or permission denied');
        // Revert optimistic update
        await loadComments();
        throw new Error('Comment could not be deleted - it may not exist or you may not have permission');
      }
      
      console.log('✅ Comment deleted successfully from database:', commentId);
      
      // Force UI update and reload from database to ensure consistency
      setInteractionFlag(true, 500);
      setTimeout(async () => {
        await loadComments();
        console.log('✅ Comments reloaded after deletion');
        setInteractionFlag(true, 200);
      }, 100);
      
    } catch (error) {
      console.error('❌ Error deleting comment:', error);
      alert('Failed to delete comment. Please try again.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStatusChange = async (commentId: string, status: 'active' | 'resolved' | 'archived') => {
    console.log('🔄 Changing comment status:', { commentId, status });
    
    setInteractionFlag(true, 1000);
    
    try {
      setLoadingAction(`status-${commentId}`);
      await updateCommentStatus(commentId, status);
      await loadComments(); // Refresh after status change
    } catch (error) {
      console.error('❌ Error updating comment status:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  // Wrapper function for type compatibility with InlineCommentingExtension
  const handleStatusChangeWrapper = (commentId: string, status: string) => {
    if (status === 'active' || status === 'resolved' || status === 'archived') {
      handleStatusChange(commentId, status as 'active' | 'resolved' | 'archived');
    }
  };

  const handleResolveWithReason = async (commentId: string, reason: string) => {
    console.log('✅ Resolving comment with reason:', { commentId, reason });
    
    setInteractionFlag(true, 1000);
    
    try {
      setLoadingAction(`resolve-${commentId}`);
      await resolveCommentWithReason(commentId, reason);
      
      // Optimistically update the local comment status immediately
      const updateCommentStatus = (commentList: ArticleComment[]): ArticleComment[] => {
        return commentList.map(comment => {
          if (comment.id === commentId) {
            return { ...comment, status: 'resolved' as const };
          }
          if (comment.replies && comment.replies.length > 0) {
            return { ...comment, replies: updateCommentStatus(comment.replies) };
          }
          return comment;
        });
      };
      
      // Optimistically update the local comments
      const updatedComments = updateCommentStatus(comments);
      onCommentsChange(updatedComments);
      
      console.log('✅ Comment resolved, triggering UI updates...');
      
      // Force re-render of the component by updating interaction state
      setInteractionFlag(true, 500);
      
      // Wait a bit then reload from database to ensure consistency
      setTimeout(async () => {
        await loadComments();
        console.log('✅ Comments reloaded after resolution');
        // Update interaction flag again to ensure proper re-render
        setInteractionFlag(true, 200);
      }, 150);
      
      console.log('✅ Comment resolved successfully:', commentId);
    } catch (error) {
      console.error('❌ Error resolving comment:', error);
      // TODO: Add user-facing error notification here
      alert('Failed to resolve comment. Please check your permissions and try again.');
    } finally {
      setLoadingAction(null);
    }
  };
  
  const handleBulkStatusUpdate = async (commentIds: string[], status: 'active' | 'resolved' | 'archived') => {
    console.log('🔄 Bulk status update:', { commentIds, status });
    try {
      setLoadingAction('bulk-update');
      await bulkUpdateCommentStatus(commentIds, status);
      await loadComments(); // Refresh after bulk update
    } catch (error) {
      console.error('❌ Error in bulk status update:', error);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReply = (comment: ArticleComment) => {
    console.log('💬 Replying to comment:', comment.id);
    
    setInteractionFlag(true, 1000);
    
    setSelectedComment(comment);
    setSelectedText(null);
    
    // Popover will auto-center, no need to calculate position
    setPopoverPosition({ x: 0, y: 0 }); // Not used anymore but keeping for compatibility
    
    setShowPopover(true);
  };

  const handleEdit = (comment: ArticleComment) => {
    console.log('✏️ Editing comment:', comment.id);
    
    setInteractionFlag(true, 1000);
    
    setSelectedComment(comment);
    setSelectedText(null);
    
    // Popover will auto-center, no need to calculate position
    setPopoverPosition({ x: 0, y: 0 }); // Not used anymore but keeping for compatibility
    
    setShowPopover(true);
  };

  const [filter, setFilter] = useState<'all' | 'active' | 'resolved' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Function to recursively collect all comments (including nested replies) for filtering
  const getAllCommentsFlat = (comments: ArticleComment[]): ArticleComment[] => {
    const flatComments: ArticleComment[] = [];
    
    const addCommentsRecursively = (commentList: ArticleComment[]) => {
      commentList.forEach(comment => {
        flatComments.push(comment);
        if (comment.replies && comment.replies.length > 0) {
          addCommentsRecursively(comment.replies);
        }
      });
    };
    
    addCommentsRecursively(comments);
    return flatComments;
  };

  // Filter comments (including nested replies) based on search and filter criteria
  const filterComment = (comment: ArticleComment): boolean => {
    const matchesFilter = filter === 'all' || comment.status === filter;
    const matchesSearch = !searchQuery || 
      comment.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (comment.user?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  };

  // Recursively filter the threaded comment structure
  const filterThreadedComments = (comments: ArticleComment[]): ArticleComment[] => {
    return comments.map(comment => {
      const filteredReplies = comment.replies ? filterThreadedComments(comment.replies) : [];
      
      // Include comment if it matches the filter, or if any of its replies match
      const commentMatches = filterComment(comment);
      const hasMatchingReplies = filteredReplies.length > 0;
      
      if (commentMatches || hasMatchingReplies) {
        return {
          ...comment,
          replies: filteredReplies
        };
      }
      return null;
    }).filter(Boolean) as ArticleComment[];
  };

  // Apply filtering to the already-threaded comments
  const filteredThreadedComments = filterThreadedComments(comments);
  
  // Get all comments flat for counting
  const allCommentsFlat = getAllCommentsFlat(comments);
  const filteredCommentsFlat = getAllCommentsFlat(filteredThreadedComments);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading comments...</p>
      </div>
    );
  }

  return (
    <>
      {/* Comment markers removed - using text highlighting instead via CommentHighlight component */}

      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="h-full bg-white border-l border-gray-200 shadow-xl"
        style={{ 
          width: '420px', 
          maxWidth: '420px'
        }}
      >
        {/* Layout Stabilization Indicator */}
        <AnimatePresence>
          {!layoutStable && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-blue-50 border-b border-blue-200 px-4 py-2"
            >
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-blue-700">
                  Positioning comments...
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Drift Warning */}
        <AnimatePresence>
          {contentDriftDetected && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-orange-50 border-b border-orange-200 px-4 py-3"
            >
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-800">
                    Content Changes Detected
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    Some comments may not be visible because the article content has changed since they were created.
                  </p>
                </div>
                <button
                  onClick={() => setContentDriftDetected(false)}
                  className="text-orange-600 hover:text-orange-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text Highlighting now handled by TipTap CommentHighlightExtension */}

        {/* Enhanced Selection button or Inline Comments */}
        {inlineMode ? (
          <InlineCommentingExtension
            articleId={articleId}
            editorRef={editorRef}
            selectedText={selectedText}
            comments={comments}
            onCommentsChange={onCommentsChange}
            getMarkerPosition={(start, end, ref) => getMarkerPosition(start, end, ref, setContentDriftDetected)}
            onCommentClick={handleCommentClick}
            onCommentStatusChange={handleStatusChangeWrapper}
            inlineMode={false} // Disable bubbles in favor of text highlighting
          />
        ) : null}

        {/* Comment popover */}
        {showPopover && ReactDOM.createPortal(
          <CommentPopover 
            position={popoverPosition}
            articleId={articleId}
            selectedText={selectedText}
            selectedComment={selectedComment}
            onClose={handleClosePopover}
            onSubmit={(content: string, isEdit?: boolean) => handleCommentSubmit(content, isEdit)}
            onCommentCreated={async (comment) => {
              console.log('✅ Comment created with image/mentions:', comment);
              await loadComments(); // Refresh comments to show the new comment with image
              handleClosePopover();
            }}
          />,
          document.body
        )}

        {/* Professional Comments Interface */}
        <div className="h-full flex flex-col">
          {/* Clean Modern Header */}
          <div className="flex-shrink-0 px-6 py-6 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  {commentMetrics.recent > 0 && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
                    >
                      <span className="text-xs font-bold text-white">{commentMetrics.recent}</span>
                    </motion.div>
                  )}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Comments
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    {commentMetrics.total} total • {commentMetrics.active} active
                  </p>
                </div>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {isExpanded ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </motion.button>
            </div>

            {/* Professional Metrics Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active</p>
                    <p className="text-2xl font-bold text-orange-600">{commentMetrics.active}</p>
                  </div>
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Resolved</p>
                    <p className="text-2xl font-bold text-green-600">{commentMetrics.resolved}</p>
                  </div>
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Professional Comments List */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex-1 overflow-hidden"
              >
                <CommentsSidebar
                  comments={comments}
                  isLoading={isLoading}
                  onCommentClick={handleCommentClick}
                  onStatusChange={handleStatusChange}
                  onResolveWithReason={handleResolveWithReason}
                  onDelete={handleDeleteComment}
                  onReply={handleReply}
                  onEdit={handleEdit}
                  showResolutionDetails={true}
                  loadingAction={loadingAction}
                  highlightedCommentId={highlightedCommentId}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Resolution Management Panel */}
          <AnimatePresence>
            {adminMode && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="border-t border-gray-100"
              >
                <CommentResolutionPanel
                  comments={comments}
                  onStatusChange={handleBulkStatusUpdate}
                  onRefresh={loadComments}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Professional Footer Actions */}
          <div className="flex-shrink-0 p-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {commentMetrics.recent > 0 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center space-x-2 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium"
                  >
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    <span>{commentMetrics.recent} new</span>
                  </motion.div>
                )}
              </div>
              
              <div className="text-xs text-gray-500">
                Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
});

// Enhanced comparison function with detailed logging
CommentingSystemComponent.displayName = 'CommentingSystem';

// Memo temporarily disabled for debugging
// const CommentingSystemMemoized = React.memo(CommentingSystemComponent);

export { CommentingSystemComponent as CommentingSystem };

// Helper component for the comment button that appears on text selection
interface CommentSelectionButtonProps {
  selection: TextSelection;
  onCreateComment: (selection: TextSelection) => void;
}

const CommentSelectionButton: React.FC<CommentSelectionButtonProps> = ({
  selection,
  onCreateComment
}) => {
  const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Calculate button position at the end of selected text
    if (selection.range) {
      const rect = selection.range.getBoundingClientRect();
      setButtonPosition({
        x: rect.right + 8, // 8px offset to the right
        y: rect.top + (rect.height / 2) - 16 // Center vertically, account for button height
      });
    }
  }, [selection]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('💬 CommentSelectionButton clicked!', { 
      selection: selection.text.substring(0, 50) + (selection.text.length > 50 ? '...' : ''),
      selectionLength: selection.text.length,
      start: selection.start,
      end: selection.end
    });
    onCreateComment(selection);
  };

  if (!buttonPosition) return null;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="fixed z-50 flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg border-2 border-white transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
      style={{
        left: buttonPosition.x,
        top: buttonPosition.y,
        pointerEvents: 'auto'
      }}
      title="Add comment"
    >
      <MessageSquare className="w-4 h-4" />
    </motion.button>
  );
};

// Enhanced comments sidebar with resolution workflow features
interface CommentsSidebarProps {
  comments: ArticleComment[];
  isLoading: boolean;
  onCommentClick: (comment: ArticleComment) => void;
  onStatusChange: (commentId: string, status: 'active' | 'resolved' | 'archived') => void;
  onResolveWithReason: (commentId: string, reason: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (comment: ArticleComment) => void;
  onEdit: (comment: ArticleComment) => void;
  showResolutionDetails?: boolean;
  loadingAction?: string | null;
  highlightedCommentId?: string | null;
}

const CommentsSidebar: React.FC<CommentsSidebarProps> = ({
  comments,
  isLoading,
  onCommentClick,
  onStatusChange,
  onResolveWithReason,
  onDelete,
  onReply,
  onEdit,
  showResolutionDetails = false,
  loadingAction,
  highlightedCommentId
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState('');

  // Function to recursively collect all comments (including nested replies) for filtering
  const getAllCommentsFlat = (comments: ArticleComment[]): ArticleComment[] => {
    const flatComments: ArticleComment[] = [];
    
    const addCommentsRecursively = (commentList: ArticleComment[]) => {
      commentList.forEach(comment => {
        flatComments.push(comment);
        if (comment.replies && comment.replies.length > 0) {
          addCommentsRecursively(comment.replies);
        }
      });
    };
    
    addCommentsRecursively(comments);
    return flatComments;
  };

  // Filter comments (including nested replies) based on search and filter criteria
  const filterComment = (comment: ArticleComment): boolean => {
    const matchesFilter = filter === 'all' || comment.status === filter;
    const matchesSearch = !searchQuery || 
      comment.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (comment.user?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  };

  // Recursively filter the threaded comment structure
  const filterThreadedComments = (comments: ArticleComment[]): ArticleComment[] => {
    return comments.map(comment => {
      const filteredReplies = comment.replies ? filterThreadedComments(comment.replies) : [];
      
      // Include comment if it matches the filter, or if any of its replies match
      const commentMatches = filterComment(comment);
      const hasMatchingReplies = filteredReplies.length > 0;
      
      if (commentMatches || hasMatchingReplies) {
        return {
          ...comment,
          replies: filteredReplies
        };
      }
      return null;
    }).filter(Boolean) as ArticleComment[];
  };

  // Apply filtering to the already-threaded comments
  const filteredThreadedComments = filterThreadedComments(comments);
  
  // Get all comments flat for counting
  const allCommentsFlat = getAllCommentsFlat(comments);
  const filteredCommentsFlat = getAllCommentsFlat(filteredThreadedComments);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading comments...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Modern Search & Filter */}
      <div className="flex-shrink-0 p-4 bg-gray-50 border-b border-gray-100">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search comments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
          />
        </div>

        {/* Filter Tabs */}
        {showResolutionDetails && comments.length > 0 && (
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all', label: 'All', count: comments.length },
              { key: 'active', label: 'Active', count: comments.filter(c => c.status === 'active').length },
              { key: 'resolved', label: 'Resolved', count: comments.filter(c => c.status === 'resolved').length },
              { key: 'archived', label: 'Archive', count: comments.filter(c => c.status === 'archived').length }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={`
                  flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all duration-200
                  ${filter === tab.key 
                    ? 'bg-white text-blue-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                  }
                `}
              >
                <div className="text-center">
                  <div>{tab.label}</div>
                  <div className="font-bold">{tab.count}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto">
        {filteredThreadedComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              {comments.length === 0 ? "No comments yet" : "No matching comments"}
            </h3>
            <p className="text-sm text-gray-500">
              {comments.length === 0 
                ? "Select text in the article to add the first comment" 
                : "Try adjusting your filters or search terms"
              }
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredThreadedComments.map((comment, index) => (
              <motion.div
                key={comment.id}
                data-comment-id={comment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  relative rounded-xl border cursor-pointer transition-all duration-200 overflow-hidden
                  ${highlightedCommentId === comment.id 
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 shadow-lg ring-2 ring-blue-100' 
                    : 'bg-white border-gray-200 hover:shadow-md hover:border-gray-300'
                  }
                `}
                onClick={() => onCommentClick(comment)}
              >
                {/* Single CommentThread component - no duplicate content */}
                <CommentThread
                  comment={comment}
                  onReply={onReply}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onStatusChange={onStatusChange}
                  onResolveWithReason={onResolveWithReason}
                  showResolutionDetails={showResolutionDetails}
                  showActions={true}
                  loadingAction={loadingAction}
                  highlightedCommentId={highlightedCommentId}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper functions to calculate text offsets
// These are crucial for mapping selection ranges to the editor's text content

// Helper function to convert normalized index back to original text position
function convertNormalizedIndexToOriginal(originalText: string, normalizedIndex: number): number {
  let originalIndex = 0;
  let normalizedCount = 0;
  
  for (let i = 0; i < originalText.length; i++) {
    if (normalizedCount === normalizedIndex) {
      return i;
    }
    
    const char = originalText[i];
    if (/\s/.test(char)) {
      // This is whitespace - it gets normalized to a single space
      normalizedCount++;
      // Skip any additional whitespace characters
      while (i + 1 < originalText.length && /\s/.test(originalText[i + 1])) {
        i++;
      }
    } else {
      // Regular character
      normalizedCount++;
    }
  }
  
  return originalIndex;
}

// Advanced function to get precise text positions using Range API
function getRangeTextPositions(container: Element, range: Range): { start: number; end: number } | null {
  try {
    // Create a range that covers from the start of the container to the start of our selection
    const startRange = document.createRange();
    startRange.selectNodeContents(container);
    startRange.setEnd(range.startContainer, range.startOffset);
    
    // Create a range that covers from the start of the container to the end of our selection
    const endRange = document.createRange();
    endRange.selectNodeContents(container);
    endRange.setEnd(range.endContainer, range.endOffset);
    
    // Get the text content of these ranges to determine positions
    const startText = startRange.toString();
    const endText = endRange.toString();
    
    const start = startText.length;
    const end = endText.length;
    
    console.log('🎯 Range-based position calculation:', {
      startText: startText.substring(Math.max(0, start - 30)),
      endText: endText.substring(Math.max(0, end - 30)),
      start,
      end,
      selectionLength: end - start,
      rangeText: range.toString().substring(0, 50) + '...'
    });
    
    return { start, end };
  } catch (error) {
    console.error('❌ Error in getRangeTextPositions:', error);
    return null;
  }
}

function getTextOffset(container: Element, targetNode: Node, targetOffset: number): number {
  // ENHANCED: Handle both text nodes and element nodes that might contain text
  if (!container || !targetNode) {
    console.error('❌ Invalid parameters for getTextOffset:', { container, targetNode });
    return 0;
  }
  
  // If target node is not a text node, try to find the nearest text node
  let actualTargetNode = targetNode;
  let actualTargetOffset = targetOffset;
  
  if (targetNode.nodeType !== Node.TEXT_NODE) {
    // If it's an element node, find the text node at the given offset
    const childNodes = Array.from(targetNode.childNodes);
    let cumulativeOffset = 0;
    
    for (const child of childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const textLength = child.textContent?.length || 0;
        if (cumulativeOffset + textLength >= targetOffset) {
          actualTargetNode = child;
          actualTargetOffset = targetOffset - cumulativeOffset;
          break;
        }
        cumulativeOffset += textLength;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const elementTextLength = child.textContent?.length || 0;
        if (cumulativeOffset + elementTextLength >= targetOffset) {
          // Recursively find the text node within this element
          return getTextOffset(container, child, targetOffset - cumulativeOffset);
        }
        cumulativeOffset += elementTextLength;
      }
    }
  }
  
  // Walk through all text nodes in the container to calculate the precise offset
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let totalOffset = 0;
  let currentNode = walker.nextNode();
  
  while (currentNode) {
    if (currentNode === actualTargetNode) {
      // Found our target node, add the offset within this node
      const nodeLength = currentNode.textContent?.length || 0;
      const clampedOffset = Math.min(actualTargetOffset, nodeLength);
      const finalOffset = totalOffset + clampedOffset;
      
      console.log('🎯 Enhanced text offset calculation - TARGET FOUND:', {
        targetNodeText: actualTargetNode.textContent?.substring(0, 50) + '...',
        originalTargetOffset: targetOffset,
        actualTargetOffset: actualTargetOffset,
        clampedOffset,
        totalOffsetBeforeNode: totalOffset,
        finalCalculatedOffset: finalOffset,
        containerTotalLength: container.textContent?.length || 0,
        nodeWasElement: targetNode.nodeType !== Node.TEXT_NODE
      });
      
      return finalOffset;
    }
    
    // Add this node's text length to our running total
    const nodeLength = currentNode.textContent?.length || 0;
    totalOffset += nodeLength;
    
    console.log('🔍 Walking text node:', {
      nodeText: currentNode.textContent?.substring(0, 30) + '...',
      nodeLength,
      runningTotal: totalOffset
    });
    
    currentNode = walker.nextNode();
  }
  
  // FALLBACK: If we didn't find the target node, try to estimate position
  const containerText = container.textContent || '';
  const estimatedOffset = Math.min(targetOffset, containerText.length);
  
  console.warn('⚠️ Target node not found in container, using estimated offset:', {
    targetNodeType: targetNode.nodeType,
    targetNodeText: targetNode.textContent?.substring(0, 50) + '...',
    originalOffset: targetOffset,
    estimatedOffset,
    containerLength: containerText.length
  });
  
  return estimatedOffset;
}

function getTextNodeAtOffset(container: Element, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let currentNode = walker.nextNode() as Text;
  let currentOffset = 0;

  while (currentNode) {
    const nodeLength = currentNode.textContent?.length || 0;
    if (currentOffset + nodeLength >= offset) {
      return { node: currentNode, offset: offset - currentOffset };
    }
    currentOffset += nodeLength;
    currentNode = walker.nextNode() as Text;
  }
  return null;
}

const getMarkerPosition = (start: number, end: number, editorRef: React.RefObject<HTMLElement>, setDriftDetected?: (detected: boolean) => void) => {
  if (!editorRef.current) return null;

  try {
    const editorTextContent = editorRef.current.textContent || '';
    const editorLength = editorTextContent.length;
    
    // **DEBUG: Log the positioning attempt**
    console.log('🎯 Calculating marker position:', { 
      start, 
      end, 
      editorLength,
      actualText: editorTextContent.substring(start, end),
      firstChars: editorTextContent.substring(0, 50) + '...',
      aroundSelection: editorTextContent.substring(Math.max(0, start - 20), start + end - start + 20)
    });
    
    // **CONTENT DRIFT DETECTION: Check if coordinates are completely out of bounds**
    if (start >= editorLength || end > editorLength) {
      console.warn(`🚨 CONTENT DRIFT DETECTED: Comment coordinates (${start}-${end}) exceed current editor length (${editorLength}). Article content may have changed since comment was created.`);
      
      // Set the drift detection state if callback provided
      if (setDriftDetected) {
        setDriftDetected(true);
      }
      
      // **RECOVERY STRATEGY: Try to find the comment text in the current content**
      // This is a fallback for when content has been significantly modified
      return null; // For now, hide the marker rather than show it in wrong position
    }
    
    // **ULTRA-ROBUST CHECK: Validate the entire range against editor length**
    if (start < 0 || end < start || start >= editorLength || end > editorLength) {
      console.warn(`📌 Invalid range for marker position: start=${start}, end=${end}, editorLength=${editorLength}. Skipping.`);
      return null;
    }

    const textNode = getTextNodeAtOffset(editorRef.current, start);
    if (!textNode) {
      console.warn(`📌 Could not find text node at offset ${start}. Skipping.`);
      return null;
    }

    console.log('🎯 Found text node:', { 
      nodeText: textNode.node.textContent?.substring(0, 50) + '...',
      offset: textNode.offset,
      nodeLength: textNode.node.textContent?.length
    });

    const range = document.createRange();
    range.setStart(textNode.node, textNode.offset);
    
    // **DEFENSIVE END POSITION SETTING**
    const endTextNode = getTextNodeAtOffset(editorRef.current, Math.min(end, editorLength));
    if (!endTextNode) {
      console.warn(`📌 Could not find end text node at offset ${end}. Using start position.`);
      range.setEnd(textNode.node, textNode.offset);
    } else {
      range.setEnd(endTextNode.node, endTextNode.offset);
    }

    const rangeText = range.toString();
    console.log('🎯 Range created:', { 
      rangeText: rangeText.substring(0, 50) + (rangeText.length > 50 ? '...' : ''),
      rangeLength: rangeText.length,
      expectedLength: end - start
    });

    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();

    // **ADDITIONAL VALIDATION: Ensure the rect is valid**
    if (rect.width === 0 && rect.height === 0) {
      console.warn(`📌 Invalid rect dimensions for range ${start}-${end}. Skipping.`);
      return null;
    }

    const position = {
      top: rect.top - editorRect.top,
      left: rect.left - editorRect.left,
      width: rect.width,
      height: rect.height
    };

    console.log('✅ Marker position calculated:', position);

    return position;
  } catch (error) {
    console.error('❌ Error calculating marker position:', error);
    return null;
  }
}; 