import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PublicHomePage } from '../src/features/home/PublicHomePage';
import { LoginPage } from '../src/features/auth/LoginPage';
import { MeetingDayDashboard } from '../src/features/meeting-day/MeetingDayDashboard';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleCode } from '@oams/shared';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

describe('Deployment Readiness Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('1. Public Landing Page (PublicHomePage)', () => {
    it('renders authoritative title and primary navigation actions correctly', () => {
      render(
        <MemoryRouter>
          <PublicHomePage />
        </MemoryRouter>
      );

      // Verify institutional title
      const title = screen.getByRole('heading', {
        name: /Official Appointment Management System/i,
        level: 1,
      });
      expect(title).toBeDefined();

      // Verify primary buttons
      const requestLink = screen.getByRole('link', { name: /Request Official Appointment/i });
      expect(requestLink.getAttribute('href')).toBe('/request');

      const signinLink = screen.getByRole('link', { name: /Staff & Official Sign In/i });
      expect(signinLink.getAttribute('href')).toBe('/login');

      const ledgerLink = screen.getByRole('link', { name: /My Applications Ledger/i });
      expect(ledgerLink.getAttribute('href')).toBe('/my/appointments');

      // Verify that "Register Account" is NOT present on the landing page
      expect(screen.queryByText(/Register Account/i)).toBeNull();
    });
  });

  describe('2. Authentication Gateway (LoginPage)', () => {
    it('renders cleanly with Sign In and Register tabs and demo credentials', () => {
      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter>
              <LoginPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Verify page title
      expect(screen.getByText(/Official Authentication Gateway/i)).toBeDefined();

      // Verify tabs (using exact match)
      expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^Register$/i })).toBeDefined();

      // Verify default credentials prefilled
      const emailInput = screen.getByLabelText(/Official Email/i) as HTMLInputElement;
      expect(emailInput).toBeDefined();
      expect(emailInput.value).toBe('kvk@stmarysgroup.com');

      const passwordInput = screen.getByLabelText(/Security Password/i) as HTMLInputElement;
      expect(passwordInput).toBeDefined();
      expect(passwordInput.value).toBe('password123');

      // Verify Submit button
      expect(screen.getByRole('button', { name: /Sign In Securely/i })).toBeDefined();
    });

    it('switches between Sign In and Register tab without errors', async () => {
      const user = userEvent.setup();
      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter>
              <LoginPage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      const registerTab = screen.getByRole('button', { name: /^Register$/i });
      await user.click(registerTab);

      // Verify headline updates to Create OAMS Account
      expect(screen.getByText(/Create OAMS Account/i)).toBeDefined();

      // Verify classification tier dropdown is shown
      expect(screen.getByLabelText(/Classification Tier/i)).toBeDefined();

      // Verify submit button changes to Create Account & Sign In
      expect(screen.getByRole('button', { name: /Create Account & Sign In/i })).toBeDefined();
    });
  });

  describe('3. Meeting Day Dashboard (MeetingDayDashboard)', () => {
    it('renders schedule timeline and daily operations header for official', async () => {
      const mockOfficialUser = {
        id: 'usr-kvk',
        orgId: 'org-apex-main',
        email: 'kvk@stmarysgroup.com',
        fullName: 'Mr. KVK',
        designation: 'Chamber Official',
        roles: [RoleCode.OFFICIAL],
        officialId: 'off-1',
        assignedOfficialIds: ['off-1'],
        status: 'ACTIVE',
      };

      sessionStorage.setItem('oams_user', JSON.stringify(mockOfficialUser));
      sessionStorage.setItem('oams_token', 'demo-token-usr-kvk');

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter>
              <MeetingDayDashboard />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      // Verify header title
      await waitFor(() => {
        expect(screen.getByText(/Today's Meeting Briefing & Operations/i)).toBeDefined();
      });

      // Verify Live Day Screen badge
      expect(screen.getByText(/Live Day Screen/i)).toBeDefined();

      // Verify Refresh button
      expect(screen.getByTitle(/Refresh Day Data/i)).toBeDefined();
    });
  });
});
