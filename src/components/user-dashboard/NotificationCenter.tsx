import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  Check, 
  MessageSquare,
  User,
  Clock,
  CheckCircle,
  MoreVertical,
  Filter,
  AtSign
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
  const [notifications, setNotifications] = useState<MentionNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'mentions'>('all');
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
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
          toast.success(
            `New mention from ${newNotification.mentioned_by_user?.name || newNotification.mentioned_by_user?.email || 'someone'}`,
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
      
      const mentionNotifications = await getMentionNotifications();
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
      const unreadIds = notifications
        .filter(n => !n.notification_sent)
        .map(n => n.id);
      
      if (unreadIds.length > 0) {
        await markMentionNotificationsAsSent(unreadIds);
        setNotifications(prev => 
          prev.map(notification => ({ ...notification, notification_sent: true }))
        );
        setUnreadCount(0);
        toast.success('All notifications marked as read');
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
            {filteredNotifications.map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  notification.notification_sent
                    ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                }`}
                onClick={() => {
                  if (!notification.notification_sent) markAsRead(notification.id);
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    notification.notification_sent ? 'bg-gray-200 dark:bg-gray-700' : 'bg-blue-500/20'
                  }`}>
                    <AtSign className={`h-4 w-4 ${
                      notification.notification_sent ? 'text-gray-500' : 'text-blue-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-medium ${
                        notification.notification_sent 
                          ? 'text-gray-600 dark:text-gray-300' 
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {getMentionedByName(notification)} mentioned you
                      </h4>
                      {!notification.notification_sent && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                    {notification.comment && (
                      <p className={`text-sm mb-2 ${
                        notification.notification_sent 
                          ? 'text-gray-500 dark:text-gray-400' 
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        "{notification.comment.content.substring(0, 100)}..."
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {notification.notification_sent ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification.id);
                        }}
                        className="p-1 rounded hover:bg-blue-500/20 text-blue-500 hover:text-blue-600 transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
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