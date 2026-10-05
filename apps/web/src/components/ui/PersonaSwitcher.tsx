import { useState, useRef, useEffect, type FC } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthContext';
import { DEMO_PERSONAS, type DemoUser } from '@/lib/mockData';
import { ChevronDown, Check, UserCheck, Sparkles, LogOut } from 'lucide-react';

export const PersonaSwitcher: FC = () => {
  const queryClient = useQueryClient();
  const { user, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectPersona = (persona: DemoUser) => {
    login(`demo-token-${persona.id}`, persona);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task-summary'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-bell'] });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
    }
    setOpen(false);
  };

  const currentPersona = Object.values(DEMO_PERSONAS).find(
    (p) => p.email.toLowerCase() === user?.email.toLowerCase() || p.id === user?.id,
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 hover:bg-[var(--brand-primary)]/10 text-xs font-semibold text-[var(--brand-primary)] transition-all cursor-pointer shadow-xs"
        title="Switch Demo Role & Permissions"
      >
        <Sparkles className="w-3.5 h-3.5 animate-pulse text-[var(--brand-primary)]" />
        <span className="hidden sm:inline">
          {currentPersona ? currentPersona.fullName : 'Switch Persona'}
        </span>
        <span className="sm:hidden">Role</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl z-50 p-2 text-xs space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-2 py-1.5 border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="font-bold text-[var(--text-main)] flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              Switch Demo Persona
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
              Live Mock Active
            </span>
          </div>

          <div className="space-y-0.5 pt-1">
            {Object.values(DEMO_PERSONAS).map((p) => {
              const isSelected = user?.email.toLowerCase() === p.email.toLowerCase() || user?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPersona(p)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'hover:bg-[var(--bg-subtle)] text-[var(--text-main)]'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className={`w-6 h-6 rounded-md font-bold text-[10px] flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
                    }`}>
                      {p.avatarIcon}
                    </span>
                    <div className="truncate">
                      <div className="font-semibold truncate">{p.fullName}</div>
                      <div
                        className={`text-[10px] truncate ${
                          isSelected ? 'text-white/80' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {p.roleTitle}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 shrink-0 ml-1 text-white" />}
                </button>
              );
            })}
          </div>

          {user && (
            <div className="pt-1.5 border-t border-[var(--border-default)]">
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  queryClient.invalidateQueries();
                  setOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out (Return to Guest View)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
