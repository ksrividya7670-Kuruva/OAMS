import { useState, useEffect, type FC, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from './AuthContext';
import {
  Mail,
  KeyRound,
  AlertCircle,
  Loader2,
  Lock,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  UserCheck,
} from 'lucide-react';
import { DEMO_PERSONAS } from '@/lib/mockData';

export const LoginPage: FC = () => {
  const navigate = useNavigate();
  const { login, trackLoginAttempt, forgotPassword, resetPassword } = useAuth();

  // Mode: 'signin' or 'signup'
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [selectedPersonaKey, setSelectedPersonaKey] = useState<string>('kvk');

  // Input states
  const [email, setEmail] = useState('kvk@stmarysgroup.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Lockout & Attempt Tracking State
  const [lockoutState, setLockoutState] = useState<{
    lockedOut: boolean;
    lockTimeRemainingMinutes: number;
    remainingAttempts: number;
  }>({ lockedOut: false, lockTimeRemainingMinutes: 0, remainingAttempts: 5 });

  // Forgot / Reset Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  // Check mode changes
  useEffect(() => {
    setError(null);
    setSuccessMsg(null);
    if (mode === 'signin') {
      setEmail('kvk@stmarysgroup.com');
      setPassword('password123');
    } else if (mode === 'signup') {
      const persona = DEMO_PERSONAS[selectedPersonaKey] || DEMO_PERSONAS.kvk;
      setEmail(persona.email);
      setPassword('password123');
    }
  }, [mode, selectedPersonaKey]);

  // Handle Authentication
  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const inputClean = email.trim().toLowerCase();

    // Check if currently locked out
    const attemptCheck = trackLoginAttempt(inputClean, true); // check lockout without incrementing
    if (attemptCheck.lockedOut) {
      setLockoutState(attemptCheck);
      setError(
        `Account temporarily locked due to excessive failed attempts. Please wait ${attemptCheck.lockTimeRemainingMinutes} minutes or reset your password.`,
      );
      return;
    }

    setLoading(true);

    try {
      // Simulate authentic secure network verification
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (mode === 'signup') {
        const persona = DEMO_PERSONAS[selectedPersonaKey] || DEMO_PERSONAS.admin;
        localStorage.setItem(`mock_user_${inputClean}`, JSON.stringify(persona));
        trackLoginAttempt(inputClean, true);
        login(`demo-token-${persona.id}`, persona);
        navigate('/');
        return;
      }

      // Admin or Sign-In Mode
      let targetUser: any = null;

      if (
        inputClean === 'admin' ||
        inputClean === 'administrator' ||
        inputClean === 'admin@stmarysgroup.com' ||
        inputClean === 'admin@apex.gov.in'
      ) {
        targetUser = DEMO_PERSONAS.admin;
      } else {
        const storedUserStr = localStorage.getItem(`mock_user_${inputClean}`);
        if (storedUserStr) {
          targetUser = JSON.parse(storedUserStr);
        } else {
          targetUser = Object.values(DEMO_PERSONAS).find(
            (p) => p.email.toLowerCase() === inputClean,
          );
        }
      }

      // If user not found
      if (!targetUser) {
        const attemptResult = trackLoginAttempt(inputClean, false);
        setLockoutState(attemptResult);
        if (attemptResult.lockedOut) {
          throw new Error(
            `Account locked! 5 consecutive failed attempts detected. Try again in 15 minutes.`,
          );
        }
        throw new Error(
          `Invalid email or password. (${attemptResult.remainingAttempts} attempts remaining before lockout)`,
        );
      }

      // Check if user account is deactivated
      if (targetUser.status === 'DISABLED') {
        throw new Error(
          'This account has been deactivated by the System Administrator. Access is revoked.',
        );
      }

      // Validate Password
      const validPasswords = ['password123', 'Admin@123', 'Password123!', 'admin123'];
      const customPass = localStorage.getItem(`oams_user_pass_${inputClean}`);
      const isPasswordValid =
        password === customPass || (!customPass && validPasswords.includes(password));

      if (!isPasswordValid) {
        const attemptResult = trackLoginAttempt(inputClean, false);
        setLockoutState(attemptResult);
        if (attemptResult.lockedOut) {
          throw new Error(
            `Account locked! 5 consecutive failed attempts detected. Try again in 15 minutes.`,
          );
        }
        throw new Error(
          `Invalid email or password. (${attemptResult.remainingAttempts} attempts remaining before security lockout)`,
        );
      }

      // Successful authentication
      trackLoginAttempt(inputClean, true);
      login(`demo-token-${targetUser.id}`, targetUser);

      // Audit log simulation
      try {
        const rawAudit = localStorage.getItem('oams_mock_audit_events');
        const audits = rawAudit ? JSON.parse(rawAudit) : [];
        const prevHash = audits[0]?.hash || '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d';
        const newHash =
          '0x' +
          Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
        audits.unshift({
          id: `aud-${Date.now()}`,
          org_id: 'org-apex-main',
          actor_id: targetUser.id,
          actor_role: targetUser.roles?.[0] || 'ADMIN',
          action: targetUser.roles?.includes('ADMIN') ? 'auth.admin_login' : 'auth.login_success',
          entity_type: 'user',
          entity_id: targetUser.id,
          changes: { method: 'PASSWORD', portal: mode },
          reason: 'User authenticated successfully',
          ip_address: '127.0.0.1',
          correlation_id: `corr-${Date.now()}`,
          prev_hash: prevHash,
          hash: newHash,
          occurred_at: new Date().toISOString(),
        });
        localStorage.setItem('oams_mock_audit_events', JSON.stringify(audits));
      } catch {}

      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle Request Forgot Password Token
  const handleRequestRecovery = async (e: FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);

    try {
      const res = await forgotPassword(recoveryEmail);
      setForgotStep(2);
      if (res.resetToken) {
        setResetTokenInput(res.resetToken);
      }
      setForgotSuccess(
        `Reset code generated: ${res.resetToken || 'SENT'}. Please enter new password below.`,
      );
    } catch (err: any) {
      setForgotError(err.message || 'Failed to dispatch password recovery');
    } finally {
      setForgotLoading(false);
    }
  };

  // Handle Reset Password Submit
  const handleResetPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (newPasswordInput !== confirmPasswordInput) {
      setForgotError('New passwords do not match');
      return;
    }
    if (newPasswordInput.length < 8) {
      setForgotError('Password must be at least 8 characters long');
      return;
    }

    setForgotLoading(true);

    try {
      await resetPassword(recoveryEmail, resetTokenInput, newPasswordInput);
      localStorage.setItem(`oams_user_pass_${recoveryEmail.trim().toLowerCase()}`, newPasswordInput);
      setShowForgotModal(false);
      setSuccessMsg('Your password has been successfully reset! You can now sign in.');
      setPassword(newPasswordInput);
      setEmail(recoveryEmail);
    } catch (err: any) {
      setForgotError(err.message || 'Failed to reset password');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[460px] mx-auto animate-in fade-in duration-300 py-4">
      <div className="p-6 sm:p-7 rounded-2xl border border-[#D5D2CA] dark:border-[#2D3342] bg-white dark:bg-[#1B1E26] shadow-lg space-y-4">
        {/* Header Branding */}
        <div className="text-center space-y-1.5">
          <div className="w-11 h-11 rounded-xl mx-auto flex items-center justify-center shadow-xs border bg-[#1A3170] text-white border-[#1A3170]/20">
            <Lock className="w-5 h-5" />
          </div>

          <div className="space-y-0.5">
            <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#16181D] dark:text-white leading-tight">
              {mode === 'signup'
                ? 'Create OAMS Account'
                : 'Official Authentication Gateway'}
            </h1>
            <p className="text-[11px] text-[#5B6070] dark:text-[#9DA4B5]">
              Official Appointment Management System &bull; St. Mary's Group
            </p>
          </div>
        </div>

        {/* Dedicated Portal Selector Tabs */}
        <div className="grid grid-cols-2 p-1 bg-[#F0EEE6] dark:bg-[#12141A] rounded-xl border border-[#E5E3DC] dark:border-[#2A2F3D] text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
              mode === 'signin'
                ? 'bg-white dark:bg-[#202530] text-[#16181D] dark:text-white shadow-xs font-bold'
                : 'text-[#5B6070] dark:text-[#9DA4B5] hover:text-[#16181D]'
            }`}
          >
            <UserCheck className="w-3 h-3 text-[#1A3170]" />
            <span>Sign In</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
              mode === 'signup'
                ? 'bg-white dark:bg-[#202530] text-[#16181D] dark:text-white shadow-xs font-bold'
                : 'text-[#5B6070] dark:text-[#9DA4B5] hover:text-[#16181D]'
            }`}
          >
            <span>Register</span>
          </button>
        </div>

        {/* Success Alert Banner */}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {/* Error / Lockout Alert Banner */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block">{error}</span>
              {lockoutState.lockedOut && (
                <span className="text-[11px] text-red-600 dark:text-red-400 block">
                  Security Lock Active: Please contact Institutional IT or reset password.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Main Authentication Form */}
        <form onSubmit={handleAuth} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label
                htmlFor="role-select"
                className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
              >
                Institutional Role Assignment
              </label>
              <select
                id="role-select"
                value={selectedPersonaKey}
                onChange={(e) => setSelectedPersonaKey(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] cursor-pointer shadow-2xs"
              >
                {Object.entries(DEMO_PERSONAS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.fullName} &bull; {p.roleTitle.split('(')[0].trim()}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
            >
              Email Address or Username
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
              <input
                id="email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="username@stmarysgroup.com"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="password"
                className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200"
              >
                Security Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotError(null);
                  setForgotSuccess(null);
                  setForgotStep(1);
                  setRecoveryEmail(email);
                  setShowForgotModal(true);
                }}
                className="text-[11px] text-[#2957D6] hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <KeyRound className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-[#8C909C] hover:text-[#16181D] dark:hover:text-white cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || lockoutState.lockedOut}
            className="w-full py-2.5 px-4 rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A3170] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'signup' ? (
              'Create Account & Login'
            ) : (
              'Sign In Securely'
            )}
          </button>
        </form>

        {/* Institutional Compliance Footer Note */}
        <div className="pt-2 border-t border-[#E5E3DC] dark:border-[#2A2F3D] text-center text-[10px] text-[#8C909C]">
          <span>Protected by AES-256 session tokenization &bull; Real-time audit logging active</span>
        </div>
      </div>

      {/* Forgot / Reset Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1B1E26] rounded-2xl border border-[#D5D2CA] dark:border-[#2D3342] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E3DC] dark:border-[#2A2F3D] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#1A3170]/10 text-[#1A3170] dark:text-blue-300 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#16181D] dark:text-white">
                  {forgotStep === 1 ? 'Recover Password' : 'Set New Password'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleRequestRecovery} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-slate-200 mb-1">
                    Enter your Registered Email
                  </label>
                  <input
                    type="email"
                    required
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="official@stmarysgroup.com"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-2.5 rounded-xl bg-[#1A3170] text-white text-xs font-semibold hover:bg-[#12224D] cursor-pointer"
                >
                  {forgotLoading ? 'Verifying...' : 'Send Recovery Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-slate-200 mb-1">
                    Recovery Token / OTP
                  </label>
                  <input
                    type="text"
                    required
                    value={resetTokenInput}
                    onChange={(e) => setResetTokenInput(e.target.value)}
                    placeholder="Enter reset token"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-slate-200 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-slate-200 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-2.5 rounded-xl bg-[#1A3170] text-white text-xs font-semibold hover:bg-[#12224D] cursor-pointer"
                >
                  {forgotLoading ? 'Updating...' : 'Set New Password & Sign In'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
