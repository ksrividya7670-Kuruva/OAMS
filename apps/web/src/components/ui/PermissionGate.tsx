import type { FC, ReactNode } from 'react';
import type { Permission } from '@oams/shared';
import { useAuth } from '@/features/auth/AuthContext';

interface PermissionGateProps {
  permission: Permission;
  record?: { orgId?: string; officialId?: string; userId?: string };
  fallback?: ReactNode;
  children: ReactNode;
}

export const PermissionGate: FC<PermissionGateProps> = ({
  permission,
  record,
  fallback = null,
  children,
}) => {
  const { can } = useAuth();

  if (!can(permission, record)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
