import type { FC } from 'react';
import { Navigate } from 'react-router';

export const DepartmentsAdminPage: FC = () => {
  return <Navigate to="/admin/users" replace />;
};
