import { type FC, type ReactNode } from 'react';
import { Navigate, useLocation, Link } from 'react-router';
import { useAuth } from './AuthContext';
import { ShieldAlert, ArrowLeft, Lock, KeyRound, Loader2 } from 'lucide-react';

interface AdminProtectedRouteProps {
  children?: ReactNode;
}

export const AdminProtectedRoute: FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, isLoading, isAdmin, logout } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#1A3170]" />
        <span className="text-xs font-semibold text-[#5B6070] tracking-wider uppercase">
          Verifying Administrative Credentials &bull; OAMS Security
        </span>
      </div>
    );
  }

  // Not signed in -> send to login
  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Signed in, but NOT an Administrator (e.g. Faculty or Staff) -> Render Unauthorized Access Screen
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 animate-in fade-in duration-200">
        <div className="p-8 rounded-2xl border-2 border-red-200 dark:border-red-900/60 bg-white dark:bg-[#1B1E26] shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 mx-auto flex items-center justify-center border border-red-300 dark:border-red-800 shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
              <Lock className="w-3 h-3" />
              <span>Security Exception &bull; HTTP 403 Forbidden</span>
            </div>
            <h1 className="text-2xl font-bold font-serif text-[#16181D] dark:text-white">
              Administrative Access Restricted
            </h1>
            <p className="text-xs sm:text-sm text-[#5B6070] dark:text-[#9DA4B5] max-w-lg mx-auto leading-relaxed">
              The requested administrative console requires elevated <strong className="text-[#16181D] dark:text-white">ADMIN</strong> credentials. Non-administrative users (Faculty and Support Staff) are strictly unauthorized from accessing this section.
            </p>
          </div>

          {/* Current Identity Verification Card */}
          <div className="p-4 rounded-xl bg-[#FAF9F6] dark:bg-[#12141A] border border-[#E5E3DC] dark:border-[#2A2F3D] text-left text-xs space-y-1.5 font-mono">
            <div className="text-[10px] font-bold text-[#8C909C] uppercase tracking-wider">
              Current Session Identity:
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[#16181D] dark:text-white">
              <span><strong>Name:</strong> {user.fullName}</span>
              <span><strong>Email:</strong> {user.email}</span>
            </div>
            <div className="text-[#5B6070] dark:text-[#9DA4B5]">
              <strong>Assigned Roles:</strong> {user.roles.join(', ') || 'Standard User'}
            </div>
            <div className="text-[11px] text-amber-700 dark:text-amber-400 pt-1 border-t border-[#E5E3DC] dark:border-[#2A2F3D]">
              &bull; Attempted URL: <span className="underline">{location.pathname}</span> &bull; Incident logged to Security Audit.
            </div>
          </div>

          {/* Recovery Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              to="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white text-xs font-semibold shadow-xs transition active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to My Designated Dashboard</span>
            </Link>

            <button
              type="button"
              onClick={async () => {
                await logout();
                window.location.href = '/login?portal=admin';
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-white hover:bg-[#FAF9F6] text-xs font-semibold shadow-2xs transition active:scale-[0.98] cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-[#1A3170]" />
              <span>Sign In as Administrator</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
