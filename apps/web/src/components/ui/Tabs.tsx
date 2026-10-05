import React, { useRef, useId } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  ariaLabel = 'Navigation tabs',
  className = '',
}: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        nextIndex = (index + 1) % tabs.length;
        while (tabs[nextIndex]?.disabled && nextIndex !== index) {
          nextIndex = (nextIndex + 1) % tabs.length;
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        while (tabs[nextIndex]?.disabled && nextIndex !== index) {
          nextIndex = (nextIndex - 1 + tabs.length) % tabs.length;
        }
        break;

      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        while (tabs[nextIndex]?.disabled && nextIndex < tabs.length - 1) {
          nextIndex++;
        }
        break;

      case 'End':
        e.preventDefault();
        nextIndex = tabs.length - 1;
        while (tabs[nextIndex]?.disabled && nextIndex > 0) {
          nextIndex--;
        }
        break;

      default:
        return;
    }

    if (nextIndex >= 0 && nextIndex < tabs.length && !tabs[nextIndex]?.disabled) {
      onChange(tabs[nextIndex].id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isSelected = tab.id === activeTab;
        const tabId = `${baseId}-tab-${tab.id}`;
        const panelId = `${baseId}-panel-${tab.id}`;

        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            role="tab"
            id={tabId}
            aria-selected={isSelected}
            aria-controls={panelId}
            aria-disabled={tab.disabled}
            disabled={tab.disabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => {
              if (!tab.disabled) onChange(tab.id);
            }}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t-md ${
              tab.disabled
                ? 'opacity-40 cursor-not-allowed border-transparent text-slate-400'
                : isSelected
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ id, activeTab, children, className = '' }: TabPanelProps) {
  if (id !== activeTab) return null;

  return (
    <div
      role="tabpanel"
      tabIndex={0}
      className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md py-4 ${className}`}
    >
      {children}
    </div>
  );
}
