import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Bell } from 'lucide-react';

// Types
type AdminView = 'dashboard' | 'userManagement' | 'articleManagement' | 'commentManagement' | 'auditLogs' | 'adminAssignmentHub' | 'contentBriefManagement';

interface AssignedClient {
  id: string;
  client_email: string;
}

interface AdminHeaderProps {
  currentView: AdminView;
  adminRole: 'super_admin' | 'sub_admin' | null;
  assignedClients: AssignedClient[];
  showNotificationCenter: boolean;
  onRefreshData: () => void;
  onToggleNotificationCenter: (show: boolean) => void;
}

export const AdminHeader = ({
  currentView,
  adminRole,
  assignedClients,
  showNotificationCenter,
  onRefreshData,
  onToggleNotificationCenter
}: AdminHeaderProps) => {
  const getViewTitle = (view: AdminView): string => {
    switch (view) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'userManagement':
        return 'User Management';
      case 'contentBriefManagement':
        return 'Content Brief Management';
      case 'articleManagement':
        return 'Content Management Hub';
      case 'commentManagement':
        return 'Engagement Center';
      case 'auditLogs':
        return 'Security & Audit Logs';
      case 'adminAssignmentHub':
        return 'Admin Assignment Hub';
      default:
        return 'Admin Dashboard';
    }
  };

  const getViewDescription = (view: AdminView): string => {
    switch (view) {
      case 'dashboard':
        return 'Welcome back! Here\'s what\'s happening today.';
      case 'userManagement':
        return 'Manage users and their permissions';
      case 'contentBriefManagement':
        return 'Manage user content briefs and product cards';
      case 'adminAssignmentHub':
        return 'Manage admin accounts, client assignments, and operations';
      default:
        return 'Manage your BOFU AI platform';
    }
  };

  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-30 bg-gray-800/90 backdrop-blur-xl border-b border-gray-700/50 p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {getViewTitle(currentView)}
          </h1>
          <p className="text-gray-400 mt-1">
            {getViewDescription(currentView)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRefreshData}
            className="p-3 rounded-xl bg-gray-700/60 hover:bg-gray-600/60 shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-600/30 hover:border-yellow-500/30"
            title="Refresh Data"
          >
            <RefreshCw size={18} className="text-gray-300 hover:text-white transition-colors" />
          </motion.button>
          
          {/* Notification Bell - Admin Users */}
          {(adminRole === 'super_admin' || adminRole === 'sub_admin') && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onToggleNotificationCenter(true)}
              className="relative p-3 rounded-xl bg-gray-700/60 hover:bg-gray-600/60 shadow-lg hover:shadow-xl transition-all duration-200 border border-gray-600/30 hover:border-blue-500/30"
              title="Assignment Notifications"
            >
              <Bell size={18} className="text-gray-300 hover:text-white transition-colors" />
              {/* Dynamic notification badge */}
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-bold">
                {/* This will be updated to show actual count from AssignmentNotificationCenter */}
                {assignedClients.length > 0 ? assignedClients.length : ''}
              </div>
            </motion.button>
          )}
        </div>
      </div>
    </motion.header>
  );
}; 