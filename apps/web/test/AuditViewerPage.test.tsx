import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditViewerPage } from '../src/features/admin/AuditViewerPage';

describe('AuditViewerPage Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('renders cryptographic audit trail title and verifies records load', async () => {
    render(<AuditViewerPage />);

    expect(screen.getByText(/Cryptographic Audit Trail/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.queryByText(/Loading audit records.../i)).toBeNull();
    });

    // Should display records in the table
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
  });

  it('filters records dynamically when selecting entity type Official', async () => {
    const user = userEvent.setup();
    render(<AuditViewerPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading audit records.../i)).toBeNull();
    });

    // Select "Official" from Entity Type dropdown
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'official');

    await waitFor(() => {
      // All displayed entity cells in the table should say "Official"
      const table = screen.getByRole('table');
      const entityCells = screen.getAllByText(/^official$/i);
      expect(entityCells.length).toBeGreaterThan(0);
      // Appointment should not appear inside table cells
      const cells = table.querySelectorAll('td');
      const hasAppointment = Array.from(cells).some((c) => c.textContent?.toLowerCase() === 'appointment');
      expect(hasAppointment).toBe(false);
    });
  });

  it('allows searching by action and clearing filters', async () => {
    const user = userEvent.setup();
    render(<AuditViewerPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading audit records.../i)).toBeNull();
    });

    // Search for "chamber"
    const actionInput = screen.getByPlaceholderText(/Action \(e\.g\. create, confirm\)/i);
    await user.type(actionInput, 'chamber{enter}');

    await waitFor(() => {
      expect(screen.getByText(/official\.chamber_policy_updated/i)).toBeDefined();
    });

    // Clear filters button should be visible and working
    const clearButton = screen.getByRole('button', { name: /Clear Filters/i });
    await user.click(clearButton);

    await waitFor(() => {
      // Other events like auth.admin_login should be back
      expect(screen.getByText(/auth\.admin_login/i)).toBeDefined();
    });
  });

  it('verifies hash chain integrity upon clicking button', async () => {
    const user = userEvent.setup();
    render(<AuditViewerPage />);

    await waitFor(() => {
      expect(screen.getByText(/Cryptographic Chain Integrity Verified/i)).toBeDefined();
    });

    const verifyButton = screen.getByRole('button', { name: /Verify Hash Chain/i });
    await user.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText(/Records Verified/i)).toBeDefined();
    });
  });
});
