import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useArticleNavigation } from '../../lib/articleNavigation';
import { 
  Bell, 
  Check, 
  MessageSquare,
  User,
  Clock,
  CheckCircle,
  MoreVertical,
  Filter,
  AtSign,
  ExternalLink,
  Building,
  FileText,
  Calendar,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import { 
  getMentionNotifications, 
  markMentionNotificationsAsSent,
  MentionNotification,
  subscribeToMentionNotifications
} from '../../lib/commentApi';
import { formatDistanceToNow } from 'date-fns';
import { BaseModal } from '../ui/BaseModal';

interface NotificationCenterProps {
  isVisible: boolean;
  onClose: () => void;
}

export function NotificationCenter({ isVisible, onClose }: NotificationCenterProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { navigateToArticle } = useArticleNavigation();
  const [notifications, setNotifications] = useState<MentionNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'mentions'>('all');
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const subscriptionRef = useRef<any>(null);

  // Load notifications when component becomes visible
  useEffect(() => {
    if (isVisible && user) {
      loadNotifications();
    }
  }, [isVisible, user]);

  // Set up real-time subscription for mention notifications
  useEffect(() => {
    if (user?.id) {
      console.log('🔔 Setting up real-time mention notifications for user:', user.id);
      
      // Clean up any existing subscription first
      if (subscriptionRef.current) {
        console.log('🔔 Cleaning up existing user mention subscription');
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      
      subscriptionRef.current = subscribeToMentionNotifications(
        user.id,
        (newNotification: MentionNotification) => {
          console.log('🔔 Received new mention notification:', newNotification);
          
          // Add the new notification to the list
          setNotifications(prev => [newNotification, ...prev]);
          
          // Update unread count
          setUnreadCount(prev => prev + 1);
          
          // Show toast notification
          const articleTitle = newNotification.comment?.content_briefs?.title || 'an article';
          const productName = newNotification.comment?.content_briefs?.product_name || 'a product';
          const userName = newNotification.mentioned_by_user?.name || newNotification.mentioned_by_user?.email || 'someone';
          
          toast.success(
            `${userName} mentioned you in ${productName} article "${articleTitle}"`,
            {
              icon: '🔔',
              duration: 5000,
            }
          );
          
          // Play notification sound (optional)
          try {
            const audio = new Audio('/notification-sound.mp3');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Ignore errors if sound doesn't exist
          } catch (error) {
            // Ignore audio errors
          }
        }
      );

      return () => {
        if (subscriptionRef.current) {
          console.log('🔔 Cleaning up mention notifications subscription');
          subscriptionRef.current.unsubscribe();
          subscriptionRef.current = null;
        }
      };
    }
  }, [user?.id]);

  // Update unread count when notifications change
  useEffect(() => {
    const unread = notifications.filter(n => !n.notification_sent).length;
    setUnreadCount(unread);
  }, [notifications]);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      console.log('📥 Loading mention notifications for user');
      
      const mentionNotifications = await getMentionNotifications(undefined, undefined, true);
      console.log('📥 Loaded mention notifications:', mentionNotifications.length);
      
      setNotifications(mentionNotifications);
    } catch (error) {
      console.error('❌ Error loading notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(notification => {
    switch (filter) {
      case 'unread':
        return !notification.notification_sent;
      case 'mentions':
        return true; // All notifications are mentions for now
      default:
        return true;
    }
  });

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await markMentionNotificationsAsSent([notificationId]);
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, notification_sent: true }
            : notification
        )
      );
      
      // Update unread count immediately
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      toast.error('Failed to mark as read');
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      console.log('🔄 markAllAsRead called, total notifications:', notifications.length);
      
      const unreadIds = notifications
        .filter(n => !n.notification_sent)
        .map(n => n.id);
      
      console.log('🔍 Found unread notification IDs:', unreadIds);
      
      if (unreadIds.length > 0) {
        console.log('🔄 Calling markMentionNotificationsAsSent...');
        const result = await markMentionNotificationsAsSent(unreadIds);
        console.log('📤 markMentionNotificationsAsSent result:', result);
        
        if (result) {
          setNotifications(prev => 
            prev.map(notification => ({ ...notification, notification_sent: true }))
          );
          setUnreadCount(0);
          
          // Manually refresh the main header notification count
          console.log('🔄 Calling manual refresh...');
          if (typeof window !== 'undefined' && (window as any).refreshNotificationCount) {
            await (window as any).refreshNotificationCount();
            console.log('✅ Manual refresh completed');
          } else {
            console.log('❌ Manual refresh function not available');
          }
          
          toast.success('All notifications marked as read');
        } else {
          throw new Error('Failed to mark notifications as sent');
        }
      } else {
        console.log('ℹ️ No unread notifications to mark');
        toast.info('No unread notifications to mark');
      }
    } catch (error) {
      console.error('❌ Error marking all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  // Toggle notification selection
  const toggleNotificationSelection = (notificationId: string) => {
    const newSelected = new Set(selectedNotifications);
    if (newSelected.has(notificationId)) {
      newSelected.delete(notificationId);
    } else {
      newSelected.add(notificationId);
    }
    setSelectedNotifications(newSelected);
  };

  // Navigation handlers for notifications
  const handleNavigateToArticle = async (articleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNavigationError(null);
    
    await navigateToArticle(
      articleId,
      navigate,
      (error) => setNavigationError(error)
    );
  };


  // Get user name from comment data
  const getMentionedByName = (notification: MentionNotification) => {
    if (notification.comment?.user?.name) {
      return notification.comment.user.name;
    }
    if (notification.comment?.user?.email) {
      // Extract name from email (before @)
      return notification.comment.user.email.split('@')[0];
    }
    return 'Someone';
  };

  return (
    <BaseModal
      isOpen={isVisible}
      onClose={onClose}
      title="Notifications"
      size="lg"
      theme="dark"
    >
      {/* Notification icon with unread count */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-blue-500/20 relative">
          <Bell className="h-6 w-6 text-blue-500" />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {unreadCount} unread • {notifications.length} total
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition-colors ml-auto"
          >
            <CheckCircle className="h-4 w-4" />
            Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        {[
          { key: 'all', label: 'All', count: notifications.length },
          { key: 'unread', label: 'Unread', count: unreadCount },
          { key: 'mentions', label: 'Mentions', count: notifications.length }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[calc(60vh-100px)] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Bell className="h-8 w-8 text-blue-500" />
            </motion.div>
          </div>
        ) : filteredNotifications.length > 0 ? (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => {
              const articleId = notification.comment?.content_briefs?.id || notification.comment?.article_id;
              const articleTitle = notification.comment?.content_briefs?.title || 'Unknown Article';
              const productName = notification.comment?.content_briefs?.product_name;
              const mentionedByName = getMentionedByName(notification);
              
              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-5 rounded-xl border transition-all cursor-pointer ${
                    notification.notification_sent
                      ? 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 shadow-lg'
                  }`}
                  onClick={() => {
                    if (!notification.notification_sent) markAsRead(notification.id);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${
                      notification.notification_sent ? 'bg-gray-200 dark:bg-gray-700' : 'bg-blue-500/20'
                    }`}>
                      <AtSign className={`h-5 w-5 ${
                        notification.notification_sent ? 'text-gray-500' : 'text-blue-500'
                      }`} />
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-3">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className={`font-semibold text-lg ${
                          notification.notification_sent 
                            ? 'text-gray-600 dark:text-gray-300' 
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {articleTitle}
                        </h4>
                        {!notification.notification_sent && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        )}
                      </div>

                      {/* Rich Context */}
                      <div className="bg-gray-100 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-600/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            <span className="text-sm text-gray-600 dark:text-gray-300">Article:</span>
                            <span className="text-sm text-gray-900 dark:text-white font-medium">{articleTitle}</span>
                          </div>
                          {productName && (
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-gray-600 dark:text-gray-300">Product:</span>
                              <span className="text-sm text-gray-900 dark:text-white font-medium">{productName}</span>
                            </div>
                          )}
                        </div>
                        
                        {notification.comment && (
                          <div className="bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600/20">
                            <div className="flex items-center gap-2 mb-2">
                              <User className="h-4 w-4 text-purple-500" />
                              <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                                {mentionedByName} mentioned you
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                              {notification.comment.content.length > 150 
                                ? `${notification.comment.content.substring(0, 150)}...`
                                : notification.comment.content
                              }
                            </p>
                          </div>
                        )}
                        
                        {/* Navigation Button */}
                        {articleId && (
                          <div className="flex items-center gap-2 mt-4">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={(e) => handleNavigateToArticle(articleId, e)}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Edit Article
                            </motion.button>
                          </div>
                        )}
                        
                        {/* Navigation Error */}
                        {navigationError && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/20 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              <span className="text-sm text-red-600 dark:text-red-400">{navigationError}</span>
                            </div>
                          </motion.div>
                        )}
                      </div>
                      
                      {/* Timestamp */}
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {notification.notification_sent ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          className="p-2 rounded-lg hover:bg-blue-500/20 text-blue-500 hover:text-blue-600 transition-colors"
                          title="Mark as read"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Bell className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Notifications</h3>
            <p>
              {filter === 'all' ? 'No notifications found' :
               filter === 'unread' ? 'All notifications have been read' :
               'No mention notifications found'}
            </p>
          </div>
        )}
      </div>
    </BaseModal>
  );
}