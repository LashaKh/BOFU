import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ArticleComment } from '../lib/commentApi';

interface CommentHighlightOptions {
  comments: ArticleComment[];
  highlightedCommentId: string | null;
  onCommentClick: (comment: ArticleComment) => void;
}

export interface CommentHighlightStorage {
  comments: ArticleComment[];
  highlightedCommentId: string | null;
  onCommentClick: (comment: ArticleComment) => void;
}

// Extend the extension type to include our global click handler
declare module '@tiptap/core' {
  interface Extension {
    globalClickHandler?: (event: Event) => void;
  }
}

const commentHighlightPluginKey = new PluginKey('commentHighlight');

// Get color based on comment status - Google Docs style with yellow highlighting
const getCommentColor = (comment: ArticleComment, isHighlighted: boolean = false): string => {
  // Don't highlight resolved comments at all
  if (comment.status === 'resolved') {
    return 'transparent';
  }

  if (isHighlighted) {
    // Darker yellow when comment is selected/highlighted
    switch (comment.status) {
      case 'archived': return 'rgba(161, 161, 170, 0.4)'; // gray for archived
      default: return 'rgba(254, 240, 138, 0.7)'; // darker yellow for active
    }
  }

  // Light yellow for all commented text by default
  switch (comment.status) {
    case 'archived': return 'rgba(161, 161, 170, 0.15)'; // light gray for archived
    default: return 'rgba(254, 240, 138, 0.4)'; // light yellow for active comments
  }
};

// Get border color for comment status - yellow theme
const getBorderColor = (comment: ArticleComment): string => {
  switch (comment.status) {
    case 'resolved': return 'transparent'; // no border for resolved comments
    case 'archived': return '#6b7280'; // gray border for archived
    default: return '#eab308'; // yellow border for active comments
  }
};

// Find text in ProseMirror document and return positions
const findTextInDocument = (doc: any, searchText: string): { start: number; end: number } | null => {
  if (!searchText || searchText.trim() === '') {
    console.warn('🚫 Empty search text provided');
    return null;
  }

  // Get the full text content of the document
  const docText = doc.textContent;
  
  // Find the text in the document
  const textIndex = docText.indexOf(searchText);
  if (textIndex === -1) {
    console.warn('🚫 Text not found in document:', { searchText: searchText.substring(0, 50) + '...', docText: docText.substring(0, 100) + '...' });
    return null;
  }

  // Convert text positions to ProseMirror positions
  let proseMirrorStart = 1; // Start at 1 (after doc node)
  let proseMirrorEnd = 1;
  let textOffset = 0;
  let foundStart = false;
  let foundEnd = false;

  doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      const nodeTextLength = node.text.length;
      
      // Check if start position is in this node
      if (!foundStart && textOffset <= textIndex && textIndex < textOffset + nodeTextLength) {
        const offsetInNode = textIndex - textOffset;
        proseMirrorStart = pos + offsetInNode;
        foundStart = true;
      }
      
      // Check if end position is in this node
      const textEndIndex = textIndex + searchText.length;
      if (!foundEnd && textOffset < textEndIndex && textEndIndex <= textOffset + nodeTextLength) {
        const offsetInNode = textEndIndex - textOffset;
        proseMirrorEnd = pos + offsetInNode;
        foundEnd = true;
      }
      
      textOffset += nodeTextLength;
      
      // Stop if we found both positions
      if (foundStart && foundEnd) {
        return false;
      }
    }
    return true; // Continue iteration
  });

  console.log('🎯 Text found in document:', {
    searchText: searchText.substring(0, 30) + '...',
    textIndex,
    textEndIndex: textIndex + searchText.length,
    proseMirrorStart,
    proseMirrorEnd,
    foundStart,
    foundEnd,
    docTextLength: docText.length
  });

  return foundStart && foundEnd ? { start: proseMirrorStart, end: proseMirrorEnd } : null;
};

