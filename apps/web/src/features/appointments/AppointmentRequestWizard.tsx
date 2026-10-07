import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import {
  Priority,
  MeetingMode,
  Visibility,
  Requirement,
  PurposeCategory,
  type SubmitAppointmentInput,
  type PreferredWindow,
  type AttendeeInput,
  type DuplicateCheckResponse,
} from '@oams/shared';
import { PRIORITY_LABELS } from './labels';
import { INITIAL_OFFICIALS } from '@/lib/mockData';
import { sendAppointmentSubmissionNotifications } from '@/lib/powerAutomateClient';
import {
  UserCheck,
  Mail,
  Phone,
  Building2,
  MapPin,
  Video,
  Phone as PhoneIcon,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  FileText,
  Users,
  Shield,
  ArrowRight,
  ArrowLeft,
  Copy,
  Printer,
  Search,
  UploadCloud,
  Trash2,
  Landmark,
  CheckCircle2,
  Check,
} from 'lucide-react';

interface OfficialItem {
  id: string;
  title: string;
  fullName: string;
  designation?: string;
  tier?: string;
  departmentName?: string;
  defaultDurationMin?: number;
  isActive: boolean;
}

const WIZARD_STEPS = [
  {
    num: 1,
    label: 'Official & Contact',
    shortLabel: 'Official',
    description: 'Chamber dignitary & contact coordinates',
  },
  {
    num: 2,
    label: 'Purpose & Agenda',
    shortLabel: 'Agenda',
    description: 'Subject, priority tier & discussion points',
  },
  {
    num: 3,
    label: 'Schedule & Format',
    shortLabel: 'Schedule',
    description: 'Duration, engagement mode & time windows',
  },
  {
    num: 4,
    label: 'Delegation Roster',
    shortLabel: 'Delegation',
    description: 'Accompanying delegates & special clearances',
  },
  {
    num: 5,
    label: 'Supporting Dossier',
    shortLabel: 'Dossier',
    description: 'Briefing memos & statutory documentation',
  },
  {
    num: 6,
    label: 'Review & Attestation',
    shortLabel: 'Attestation',
    description: 'Executive docket review & DPDP consent',
  },
];

