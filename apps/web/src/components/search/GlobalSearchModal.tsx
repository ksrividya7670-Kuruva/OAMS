import { useState, useEffect, FC } from 'react';
import { useNavigate } from 'react-router';
import {
  Search,
  Calendar,
  User,
  CheckSquare,
  DoorOpen,
  X,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthContext';
import { RoleCode } from '@oams/shared';

interface SearchResultItem {
  id: string;
  type: 'appointment' | 'official' | 'task' | 'visit';
  title: string;
  subtitle?: string;
  status?: string;
  metadata?: Record<string, any>;
  url?: string;
}

interface SearchResponse {
  query: string;
  total: number;
  results: SearchResultItem[];
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const qp = new URLSearchParams();
        qp.set('q', query.trim());
        if (activeType !== 'all') {
          qp.set('types', activeType);
        }
        const data = await api.get<SearchResponse>(`/api/v1/search?${qp.toString()}`);
        setResults(data.results || []);
      } catch (err) {
        console.error('Search error', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, activeType]);

  if (!isOpen) return null;

  const handleSelect = (item: SearchResultItem) => {
    onClose();
    if (item.type === 'appointment') {
      const isStaffOrOfficial = Boolean(
        user?.officialId ||
        hasRole(RoleCode.OFFICIAL) ||
        hasRole(RoleCode.PA) ||
        hasRole(RoleCode.EA) ||
        hasRole(RoleCode.SUPER_ADMIN),
      );
      if (isStaffOrOfficial) {
        navigate(`/app/appointments/${item.id}`);
      } else {
        const isTrackRoute = window.location.pathname.startsWith('/track') || !user;
        navigate(isTrackRoute ? `/track/${item.id}` : `/my/appointments/${item.id}`);
      }
    } else if (item.type === 'task') {
      navigate('/app/todo');
    } else if (item.type === 'visit') {
      navigate('/app/reception');
    } else if (item.type === 'official') {
      navigate('/app/calendar');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'appointment':
        return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'official':
        return <User className="w-4 h-4 text-purple-500" />;
      case 'task':
        return <CheckSquare className="w-4 h-4 text-amber-500" />;
      case 'visit':
        return <DoorOpen className="w-4 h-4 text-emerald-500" />;
      default:
        return <Search className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        {/* Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--border-default)] gap-3 bg-[var(--bg-surface)]">
          <Search className="w-5 h-5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search appointments, officials, tasks, visitors..."
            className="flex-1 bg-transparent text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
            autoFocus
          />
          {loading && <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-primary)]" />}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--border-default)] bg-[var(--bg-subtle)]/50 text-xs">
          {['all', 'appointment', 'official', 'task', 'visit'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveType(t)}
              className={`px-2.5 py-1 rounded-md font-medium capitalize cursor-pointer transition-colors ${
                activeType === t
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {t === 'all' ? 'All Results' : `${t}s`}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border-default)]">
          {query.trim().length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              Type to search across appointments, officials, tasks, and visits...
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              No matching records found for "{query}".
            </div>
          ) : (
            results.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                onClick={() => handleSelect(item)}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] shrink-0">
                    {getIcon(item.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[var(--text-main)] truncate">
                        {item.title}
                      </span>
                      {item.status && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                          {item.status}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 ml-2" />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border-default)] bg-[var(--bg-subtle)]/30 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>Role-based privacy boundaries enforced (§17.4)</span>
          <span>Press ESC to close</span>
        </div>
      </div>
    </div>
  );
};
