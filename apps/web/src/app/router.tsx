import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './layout';
import { HomePage } from '@/features/home/HomePage';
import { LoginPage } from '@/features/auth/LoginPage';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { UsersAdminPage } from '@/features/admin/UsersAdminPage';
import { OfficialsAdminPage } from '@/features/admin/OfficialsAdminPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { ControlRoomPage } from '@/features/calendar/ControlRoomPage';
import { PersonalAccessPage } from '@/features/settings/PersonalAccessPage';
import { RoomsAdminPage } from '@/features/admin/RoomsAdminPage';
import { HolidaysAdminPage } from '@/features/admin/HolidaysAdminPage';
import { AppointmentRequestWizard } from '@/features/appointments/AppointmentRequestWizard';
import { MyAppointmentsPage } from '@/features/appointments/MyAppointmentsPage';
import { AppointmentTrackingPage } from '@/features/appointments/AppointmentTrackingPage';
import { InboxPage } from '@/features/inbox/InboxPage';
import { AppointmentDetailPage } from '@/features/appointments/AppointmentDetailPage';
import { FindSlotPage } from '@/features/calendar/FindSlotPage';
import { TodoPage } from '@/features/todo/TodoPage';
import { ReceptionPage } from '@/features/reception/ReceptionPage';
import { SecurityPage } from '@/features/security/SecurityPage';
import { MeetingDayDashboard } from '@/features/meeting-day/MeetingDayDashboard';
import { ReportsPage } from '@/features/admin/ReportsPage';
import { AuditViewerPage } from '@/features/admin/AuditViewerPage';
import { AdminOpsPage } from '@/features/admin/AdminOpsPage';
import { PrivacyRequestsPage } from '@/features/admin/PrivacyRequestsPage';
import { AdminProtectedRoute } from '@/features/auth/AdminProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'request',
        element: <AppointmentRequestWizard />,
      },
      {
        path: 'my/appointments',
        element: <MyAppointmentsPage />,
      },
      {
        path: 'my/appointments/:id',
        element: <AppointmentTrackingPage />,
      },
      {
        path: 'track',
        element: <MyAppointmentsPage />,
      },
      {
        path: 'track/:id',
        element: <AppointmentTrackingPage />,
      },
      {
        path: 'app/inbox',
        element: <InboxPage />,
      },
      {
        path: 'app/appointments/:id',
        element: <AppointmentDetailPage />,
      },
      {
        path: 'app/find-slot',
        element: <FindSlotPage />,
      },
      {
        path: 'app/calendar',
        element: <CalendarPage />,
      },
      {
        path: 'app/todo',
        element: <TodoPage />,
      },
      {
        path: 'app/reception',
        element: <ReceptionPage />,
      },
      {
        path: 'app/security',
        element: <SecurityPage />,
      },
      {
        path: 'app/today',
        element: <MeetingDayDashboard />,
      },
      {
        path: 'app/control-room',
        element: <ControlRoomPage />,
      },
      {
        path: 'app/notifications',
        element: <NotificationCenter />,
      },
      {
        path: 'notifications',
        element: <NotificationCenter />,
      },
      {
        path: 'app/settings',
        element: <SettingsPage />,
      },
      {
        path: 'app/settings/personal-access',
        element: <PersonalAccessPage />,
      },
      {
        path: 'admin',
        element: (
          <AdminProtectedRoute>
            <HomePage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <AdminProtectedRoute>
            <UsersAdminPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/departments',
        element: <Navigate to="/admin/users" replace />,
      },
      {
        path: 'admin/officials',
        element: (
          <AdminProtectedRoute>
            <OfficialsAdminPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/rooms',
        element: (
          <AdminProtectedRoute>
            <RoomsAdminPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/holidays',
        element: (
          <AdminProtectedRoute>
            <HolidaysAdminPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/reports',
        element: (
          <AdminProtectedRoute>
            <ReportsPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/audit',
        element: (
          <AdminProtectedRoute>
            <AuditViewerPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/ops',
        element: (
          <AdminProtectedRoute>
            <AdminOpsPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: 'admin/privacy-requests',
        element: (
          <AdminProtectedRoute>
            <PrivacyRequestsPage />
          </AdminProtectedRoute>
        ),
      },
      {
        path: '*',
        element: (
          <div className="py-16 text-center">
            <h2 className="text-xl font-semibold text-[var(--text-main)]">Page Not Found</h2>
            <p className="text-sm text-[var(--text-muted)] mt-2">
              The requested page does not exist or you do not have permission to view it.
            </p>
          </div>
        ),
      },
    ],
  },
]);
