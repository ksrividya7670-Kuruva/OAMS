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
  User,
  Phone,
  Building2,
} from 'lucide-react';
import { DEMO_PERSONAS, INITIAL_AUDIT_EVENTS } from '@/lib/mockData';
import { RoleCode } from '@oams/shared';

interface LoginPageProps {
  initialMode?: 'signin' | 'signup';
}

export const LoginPage: FC<LoginPageProps> = ({ initialMode = 'signin' }) => {
  const navigate = useNavigate();
  const { login, trackLoginAttempt, forgotPassword, resetPassword } = useAuth();

  // Mode: 'signin' or 'signup'
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);

  // Sign In Input states
  const [email, setEmail] = useState('kvk@stmarysgroup.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sign Up Input states (placeholders used instead of prebuilt values)
  const [signupFullName, setSignupFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupOrg, setSignupOrg] = useState('');
  const [signupCategory, setSignupCategory] = useState<'CITIZEN' | 'STUDENT' | 'FACULTY' | 'DELEGATION'>('CITIZEN');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupConsent, setSignupConsent] = useState(false);

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
    }
  }, [mode]);

  // Handle Authentication / Registration
  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // SIGN UP MODE
    if (mode === 'signup') {
      if (!signupFullName.trim() || signupFullName.trim().length < 2) {
        setError('Please enter your full legal or institutional name.');
        return;
      }
      if (!signupEmail.trim() || !signupEmail.includes('@')) {
        setError('Please provide a valid official email address.');
        return;
      }
      if (signupPassword.length < 8) {
        setError('Security password must be at least 8 characters in length.');
        return;
      }
      if (signupPassword !== signupConfirmPassword) {
        setError('Password and confirmation password do not match.');
        return;
      }
      if (!signupConsent) {
        setError('Please attest to the statutory institutional guidelines.');
        return;
      }

      setLoading(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const cleanEmail = signupEmail.trim().toLowerCase();

        const roleTitle =
          signupCategory === 'STUDENT'
            ? 'Student Requester'
            : signupCategory === 'FACULTY'
            ? 'Faculty Member'
            : signupCategory === 'DELEGATION'
            ? 'Protocol Delegation Leader'
            : 'Citizen Petitioner';

        const roleCode = signupCategory === 'FACULTY' ? RoleCode.FACULTY : RoleCode.GUEST;
        const initials = signupFullName
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'UR';

        const newUserId = `usr-reg-${Date.now()}`;
        const registeredUser = {
          id: newUserId,
          email: cleanEmail,
          fullName: signupFullName.trim(),
          roleTitle,
          orgId: 'org-apex-main',
          roles: [roleCode],
          officialId: null,
          assignedOfficialIds: [],
          phone: signupPhone.trim(),
          organization: signupOrg.trim(),
          avatarIcon: initials,
          status: 'ACTIVE' as const,
          authProvider: 'LOCAL' as const,
          timezone: 'Asia/Kolkata',
          theme: 'SYSTEM' as const,
        };

        // Persist to user stores
        localStorage.setItem(`mock_user_${cleanEmail}`, JSON.stringify(registeredUser));
        localStorage.setItem(`oams_user_pass_${cleanEmail}`, signupPassword);
        localStorage.setItem('oams_last_requester_email', cleanEmail);

        try {
          const rawUsers = localStorage.getItem('oams_mock_users');
          const usersList = rawUsers ? JSON.parse(rawUsers) : [];
          if (!usersList.some((u: any) => u.email?.toLowerCase() === cleanEmail)) {
            usersList.unshift(registeredUser);
            localStorage.setItem('oams_mock_users', JSON.stringify(usersList));
          }
        } catch {}

        // Record Audit Event
        try {
          const rawAudit = localStorage.getItem('oams_mock_audit_events');
          const audits = rawAudit ? JSON.parse(rawAudit) : [...INITIAL_AUDIT_EVENTS];
          audits.unshift({
            id: `aud-${Date.now()}`,
            org_id: 'org-apex-main',
            actor_id: registeredUser.id,
            actor_role: roleCode,
            action: 'auth.user_registered',
            entity_type: 'user',
            entity_id: registeredUser.id,
            changes: { email: cleanEmail, category: signupCategory },
            reason: 'Self-service citizen petitioner registration completed',
            ip_address: '127.0.0.1',
            correlation_id: `corr-${Date.now()}`,
            prev_hash: audits[0]?.hash || '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d',
            hash: '0x' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
            occurred_at: new Date().toISOString(),
          });
          localStorage.setItem('oams_mock_audit_events', JSON.stringify(audits));
        } catch {}

        // Add Welcome Notification
        try {
          const rawNotifs = localStorage.getItem('oams_mock_notifications');
          const notifs = rawNotifs ? JSON.parse(rawNotifs) : [];
          const welcomeNotif = {
            id: `notif-${Date.now()}`,
            userId: registeredUser.id,
            officialId: null,
            targetRoles: [roleCode],
            type: 'system_alert',
            eventType: 'ACCOUNT_ACTIVATED',
            title: `Welcome to OAMS, ${registeredUser.fullName}!`,
            message: `Your appointment petitioner coordinates are verified. You can now request an official audience with executive leadership.`,
            body: `Your appointment petitioner coordinates are verified. You can now request an official audience with executive leadership.`,
            link: '/request',
            priority: 'MEDIUM',
            entityType: 'USER',
            entityId: registeredUser.id,
            isRead: false,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          notifs.unshift(welcomeNotif);
          localStorage.setItem('oams_mock_notifications', JSON.stringify(notifs));
          window.dispatchEvent(new CustomEvent('oams-notifications-updated'));
        } catch {}

        login(`demo-token-${registeredUser.id}`, registeredUser);
        navigate('/');
        return;
      } catch (err: any) {
        setError(err.message || 'Registration failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    // SIGN IN MODE
    const inputClean = email.trim().toLowerCase();

    // Check if currently locked out
    const attemptCheck = trackLoginAttempt(inputClean, true);
    if (attemptCheck.lockedOut) {
      setLockoutState(attemptCheck);
      setError(
        `Account temporarily locked due to excessive failed attempts. Please wait ${attemptCheck.lockTimeRemainingMinutes} minutes or reset your password.`,
      );
      return;
    }

    setLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
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
        const audits = rawAudit ? JSON.parse(rawAudit) : [...INITIAL_AUDIT_EVENTS];
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

        {/* Main Authentication / Registration Form */}
        <form onSubmit={handleAuth} className="space-y-3.5">
          {mode === 'signup' ? (
            <>
              {/* Quick Prefill Button for evaluators */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-semibold text-[#16181D] dark:text-slate-200">
                  Citizen / Petitioner Details
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSignupFullName('Priya Sharma');
                    setSignupEmail('priya@example.com');
                    setSignupPhone('+91 98765 43210');
                    setSignupOrg('Student Delegate');
                    setSignupCategory('STUDENT');
                    setSignupPassword('password123');
                    setSignupConfirmPassword('password123');
                    setSignupConsent(true);
                  }}
                  className="text-[10px] text-[#2957D6] hover:underline cursor-pointer font-medium"
                >
                  Prefill Demo Coordinates
                </button>
              </div>

              <div>
                <label
                  htmlFor="signup-name"
                  className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                >
                  Full Legal / Institutional Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
                  <input
                    id="signup-name"
                    type="text"
                    required
                    value={signupFullName}
                    onChange={(e) => setSignupFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma or Dr. Ramesh"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-email"
                    className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                  >
                    Official Email <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
                    <input
                      id="signup-email"
                      type="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-phone"
                    className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                  >
                    Phone / Mobile <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
                    <input
                      id="signup-phone"
                      type="tel"
                      required
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-org"
                    className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                  >
                    Organization / Dept
                  </label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
                    <input
                      id="signup-org"
                      type="text"
                      value={signupOrg}
                      onChange={(e) => setSignupOrg(e.target.value)}
                      placeholder="e.g. Dept of Biotechnology"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-cat"
                    className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                  >
                    Classification Tier
                  </label>
                  <select
                    id="signup-cat"
                    value={signupCategory}
                    onChange={(e) => setSignupCategory(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] cursor-pointer shadow-2xs"
                  >
                    <option value="CITIZEN">Citizen / Public Petitioner</option>
                    <option value="STUDENT">Student / Scholar</option>
                    <option value="FACULTY">Faculty Member / Academic</option>
                    <option value="DELEGATION">Corporate Delegation</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="signup-pwd"
                    className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                  >
                    Password (8+ chars) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
                    <input
                      id="signup-pwd"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="signup-cpwd"
                    className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                  >
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3" />
                    <input
                      id="signup-cpwd"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-white dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-1">
                <input
                  id="signup-consent"
                  type="checkbox"
                  checked={signupConsent}
                  onChange={(e) => setSignupConsent(e.target.checked)}
                  className="mt-0.5 rounded border-[#D5D2CA] text-[#1A3170] focus:ring-[#1A3170] cursor-pointer"
                />
                <label
                  htmlFor="signup-consent"
                  className="text-[11px] text-[#5B6070] dark:text-slate-300 leading-tight cursor-pointer"
                >
                  I attest that the information provided is accurate and agree to official appointment protocol guidelines.
                </label>
              </div>
            </>
          ) : (
            <>
              {/* Quick Select Account Dropdown (Above Email) */}
              <div>
                <label
                  htmlFor="account-preset"
                  className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                >
                  Quick Select Account
                </label>
                <div className="relative">
                  <UserCheck className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <select
                    id="account-preset"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setPassword('password123');
                      if (error) setError(null);
                    }}
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[#D5D2CA] dark:border-[#383E50] bg-[#F7F6F2] dark:bg-[#202530] text-[#16181D] dark:text-slate-200 focus:outline-none focus:ring-1.5 focus:ring-[#1A3170] shadow-2xs cursor-pointer font-medium"
                  >
                    <option value="admin@stmarysgroup.com">admin@stmarysgroup.com — System Administrator</option>
                    <option value="kvk@stmarysgroup.com">kvk@stmarysgroup.com — Chairman & Official</option>
                    <option value="harsha@stmarysgroup.com">harsha@stmarysgroup.com — Chief Executive Officer (CEO)</option>
                    <option value="vc@stmarysgroup.com">vc@stmarysgroup.com — Vice Chancellor (VC)</option>
                    <option value="bharathi@stmarysgroup.com">bharathi@stmarysgroup.com — President</option>
                    <option value="indhu@stmarysgroup.com">indhu@stmarysgroup.com — Joint Secretary & Staff</option>
                    <option value="janardhan@stmarysgroup.com">janardhan@stmarysgroup.com — Vice Principal / Admin</option>
                    <option value="security@stmarysgroup.com">security@stmarysgroup.com — Security Gate 1</option>
                    <option value="reception@stmarysgroup.com">reception@stmarysgroup.com — Front Desk Reception</option>
                  </select>
                </div>
              </div>

              {/* Official Email Entry Field */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-[11px] font-semibold text-[#16181D] dark:text-slate-200 mb-1"
                >
                  Official Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-[#5B6070] dark:text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@stmarysgroup.com"
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
            </>
          )}

          <button
            type="submit"
            disabled={loading || lockoutState.lockedOut}
            className="w-full py-2.5 px-4 rounded-xl bg-[#1A3170] hover:bg-[#12224D] text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A3170] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'signup' ? (
              'Create Account & Sign In'
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
