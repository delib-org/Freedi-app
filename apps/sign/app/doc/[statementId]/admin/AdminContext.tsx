'use client';

import { createContext, useContext, ReactNode } from 'react';
import { AdminPermissionLevel } from '@freedi/shared-types';

export interface AdminContextType {
  permissionLevel: AdminPermissionLevel;
  isOwner: boolean;
  canManageSettings: boolean;  // owner + admin
  canExport: boolean;          // owner + admin
  canInviteViewers: boolean;   // owner + admin
  canInviteAdmins: boolean;    // owner only
}

const AdminContext = createContext<AdminContextType | null>(null);

interface AdminProviderProps {
  children: ReactNode;
  permissionLevel: AdminPermissionLevel;
  isOwner: boolean;
}

export function AdminProvider({ children, permissionLevel, isOwner }: AdminProviderProps) {
  const isViewer = permissionLevel === AdminPermissionLevel.viewer;

  const value: AdminContextType = {
    permissionLevel,
    isOwner,
    canManageSettings: !isViewer,
    canExport: !isViewer,
    canInviteViewers: !isViewer,
    canInviteAdmins: isOwner,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdminContext(): AdminContextType {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdminContext must be used within an AdminProvider');
  }
  return context;
}
