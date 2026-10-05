import { useEffect } from 'react';

export type ToastUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  type?: ToastType;
  urgency?: ToastUrgency;
  durationMs?: number;
}

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const { id, title, message, type = 'info', urgency = 'MEDIUM', durationMs = 5000 } = toast;
  const isUrgent = urgency === 'URGENT' || type === 'error';

  useEffect(() => {
    if (durationMs > 0) {
      const timer = setTimeout(() => {
        onDismiss(id);
      }, durationMs);
      return () => clearTimeout(timer);
    }
  }, [id, durationMs, onDismiss]);

  const borderStyles = {
    info: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200',
    success:
      'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200',
    warning: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200',
    error: 'border-red-600 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200',
  }[type];

  return (
    <div
      role="status"
      aria-live={isUrgent ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`flex items-start justify-between gap-3 p-4 rounded-lg border shadow-lg max-w-sm w-full transition-all ${borderStyles}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-sm">{title}</span>
        {message && <p className="text-xs opacity-90">{message}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
        className="text-current opacity-60 hover:opacity-100 p-0.5 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        ✕
      </button>
    </div>
  );
}

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-auto"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
