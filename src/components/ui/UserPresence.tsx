import React, { useState, useEffect, useRef } from 'react';
import { Users, Eye, Edit, Clock, X, Settings, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { realtimeCollaboration, PresenceUser } from '../../lib/realtimeCollaboration';
import { cn } from '../../lib/utils';
import { EnhancedUserAvatar } from './EnhancedUserAvatar';

interface UserPresenceProps {
  articleId: string;
  className?: string;
  compact?: boolean;
  showTooltips?: boolean;
  onUserClick?: (user: PresenceUser) => void;
}

interface CursorDisplay {
  userId: string;
  position: any;
  metadata: any;
}

interface UserPresenceSettings {
  showAvatars: boolean;
  showStatus: boolean;
  showTooltips: boolean;
  animateJoinLeave: boolean;
  compactMode: boolean;
}

export const UserPresence: React.FC<UserPresenceProps> = ({
  articleId,
  className = '',
  compact = false,
  showTooltips = true,
  onUserClick,
}) => {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<CursorDisplay[]>([]);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [isJoined, setIsJoined] = useState(false);
  const [settings, setSettings] = useState<UserPresenceSettings>({
    showAvatars: true,
    showStatus: true,
    showTooltips: true,
    animateJoinLeave: true,
    compactMode: compact,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [joiningUsers, setJoiningUsers] = useState<Set<string>>(new Set());
  const [leavingUsers, setLeavingUsers] = useState<Set<string>>(new Set());
  const presenceRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('user-presence-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to load presence settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('user-presence-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let presenceUnsubscribe: (() => void) | null = null;
    let cursorUnsubscribe: (() => void) | null = null;

    const initializePresence = async () => {
      try {
        console.log('🚀 UserPresence: Initializing for article:', articleId);
        // Join the article for real-time collaboration
        await realtimeCollaboration.joinArticle(articleId);
        setIsJoined(true);
        console.log('✅ UserPresence: Successfully joined article');

        // Subscribe to presence changes
        presenceUnsubscribe = realtimeCollaboration.onPresenceChange((presence) => {
          console.log('🔔 UserPresence received presence update:', presence);
          
          // Handle join/leave animations using previous state instead of closure
          setActiveUsers(prevUsers => {
            if (settings.animateJoinLeave) {
              const currentUserIds = new Set(prevUsers.map(u => u.user_id));
              const newUserIds = new Set(presence.map(u => u.user_id));
              
              // Find users who joined
              const joined = presence.filter(u => !currentUserIds.has(u.user_id));
              if (joined.length > 0) {
                console.log('➕ Users joined:', joined);
                setJoiningUsers(new Set(joined.map(u => u.user_id)));
                setTimeout(() => {
                  setJoiningUsers(new Set());
                }, 500);
              }
              
              // Find users who left
              const left = prevUsers.filter(u => !newUserIds.has(u.user_id));
              if (left.length > 0) {
                console.log('➖ Users left:', left);
                setLeavingUsers(new Set(left.map(u => u.user_id)));
                setTimeout(() => {
                  setLeavingUsers(new Set());
                }, 300);
              }
            }
            
            console.log('👥 UserPresence activeUsers updated to:', presence.length, 'users');
            return presence; // Return the new presence array
          });
        });

        // Subscribe to cursor changes
        cursorUnsubscribe = realtimeCollaboration.onCursorChange((cursors) => {
          setCursors(cursors);
        });

        // Get initial active users
        const initialUsers = await realtimeCollaboration.getActiveUsers(articleId);
        console.log('👥 UserPresence: Initial active users:', initialUsers);
        setActiveUsers(initialUsers);
      } catch (error) {
        console.error('Failed to initialize presence:', error);
      }
    };

    initializePresence();

    return () => {
      // Cleanup subscriptions
      if (presenceUnsubscribe) {
        presenceUnsubscribe();
      }
      if (cursorUnsubscribe) {
        cursorUnsubscribe();
      }
      
      // Leave the article when component unmounts
      if (isJoined) {
        realtimeCollaboration.leaveArticle();
      }
    };
  }, [articleId]); // Removed activeUsers and settings.animateJoinLeave to prevent infinite loop

  // Close settings panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettings]);

  const getStatusIcon = (status: PresenceUser['status'], size: 'sm' | 'md' = 'sm') => {
    const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
    
    switch (status) {
      case 'editing':
        return <Edit className={cn(iconSize, 'text-green-500')} />;
      case 'viewing':
        return <Eye className={cn(iconSize, 'text-blue-500')} />;
      case 'idle':
        return <Clock className={cn(iconSize, 'text-amber-500')} />;
      default:
        return <Eye className={cn(iconSize, 'text-gray-400')} />;
    }
  };

  const getStatusText = (status: PresenceUser['status']) => {
    switch (status) {
      case 'editing':
        return 'Editing';
      case 'viewing':
        return 'Viewing';
      case 'idle':
        return 'Away';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status: PresenceUser['status']) => {
    switch (status) {
      case 'editing':
        return 'bg-green-500';
      case 'viewing':
        return 'bg-blue-500';
      case 'idle':
        return 'bg-amber-500';
      default:
        return 'bg-gray-400';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    }
  };

  const getCurrentUserColor = (userId: string) => {
    const user = activeUsers.find(u => u.user_id === userId);
    return user?.user_metadata?.color || '#3B82F6';
  };

  const renderUserAvatar = (user: PresenceUser, size: 'sm' | 'md' | 'lg' = 'sm') => {
    const isJoining = joiningUsers.has(user.user_id);
    const isLeaving = leavingUsers.has(user.user_id);

    return (
      <EnhancedUserAvatar
        key={user.user_id}
        user={user}
        size={size}
        showStatus={settings.showStatus}
        showTooltip={settings.showTooltips && showTooltips}
        onClick={onUserClick}
        isJoining={isJoining}
        isLeaving={isLeaving}
        showConnectionStatus={true}
      />
    );
  };

  const renderCursor = (cursor: CursorDisplay) => {
    if (!cursor.position) return null;

    const color = cursor.metadata?.color || '#3B82F6';
    const userName = cursor.metadata?.name || cursor.metadata?.email || 'Unknown User';

    return (
      <div
        key={cursor.userId}
        className="absolute pointer-events-none z-50"
        style={{
          // Position will be calculated based on editor coordinates
          // This is a simplified version - actual implementation would
          // need to map editor coordinates to screen coordinates
          transform: `translate(${cursor.position.from}px, 0)`,
        }}
      >
        <div
          className="w-0.5 h-5 relative"
          style={{ backgroundColor: color }}
        >
          <div
            className="absolute -top-6 left-0 px-2 py-1 text-xs text-white rounded whitespace-nowrap"
            style={{ backgroundColor: color }}
          >
            {userName}
          </div>
        </div>
      </div>
    );
  };

  if (!isJoined) {
    return null;
  }

  const currentUserId = realtimeCollaboration.getCurrentUserId();
  const otherUsers = activeUsers.filter(user => user.user_id !== currentUserId);
  const totalUsers = otherUsers.length; // Only count other users, not including current user

  const renderSettingsPanel = () => (
    <div 
      ref={settingsRef}
      className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-72"
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            Presence Settings
          </h3>
          <button
            onClick={() => setShowSettings(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        {/* Show Avatars Setting */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700">Show Avatars</label>
          <button
            onClick={() => setSettings(prev => ({ ...prev, showAvatars: !prev.showAvatars }))}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              settings.showAvatars ? 'bg-blue-600' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.showAvatars ? 'translate-x-5' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Show Status Setting */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700">Show Status Indicators</label>
          <button
            onClick={() => setSettings(prev => ({ ...prev, showStatus: !prev.showStatus }))}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              settings.showStatus ? 'bg-blue-600' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.showStatus ? 'translate-x-5' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Show Tooltips Setting */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700">Show Tooltips</label>
          <button
            onClick={() => setSettings(prev => ({ ...prev, showTooltips: !prev.showTooltips }))}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              settings.showTooltips ? 'bg-blue-600' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.showTooltips ? 'translate-x-5' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Animate Join/Leave Setting */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700">Animate Join/Leave</label>
          <button
            onClick={() => setSettings(prev => ({ ...prev, animateJoinLeave: !prev.animateJoinLeave }))}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              settings.animateJoinLeave ? 'bg-blue-600' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.animateJoinLeave ? 'translate-x-5' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Compact Mode Setting */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-700">Compact Mode</label>
          <button
            onClick={() => setSettings(prev => ({ ...prev, compactMode: !prev.compactMode }))}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              settings.compactMode ? 'bg-blue-600' : 'bg-gray-300'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.compactMode ? 'translate-x-5' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );

  const renderCompactView = () => (
    <div className="flex items-center space-x-2">
      {/* Always show collaboration indicator */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center space-x-2 px-3 py-1.5 text-sm bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-full hover:from-blue-500/20 hover:to-purple-500/20 transition-all"
        title={`${totalUsers} other user${totalUsers !== 1 ? 's' : ''} active`}
      >
        <div className="flex items-center space-x-1">
          <Users className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-gray-700 dark:text-gray-300">{totalUsers}</span>
          {totalUsers === 0 && <span className="text-xs text-gray-500">(solo)</span>}
        </div>
        
        {/* Avatar Stack */}
        {otherUsers.length > 0 && (
          <div className="flex -space-x-2 ml-2">
            {otherUsers.slice(0, 3).map((user) => 
              renderUserAvatar(user, 'sm')
            )}
            
            {otherUsers.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium border-2 border-white dark:border-gray-800">
                +{otherUsers.length - 3}
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center space-x-1">
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </button>
      
      {/* Settings button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        title="Collaboration settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderExpandedView = () => (
    <div 
      ref={presenceRef}
      className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-80"
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            Other Users ({totalUsers})
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      
      <div className="max-h-80 overflow-y-auto">
        {otherUsers.map((user) => {
          const isCurrentUser = false; // Since we're only showing other users now
          return (
            <div
              key={user.user_id}
              className={cn(
                'flex items-center space-x-3 p-3 transition-colors cursor-pointer',
                'hover:bg-gray-50',
                isCurrentUser && 'bg-blue-50'
              )}
              onClick={() => onUserClick?.(user)}
            >
              <div className="relative">
                {renderUserAvatar(user, 'md')}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.user_metadata.name || user.user_metadata.email}
                    {isCurrentUser && (
                      <span className="text-xs text-blue-600 ml-1 font-normal">(You)</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(user.status, 'sm')}
                    <span>{getStatusText(user.status)}</span>
                  </div>
                  <span>•</span>
                  <span>{formatTimeAgo(user.last_heartbeat)}</span>
                </div>
                {user.user_metadata.email && user.user_metadata.name && (
                  <div className="text-xs text-gray-400 truncate">
                    {user.user_metadata.email}
                  </div>
                )}
              </div>

              {/* Additional status indicators */}
              <div className="flex items-center space-x-1">
                {user.status === 'editing' && (
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Currently editing" />
                )}
                {user.cursor_position && (
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: user.user_metadata.color }} 
                    title="Active cursor"
                  />
                )}
              </div>
            </div>
          );
        })}

        {otherUsers.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No other users online</p>
          </div>
        )}
      </div>

      {/* Footer with collaboration stats */}
      <div className="p-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        <div className="flex justify-between items-center">
          <span>
            {otherUsers.filter(u => u.status === 'editing').length} editing, {' '}
            {otherUsers.filter(u => u.status === 'viewing').length} viewing
          </span>
          <span className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Real-time</span>
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('relative', className)}>
      {/* Main User Presence Indicator */}
      {renderCompactView()}

      {/* Expanded User List */}
      {isExpanded && renderExpandedView()}

      {/* Settings Panel */}
      {showSettings && renderSettingsPanel()}

      {/* Render Cursors (These would be positioned relative to the editor) */}
      {cursors.map(renderCursor)}
    </div>
  );
};

export default UserPresence; 