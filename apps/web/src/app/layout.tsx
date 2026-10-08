import { useState, useEffect, useMemo, type FC, type ReactNode } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

import { GlobalSearchModal } from '@/components/search/GlobalSearchModal';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { useAuth } from '@/features/auth/AuthContext';
import { RoleCode } from '@oams/shared';
import {
  ArrowLeft,
  Calendar,
  Settings,
  LogIn,
  LogOut,
  LayoutGrid,
  CheckSquare,
  DoorOpen,
  Clock,
  Search,
  Menu,
  X,
  Inbox,
  Home,
  PlusCircle,
  Users,
  Shield,
  ShieldCheck,
} from 'lucide-react';

export const Layout: FC = () => {
  const { user, logout, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleBack = () => {
    // If the browser session has an active history entry, pop backwards
    if (window.history.length > 1 && window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      // Smart hierarchical fallback based on active location
      const path = location.pathname;
      if (path.startsWith('/app/appointments/')) {
        navigate('/app/inbox');
      } else if (path.startsWith('/track/')) {
        navigate('/track');
      } else if (path.startsWith('/my/appointments/')) {
        navigate('/my/appointments');
      } else if (path.startsWith('/app/settings/')) {
        navigate('/app/settings');
      } else if (path.startsWith('/admin/')) {
        navigate('/app/control-room');
      } else if (path !== '/' && path !== '/app/today') {
        navigate('/');
      } else {
        navigate(-1);
      }
    }
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') {
      if (!user) return 'Home';
      if (
        hasRole(RoleCode.ADMIN) ||
        hasRole(RoleCode.SUPER_ADMIN) ||
        hasRole(RoleCode.APPOINTMENT_ADMIN)
      ) {
        return 'Admin Operations Dashboard';
      }
      if (user.officialId || hasRole(RoleCode.OFFICIAL)) return 'Official Chamber Dashboard';
      if (hasRole(RoleCode.PA) || hasRole(RoleCode.EA)) return 'Secretariat Operations';
      if (hasRole(RoleCode.RECEPTION)) return 'Reception Operations';
      if (hasRole(RoleCode.SECURITY)) return 'Security Gate Control';
      return 'Institutional Operations Portal';
    }
    if (path === '/app/today') return 'Today';
    if (path.startsWith('/request')) return 'New appointment request';
    if (path.startsWith('/app/calendar')) return 'Calendar';
    if (path.startsWith('/app/todo')) return 'To-Do';
    if (path.startsWith('/app/inbox')) return 'Inbox';
    if (path.startsWith('/app/appointments/')) return 'Appointment Details';
    if (path.startsWith('/app/find-slot')) return 'Find Slot';
    if (path.startsWith('/app/reception')) return 'Reception';
    if (path.startsWith('/app/security')) return 'Security Check-In';
    if (path.startsWith('/app/control-room')) return 'Control Room';
    if (path.startsWith('/track/')) return 'Appointment Tracking';
    if (path.startsWith('/track')) return 'Track Appointment';
    if (path.startsWith('/my/appointments/')) return 'Appointment Tracking';
    if (path.startsWith('/my/appointments')) return 'My Appointments';
    if (path.startsWith('/app/notifications') || path.startsWith('/notifications')) return 'Notifications';
    if (path.startsWith('/app/settings')) return 'Settings';
    if (path.startsWith('/admin/users')) return 'Users & Roles Management';
    if (path.startsWith('/admin/officials')) return 'Faculty Chambers';
    if (path.startsWith('/admin/reports')) return 'Executive Reports & Analytics';
    if (path.startsWith('/admin/audit')) return 'Security Audit Trail';
    if (path.startsWith('/admin/ops')) return 'System Operations';
    if (path.startsWith('/admin')) return 'Administration Console';
    if (path.startsWith('/login')) return 'Sign In';
    return 'OAMS';
  };

  const isAdminUser = Boolean(
    user &&
      (user.roles?.includes(RoleCode.ADMIN) ||
        user.roles?.includes(RoleCode.SUPER_ADMIN) ||
        user.roles?.includes(RoleCode.APPOINTMENT_ADMIN) ||
        hasRole(RoleCode.ADMIN) ||
        hasRole(RoleCode.SUPER_ADMIN) ||
        hasRole(RoleCode.APPOINTMENT_ADMIN)),
  );

  // Primary sidebar navigation items
  const primaryNavItems: NavItem[] = useMemo(() => {
    // Before sign-in: Only keep Home, Request Meeting, Track Appointment
    if (!user) {
      return [
        {
          to: '/',
          label: 'Home',
          icon: <Home className="w-[18px] h-[18px] shrink-0" />,
        },
        {
          to: '/request',
          label: 'Request Meeting',
          icon: <PlusCircle className="w-[18px] h-[18px] shrink-0" />,
        },
        {
          to: '/track',
          label: 'Track Appointment',
          icon: <Clock className="w-[18px] h-[18px] shrink-0" />,
        },
      ];
    }

    // Admin users: Dedicated governance suite (no appointment operational/reception queue items)
    if (isAdminUser) {
      return [
        {
          to: '/',
          label: 'Dashboard',
          icon: <Home className="w-[18px] h-[18px] shrink-0" />,
        },
        {
          to: '/admin/users',
          label: 'Users & Roles',
          icon: <Users className="w-[18px] h-[18px] shrink-0" />,
        },
        {
          to: '/admin/officials',
          label: 'Faculty Chambers',
          icon: <Shield className="w-[18px] h-[18px] shrink-0" />,
        },
        {
          to: '/admin/reports',
          label: 'Executive Reports',
          icon: <LayoutGrid className="w-[18px] h-[18px] shrink-0" />,
        },
        {
          to: '/admin/audit',
          label: 'Audit Logs',
          icon: <ShieldCheck className="w-[18px] h-[18px] shrink-0" />,
        },
      ];
    }

    // After sign-in: Uniform suite across all non-admin operational roles
    return [
      {
        to: '/',
        label: 'Dashboard',
        icon: <Home className="w-[18px] h-[18px] shrink-0" />,
      },
      {
        to: '/app/today',
        label: "Today's Schedule",
        icon: <Clock className="w-[18px] h-[18px] shrink-0" />,
      },
      {
        to: '/app/inbox',
        label: 'Triage Inbox',
        icon: <Inbox className="w-[18px] h-[18px] shrink-0" />,
      },
      {
        to: '/app/calendar',
        label: 'Master Calendar',
        icon: <Calendar className="w-[18px] h-[18px] shrink-0" />,
      },
      {
        to: '/app/todo',
        label: 'Tasks & Follow-ups',
        icon: <CheckSquare className="w-[18px] h-[18px] shrink-0" />,
      },
      {
        to: '/app/reception',
        label: 'Reception Desk',
        icon: <DoorOpen className="w-[18px] h-[18px] shrink-0" />,
      },
    ];
  }, [user, isAdminUser]);

  // Secondary items: Displayed below divider for authenticated roles (hidden before sign in)
  const secondaryNavItems: NavItem[] = useMemo(() => {
    if (!user) return [];

    // Admin users: Don't show My Appointments
    if (isAdminUser) {
      return [];
    }

    const items: NavItem[] = [
      {
        to: '/my/appointments',
        label: 'My Appointments',
        icon: <Clock className="w-[18px] h-[18px] shrink-0" />,
      },
    ];

    return items;
  }, [user, isAdminUser]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  const userInitials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : '';

  const userRoleDisplay = useMemo(() => {
    if (!user) return '';
    if (
      hasRole(RoleCode.ADMIN) ||
      hasRole(RoleCode.SUPER_ADMIN) ||
      hasRole(RoleCode.APPOINTMENT_ADMIN)
    ) {
      return `${user.fullName} · Administrator`;
    }
    if (user.officialId || hasRole(RoleCode.OFFICIAL) || hasRole(RoleCode.FACULTY)) {
      return `${user.fullName} · Faculty / Official`;
    }
    if (hasRole(RoleCode.STAFF)) {
      return `${user.fullName} · Staff`;
    }
    if (hasRole(RoleCode.PA) || hasRole(RoleCode.EA)) {
      return `${user.fullName} · Secretariat`;
    }
    if (hasRole(RoleCode.RECEPTION)) {
      return `${user.fullName} · Reception Desk`;
    }
    if (hasRole(RoleCode.SECURITY)) {
      return `${user.fullName} · Security Desk`;
    }
    return `${user.fullName} · Staff`;
  }, [user, hasRole]);

  return (
    <div className="min-h-screen flex bg-[#F7F6F2] text-[#16181D]">
      {/* 220px Deep Navy Left Sidebar (§Layout & Structure from Design Template) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[220px] bg-[#1A3170] flex flex-col justify-between p-[20px_14px] transition-transform duration-200 md:static md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col gap-1">
          {/* Brand Logo */}
          <div className="flex items-center justify-between pb-5 pt-1 px-3">
            <Link
              to="/"
              className="text-[22px] font-serif font-semibold text-white tracking-wide hover:opacity-90 no-underline"
            >
              OAMS
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden text-[#C5D0EE] hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Navigation Links */}
          <nav aria-label="Main" className="flex flex-col gap-1">
            {primaryNavItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors no-underline font-medium ${
                    active
                      ? 'bg-[#2D4C9E] text-white font-semibold'
                      : 'text-[#C5D0EE] hover:text-white hover:bg-[#2D4C9E]/40'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {secondaryNavItems.length > 0 && (
              <div className="my-2 border-t border-white/10" />
            )}

            {/* Secondary Navigation Links */}
            {secondaryNavItems.map((item) => {
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors no-underline font-medium ${
                    active
                      ? 'bg-[#2D4C9E] text-white font-semibold'
                      : 'text-[#C5D0EE] hover:text-white hover:bg-[#2D4C9E]/40'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}


          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
          {user && (
            <Link
              to="/app/settings"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-[#C5D0EE] hover:text-white hover:bg-[#2D4C9E]/40 transition-colors no-underline font-medium"
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Settings</span>
            </Link>
          )}

          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-rose-300 hover:text-white hover:bg-rose-900/40 transition-colors font-medium cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs bg-[#2957D6] text-white hover:bg-[#1E4FC2] transition-colors font-semibold no-underline"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </aside>

      {/* Backdrop for mobile */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Application Container */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top 64px Header Bar matching design template */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-4 sm:px-7 bg-white border-b border-[#E4E2DC] z-30">
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg border border-[#E4E2DC] text-[#16181D] hover:bg-[#F7F6F2] cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Back Button (hidden on home page) */}
            {location.pathname !== '/' && (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  title="Go back to previous page"
                  aria-label="Go back to previous page"
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#E4E2DC] bg-[#FAF9F5] hover:bg-[#F0EEE6] active:bg-[#EAE7DC] dark:bg-[var(--bg-subtle)] dark:border-[var(--border-default)] dark:hover:bg-[var(--bg-pill)] text-[#16181D] dark:text-[var(--text-main)] text-xs font-semibold transition-all cursor-pointer shadow-2xs group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2957D6]"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#5B6070] dark:text-[var(--text-muted)] group-hover:text-[#16181D] dark:group-hover:text-[var(--text-main)] transition-transform group-hover:-translate-x-0.5" />
                  <span>Back</span>
                </button>

                <span className="h-4 w-[1px] bg-[#E4E2DC] dark:bg-[var(--border-default)] hidden sm:inline-block" aria-hidden="true" />
              </>
            )}

            <h1 className="m-0 font-serif text-xl sm:text-2xl font-semibold text-[#16181D] dark:text-[var(--text-main)] tracking-tight">
              {getPageTitle()}
            </h1>
          </div>

          {/* Right Header Controls: Persona Switcher + Quick Search + Notification Bell + User Pill */}
          <div className="flex items-center gap-2 sm:gap-3.5">
            {/* Quick Search */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Search (Ctrl+K)"
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E4E2DC] bg-[#F7F6F2] text-[#5B6070] hover:text-[#16181D] text-xs cursor-pointer transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
              <kbd className="font-mono text-[10px] px-1 py-0.5 bg-white border border-[#E4E2DC] rounded ml-1 text-[#5B6070]">
                ⌘K
              </kbd>
            </button>

            {/* Notification Bell */}
            {user && <NotificationBell />}

            {user && (
              <div className="flex items-center gap-2 pl-1 sm:pl-2">
                <span className="w-8 h-8 rounded-full bg-[#2957D6] text-white flex items-center justify-center font-semibold text-xs shrink-0 shadow-2xs">
                  {userInitials}
                </span>
                <span className="hidden sm:inline-block text-xs text-[#16181D] font-medium max-w-[160px] truncate">
                  {userRoleDisplay}
                </span>
              </div>
            )}

          </div>
        </header>

        {/* Dynamic Page Content Canvas */}
        <main
          className={`flex-1 bg-[#F7F6F2] flex flex-col min-h-0 ${
            location.pathname === '/login'
              ? 'p-3 items-center justify-center overflow-hidden'
              : 'p-4 sm:p-7 overflow-y-auto gap-5'
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
};
