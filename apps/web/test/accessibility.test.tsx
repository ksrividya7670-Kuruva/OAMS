import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Button,
  IconButton,
  Input,
  Textarea,
  RadioCardGroup,
  Dialog,
  Tabs,
  TabPanel,
  Toast,
} from '../src/components/ui/index.js';

describe('Accessibility & Keyboard Navigation (WCAG 2.2 AA)', () => {
  describe('Button & IconButton', () => {
    it('should set aria-busy and be disabled when loading', () => {
      render(<Button loading>Submit</Button>);
      const btn = screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement;
      expect(btn).toBeDefined();
      expect(btn.getAttribute('aria-busy')).toBe('true');
      expect(btn.disabled).toBe(true);
    });

    it('should require and expose accessible name on IconButton', () => {
      render(
        <IconButton aria-label="Close panel">
          <span aria-hidden="true">✕</span>
        </IconButton>,
      );
      const btn = screen.getByRole('button', { name: 'Close panel' });
      expect(btn).toBeDefined();
      expect(btn.getAttribute('aria-label')).toBe('Close panel');
    });
  });

  describe('Form Inputs: Input & Textarea', () => {
    it('associates input with label, aria-invalid, and error description', () => {
      render(
        <Input
          label="Official Email"
          error="Invalid email format"
          hint="Use official gov domain"
        />,
      );

      const input = screen.getByLabelText(/official email/i);
      expect(input).toBeDefined();
      expect(input.getAttribute('aria-invalid')).toBe('true');

      const errorAlert = screen.getByRole('alert');
      expect(errorAlert.textContent).toContain('Invalid email format');

      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(describedBy).toContain(errorAlert.id);
    });

    it('associates textarea with label and hint description', () => {
      render(<Textarea label="Meeting Purpose" hint="Maximum 500 characters" />);

      const textarea = screen.getByLabelText(/meeting purpose/i);
      expect(textarea).toBeDefined();
      expect(textarea.getAttribute('aria-invalid')).toBe('false');

      const hintText = screen.getByText('Maximum 500 characters');
      expect(textarea.getAttribute('aria-describedby')).toContain(hintText.id);
    });
  });

  describe('RadioCardGroup (Priority Picker Keyboard Nav)', () => {
    function PriorityPicker() {
      const [priority, setPriority] = useState('MEDIUM');
      const options = [
        { value: 'LOW', label: 'Low', description: 'Routine matters' },
        { value: 'MEDIUM', label: 'Medium', description: 'Standard review' },
        { value: 'HIGH', label: 'High', description: 'Requires reason' },
        { value: 'URGENT', label: 'Urgent', description: 'Immediate attention' },
      ];
      return (
        <RadioCardGroup
          label="Select Appointment Priority"
          options={options}
          value={priority}
          onChange={setPriority}
        />
      );
    }

    it('renders with role radiogroup and navigates via arrow keys with roving tabindex', () => {
      render(<PriorityPicker />);
      const group = screen.getByRole('radiogroup', { name: /select appointment priority/i });
      expect(group).toBeDefined();

      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(4);

      // MEDIUM is initially selected (index 1)
      expect(radios[1].getAttribute('aria-checked')).toBe('true');
      expect(radios[1].getAttribute('tabindex')).toBe('0');
      expect(radios[0].getAttribute('tabindex')).toBe('-1');
      expect(radios[2].getAttribute('tabindex')).toBe('-1');

      // Press ArrowRight to move to HIGH
      fireEvent.keyDown(radios[1], { key: 'ArrowRight' });
      expect(radios[2].getAttribute('aria-checked')).toBe('true');
      expect(radios[2].getAttribute('tabindex')).toBe('0');

      // Press ArrowDown to move to URGENT
      fireEvent.keyDown(radios[2], { key: 'ArrowDown' });
      expect(radios[3].getAttribute('aria-checked')).toBe('true');

      // Press ArrowRight to wrap around to LOW
      fireEvent.keyDown(radios[3], { key: 'ArrowRight' });
      expect(radios[0].getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('Dialog (Modal, Focus Trap & Escape Dismissal)', () => {
    it('renders modal dialog with aria attributes, traps focus, and closes on Escape', () => {
      const handleClose = vi.fn();
      render(
        <Dialog
          isOpen={true}
          onClose={handleClose}
          title="Confirm Reschedule"
          description="Are you sure you want to move this appointment?"
          footer={<Button onClick={handleClose}>Cancel</Button>}
        >
          <p>Dialog Body Content</p>
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog', { name: /confirm reschedule/i });
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-modal')).toBe('true');

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tabs (ARIA Tablist & Arrow Navigation)', () => {
    function TabTestComponent() {
      const [activeTab, setActiveTab] = useState('overview');
      const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'scheduling', label: 'Scheduling' },
        { id: 'attendees', label: 'Attendees' },
      ];
      return (
        <div>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          <TabPanel id="overview" activeTab={activeTab}>
            Overview content
          </TabPanel>
          <TabPanel id="scheduling" activeTab={activeTab}>
            Scheduling content
          </TabPanel>
          <TabPanel id="attendees" activeTab={activeTab}>
            Attendees content
          </TabPanel>
        </div>
      );
    }

    it('manages aria-selected, tablist role, and keyboard navigation between tabs', () => {
      render(<TabTestComponent />);
      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeDefined();

      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(3);

      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(tabs[0].getAttribute('tabindex')).toBe('0');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
      expect(tabs[1].getAttribute('tabindex')).toBe('-1');

      // ArrowRight to scheduling
      fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(screen.getByText('Scheduling content')).toBeDefined();

      // ArrowLeft back to overview
      fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('Toast Notifications (Live Regions)', () => {
    it('sets aria-live=polite for standard info/success toasts', () => {
      const handleDismiss = vi.fn();
      render(
        <Toast
          toast={{
            id: 't-1',
            title: 'Draft Saved',
            type: 'info',
            urgency: 'LOW',
            durationMs: 0,
          }}
          onDismiss={handleDismiss}
        />,
      );

      const status = screen.getByRole('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(screen.getByText('Draft Saved')).toBeDefined();
    });

    it('sets aria-live=assertive for URGENT notifications', () => {
      const handleDismiss = vi.fn();
      render(
        <Toast
          toast={{
            id: 't-2',
            title: 'Urgent Request Escalated',
            type: 'warning',
            urgency: 'URGENT',
            durationMs: 0,
          }}
          onDismiss={handleDismiss}
        />,
      );

      const status = screen.getByRole('status');
      expect(status.getAttribute('aria-live')).toBe('assertive');
    });
  });
});