export const CommentHighlightExtension = Extension.create<CommentHighlightOptions, CommentHighlightStorage>({
  name: 'commentHighlight',

  addOptions() {
    return {
      comments: [],
      highlightedCommentId: null,
      onCommentClick: () => {},
    };
  },

  addStorage() {
    return {
      comments: this.options.comments,
      highlightedCommentId: this.options.highlightedCommentId,
      onCommentClick: this.options.onCommentClick,
    };
  },

  onCreate() {
    // Add a persistent global click listener with HIGH PRIORITY to intercept clicks before text selection
    this.globalClickHandler = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const target = event.target as HTMLElement;
      
      console.log('🌟 High-priority global click handler triggered:', { target: target.tagName, classes: Array.from(target.classList || []) });
      
      // Skip image elements and image control buttons
      if (target.tagName === 'IMG' ||
          target.classList?.contains('image-edit-caption') || 
          target.classList?.contains('image-delete') || 
          target.classList?.contains('resize-handle') ||
          target.closest('.image-resize-handle') ||
          target.closest('.image-toolbar') ||
          target.closest('.image-controls')) {
        console.log('🖼️ Skipping comment handling for image element or control button');
        return;
      }
      
      // First, check if we clicked directly on a comment highlight
      if (target.classList?.contains('comment-highlight-tiptap')) {
        const commentId = target.getAttribute('data-comment-id');
        const comment = this.storage.comments.find(c => c.id === commentId);
        
        console.log('🎯 Direct hit on comment highlight:', { commentId, comment: !!comment, status: comment?.status });
        
        if (comment && comment.status !== 'resolved') {
          console.log('✅ Direct hit: Calling onCommentClick for comment:', comment.id);
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          // Also prevent text selection
          if ('getSelection' in window) {
            window.getSelection()?.removeAllRanges();
          }
          this.storage.onCommentClick(comment);
          return;
        }
      }
      
      // Second, use elementsFromPoint to find comment highlights at click coordinates
      const elementsAtPoint = document.elementsFromPoint(mouseEvent.clientX, mouseEvent.clientY);
      console.log('🔍 Elements at click point:', elementsAtPoint.map(el => ({ tag: el.tagName, classes: Array.from(el.classList || []) })));
      
      for (const element of elementsAtPoint) {
        if (element.classList.contains('comment-highlight-tiptap')) {
          const commentId = element.getAttribute('data-comment-id');
          const comment = this.storage.comments.find(c => c.id === commentId);
          
          console.log('🎯 Found comment via elementsFromPoint:', { commentId, comment: !!comment, status: comment?.status });
          
          if (comment && comment.status !== 'resolved') {
            console.log('✅ elementsFromPoint: Calling onCommentClick for comment:', comment.id);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            // Also prevent text selection
            if ('getSelection' in window) {
              window.getSelection()?.removeAllRanges();
            }
            this.storage.onCommentClick(comment);
            return;
          }
          break;
        }
      }
      
      // Third, traverse up the DOM tree
      let commentElement = target;
      for (let i = 0; i < 8 && commentElement; i++) {
        if (commentElement?.classList?.contains('comment-highlight-tiptap')) {
          const commentId = commentElement.getAttribute('data-comment-id');
          const comment = this.storage.comments.find(c => c.id === commentId);
          
          console.log('🎯 Found comment via DOM traversal:', { commentId, comment: !!comment, status: comment?.status });
          
          if (comment && comment.status !== 'resolved') {
            console.log('✅ DOM traversal: Calling onCommentClick for comment:', comment.id);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            // Also prevent text selection
            if ('getSelection' in window) {
              window.getSelection()?.removeAllRanges();
            }
            this.storage.onCommentClick(comment);
            return;
          }
          break;
        }
        commentElement = commentElement.parentElement as HTMLElement;
      }
    };
    
    // TEMPORARY: Disable global handlers to let ArticleEditor handle clicks
    // The ArticleEditor already has comprehensive click handling
    console.log('🔧 CommentHighlightExtension: Relying on ArticleEditor click handlers');
    // document.addEventListener('mousedown', this.globalClickHandler, true);
    // document.addEventListener('click', this.globalClickHandler, true);
  },

  onDestroy() {
    // Clean up global listeners (currently disabled)
    if (this.globalClickHandler) {
      // document.removeEventListener('mousedown', this.globalClickHandler, true);
      // document.removeEventListener('click', this.globalClickHandler, true);
      console.log('🔧 CommentHighlightExtension: Cleanup (handlers were disabled)');
    }
  },

  addProseMirrorPlugins() {
    const extension = this;
    
    return [
      new Plugin({
        key: commentHighlightPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, set) {
            // Get storage from extension
            const storage = extension.storage;
            console.log('🔍 CommentHighlight apply called:', {
              hasStorage: !!storage,
              commentsLength: storage?.comments?.length || 0,
              comments: storage?.comments?.map(c => ({ id: c.id, hasSelectedText: !!c.selected_text }))
            });
            if (!storage || !storage.comments || storage.comments.length === 0) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];

            storage.comments.forEach((comment: ArticleComment) => {
              if (comment.selected_text && comment.selected_text.trim() !== '') {
                const isHighlighted = storage.highlightedCommentId === comment.id;
                const backgroundColor = getCommentColor(comment, isHighlighted);
                const borderColor = getBorderColor(comment);
                
                console.log('🎨 Creating decoration for comment:', {
                  commentId: comment.id,
                  isHighlighted,
                  backgroundColor,
                  highlightedCommentId: storage.highlightedCommentId,
                  selectedText: comment.selected_text.substring(0, 30) + '...'
                });

                // Find text in document and get ProseMirror positions
                const positions = findTextInDocument(tr.doc, comment.selected_text);

                if (positions) {
                  console.log('🎯 Comment highlight positioning:', {
                    commentId: comment.id,
                    selectedText: comment.selected_text.substring(0, 30) + '...',
                    proseMirrorStart: positions.start,
                    proseMirrorEnd: positions.end,
                    storedStart: comment.selection_start,
                    storedEnd: comment.selection_end
                  });

                  const decoration = Decoration.inline(
                    positions.start,
                    positions.end,
                    {
                      class: 'comment-highlight-tiptap',
                      style: `
                        background-color: ${backgroundColor};
                        border-bottom: 2px solid ${borderColor};
                        border-radius: 2px;
                        padding: 1px 2px;
                        margin: 0 1px;
                        cursor: pointer;
                        pointer-events: auto;
                        user-select: none;
                        -webkit-user-select: none;
                        -moz-user-select: none;
                        -ms-user-select: none;
                        transition: background-color 0.2s ease, border-color 0.2s ease;
                      `,
                      title: `Comment by ${comment.user?.name || 'Unknown'}: ${comment.content.substring(0, 100)}${comment.content.length > 100 ? '...' : ''}`,
                      'data-comment-id': comment.id,
                    }
                  );

                  decorations.push(decoration);
                } else {
                  console.warn('🚫 Could not find text for comment highlighting:', {
                    commentId: comment.id,
                    selectedText: comment.selected_text?.substring(0, 50) + '...'
                  });
                }
              }
            });

            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleClick(view, pos, event) {
            // This is a more reliable click handler that doesn't get lost during decoration updates
            console.log('🖱️ ProseMirror handleClick:', { pos, event, target: event.target });
            const target = event.target as HTMLElement;
            
            // Check if we clicked on a comment highlight
            let commentElement = target;
            for (let i = 0; i < 5 && commentElement; i++) {
              if (commentElement.classList?.contains('comment-highlight-tiptap')) {
                const commentId = commentElement.getAttribute('data-comment-id');
                const comment = extension.storage.comments.find(c => c.id === commentId);
                
                if (comment && comment.status !== 'resolved') {
                  console.log('✅ handleClick: Calling onCommentClick for comment:', comment.id);
                  event.preventDefault();
                  event.stopPropagation();
                  extension.storage.onCommentClick(comment);
                  return true;
                }
                break;
              }
              commentElement = commentElement.parentElement as HTMLElement;
            }
            return false;
          },
          handleDOMEvents: {
            mouseup(view, event) {
              // Handle mouseup to catch the complete click cycle
              console.log('🖱️ MouseUp event in CommentHighlightExtension:', event.target);
              const target = event.target as HTMLElement;
              
              // Check if we're on a comment highlight
              let commentElement = target;
              for (let i = 0; i < 5 && commentElement; i++) {
                if (commentElement.classList?.contains('comment-highlight-tiptap')) {
                  const commentId = commentElement.getAttribute('data-comment-id');
                  const comment = extension.storage.comments.find(c => c.id === commentId);
                  
                  if (comment && comment.status !== 'resolved') {
                    console.log('✅ mouseup: Calling onCommentClick for comment:', comment.id);
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    extension.storage.onCommentClick(comment);
                    return true;
                  }
                  break;
                }
                commentElement = commentElement.parentElement as HTMLElement;
              }
              return false;
            },
            click(view, event) {
              console.log('🖱️ Click event in CommentHighlightExtension:', event.target);
              const target = event.target as HTMLElement;
              console.log('🎯 Target element:', target, 'Has comment class:', target?.classList.contains('comment-highlight-tiptap'));
              
              // Debug: Check if we can find any comment highlight elements near the click
              const allCommentElements = document.querySelectorAll('.comment-highlight-tiptap');
              console.log('🔍 All comment elements found:', allCommentElements.length, Array.from(allCommentElements).map(el => ({
                id: el.getAttribute('data-comment-id'),
                text: el.textContent?.substring(0, 30) + '...',
                style: el.getAttribute('style'),
                isTransparent: el.getAttribute('style')?.includes('transparent'),
                backgroundColor: el.style.backgroundColor,
                borderColor: el.style.borderColor,
                cursor: el.style.cursor,
                pointerEvents: el.style.pointerEvents
              })));
              
              // Enhanced click detection with better DOM traversal
              let commentElement = target;
              let found = false;
              
              // Look up the DOM tree for comment elements (increased depth for better detection)
              for (let i = 0; i < 8 && commentElement; i++) {
                console.log(`🔍 Checking level ${i}:`, {
                  nodeName: commentElement.nodeName,
                  classes: Array.from(commentElement.classList || []),
                  hasCommentClass: commentElement.classList?.contains('comment-highlight-tiptap'),
                  dataCommentId: commentElement.getAttribute?.('data-comment-id'),
                  textContent: commentElement.textContent?.substring(0, 30) + '...'
                });
                
                if (commentElement.classList && commentElement.classList.contains('comment-highlight-tiptap')) {
                  found = true;
                  break;
                }
                commentElement = commentElement.parentElement as HTMLElement;
              }
              
              // Fallback: Direct query selector search around the clicked area
              if (!found) {
                console.log('🔍 No comment element found via traversal, trying direct search...');
                const clickedRect = target.getBoundingClientRect();
                const elementsAtPoint = document.elementsFromPoint(clickedRect.left + clickedRect.width/2, clickedRect.top + clickedRect.height/2);
                
                for (const element of elementsAtPoint) {
                  if (element.classList.contains('comment-highlight-tiptap')) {
                    commentElement = element as HTMLElement;
                    found = true;
                    console.log('✅ Found comment element via elementsFromPoint:', element);
                    break;
                  }
                }
              }
              
              if (found && commentElement) {
                const commentId = commentElement.getAttribute('data-comment-id');
                console.log('💭 Found comment ID:', commentId);
                const comment = extension.storage.comments.find(c => c.id === commentId);
                console.log('📝 Found comment object:', comment);
                
                if (comment) {
                  // Check if comment is active (not resolved/archived) before allowing click
                  if (comment.status === 'resolved') {
                    console.log('🚫 Comment is resolved, ignoring click:', comment.id);
                    return false;
                  }
                  
                  console.log('✅ handleDOMEvents click: Calling onCommentClick for active comment:', comment.id);
                  event.preventDefault();
                  event.stopPropagation();
                  event.stopImmediatePropagation(); // Stop ALL further event propagation
                  extension.storage.onCommentClick(comment);
                  return true; // Indicate we handled the event
                } else {
                  console.warn('❌ Comment not found in storage for ID:', commentId);
                }
              } else {
                console.log('❌ No comment element found after exhaustive search');
              }
              return false;
            },
            mouseover(view, event) {
              const target = event.target as HTMLElement;
              if (target && target.classList.contains('comment-highlight-tiptap')) {
                const commentId = target.getAttribute('data-comment-id');
                const comment = extension.storage.comments.find(c => c.id === commentId);
                if (comment) {
                  target.style.backgroundColor = getCommentColor(comment, true);
                }
              }
              return false;
            },
            mouseout(view, event) {
              const target = event.target as HTMLElement;
              if (target && target.classList.contains('comment-highlight-tiptap')) {
                const commentId = target.getAttribute('data-comment-id');
                const comment = extension.storage.comments.find(c => c.id === commentId);
                if (comment && extension.storage.highlightedCommentId !== comment.id) {
                  target.style.backgroundColor = getCommentColor(comment, false);
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      updateComments: (comments: ArticleComment[]) => ({ editor }: any) => {
        console.log('📝 CommentHighlight updateComments called:', {
          commentsLength: comments.length,
          comments: comments.map((c: ArticleComment) => ({ 
            id: c.id, 
            hasSelectedText: !!c.selected_text,
            selectedText: c.selected_text?.substring(0, 30) + '...'
          }))
        });
        const extension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'commentHighlight');
        if (extension) {
          extension.storage.comments = comments;
          // Force re-render of decorations
          editor.view.dispatch(editor.state.tr);
        }
        return true;
      },
      updateHighlightedComment: (commentId: string | null) => ({ editor }: any) => {
        const extension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'commentHighlight');
        if (extension) {
          extension.storage.highlightedCommentId = commentId;
          // Force re-render of decorations
          editor.view.dispatch(editor.state.tr);
        }
        return true;
      },
      updateOnCommentClick: (onCommentClick: (comment: ArticleComment) => void) => ({ editor }: any) => {
        const extension = editor.extensionManager.extensions.find((ext: any) => ext.name === 'commentHighlight');
        if (extension) {
          extension.storage.onCommentClick = onCommentClick;
        }
        return true;
      },
    };
  },
}); 