export const AppointmentRequestWizard: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const followUpTo = searchParams.get('followUpTo');
  const preselectedOfficialId = searchParams.get('officialId');
  const { user, token } = useAuth();

  const [parentAppointment, setParentAppointment] = useState<any | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [officials, setOfficials] = useState<OfficialItem[]>([]);
  const [loadingOfficials, setLoadingOfficials] = useState(true);
  const [officialSearch, setOfficialSearch] = useState('');

  // Requester Contact Details
  const [requesterName, setRequesterName] = useState(user?.fullName || '');
  const [requesterEmail, setRequesterEmail] = useState(user?.email || '');
  const [requesterPhone, setRequesterPhone] = useState((user as any)?.phone || '');
  const [requesterOrg, setRequesterOrg] = useState((user as any)?.organization || '');

  // Form State
  const [selectedOfficialId, setSelectedOfficialId] = useState<string>(preselectedOfficialId || '');
  const [additionalOfficialIds, setAdditionalOfficialIds] = useState<
    { officialId: string; requirement: Requirement }[]
  >([]);

  const [subject, setSubject] = useState('');
  const [purpose, setPurpose] = useState<string>(PurposeCategory.BUSINESS_DISCUSSION);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(Priority.MEDIUM);
  const [priorityReason, setPriorityReason] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(Visibility.INTERNAL);

  const getLocalDateString = (d: Date = new Date()): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatPreferredWindowDisplay = (pw?: {
    date: string;
    from?: string;
    to?: string;
  }): string => {
    if (!pw?.date) return 'To be scheduled';
    try {
      const [y, m, d] = pw.date.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dateStr = dateObj.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${dateStr} (${pw.from || '10:00'} - ${pw.to || '10:30'})`;
    } catch {
      return `${pw.date} (${pw.from || '10:00'} - ${pw.to || '10:30'})`;
    }
  };

  const [durationMin, setDurationMin] = useState<15 | 30 | 45 | 60 | 90>(30);
  const [meetingMode, setMeetingMode] = useState<MeetingMode>(MeetingMode.IN_PERSON);
  const [preferredWindows, setPreferredWindows] = useState<PreferredWindow[]>([
    {
      date: getLocalDateString(),
      from: '10:00',
      to: '10:30',
    },
  ]);

  const [attendees, setAttendees] = useState<AttendeeInput[]>([]);
  const [newAttendee, setNewAttendee] = useState<AttendeeInput>({
    name: '',
    email: '',
    phone: '',
    organization: '',
    isExternal: true,
    needs: '',
  });

  const [files, setFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const [consentGiven, setConsentGiven] = useState(false);

  // Submission & Validation States
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    referenceNo: string;
    id: string;
    slaDueAt: string;
  } | null>(null);

  const [deliveryStatus, setDeliveryStatus] = useState<{
    status: 'pending' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Load Officials
  useEffect(() => {
    async function fetchOfficials() {
      try {
        setLoadingOfficials(true);
        const res = await api.get<any[]>('/api/v1/officials', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const allowedIds = new Set([
          'off-1', 'off-2', 'off-3', 'off-4', 'off-5', 'off-6',
          'off-kvk', 'off-harsha', 'off-vc', 'off-bharathi', 'off-indhu', 'off-janardhan',
        ]);
        if (Array.isArray(res) && res.length > 0) {
          const list = res.map((item) => ({
            id: item.id,
            title: item.title,
            fullName: item.fullName || item.full_name || 'Official',
            designation: item.designation || item.roleTitle || item.title || 'Official',
            tier: item.tier || 'Executive Chamber',
            departmentName: item.departmentName || item.department_name,
            defaultDurationMin: item.defaultDurationMin || 30,
            isActive: item.isActive ?? item.is_active ?? true,
          }));
          const activeList = list.filter((o) => o.isActive && allowedIds.has(o.id));
          setOfficials(activeList.length > 0 ? activeList : (INITIAL_OFFICIALS as any));
        } else {
          setOfficials(INITIAL_OFFICIALS as any);
        }
      } catch (err) {
        console.warn('Using fallback officials list:', err);
        setOfficials(INITIAL_OFFICIALS as any);
      } finally {
        setLoadingOfficials(false);
      }
    }
    fetchOfficials();
  }, [token]);

  // Sync preselected official
  useEffect(() => {
    if (preselectedOfficialId && !selectedOfficialId) {
      const aliasMap: Record<string, string> = {
        'off-kvk': 'off-1',
        'off-harsha': 'off-2',
        'off-vc': 'off-3',
        'off-bharathi': 'off-4',
        'off-indhu': 'off-5',
        'off-janardhan': 'off-6',
      };
      setSelectedOfficialId(aliasMap[preselectedOfficialId] || preselectedOfficialId);
    }
  }, [preselectedOfficialId, selectedOfficialId]);

  // Load parent appointment if follow-up link (§16, §22 Track 8)
  useEffect(() => {
    if (!followUpTo) return;
    async function loadFollowUpParent() {
      try {
        const parentApt = await api.get<any>(`/api/v1/appointments/${followUpTo}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (parentApt) {
          setParentAppointment(parentApt);
          if (parentApt.official?.id) {
            setSelectedOfficialId(parentApt.official.id);
          }
          setSubject(`Follow-up: ${parentApt.subject || ''}`);
          if (parentApt.purpose) setPurpose(parentApt.purpose);
          if (parentApt.priority) setPriority(parentApt.priority);
          if (parentApt.meetingMode) setMeetingMode(parentApt.meetingMode);
          if (parentApt.visibility) setVisibility(parentApt.visibility);
          if (parentApt.durationMin) setDurationMin(parentApt.durationMin);
          setDescription(
            `Follow-up consultation regarding ${parentApt.referenceNo || 'previous meeting'}.\n\nContext and action items carried forward from previous appointment.`,
          );
          if (parentApt.attendees && Array.isArray(parentApt.attendees)) {
            setAttendees(
              parentApt.attendees.map((a: any) => ({
                name: a.name,
                email: a.email || '',
                phone: a.phone || '',
                organization: a.organization || '',
                isExternal: a.isExternal ?? true,
                needs: a.needs || '',
              })),
            );
          }
        }
      } catch (err) {
        console.error('Failed to load follow-up parent appointment:', err);
      }
    }
    loadFollowUpParent();
  }, [followUpTo, token]);

  // Pre-fill primary official default duration
  useEffect(() => {
    if (selectedOfficialId) {
      const off = officials.find((o) => o.id === selectedOfficialId);
      if (off && off.defaultDurationMin) {
        const val = off.defaultDurationMin as any;
        if ([15, 30, 45, 60, 90].includes(val)) {
          setDurationMin(val);
        }
      }
    }
  }, [selectedOfficialId, officials]);

  // Clean form reset
  const handleResetForm = () => {
    if (window.confirm('Reset all entered details and start a fresh appointment petition?')) {
      setCurrentStep(1);
      setSelectedOfficialId('');
      setAdditionalOfficialIds([]);
      setSubject('');
      setPurpose(PurposeCategory.BUSINESS_DISCUSSION);
      setDescription('');
      setPriority(Priority.MEDIUM);
      setPriorityReason('');
      setVisibility(Visibility.INTERNAL);
      setDurationMin(30);
      setMeetingMode(MeetingMode.IN_PERSON);
      setPreferredWindows([
        {
          date: getLocalDateString(),
          from: '10:00',
          to: '10:30',
        },
      ]);
      setAttendees([]);
      setFiles([]);
      setConsentGiven(false);
      setErrorMsg(null);
      setDuplicateWarning(null);
      setSubmittedResult(null);
      setParentAppointment(null);
      setRequesterName(user?.fullName || '');
      setRequesterEmail(user?.email || '');
      setRequesterPhone((user as any)?.phone || '');
      setRequesterOrg((user as any)?.organization || '');
    }
  };

  // Pre-submission duplicate check on Step 6
  useEffect(() => {
    async function runDupCheck() {
      if (currentStep === 6 && user && selectedOfficialId && preferredWindows[0]?.date) {
        try {
          const res = await api.post<DuplicateCheckResponse>(
            '/api/v1/appointments/check-duplicate',
            {
              officialId: selectedOfficialId,
              subject: subject || 'Appointment Request',
              preferredDate: preferredWindows[0].date,
            },
            {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
          );

          if (res.isBlocked) {
            setErrorMsg(res.message || 'Duplicate request within 24 hours is blocked (§9.1)');
          } else if (res.isWarning) {
            setDuplicateWarning(res.message || null);
          } else {
            setDuplicateWarning(null);
          }
        } catch (err: any) {
          if (err.code === 'DUPLICATE_REQUEST') {
            setErrorMsg(err.message);
          }
        }
      }
    }
    runDupCheck();
  }, [currentStep, user, selectedOfficialId, subject, preferredWindows, token]);

  const handleNextStep = () => {
    setErrorMsg(null);
    if (currentStep === 1) {
      if (!requesterName.trim()) {
        setErrorMsg('Please enter your full name so the Secretariat knows who is requesting.');
        return;
      }
      if (!requesterEmail.trim() || !requesterEmail.includes('@') || !requesterEmail.includes('.')) {
        setErrorMsg('Please enter a valid email address to receive meeting notifications and pass credentials.');
        return;
      }
      if (!requesterPhone.trim() || requesterPhone.trim().length < 7) {
        setErrorMsg('Please enter your contact phone number for security protocol verification.');
        return;
      }
      if (!selectedOfficialId) {
        setErrorMsg('Please select a Principal Dignitary / Official for the audience.');
        return;
      }
    }
    if (currentStep === 2) {
      if (!subject.trim() || subject.trim().length < 5) {
        setErrorMsg('Meeting subject must be at least 5 characters in length.');
        return;
      }
      if (!description.trim() || description.trim().length < 20) {
        setErrorMsg('Please provide a substantive agenda description (minimum 20 characters).');
        return;
      }
      if (
        priority === Priority.HIGH &&
        (!priorityReason.trim() || priorityReason.trim().length < 20)
      ) {
        setErrorMsg('Administrative justification for High Priority is required (minimum 20 characters).');
        return;
      }
    }
    if (currentStep === 3) {
      if (preferredWindows.length === 0) {
        setErrorMsg('Please specify at least 1 preferred date and time window.');
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, 6));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevStep = () => {
    setErrorMsg(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJumpToStep = (targetStep: number) => {
    if (targetStep === currentStep) return;
    setErrorMsg(null);
    if (targetStep > 1 && !selectedOfficialId) {
      setErrorMsg('Please select an official and provide contact coordinates in Stage 1 first.');
      return;
    }
    setCurrentStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddWindow = () => {
    if (preferredWindows.length >= 3) return;
    const base = new Date();
    base.setDate(base.getDate() + preferredWindows.length);
    const nextDate = getLocalDateString(base);
    setPreferredWindows([...preferredWindows, { date: nextDate, from: '11:00', to: '11:30' }]);
  };

  const handleRemoveWindow = (idx: number) => {
    if (preferredWindows.length <= 1) return;
    setPreferredWindows(preferredWindows.filter((_, i) => i !== idx));
  };

  const handleAddAttendee = () => {
    if (!newAttendee.name.trim()) {
      setErrorMsg('Attendee full name is required.');
      return;
    }
    setAttendees([...attendees, { ...newAttendee }]);
    setNewAttendee({
      name: '',
      email: '',
      phone: '',
      organization: '',
      isExternal: true,
      needs: '',
    });
    setErrorMsg(null);
  };

  const handleRemoveAttendee = (idx: number) => {
    setAttendees(attendees.filter((_, i) => i !== idx));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
      }));
      setFiles((prev) => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCopyReference = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!consentGiven) {
      setErrorMsg('You must provide DPDP Act consent before submitting.');
      return;
    }

    try {
      setSubmitting(true);

      const safeRequesterEmail = requesterEmail.trim() || 'appointments@university.edu';
      const safeRequesterName = requesterName.trim() || 'Requester';
      const safeRequesterPhone = requesterPhone.trim() || undefined;

      const primaryAttendee: AttendeeInput = {
        name: safeRequesterName,
        email: safeRequesterEmail,
        phone: safeRequesterPhone,
        organization: requesterOrg.trim() || undefined,
        isExternal: true,
      };

      const finalAttendees = [
        primaryAttendee,
        ...attendees.filter(
          (a) => (a.email || '').toLowerCase() !== safeRequesterEmail.toLowerCase(),
        ),
      ];

      const payload: SubmitAppointmentInput = {
        officialId: selectedOfficialId,
        additionalOfficials: additionalOfficialIds,
        subject,
        purpose,
        description,
        priority,
        priorityReason: priority === Priority.HIGH ? priorityReason : undefined,
        meetingMode,
        visibility,
        durationMin,
        preferredWindows,
        attendees: finalAttendees,
        attachmentIds: files.map((f) => f.id),
        consentGiven: true,
        consentNoticeVersion: '2026.1',
        parentAppointmentId: followUpTo || undefined,
      };

      const res = await api.post<{
        id: string;
        referenceNo: string;
        slaDueAt: string;
        status: string;
      }>('/api/v1/appointments/submit', payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setSubmittedResult({
        id: res.id,
        referenceNo: res.referenceNo,
        slaDueAt: res.slaDueAt,
      });

      // Dispatch notifications via Power Automate
      sendAppointmentSubmissionNotifications({
        appointmentId: res.id,
        referenceNo: res.referenceNo,
        subject,
        requesterEmail: safeRequesterEmail,
        requesterName: safeRequesterName,
        requesterPhone: safeRequesterPhone,
        officialName: selectedOfficial?.fullName || 'Chamber Official',
        officialEmail: (selectedOfficial as any)?.email,
        priority,
        preferredTime: preferredWindows[0]?.date
          ? formatPreferredWindowDisplay(preferredWindows[0])
          : 'To be scheduled',
        meetingMode,
        location:
          meetingMode === 'ONLINE'
            ? 'Microsoft Teams Encrypted Video Room'
            : meetingMode === 'PHONE'
            ? 'Direct Secure Teleconference'
            : 'Executive Secretariat Chamber, Main Campus',
        purpose,
      })
        .then((paResult) => {
          if (paResult.ok) {
            setDeliveryStatus({
              status: 'success',
              message: `Official dispatch confirmation transmitted via email to ${safeRequesterEmail}`,
            });
          } else {
            setDeliveryStatus({
              status: 'warning',
              message: paResult.message,
            });
          }
        })
        .catch((err) => {
          setDeliveryStatus({
            status: 'error',
            message: err.message || 'Power Automate delivery request failed.',
          });
        });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit appointment request.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedOfficial = officials.find((o) => o.id === selectedOfficialId);
  const totalAttendeeCount = attendees.length + 1; // Requester + additional

  // Render Submitted Confirmation Screen (§9)
  if (submittedResult) {
    return (
      <div className="max-w-[720px] mx-auto py-8 px-4 sm:px-6">
        <div className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-6 sm:p-10 shadow-sm text-center">
          <div className="w-16 h-16 bg-[#1A3170]/10 text-[#1A3170] dark:bg-blue-900/30 dark:text-blue-300 rounded-full flex items-center justify-center mx-auto mb-5 text-2xl font-bold shadow-2xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="inline-block px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#1A3170] dark:text-blue-300 font-mono text-[11px] font-semibold tracking-wider uppercase mb-2 border border-blue-100 dark:border-blue-900/50">
            Form OAMS-101 &bull; Registered
          </div>

          <h2 className="text-2xl font-bold font-serif text-[#16181D] dark:text-white mb-2">
            Petition Successfully Submitted
          </h2>
          <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] max-w-lg mx-auto mb-6 leading-relaxed">
            Your appointment request has been recorded into the institutional ledger and routed to the
            Executive Secretariat for chamber availability screening.
          </p>

          {/* Reference Card with Copy Action */}
          <div className="p-5 rounded-xl bg-[#FBFAF7] dark:bg-[var(--bg-main)] border border-[#E4E2DC] dark:border-[var(--border-default)] mb-6 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)]">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#8C93A4]">
                  Official Reference Number
                </span>
                <div className="text-xl font-mono font-bold text-[#1A3170] dark:text-blue-400 mt-0.5">
                  {submittedResult.referenceNo}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopyReference(submittedResult.referenceNo)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] text-xs font-semibold text-[#16181D] dark:text-white hover:bg-slate-50 transition cursor-pointer shadow-2xs self-start sm:self-auto"
              >
                {copiedRef ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#5B6070]" />
                    <span>Copy Reference Code</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 text-xs">
              <div>
                <span className="text-[#8C93A4] block text-[11px]">Consultation Dignitary</span>
                <span className="font-semibold text-[#16181D] dark:text-white">
                  {selectedOfficial?.title} {selectedOfficial?.fullName}
                </span>
              </div>

              <div>
                <span className="text-[#8C93A4] block text-[11px]">Subject Matter</span>
                <span className="font-semibold text-[#16181D] dark:text-white truncate block">
                  {subject}
                </span>
              </div>

              <div>
                <span className="text-[#8C93A4] block text-[11px]">Primary Dispatch Email</span>
                <span className="font-semibold text-[#16181D] dark:text-white">
                  {requesterEmail}
                </span>
              </div>

              <div>
                <span className="text-[#8C93A4] block text-[11px]">SLA Resolution Target</span>
                <span className="font-semibold text-[#1A3170] dark:text-blue-400">
                  {new Date(submittedResult.slaDueAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  ({PRIORITY_LABELS[priority].slaText})
                </span>
              </div>
            </div>
          </div>

          {/* Delivery Alert */}
          {deliveryStatus && (
            <div
              className={`p-4 rounded-xl mb-6 text-xs flex items-start gap-3 text-left border ${
                deliveryStatus.status === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : deliveryStatus.status === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              }`}
            >
              {deliveryStatus.status === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-bold text-[12px]">
                  {deliveryStatus.status === 'success'
                    ? 'Official Confirmation Dispatched'
                    : 'Dispatch Notice'}
                </p>
                <p className="mt-0.5 leading-relaxed opacity-90">{deliveryStatus.message}</p>
              </div>
            </div>
          )}

          {/* Next Protocol Steps */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[var(--bg-main)] border border-[#E4E2DC] dark:border-[var(--border-default)] mb-8 text-left space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A3170] dark:text-blue-300">
              Protocol Next Steps:
            </h4>
            <ul className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] space-y-1.5 list-disc pl-4">
              <li>
                <strong>Secretariat Triage:</strong> The official chamber assistant will review availability and confirm your allocated time slot.
              </li>
              <li>
                <strong>Pass Generation:</strong> Upon confirmation, a secure digital entry badge and location coordinates will be generated.
              </li>
              <li>
                <strong>Campus Check-in:</strong> Present the digital pass at the security gate for physical visits or follow the encrypted link for virtual sessions.
              </li>
            </ul>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 border border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:bg-[#F7F6F2] text-[#16181D] dark:text-white text-xs font-semibold rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Formal Receipt</span>
            </button>

            <button
              type="button"
              onClick={() => navigate(`/my/appointments/${submittedResult.id}`)}
              className="px-5 py-2.5 bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
            >
              <span>Track Petition Status</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2.5 border border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:bg-[#F7F6F2] text-[#5B6070] dark:text-[var(--text-muted)] text-xs font-medium rounded-xl transition cursor-pointer"
            >
              Submit Another Petition
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-4 py-2.5 border border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-surface)] hover:bg-[#F7F6F2] text-[#5B6070] dark:text-[var(--text-muted)] text-xs font-medium rounded-xl transition cursor-pointer"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[820px] mx-auto py-4 sm:py-6 px-3 sm:px-0">
      {/* Institutional Top Header */}
      <div className="mb-6 bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1A3170]/10 dark:bg-blue-950/60 text-[#1A3170] dark:text-blue-300 font-mono text-[10px] font-bold uppercase tracking-wider border border-[#1A3170]/20">
                <Shield className="w-3 h-3" />
                Form OAMS-101 &bull; Official Protocol
              </span>
              <span className="text-[11px] text-[#8C93A4]">&bull; Track 8 Governance</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-serif text-[#16181D] dark:text-white">
              Official Appointment Request
            </h1>
            <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1 max-w-xl leading-relaxed">
              Petition for official audiences with leadership chambers, board members, and department heads.
              All submissions are processed under administrative priority guidelines.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetForm}
            title="Reset all fields and restart petition"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E4E2DC] hover:border-red-300 bg-white hover:bg-red-50/50 text-xs font-medium text-[#5B6070] hover:text-[#B42318] transition cursor-pointer shadow-2xs self-start sm:self-auto shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Form</span>
          </button>
        </div>

        {/* Stepper Timeline Bar */}
        <div className="mt-6 pt-5 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)]">
          {/* Milestone Nodes */}
          <div className="relative">
            {/* Connecting Horizontal Line */}
            <div className="hidden sm:block absolute top-4 left-6 right-6 h-0.5 bg-[#E4E2DC] dark:bg-[var(--border-default)] -z-0" />

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-1 relative z-10">
              {WIZARD_STEPS.map((step) => {
                const isCompleted = currentStep > step.num;
                const isCurrent = currentStep === step.num;
                return (
                  <button
                    key={step.num}
                    type="button"
                    onClick={() => handleJumpToStep(step.num)}
                    className="flex flex-col items-center text-center group cursor-pointer border-0 bg-transparent p-1 transition"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-2xs ${
                        isCurrent
                          ? 'bg-[#1A3170] text-white ring-4 ring-[#1A3170]/20 scale-105'
                          : isCompleted
                          ? 'bg-[#2957D6] text-white hover:bg-[#1E4FC2]'
                          : 'bg-white dark:bg-[var(--bg-main)] text-[#8C93A4] border border-[#D5D2CA] dark:border-[var(--border-default)] group-hover:border-[#1A3170]'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : step.num}
                    </div>

                    <span
                      className={`text-[11px] mt-2 font-medium leading-tight ${
                        isCurrent
                          ? 'text-[#1A3170] dark:text-blue-400 font-bold'
                          : isCompleted
                          ? 'text-[#16181D] dark:text-white font-semibold'
                          : 'text-[#8C93A4]'
                      }`}
                    >
                      {step.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current Stage Indicator & Progress Bar */}
          <div className="mt-4 pt-3 border-t border-[#F5F4F0] dark:border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <span className="font-semibold text-[#1A3170] dark:text-blue-300">
              Stage {currentStep} of 6: {WIZARD_STEPS[currentStep - 1].label}
            </span>
            <span className="text-[11px] text-[#8C93A4]">
              {Math.round((currentStep / 6) * 100)}% Complete
            </span>
          </div>
          <div className="w-full bg-[#EAE8E2] dark:bg-[var(--border-default)] h-1 rounded-full mt-1.5 overflow-hidden">
            <div
              className="bg-[#1A3170] dark:bg-blue-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(currentStep / 6) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Follow-up Banner if linked to previous appointment */}
      {parentAppointment && (
        <div className="mb-6 p-4 rounded-xl border border-purple-500/30 bg-purple-500/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-bold text-xs uppercase tracking-wider">
              Follow-up Petition
            </span>
            <div>
              <div className="text-xs font-bold text-[var(--text-main)]">
                Scheduling Follow-up to {parentAppointment.referenceNo || 'Previous Meeting'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Dignitary, subject, and delegation have been pre-filled (§16, §22 Track 8).
              </div>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
            {parentAppointment.referenceNo}
          </span>
        </div>
      )}

      {/* Error / Warning Alert */}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-red-900 dark:text-red-300 text-xs flex items-start gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
        </div>
      )}

      {duplicateWarning && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-300 text-xs flex items-start gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Prior Petition Notice:</span> {duplicateWarning}
          </div>
        </div>
      )}

      {/* Main Wizard Form Card */}
      <div className="bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-6 sm:p-8 shadow-2xs">
        {/* ============================================================== */}
        {/* STAGE 1: Requester Details & Official Selection */}
        {/* ============================================================== */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white">
                Stage 1 — Principal Dignitary & Contact Coordinates
              </h2>
              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                Provide your official contact coordinates and select the chamber dignitary for the audience petition.
              </p>
            </div>

            {/* 1. Requester Contact Information */}
            <div className="p-5 rounded-xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FBFAF7] dark:bg-[var(--bg-main)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)] gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
                  <h3 className="text-xs font-bold text-[#16181D] dark:text-white uppercase tracking-wider">
                    1. Primary Petitioner Coordinates
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  {user?.fullName && (
                    <button
                      type="button"
                      onClick={() => {
                        setRequesterName(user.fullName || '');
                        if (user.email) setRequesterEmail(user.email);
                        if ((user as any).phone) setRequesterPhone((user as any).phone);
                        if ((user as any).organization) setRequesterOrg((user as any).organization);
                      }}
                      className="text-xs text-[#1A3170] dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      Prefill with profile credentials
                    </button>
                  )}
                  <span className="text-[10px] font-semibold text-[#1A3170] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                    Dispatch Destination
                  </span>
                </div>
              </div>

              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] leading-relaxed">
                All meeting notices (submission receipt, secretariat review, calendar allocation, confirmed timings, security pass, and virtual links) will be dispatched to these coordinates.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-white mb-1.5">
                    Petitioner Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 text-[#8C93A4] absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={requesterName}
                      onChange={(e) => setRequesterName(e.target.value)}
                      placeholder="e.g., Dr. Ramesh Patel"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white placeholder:text-[#8C93A4] focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-white mb-1.5">
                    Official Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#8C93A4] absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={requesterEmail}
                      onChange={(e) => setRequesterEmail(e.target.value)}
                      placeholder="e.g., ramesh.patel@institution.org"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white placeholder:text-[#8C93A4] focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-white mb-1.5">
                    Contact Phone / Mobile <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#8C93A4] absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={requesterPhone}
                      onChange={(e) => setRequesterPhone(e.target.value)}
                      placeholder="e.g., +91 98765 43210"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white placeholder:text-[#8C93A4] focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#16181D] dark:text-white mb-1.5">
                    Organization / Department
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-[#8C93A4] absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      value={requesterOrg}
                      onChange={(e) => setRequesterOrg(e.target.value)}
                      placeholder="e.g., Department of Biotechnology"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white placeholder:text-[#8C93A4] focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Official / Chamber Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
                  <h3 className="text-xs font-bold text-[#16181D] dark:text-white uppercase tracking-wider">
                    2. Select Principal Dignitary / Chamber <span className="text-red-500">*</span>
                  </h3>
                </div>
                <span className="text-[11px] text-[#8C93A4]">
                  {officials.length} chambers active
                </span>
              </div>
              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mb-3">
                Select the executive authority or committee chair whose audience you are petitioning.
              </p>

              <div className="relative mb-4">
                <Search className="w-4 h-4 text-[#8C93A4] absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search chamber by dignitary name, title, or department..."
                  value={officialSearch}
                  onChange={(e) => setOfficialSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FBFAF7] dark:bg-[var(--bg-main)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
                />
              </div>

              {loadingOfficials ? (
                <div className="py-12 text-center text-xs text-[#8C93A4]">
                  Loading official registry...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {officials
                    .filter(
                      (o) =>
                        o.title.toLowerCase().includes(officialSearch.toLowerCase()) ||
                        o.fullName.toLowerCase().includes(officialSearch.toLowerCase()) ||
                        (o.departmentName &&
                          o.departmentName.toLowerCase().includes(officialSearch.toLowerCase())),
                    )
                    .map((official) => {
                      const isSelected = selectedOfficialId === official.id;
                      return (
                        <button
                          key={official.id}
                          type="button"
                          onClick={() => setSelectedOfficialId(official.id)}
                          className={`text-left p-4 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                            isSelected
                              ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/40 ring-2 ring-[#1A3170] shadow-2xs'
                              : 'border-[#E4E2DC] dark:border-[var(--border-default)] hover:border-[#1A3170]/50 bg-white dark:bg-[var(--bg-surface)] hover:shadow-2xs'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-[10px] font-mono font-semibold uppercase text-[#1A3170] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded">
                                {official.tier || 'Chamber'}
                              </span>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1A3170] dark:text-blue-300">
                                  <Check className="w-3 h-3 stroke-[2.5]" />
                                  Selected
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-xs text-[#16181D] dark:text-white">
                              {official.fullName}
                            </div>
                            <div className="text-xs text-[#1A3170] dark:text-blue-400 font-medium mt-0.5">
                              {official.designation || 'Official'}
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[#8C93A4]">
                            <span className="truncate max-w-[130px]">
                              {official.departmentName || 'Chamber Office'}
                            </span>
                            <span>{official.defaultDurationMin || 30}m slot</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Selected Dignitary Callout */}
            {selectedOfficial && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-transparent dark:from-blue-950/40 dark:to-transparent border border-[#1A3170]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#1A3170] dark:text-blue-300 uppercase tracking-wider">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Chamber Dignitary Confirmed
                  </div>
                  <div className="text-sm font-bold text-[#16181D] dark:text-white mt-0.5">
                    {selectedOfficial.fullName}
                  </div>
                  <div className="text-xs text-[#5B6070] dark:text-[var(--text-muted)]">
                    {selectedOfficial.designation ? `${selectedOfficial.designation} • ` : ''}{selectedOfficial.departmentName} &bull; Default {selectedOfficial.defaultDurationMin} min consultation window
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-5 py-2.5 bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-bold rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                >
                  <span>Continue to Purpose & Agenda</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Additional Joint Officials */}
            {selectedOfficialId && (
              <div className="pt-3 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)] space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C93A4]">
                  Joint Chamber Presence (Optional)
                </span>
                <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)]">
                  Select any additional officials requested to co-attend this consultation session:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {officials
                    .filter((o) => o.id !== selectedOfficialId)
                    .map((other) => {
                      const isAdded = additionalOfficialIds.some((a) => a.officialId === other.id);
                      return (
                        <button
                          key={other.id}
                          type="button"
                          onClick={() => {
                            if (isAdded) {
                              setAdditionalOfficialIds(
                                additionalOfficialIds.filter((a) => a.officialId !== other.id),
                              );
                            } else {
                              setAdditionalOfficialIds([
                                ...additionalOfficialIds,
                                { officialId: other.id, requirement: Requirement.REQUIRED },
                              ]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                            isAdded
                              ? 'bg-[#1A3170] text-white border-[#1A3170]'
                              : 'border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-main)] text-[#16181D] dark:text-white hover:border-[#1A3170]'
                          }`}
                        >
                          {isAdded ? '✓ ' : '+ '} {other.title} ({other.fullName})
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* STAGE 2: Purpose & Agenda */}
        {/* ============================================================== */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white">
                Stage 2 — Purpose, Classification & Agenda
              </h2>
              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                Formulate the official petition title, classify the meeting tier, and outline the substantive agenda points.
              </p>
            </div>

            {/* Dignitary Context Pill */}
            <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-xs flex items-center justify-between">
              <span className="text-[#1A3170] dark:text-blue-300">
                Petitioning Dignitary:{' '}
                <strong className="text-[#16181D] dark:text-white">
                  {selectedOfficial
                    ? `${selectedOfficial.title} — ${selectedOfficial.fullName}`
                    : 'Institutional Leadership'}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="text-[11px] text-[#1A3170] dark:text-blue-400 font-semibold hover:underline"
              >
                Change Official
              </button>
            </div>

            {/* Meeting Subject */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="subj"
                  className="block text-xs font-semibold text-[#16181D] dark:text-white"
                >
                  Formal Subject / Petition Title <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-[#8C93A4]">
                  {subject.trim().length} / 120 (Min. 5 required)
                </span>
              </div>
              <input
                id="subj"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                placeholder="e.g., Annual Budget Allocation Review & Q3 Grant Sanction"
                className="w-full border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl p-3 text-xs bg-white dark:bg-[var(--bg-main)] text-[#16181D] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
              />
            </div>

            {/* Classification & Visibility */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cat"
                  className="block text-xs font-semibold text-[#16181D] dark:text-white mb-1.5"
                >
                  Purpose Classification
                </label>
                <select
                  id="cat"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl p-2.5 text-xs bg-white dark:bg-[var(--bg-main)] text-[#16181D] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
                >
                  <option value="Proposal">Formal Policy / Grant Proposal</option>
                  <option value={PurposeCategory.BUSINESS_DISCUSSION}>Business & Academic Deliberation</option>
                  <option value={PurposeCategory.APPROVAL_REQUEST}>Administrative Approval Request</option>
                  <option value={PurposeCategory.GRIEVANCE}>Institutional Grievance / Appeal</option>
                  <option value={PurposeCategory.COURTESY_VISIT}>Courtesy Visit / Protocol Delegation</option>
                  <option value={PurposeCategory.OTHER}>Other Matters</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="vis"
                  className="block text-xs font-semibold text-[#16181D] dark:text-white mb-1.5"
                >
                  Confidentiality Tier
                </label>
                <select
                  id="vis"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as Visibility)}
                  className="w-full border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl p-2.5 text-xs bg-white dark:bg-[var(--bg-main)] text-[#16181D] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
                >
                  <option value={Visibility.INTERNAL}>Standard Institutional (Chamber Secretariat)</option>
                  <option value={Visibility.CONFIDENTIAL}>Confidential (Executive Eyes Only)</option>
                </select>
              </div>
            </div>

            {/* Priority Selection */}
            <div>
              <label className="block text-xs font-semibold text-[#16181D] dark:text-white mb-1.5">
                Priority Tier & Service Level Commitment (SLA)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Low */}
                <label
                  onClick={() => setPriority(Priority.LOW)}
                  className={`flex flex-col justify-between p-4 rounded-xl cursor-pointer transition border ${
                    priority === Priority.LOW
                      ? 'bg-slate-50 dark:bg-slate-900/40 border-[#1A3170] ring-1 ring-[#1A3170]'
                      : 'bg-white dark:bg-[var(--bg-main)] border-[#D5D2CA] dark:border-[var(--border-default)]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        Routine
                      </span>
                      <input
                        type="radio"
                        name="priority"
                        checked={priority === Priority.LOW}
                        onChange={() => setPriority(Priority.LOW)}
                        className="w-3.5 h-3.5 accent-[#1A3170]"
                      />
                    </div>
                    <div className="text-xs font-bold text-[#16181D] dark:text-white">
                      General Institutional Inquiries
                    </div>
                    <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                      Courtesy calls and periodic briefings
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)] text-[10px] font-semibold text-[#8C93A4]">
                    SLA: 3 working days
                  </div>
                </label>

                {/* Medium */}
                <label
                  onClick={() => setPriority(Priority.MEDIUM)}
                  className={`flex flex-col justify-between p-4 rounded-xl cursor-pointer transition border ${
                    priority === Priority.MEDIUM
                      ? 'bg-blue-50/40 dark:bg-blue-950/40 border-[#1A3170] ring-1 ring-[#1A3170]'
                      : 'bg-white dark:bg-[var(--bg-main)] border-[#D5D2CA] dark:border-[var(--border-default)]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-[#1A3170] dark:text-blue-300">
                        Standard
                      </span>
                      <input
                        type="radio"
                        name="priority"
                        checked={priority === Priority.MEDIUM}
                        onChange={() => setPriority(Priority.MEDIUM)}
                        className="w-3.5 h-3.5 accent-[#1A3170]"
                      />
                    </div>
                    <div className="text-xs font-bold text-[#16181D] dark:text-white">
                      Standard Business Operations
                    </div>
                    <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                      Scheduled project deliberations and approvals
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)] text-[10px] font-semibold text-[#1A3170] dark:text-blue-400">
                    SLA: 24 to 48 hours
                  </div>
                </label>

                {/* High */}
                <label
                  onClick={() => setPriority(Priority.HIGH)}
                  className={`flex flex-col justify-between p-4 rounded-xl cursor-pointer transition border ${
                    priority === Priority.HIGH
                      ? 'bg-amber-50/50 dark:bg-amber-950/40 border-amber-600 ring-1 ring-amber-600'
                      : 'bg-white dark:bg-[var(--bg-main)] border-[#D5D2CA] dark:border-[var(--border-default)]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                        Time-Critical
                      </span>
                      <input
                        type="radio"
                        name="priority"
                        checked={priority === Priority.HIGH}
                        onChange={() => setPriority(Priority.HIGH)}
                        className="w-3.5 h-3.5 accent-amber-600"
                      />
                    </div>
                    <div className="text-xs font-bold text-[#16181D] dark:text-white">
                      Pressing Statutory Deadlines
                    </div>
                    <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                      Urgent board or regulatory milestones
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)] text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    SLA: 4 to 8 working hours
                  </div>
                </label>
              </div>
            </div>

            {/* High Priority Justification */}
            {priority === Priority.HIGH && (
              <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="why"
                    className="block text-xs font-bold text-amber-900 dark:text-amber-300"
                  >
                    Statutory / Operational Justification for High Priority <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-amber-800 dark:text-amber-400 font-mono">
                    {priorityReason.trim().length} / 20 chars min
                  </span>
                </div>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                  State the specific operational deadline, upcoming board committee meeting, or regulatory milestone necessitating expedited clearance.
                </p>
                <textarea
                  id="why"
                  rows={2}
                  value={priorityReason}
                  onChange={(e) => setPriorityReason(e.target.value)}
                  placeholder="e.g., Statutory compliance filing deadline on 15 Oct requires Vice-Chancellor review and signature."
                  className="w-full border border-amber-300 dark:border-amber-800 rounded-lg p-2.5 text-xs bg-white dark:bg-[var(--bg-surface)] text-[#16181D] dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-600"
                />
              </div>
            )}

            {/* Agenda Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="desc"
                  className="block text-xs font-semibold text-[#16181D] dark:text-white"
                >
                  Detailed Agenda & Discussion Points <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-[#8C93A4]">
                  {description.trim().length} / 20 chars min
                </span>
              </div>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Provide an executive summary of key deliberation topics, background context, and specific decisions or approvals sought from the Official..."
                className="w-full border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl p-3 text-xs bg-white dark:bg-[var(--bg-main)] text-[#16181D] dark:text-white resize-y focus:outline-none focus:ring-1 focus:ring-[#1A3170]"
              />
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STAGE 3: Duration, Format & Preferred Windows */}
        {/* ============================================================== */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white">
                Stage 3 — Schedule, Duration & Engagement Mode
              </h2>
              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                Choose the consultation format, requested session duration, and propose up to 3 preferred date/time windows.
              </p>
            </div>

            {/* Format / Mode */}
            <div>
              <label className="block text-xs font-semibold text-[#16181D] dark:text-white mb-2">
                Consultation Format / Meeting Mode <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setMeetingMode(MeetingMode.IN_PERSON)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition flex items-start gap-3 ${
                    meetingMode === MeetingMode.IN_PERSON
                      ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/40 ring-1 ring-[#1A3170] shadow-2xs'
                      : 'border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-main)] hover:border-[#1A3170]'
                  }`}
                >
                  <MapPin className="w-5 h-5 text-[#1A3170] dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs text-[#16181D] dark:text-white">
                      Offline Chamber Visit
                    </div>
                    <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
                      Physical attendance at Executive Chamber. Security gate pass generated.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMeetingMode(MeetingMode.ONLINE)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition flex items-start gap-3 ${
                    meetingMode === MeetingMode.ONLINE
                      ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/40 ring-1 ring-[#1A3170] shadow-2xs'
                      : 'border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-main)] hover:border-[#1A3170]'
                  }`}
                >
                  <Video className="w-5 h-5 text-[#2957D6] dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs text-[#16181D] dark:text-white">
                      Encrypted Video Conference
                    </div>
                    <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
                      Virtual conference via Microsoft Teams / Secure Chamber VC.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMeetingMode(MeetingMode.PHONE)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition flex items-start gap-3 ${
                    meetingMode === MeetingMode.PHONE
                      ? 'border-[#1A3170] bg-[#1A3170]/5 dark:bg-blue-950/40 ring-1 ring-[#1A3170] shadow-2xs'
                      : 'border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-main)] hover:border-[#1A3170]'
                  }`}
                >
                  <PhoneIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs text-[#16181D] dark:text-white">
                      Direct Teleconference
                    </div>
                    <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
                      Scheduled audio briefing directly to official chamber line.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Duration Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#16181D] dark:text-white">
                  Requested Chamber Duration
                </label>
                <span className="text-[11px] text-[#8C93A4]">
                  Official typical: {selectedOfficial?.defaultDurationMin || 30} mins
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { min: 15, label: '15 Mins', note: 'Brief Update' },
                  { min: 30, label: '30 Mins', note: 'Standard' },
                  { min: 45, label: '45 Mins', note: 'In-Depth' },
                  { min: 60, label: '60 Mins', note: 'Strategic' },
                  { min: 90, label: '90 Mins', note: 'Special Hearing' },
                ].map((dur) => (
                  <button
                    key={dur.min}
                    type="button"
                    onClick={() => setDurationMin(dur.min as any)}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      durationMin === dur.min
                        ? 'border-[#1A3170] bg-[#1A3170] text-white shadow-2xs'
                        : 'border-[#D5D2CA] dark:border-[var(--border-default)] bg-white dark:bg-[var(--bg-main)] text-[#16181D] dark:text-white hover:border-[#1A3170]'
                    }`}
                  >
                    <div className="text-xs font-bold">{dur.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        durationMin === dur.min ? 'text-white/80' : 'text-[#8C93A4]'
                      }`}
                    >
                      {dur.note}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preferred Windows */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <label className="block text-xs font-bold text-[#16181D] dark:text-white uppercase tracking-wider">
                    Preferred Date & Time Windows (1 to 3) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
                    Propose convenient options. The Secretariat will book within these windows or allocate the nearest opening.
                  </p>
                </div>

                {preferredWindows.length < 3 && (
                  <button
                    type="button"
                    onClick={handleAddWindow}
                    className="inline-flex items-center gap-1 text-xs text-[#1A3170] dark:text-blue-400 font-bold hover:underline cursor-pointer self-start sm:self-auto"
                  >
                    <span>+ Propose Alternative Window</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {preferredWindows.map((win, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-4 bg-[#FBFAF7] dark:bg-[var(--bg-main)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-xl"
                  >
                    <span className="text-xs font-mono font-bold text-[#1A3170] dark:text-blue-400 w-16">
                      Slot #{idx + 1}
                    </span>

                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#8C93A4]" />
                      <input
                        type="date"
                        value={win.date}
                        onChange={(e) => {
                          const updated = [...preferredWindows];
                          updated[idx].date = e.target.value;
                          setPreferredWindows(updated);
                        }}
                        className="px-3 py-1.5 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-lg text-xs text-[#16181D] dark:text-white cursor-pointer"
                      />
                      {win.date && (
                        <span className="text-[11px] font-semibold px-2 py-1 rounded bg-[#1A3170]/10 text-[#1A3170] dark:text-blue-300 whitespace-nowrap">
                          {(() => {
                            try {
                              const [y, m, d] = win.date.split('-').map(Number);
                              return new Date(y, m - 1, d).toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              });
                            } catch {
                              return '';
                            }
                          })()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#5B6070] dark:text-[var(--text-muted)]">
                      <Clock className="w-4 h-4 text-[#8C93A4]" />
                      <span>From:</span>
                      <input
                        type="time"
                        value={win.from}
                        onChange={(e) => {
                          const updated = [...preferredWindows];
                          updated[idx].from = e.target.value;
                          setPreferredWindows(updated);
                        }}
                        className="px-2 py-1.5 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-lg text-xs text-[#16181D] dark:text-white"
                      />
                      <span>To:</span>
                      <input
                        type="time"
                        value={win.to}
                        onChange={(e) => {
                          const updated = [...preferredWindows];
                          updated[idx].to = e.target.value;
                          setPreferredWindows(updated);
                        }}
                        className="px-2 py-1.5 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-lg text-xs text-[#16181D] dark:text-white"
                      />
                    </div>

                    {preferredWindows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveWindow(idx)}
                        className="text-xs text-red-600 hover:text-red-800 ml-auto inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STAGE 4: Accompanying Delegation Roster */}
        {/* ============================================================== */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white">
                Stage 4 — Delegation Roster & Attendee Credentials
              </h2>
              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                Register all delegates accompanying the primary petitioner. Individual security badges are issued for campus clearance.
              </p>
            </div>

            {/* Primary Petitioner Lead Card */}
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-[#1A3170] text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                  {requesterName.substring(0, 2).toUpperCase() || 'PL'}
                </span>
                <div>
                  <div className="font-bold text-xs text-[#16181D] dark:text-white">
                    {requesterName} (Delegation Lead & Primary Petitioner)
                  </div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
                    {requesterEmail} &bull; {requesterPhone} {requesterOrg ? `&bull; ${requesterOrg}` : ''}
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-blue-100 dark:bg-blue-900/60 text-[#1A3170] dark:text-blue-300 font-semibold text-[10px] uppercase tracking-wider self-start sm:self-auto border border-blue-200">
                Primary Signatory
              </span>
            </div>

            {/* Add Attendee Box */}
            <div className="p-5 rounded-xl border border-[#E4E2DC] dark:border-[var(--border-default)] bg-[#FBFAF7] dark:bg-[var(--bg-main)] space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#16181D] dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
                  Add Accompanying Delegate
                </span>
                <span className="text-[11px] text-[#8C93A4]">Pre-clearance for security pass</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Delegate Full Name *"
                  value={newAttendee.name}
                  onChange={(e) => setNewAttendee({ ...newAttendee, name: e.target.value })}
                  className="px-3 py-2 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white"
                />
                <input
                  type="email"
                  placeholder="Official Email Address"
                  value={newAttendee.email}
                  onChange={(e) => setNewAttendee({ ...newAttendee, email: e.target.value })}
                  className="px-3 py-2 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Organization / Department"
                  value={newAttendee.organization}
                  onChange={(e) => setNewAttendee({ ...newAttendee, organization: e.target.value })}
                  className="px-3 py-2 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1">
                <input
                  type="text"
                  placeholder="Special Clearance / Escort / Accessibility Requirements (Optional)..."
                  value={newAttendee.needs}
                  onChange={(e) => setNewAttendee({ ...newAttendee, needs: e.target.value })}
                  className="w-full sm:w-2/3 px-3 py-2 bg-white dark:bg-[var(--bg-surface)] border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl text-xs text-[#16181D] dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddAttendee}
                  className="w-full sm:w-auto px-4 py-2 bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-2xs whitespace-nowrap"
                >
                  + Add to Delegation
                </button>
              </div>
            </div>

            {/* Attendee Roster */}
            {attendees.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[#8C93A4] px-1">
                  <span>Accompanying Delegates ({attendees.length})</span>
                  <span>Total Party: {totalAttendeeCount} attendees</span>
                </div>
                {attendees.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center p-3.5 bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-xl text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#16181D] dark:text-white">{att.name}</div>
                      <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-0.5">
                        {att.organization && `${att.organization} &bull; `}
                        {att.email || 'Email unlisted'}
                        {att.needs && ` &bull; Needs: ${att.needs}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttendee(idx)}
                      className="text-xs text-red-600 hover:text-red-800 cursor-pointer font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#8C93A4] italic text-center py-3">
                No accompanying delegates registered yet. You may proceed if attending alone.
              </p>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* STAGE 5: Supporting Dossier & Documents */}
        {/* ============================================================== */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white">
                Stage 5 — Supporting Dossier & Briefing Documentation
              </h2>
              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                Attach briefing memos, policy proposals, or statutory records for advance chamber review (Optional).
              </p>
            </div>

            <div className="border-2 border-dashed border-[#D5D2CA] dark:border-[var(--border-default)] rounded-2xl p-8 text-center bg-[#FBFAF7] dark:bg-[var(--bg-main)]">
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.pptx,.jpg,.png"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer block">
                <UploadCloud className="w-10 h-10 text-[#1A3170] dark:text-blue-400 mx-auto mb-2" />
                <span className="text-xs font-bold text-[#1A3170] dark:text-blue-400 hover:underline">
                  Click to browse dossier files from local disk
                </span>
                <p className="text-[11px] text-[#8C93A4] mt-1">
                  Supported formats: PDF, DOCX, XLSX, PPTX, JPG, PNG (Max 5 files, up to 10MB each)
                </p>
              </label>

              <div className="mt-4 pt-3 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setFiles((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        name: 'Briefing_Memo_Strategic_Institutional_Initiative.pdf',
                        size: 2450000,
                      },
                    ]);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-[#1A3170]/30 bg-[#1A3170]/5 dark:bg-blue-950/60 text-[#1A3170] dark:text-blue-300 text-xs font-semibold hover:bg-[#1A3170]/10 transition cursor-pointer"
                >
                  + Attach Sample Briefing Memorandum (PDF)
                </button>
              </div>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C93A4]">
                  Attached Briefing Documents ({files.length}/5)
                </span>
                {files.map((f, idx) => (
                  <div
                    key={f.id}
                    className="flex justify-between items-center p-3.5 bg-white dark:bg-[var(--bg-surface)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
                      <div>
                        <span className="font-semibold text-[#16181D] dark:text-white block">
                          {f.name}
                        </span>
                        <span className="text-[10px] text-[#8C93A4]">{formatFileSize(f.size)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                      className="text-xs text-red-600 hover:text-red-800 cursor-pointer font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* STAGE 6: Review & DPDP Attestation */}
        {/* ============================================================== */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold font-serif text-[#16181D] dark:text-white">
                Stage 6 — Executive Docket Review & Legal Attestation
              </h2>
              <p className="text-xs text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                Carefully inspect your petition details. Upon confirmation, the petition will be permanently registered into the Secretariat ledger.
              </p>
            </div>

            {/* Executive Summary Docket */}
            <div className="bg-[#FBFAF7] dark:bg-[var(--bg-main)] border border-[#E4E2DC] dark:border-[var(--border-default)] rounded-2xl p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#8C93A4]">
                    Docket Preview &bull; Draft Status
                  </span>
                  <div className="font-serif font-bold text-sm text-[#16181D] dark:text-white mt-0.5">
                    Official Audience Petition Docket
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded bg-[#1A3170]/10 text-[#1A3170] dark:text-blue-300 font-mono text-[10px] font-bold">
                  Track 8
                </span>
              </div>

              {/* Row 1: Petitioner */}
              <div className="flex justify-between items-start pb-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8C93A4] block">
                    1. Primary Petitioner Coordinates
                  </span>
                  <div className="font-bold text-[#16181D] dark:text-white mt-0.5">
                    {requesterName}
                  </div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)]">
                    {requesterEmail} &bull; {requesterPhone} {requesterOrg ? `&bull; ${requesterOrg}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-[#1A3170] dark:text-blue-400 font-semibold hover:underline"
                >
                  Edit
                </button>
              </div>

              {/* Row 2: Official */}
              <div className="flex justify-between items-start pb-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8C93A4] block">
                    2. Principal Dignitary / Chamber
                  </span>
                  <div className="font-bold text-[#16181D] dark:text-white mt-0.5">
                    {selectedOfficial?.title} ({selectedOfficial?.fullName})
                  </div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)]">
                    {selectedOfficial?.departmentName}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-[#1A3170] dark:text-blue-400 font-semibold hover:underline"
                >
                  Edit
                </button>
              </div>

              {/* Row 3: Subject & Priority */}
              <div className="flex justify-between items-start pb-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8C93A4] block">
                    3. Subject & Purpose
                  </span>
                  <div className="font-bold text-[#16181D] dark:text-white mt-0.5">{subject}</div>
                  <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-1 line-clamp-2">
                    {description}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold ${PRIORITY_LABELS[priority].badgeClass}`}
                    >
                      {PRIORITY_LABELS[priority].label} Priority &bull; {PRIORITY_LABELS[priority].slaText}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-medium">
                      {meetingMode} &bull; {durationMin} min
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-xs text-[#1A3170] dark:text-blue-400 font-semibold hover:underline"
                >
                  Edit
                </button>
              </div>

              {/* Row 4: Preferred Windows */}
              <div className="flex justify-between items-start pb-3 border-b border-[#EFEDE7] dark:border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8C93A4] block">
                    4. Proposed Windows ({preferredWindows.length})
                  </span>
                  <div className="text-[11px] text-[#16181D] dark:text-white mt-1 space-y-0.5 font-medium">
                    {preferredWindows.map((w, i) => (
                      <div key={i}>
                        Option #{i + 1}: {formatPreferredWindowDisplay(w)}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="text-xs text-[#1A3170] dark:text-blue-400 font-semibold hover:underline"
                >
                  Edit
                </button>
              </div>

              {/* Row 5: Attendees & Dossier */}
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#8C93A4] block">
                    5. Delegation & Supporting Dossier
                  </span>
                  <div className="text-[11px] text-[#5B6070] dark:text-[var(--text-muted)] mt-1">
                    {totalAttendeeCount} delegate(s) total &bull; {files.length} briefing file(s) attached
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="text-xs text-[#1A3170] dark:text-blue-400 font-semibold hover:underline"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* DPDP Notice & Consent (§17.6) */}
            <div className="p-5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1A3170] dark:text-blue-300 uppercase tracking-wider">
                <Shield className="w-4 h-4 text-[#1A3170] dark:text-blue-400" />
                Digital Personal Data Protection (DPDP) Act Compliance Notice (v2026.1)
              </div>
              <p className="text-xs text-blue-900/80 dark:text-blue-200/80 leading-relaxed">
                By submitting this petition, your personal coordinates, delegation roster, and agenda details will be processed exclusively for official scheduling, physical campus security screening, and secretariat record-keeping under CERT-In and DPDP statutory frameworks.
              </p>
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-[#1A3170] focus:ring-[#1A3170] border-[#D5D2CA]"
                />
                <span className="text-xs font-semibold text-[#16181D] dark:text-white">
                  I formally consent to the processing of personal and delegation coordinates under the DPDP Act 2023 for this appointment request. *
                </span>
              </label>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* Wizard Footer Navigation Toolbar */}
        {/* ============================================================== */}
        <div className="flex justify-between items-center pt-6 border-t border-[#EFEDE7] dark:border-[var(--border-subtle)] mt-6">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="h-10 px-5 border border-[#D5D2CA] dark:border-[var(--border-default)] rounded-xl bg-white dark:bg-[var(--bg-main)] text-xs text-[#16181D] dark:text-white hover:bg-[#F7F6F2] transition cursor-pointer font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back: {WIZARD_STEPS[currentStep - 2].shortLabel}</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 6 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="h-10 px-6 border-0 rounded-xl bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-bold transition cursor-pointer shadow-xs inline-flex items-center gap-1.5"
            >
              <span>Next: {WIZARD_STEPS[currentStep].label}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="h-10 px-7 bg-[#1A3170] hover:bg-[#132554] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Shield className="w-4 h-4 text-blue-200" />
              <span>{submitting ? 'Submitting to Secretariat...' : 'Confirm & Submit Official Petition'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
