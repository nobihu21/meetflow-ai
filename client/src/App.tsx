import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User
} from 'firebase/auth';
import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  FileAudio,
  Landmark,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCw,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { apiGet, apiJson, uploadMeeting, uploadPaymentProof } from './lib/api';
import { auth, authReady, googleProvider } from './lib/firebase';
import type { ActionItem, ActionStatus, EmailDraft, MeetingDetail, MeetingListItem, PaymentRequest, Priority, Usage } from './types';

type View = 'dashboard' | 'upload' | 'meeting' | 'actions' | 'pro' | 'admin';
const adminEmails = new Set(String(import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

const priorityTone: Record<Priority, string> = {
  high: 'border-red-200 bg-red-50 text-red-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-blue-200 bg-blue-50 text-blue-700'
};

const statusLabels: Record<ActionStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed'
};

const sampleTranscript = `Maaz: We decided to launch the onboarding pilot next Monday.
Ayesha: I will prepare the onboarding checklist by Friday and share it with the team.
Omar: I can draft the customer follow-up email tomorrow.
Maaz: The pricing page must be reviewed before launch.
Ayesha: Who will confirm whether Slack reminders are included?`;

function Waveform() {
  return (
    <svg viewBox="0 0 120 42" className="h-10 w-28 text-cyanFlash" aria-hidden="true">
      {[16, 38, 60, 82, 104].map((x, index) => (
        <rect key={x} className="wave-bar" x={x} y="6" width="10" height="30" rx="5" fill="currentColor" opacity={0.75 + index * 0.04} />
      ))}
    </svg>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  const label = score === null ? 'Pending' : `${score}`;
  const color = score === null ? 'bg-slate-100 text-slate-500' : score >= 80 ? 'bg-emerald-100 text-emerald-700' : score >= 55 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`inline-flex min-w-16 items-center justify-center rounded-full px-3 py-1 text-sm font-bold ${color}`}>{label}</span>;
}

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Authentication failed.';
  if (message.includes('auth/unauthorized-domain')) return 'This domain is not authorized in Firebase Auth. Add localhost and 127.0.0.1 in Firebase Console > Authentication > Settings > Authorized domains.';
  if (message.includes('auth/popup') || message.includes('auth/cancelled-popup-request')) return 'Google sign-in was interrupted. Please try again.';
  if (message.includes('auth/email-already-in-use')) return 'This email already has an account. Switch to Sign in.';
  if (message.includes('auth/weak-password')) return 'Use a stronger password with at least 6 characters.';
  if (message.includes('auth/invalid-credential')) return 'Email or password is incorrect.';
  return message;
}

function AuthScreen({ initialMessage = '' }: { initialMessage?: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialMessage) setMessage(initialMessage);
  }, [initialMessage]);

  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      await authReady;
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setBusy(true);
    setMessage('');
    try {
      await authReady;
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('auth/popup-blocked') || message.includes('auth/popup-closed-by-user') || message.includes('auth/cancelled-popup-request')) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          setMessage(friendlyAuthError(redirectError));
        }
      } else {
        setMessage(friendlyAuthError(error));
      }
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] px-5 py-6 text-slate-900">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-between rounded-[28px] bg-sidebar p-6 text-white shadow-indigo sm:p-8 lg:p-10">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-indigoElectric">
                  <Sparkles size={22} />
                </div>
                <div>
                  <div className="text-xl font-black">MeetFlow AI</div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Meeting intelligence</div>
                </div>
              </div>
              <div className="hidden rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-indigo-100 sm:block">For remote teams</div>
            </div>

            <div className="mt-16 max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-cyan-100 ring-1 ring-white/10">
                <CalendarCheck size={16} /> Turn every meeting into accountable work
              </div>
              <h1 className="text-5xl font-black leading-tight sm:text-6xl lg:text-7xl">Meetings end. Follow-through starts.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-indigo-100">
                Upload a transcript and get assigned actions, decisions, open questions, and a clear meeting score before the context fades.
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ['5/month', 'Free plan for trying real meetings'],
              ['Unlimited', 'Pro processing for active teams'],
              ['2 min', 'From transcript to action board']
            ].map(([metric, label]) => (
              <div key={metric} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="text-2xl font-black text-white">{metric}</div>
                <div className="mt-1 text-sm leading-6 text-indigo-100">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-rows-[auto_1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-indigo sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-sidebar">{mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Start with 5 free processed meetings. Upgrade when your team is ready.</p>
              </div>
              <ShieldCheck className="mt-1 text-emerald-500" size={24} />
            </div>

            <div className="mt-6 grid gap-3">
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-indigoElectric focus:bg-white" placeholder="Work email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-indigoElectric focus:bg-white" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button disabled={busy} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigoElectric px-4 py-3 font-black text-white shadow-indigo transition hover:bg-violetDeep disabled:opacity-60">
                {mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={18} />
              </button>
              <button onClick={googleLogin} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-black text-sidebar transition hover:bg-slate-50">Continue with Google</button>
            </div>

            {message && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
            <button className="mt-5 text-sm font-black text-indigoElectric" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Create a new workspace' : 'Sign in instead'}
            </button>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-indigo">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-sidebar">What your team receives</h3>
                <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-black uppercase text-cyan-700">AI Generated</span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ['Action items', 'Owners, due dates, priority, and source quote.'],
                  ['Decisions', 'Clear record of what the meeting agreed on.'],
                  ['Open questions', 'Unresolved blockers assigned for follow-up.']
                ].map(([title, copy]) => (
                  <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 font-black text-sidebar"><CheckCircle2 size={18} className="text-emerald-500" /> {title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{copy}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-indigo">
              <h3 className="text-lg font-black text-sidebar">Plans</h3>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-sidebar">Free</div>
                    <div className="font-black text-slate-500">$0</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">5 meetings/month, transcript upload, action extraction, dashboard history.</p>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-sidebar">Pro</div>
                    <div className="font-black text-indigoElectric">$12/mo</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Unlimited meetings, audio transcription, editable action board, priority processing, email drafts.</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm font-bold text-slate-600">
                <div className="flex items-center gap-2"><Mail size={16} className="text-cyanFlash" /> Email-ready</div>
                <div className="flex items-center gap-2"><BarChart3 size={16} className="text-indigoElectric" /> Score tracking</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Sidebar({ view, setView, signOut, isAdmin }: { view: View; setView: (view: View) => void; signOut: () => void; isAdmin: boolean }) {
  const nav = [
    { view: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { view: 'upload' as const, label: 'New Meeting', icon: UploadCloud },
    { view: 'actions' as const, label: 'Actions', icon: ListChecks },
    { view: 'pro' as const, label: 'Billing', icon: Sparkles },
    ...(isAdmin ? [{ view: 'admin' as const, label: 'Admin', icon: ShieldCheck }] : [])
  ];
  return (
    <aside className="flex bg-sidebar text-white lg:min-h-screen lg:w-72 lg:flex-col">
      <div className="hidden p-6 lg:block">
        <div className="text-2xl font-black">MeetFlow AI</div>
        <div className="mt-2 text-sm text-indigo-200">Production workspace</div>
      </div>
      <nav className="flex w-full gap-2 overflow-x-auto p-3 lg:flex-col lg:p-4">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button key={item.view} onClick={() => setView(item.view)} className={`flex min-w-fit items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${active ? 'bg-indigoElectric text-white' : 'text-indigo-100 hover:bg-white/10'}`}>
              <Icon size={18} /> {item.label}
            </button>
          );
        })}
      </nav>
      <button onClick={signOut} className="m-3 ml-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-indigo-100 hover:bg-white/10 lg:mt-auto">
        <LogOut size={18} /> Sign out
      </button>
    </aside>
  );
}

function Dashboard({ openMeeting, setView }: { openMeeting: (id: string) => void; setView: (view: View) => void }) {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await apiGet<{ data: MeetingListItem[] }>(`/api/meetings?search=${encodeURIComponent(search)}`);
      setMeetings(result.data);
      const usageResult = await apiGet<Usage>('/api/usage');
      setUsage(usageResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load meetings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const completedMeetings = meetings.filter((meeting) => meeting.status === 'completed').length;
  const averageScore = meetings.length
    ? Math.round(meetings.reduce((sum, meeting) => sum + (meeting.meeting_score || 0), 0) / meetings.length)
    : null;

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black text-sidebar">Meeting command center</h1>
          <p className="mt-1 text-slate-500">Upload meetings, review outputs, and track follow-through from one place.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setView('upload')} className="flex items-center gap-2 rounded-xl bg-indigoElectric px-4 py-3 font-black text-white shadow-indigo">
            <UploadCloud size={18} /> New meeting
          </button>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-indigo">
            <Search className="ml-2 mt-3 text-slate-400" size={18} />
            <input className="min-w-0 px-3 py-2 outline-none" placeholder="Search meetings" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} />
            <button onClick={load} className="rounded-lg bg-slate-100 px-3 py-2 font-bold text-sidebar">Search</button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ['Meetings processed', completedMeetings.toString(), 'Completed records in this workspace'],
          ['Average score', averageScore === null ? '-' : `${averageScore}`, 'Clarity and accountability rating'],
          ['Plan usage', usage ? `${usage.used}/${usage.limit}` : `${Math.min(meetings.length, 5)}/5`, usage ? `${usage.remaining} free meetings remaining` : 'Free meetings used this month']
        ].map(([label, value, help]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-indigo">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-sidebar">{value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{help}</p>
          </div>
        ))}
      </div>

      {loading && <div className="mt-10 flex items-center gap-4 rounded-2xl bg-white p-6 shadow-indigo"><Waveform /> Processing your view...</div>}
      {error && <div className="mt-6 rounded-2xl bg-red-50 p-4 text-red-700">{error}</div>}
      {!loading && meetings.length === 0 && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-indigo">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black text-sidebar">Start with one transcript</h2>
            <p className="mt-3 leading-7 text-slate-600">Paste a meeting transcript or upload a `.txt` file. MeetFlow will create actions, decisions, questions, and a score, then save everything here.</p>
            <button onClick={() => setView('upload')} className="mt-5 rounded-xl bg-indigoElectric px-5 py-3 font-black text-white shadow-indigo">Create first meeting</button>
          </div>
        </div>
      )}
      <div className="mt-6 grid gap-4">
        {meetings.map((meeting) => (
          <button key={meeting.id} onClick={() => openMeeting(meeting.id)} className="rounded-2xl bg-white p-5 text-left shadow-indigo transition hover:-translate-y-0.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-sidebar">{meeting.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{new Date(meeting.created_at).toLocaleString()}</p>
              </div>
              <ScoreBadge score={meeting.meeting_score} />
            </div>
            <p className="mt-4 text-sm font-bold capitalize text-indigoElectric">{meeting.status}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function UploadMeeting({ openMeeting }: { openMeeting: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [transcript, setTranscript] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('title', title);
    form.set('participants', participants);
    form.set('transcript', transcript);
    if (file) form.set('file', file);

    try {
      const result = await uploadMeeting(form);
      openMeeting(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process meeting.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="rounded-2xl bg-sidebar p-6 text-white shadow-indigo">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h1 className="text-3xl font-black">Process a meeting</h1>
            <p className="mt-2 max-w-3xl text-indigo-100">Give MeetFlow the raw meeting text. The app extracts what matters and sends you straight to the editable result page.</p>
          </div>
          <div className="flex gap-2 text-xs font-black uppercase text-indigo-100">
            <span className="rounded-full bg-white/10 px-3 py-2">1 Upload</span>
            <span className="rounded-full bg-white/10 px-3 py-2">2 Review</span>
            <span className="rounded-full bg-white/10 px-3 py-2">3 Track</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-indigo">
          <label className="text-sm font-black text-sidebar">Meeting title</label>
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-indigoElectric focus:bg-white" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter meeting title" />
          <label className="mt-5 block text-sm font-black text-sidebar">Participants</label>
          <input className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-indigoElectric focus:bg-white" value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="Add names or emails separated by commas" />
          <label className="mt-5 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-8 text-center transition hover:border-indigoElectric hover:bg-indigo-100">
            <FileAudio className="text-indigoElectric" size={34} />
            <span className="mt-3 font-black text-sidebar">{file ? file.name : 'Upload .txt or audio file'}</span>
            <span className="mt-1 text-sm leading-6 text-slate-500">Text works on every plan. Audio transcription is available when storage/transcription is configured.</span>
            <input className="hidden" type="file" accept=".mp3,.m4a,.webm,.wav,.txt,audio/*,text/plain" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          {busy && <div className="mt-5 flex items-center gap-4 rounded-2xl border-l-4 border-cyanFlash bg-cyan-50 p-4 font-bold text-cyan-900"><Waveform /> Processing with AI</div>}
          {error && <div className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}
          <button disabled={busy || !title || (!transcript && !file)} onClick={submit} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigoElectric px-4 py-3 font-black text-white shadow-indigo disabled:opacity-50">
            Process meeting <Sparkles size={18} />
          </button>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Tip: best results come from transcripts that include speaker names and clear discussion context.
          </div>
          <button
            type="button"
            onClick={() => {
              setTitle('Customer onboarding pilot sync');
              setParticipants('Maaz, Ayesha, Omar');
              setTranscript(sampleTranscript);
            }}
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-black text-sidebar transition hover:bg-slate-50"
          >
            Use sample transcript
          </button>
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="font-black text-sidebar">Transcript</label>
            <span className="text-sm font-bold text-slate-500">{transcript.length} characters</span>
          </div>
          <textarea className="min-h-[32rem] w-full rounded-2xl border border-slate-200 bg-white p-5 leading-7 shadow-indigo outline-none focus:border-indigoElectric" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste your meeting transcript here. Use the sample button only if you want to test the AI flow." />
        </div>
      </div>
    </section>
  );
}

function ActionEditor({ action, onSaved }: { action: ActionItem; onSaved: (action: ActionItem) => void }) {
  const [draft, setDraft] = useState(action);
  const [saving, setSaving] = useState(false);

  async function save(next: Partial<ActionItem>) {
    const updated = { ...draft, ...next };
    setDraft(updated);
    setSaving(true);
    const saved = await apiJson<ActionItem>(`/api/actions/${action.id}`, 'PUT', {
      owner_name: updated.owner_name,
      due_date: updated.due_date,
      priority: updated.priority,
      status: updated.status
    });
    setSaving(false);
    onSaved(saved);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-indigo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl font-bold text-sidebar">{draft.description}</p>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${priorityTone[draft.priority]}`}>{draft.priority}</span>
      </div>
      {draft.source_quote && <p className="mt-3 border-l-4 border-cyanFlash pl-3 text-sm text-slate-500">Source: "{draft.source_quote}"</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <input className="rounded-xl border border-slate-200 px-3 py-2" value={draft.owner_name || ''} placeholder="Owner" onChange={(event) => setDraft({ ...draft, owner_name: event.target.value })} onBlur={() => save({ owner_name: draft.owner_name })} />
        <input className="rounded-xl border border-slate-200 px-3 py-2" type="date" value={draft.due_date || ''} onChange={(event) => save({ due_date: event.target.value || null })} />
        <select className="rounded-xl border border-slate-200 px-3 py-2" value={draft.priority} onChange={(event) => save({ priority: event.target.value as Priority })}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="rounded-xl border border-slate-200 px-3 py-2" value={draft.status} onChange={(event) => save({ status: event.target.value as ActionStatus })}>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      {saving && <p className="mt-2 text-xs font-bold text-indigoElectric">Saving...</p>}
    </div>
  );
}

function MeetingView({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [tab, setTab] = useState<'actions' | 'decisions' | 'questions' | 'summary'>('actions');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    setError('');
    setNotFound(false);
    setMeeting(null);
    apiGet<MeetingDetail>(`/api/meetings/${meetingId}`)
      .then(setMeeting)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Meeting could not be loaded.';
        if (message.toLowerCase().includes('not found')) {
          setNotFound(true);
          return;
        }
        setError(message);
      });
  }, [meetingId]);

  function replaceAction(action: ActionItem) {
    if (!meeting) return;
    setMeeting({ ...meeting, action_items: meeting.action_items.map((item) => item.id === action.id ? action : item) });
  }

  async function refreshMeeting() {
    const latest = await apiGet<MeetingDetail>(`/api/meetings/${meetingId}`);
    setMeeting(latest);
  }

  async function retryMeeting() {
    setBusyAction('retry');
    setError('');
    try {
      await apiJson(`/api/meetings/${meetingId}/retry`, 'POST');
      await refreshMeeting();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setBusyAction('');
    }
  }

  async function deleteMeeting() {
    const ok = window.confirm('Delete this meeting and all extracted actions?');
    if (!ok) return;
    setBusyAction('delete');
    try {
      await apiJson(`/api/meetings/${meetingId}`, 'DELETE');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyAction('');
    }
  }

  async function createEmailDraft() {
    setDraftLoading(true);
    setError('');
    try {
      const draft = await apiJson<EmailDraft>(`/api/meetings/${meetingId}/email-draft`, 'POST');
      setEmailDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create email draft.');
    } finally {
      setDraftLoading(false);
    }
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-indigo">
        <h1 className="text-2xl font-black text-sidebar">Meeting not found</h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">This meeting may have been deleted or belongs to another workspace. Go back to the dashboard and select an available meeting.</p>
        <button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-indigoElectric px-5 py-3 font-black text-white shadow-indigo">Back to dashboard</button>
      </div>
    );
  }
  if (error) return <div className="rounded-2xl bg-red-50 p-4 text-red-700">{error}</div>;
  if (!meeting) return <div className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-indigo"><Waveform /> Loading meeting...</div>;

  const tabs = [
    ['actions', `Actions (${meeting.action_items.length})`],
    ['decisions', `Decisions (${meeting.decisions.length})`],
    ['questions', `Questions (${meeting.open_questions.length})`],
    ['summary', 'Summary']
  ] as const;

  return (
    <section>
      <div className="rounded-2xl bg-sidebar p-6 text-white shadow-indigo">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">{meeting.title}</h1>
            <p className="mt-1 text-indigo-100">{new Date(meeting.created_at).toLocaleString()}</p>
          </div>
          <div className="rounded-2xl bg-white p-3">
            <ScoreBadge score={meeting.meeting_score} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={createEmailDraft} disabled={draftLoading} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-black text-sidebar disabled:opacity-60">
            <Mail size={17} /> {draftLoading ? 'Drafting...' : 'Draft follow-up email'}
          </button>
          {meeting.status === 'failed' && (
            <button onClick={retryMeeting} disabled={busyAction === 'retry'} className="flex items-center gap-2 rounded-xl bg-amber-100 px-4 py-2 font-black text-amber-900 disabled:opacity-60">
              <RefreshCw size={17} /> Retry processing
            </button>
          )}
          <button onClick={deleteMeeting} disabled={busyAction === 'delete'} className="flex items-center gap-2 rounded-xl bg-red-100 px-4 py-2 font-black text-red-700 disabled:opacity-60">
            <Trash2 size={17} /> Delete
          </button>
        </div>
      </div>
      {emailDraft && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-indigo">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-sidebar">Follow-up email draft</h2>
              <p className="mt-1 text-sm text-slate-500">Review before sending from your email client.</p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`)}
              className="rounded-xl bg-indigoElectric px-4 py-2 font-black text-white"
            >
              Copy
            </button>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="font-black text-sidebar">{emailDraft.subject}</p>
            <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">{emailDraft.body}</p>
          </div>
        </div>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ['Actions', meeting.action_items.length],
          ['Decisions', meeting.decisions.length],
          ['Questions', meeting.open_questions.length],
          ['Participants', meeting.participants?.length || 0]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-indigo">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-sidebar">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-sidebar">Review meeting outputs</h2>
          <p className="mt-1 text-slate-500">Edit owners, deadlines, and status before tracking work.</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-indigo">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`min-w-fit rounded-xl px-4 py-2 font-bold ${tab === id ? 'bg-indigoElectric text-white' : 'text-slate-500 hover:bg-coolSlate'}`}>{label}</button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="mt-6">
          {tab === 'actions' && <div className="grid gap-4">{meeting.action_items.map((action) => <ActionEditor key={action.id} action={action} onSaved={replaceAction} />)}</div>}
          {tab === 'decisions' && <div className="grid gap-4">{meeting.decisions.map((decision) => <div key={decision.id} className="border-l-4 border-cyanFlash rounded-2xl bg-white p-5 shadow-indigo"><div className="text-xs font-black uppercase text-cyan-700">Decision</div><p className="mt-2 font-bold text-sidebar">{decision.description}</p><p className="mt-2 text-sm text-slate-500">Made by {decision.made_by || 'Unknown'}</p></div>)}</div>}
          {tab === 'questions' && <div className="grid gap-4">{meeting.open_questions.map((question) => <div key={question.id} className="border-l-4 border-cyanFlash rounded-2xl bg-white p-5 shadow-indigo"><div className="text-xs font-black uppercase text-cyan-700">Open question</div><p className="mt-2 font-bold text-sidebar">{question.question}</p><p className="mt-2 text-sm text-slate-500">Assigned to {question.assigned_to || 'Unassigned'}</p></div>)}</div>}
          {tab === 'summary' && <div className="rounded-2xl border-l-4 border-cyanFlash bg-white p-6 shadow-indigo"><div className="text-xs font-black uppercase text-cyan-700">Summary</div><p className="mt-3 leading-8 text-slate-700">{meeting.summary || 'No summary was generated for this meeting.'}</p></div>}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function ActionsBoard() {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [owner, setOwner] = useState('');

  useEffect(() => {
    apiGet<{ data: MeetingListItem[] }>('/api/meetings?limit=50').then(async (result) => {
      setMeetings(result.data);
      const detailResults = await Promise.allSettled(result.data.map((meeting) => apiGet<MeetingDetail>(`/api/meetings/${meeting.id}`)));
      const details = detailResults
        .filter((item): item is PromiseFulfilledResult<MeetingDetail> => item.status === 'fulfilled')
        .map((item) => item.value);
      setActions(details.flatMap((meeting) => meeting.action_items));
    }).catch(() => setActions([]));
  }, []);

  const owners = useMemo(() => Array.from(new Set(actions.map((action) => action.owner_name).filter(Boolean))) as string[], [actions]);
  const filtered = owner ? actions.filter((action) => action.owner_name === owner) : actions;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-sidebar">Action board</h1>
          <p className="mt-1 text-slate-500">Track every assigned follow-up across your meetings.</p>
        </div>
        <select className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-indigo" value={owner} onChange={(event) => setOwner(event.target.value)}>
          <option value="">All owners</option>
          {owners.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {actions.length === 0 && (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-indigo">
          <h2 className="text-2xl font-black text-sidebar">No action items yet</h2>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">Once you process a meeting, assigned work appears here by status. Use this board as the daily follow-up list for owners and deadlines.</p>
        </div>
      )}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {(Object.keys(statusLabels) as ActionStatus[]).map((status) => (
          <div key={status} className="rounded-2xl bg-white p-4 shadow-indigo">
            <h2 className="flex items-center gap-2 font-black text-sidebar"><CheckCircle2 size={18} /> {statusLabels[status]}</h2>
            <div className="mt-4 grid gap-3">
              {filtered.filter((action) => action.status === status).map((action) => (
                <div key={action.id} className="rounded-xl border border-slate-100 p-4">
                  <p className="font-bold text-sidebar">{action.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <span className={`rounded-full border px-2 py-1 ${priorityTone[action.priority]}`}>{action.priority}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{action.owner_name || 'Unknown'}</span>
                  </div>
                </div>
              ))}
              {filtered.filter((action) => action.status === status).length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No items in this stage.</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BillingPage() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentRequest['payment_method']>('bank_transfer');
  const [billingCycle, setBillingCycle] = useState<PaymentRequest['billing_cycle']>('monthly');
  const [senderName, setSenderName] = useState('');
  const [senderAccount, setSenderAccount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const amount = billingCycle === 'monthly' ? 3500 : 35000;

  async function loadRequests() {
    const result = await apiGet<{ data: PaymentRequest[] }>('/api/payment-requests');
    setRequests(result.data);
  }

  useEffect(() => {
    void loadRequests().catch((err) => setMessage(err instanceof Error ? err.message : 'Could not load payments.'));
  }, []);

  async function submitPayment() {
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData();
      form.set('plan', 'pro');
      form.set('billing_cycle', billingCycle);
      form.set('payment_method', paymentMethod);
      form.set('amount', String(amount));
      form.set('currency', 'PKR');
      form.set('sender_name', senderName);
      form.set('sender_account', senderAccount);
      form.set('transaction_id', transactionId);
      form.set('paid_at', paidAt);
      form.set('notes', notes);
      if (proof) form.set('proof', proof);

      await uploadPaymentProof<PaymentRequest>(form);
      setMessage('Payment proof submitted. We will verify it against the bank statement before activating Pro.');
      setSenderName('');
      setSenderAccount('');
      setTransactionId('');
      setNotes('');
      setProof(null);
      await loadRequests();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not submit payment proof.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_0.78fr]">
      <div>
        <div className="rounded-3xl bg-sidebar p-7 text-white shadow-indigo">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-100">Billing</p>
              <h1 className="mt-2 text-3xl font-black">Upgrade to MeetFlow Pro</h1>
              <p className="mt-3 max-w-2xl leading-7 text-indigo-100">Manual verification keeps checkout simple for Pakistan while protecting plan activation from fake screenshots and frontend tampering.</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
              <p className="text-sm text-indigo-100">Selected price</p>
              <p className="mt-1 text-3xl font-black">PKR {amount.toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              ['Unlimited meetings', 'No 5 meeting cap after approval'],
              ['Email drafts', 'Follow-up emails from Gemini'],
              ['Priority processing', 'Best for active teams']
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
                <p className="font-black">{title}</p>
                <p className="mt-2 text-sm leading-6 text-indigo-100">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <button onClick={() => setBillingCycle('monthly')} className={`rounded-2xl border p-5 text-left shadow-indigo ${billingCycle === 'monthly' ? 'border-indigoElectric bg-white' : 'border-slate-200 bg-white/70'}`}>
            <p className="text-sm font-bold text-slate-500">Monthly</p>
            <p className="mt-2 text-3xl font-black text-sidebar">PKR 3,500</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Good for first customers and testing demand.</p>
          </button>
          <button onClick={() => setBillingCycle('yearly')} className={`rounded-2xl border p-5 text-left shadow-indigo ${billingCycle === 'yearly' ? 'border-indigoElectric bg-white' : 'border-slate-200 bg-white/70'}`}>
            <p className="text-sm font-bold text-slate-500">Yearly</p>
            <p className="mt-2 text-3xl font-black text-sidebar">PKR 35,000</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">Two months free for committed teams.</p>
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-cyan-100 bg-white p-6 shadow-indigo">
          <h2 className="flex items-center gap-2 text-xl font-black text-sidebar"><LockKeyhole size={20} /> Fraud-safe verification flow</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ['1', 'User transfers payment to official account only.'],
              ['2', 'User submits transaction ID, sender details, and optional proof.'],
              ['3', 'Admin verifies against bank/wallet statement, then Pro activates.']
            ].map(([step, text]) => (
              <div key={step} className="rounded-xl bg-coolSlate p-4 text-sm font-bold leading-6 text-violetDeep">
                <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-indigoElectric text-white">{step}</span>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-indigo">
        <h2 className="flex items-center gap-2 text-2xl font-black text-sidebar"><ReceiptText size={22} /> Submit payment proof</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Bank details will appear here after you add the official account. Until then this form safely records verification requests.</p>

        <div className="mt-5 rounded-2xl bg-coolSlate p-4">
          <p className="text-sm font-black text-sidebar">Official payment channels</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Bank transfer: account pending setup</p>
          <p className="text-sm leading-6 text-slate-600">JazzCash / EasyPaisa: merchant or business number pending setup</p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ['bank_transfer', Landmark, 'Bank'],
            ['jazzcash', CreditCard, 'JazzCash'],
            ['easypaisa', CreditCard, 'EasyPaisa']
          ].map(([value, Icon, label]) => (
            <button key={String(value)} onClick={() => setPaymentMethod(value as PaymentRequest['payment_method'])} className={`rounded-xl border px-3 py-3 text-sm font-black ${paymentMethod === value ? 'border-indigoElectric bg-indigoElectric text-white' : 'border-slate-200 bg-white text-sidebar'}`}>
              <Icon className="mx-auto mb-1" size={18} /> {label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3">
          <input className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigoElectric" placeholder="Sender name" value={senderName} onChange={(event) => setSenderName(event.target.value)} />
          <input className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigoElectric" placeholder="Sender bank/account/mobile number" value={senderAccount} onChange={(event) => setSenderAccount(event.target.value)} />
          <input className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigoElectric" placeholder="Transaction ID / reference number" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} />
          <input className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigoElectric" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
          <textarea className="min-h-24 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-indigoElectric" placeholder="Optional note" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <label className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-600">
            <UploadCloud className="mb-2" size={20} />
            {proof ? proof.name : 'Upload screenshot or PDF proof (optional)'}
            <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setProof(event.target.files?.[0] || null)} />
          </label>
        </div>

        <button disabled={busy} onClick={submitPayment} className="mt-4 w-full rounded-xl bg-indigoElectric px-4 py-3 font-black text-white disabled:opacity-60">
          {busy ? 'Submitting...' : 'Submit for verification'}
        </button>
        {message && <p className="mt-4 rounded-xl bg-coolSlate p-3 text-sm font-bold text-violetDeep">{message}</p>}

        <div className="mt-6">
          <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Your requests</h3>
          <div className="mt-3 grid gap-3">
            {requests.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No payment proofs submitted yet.</p>}
            {requests.map((request) => (
              <div key={request.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-sidebar">PKR {Number(request.amount).toLocaleString()}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${request.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{request.status.replace('_', ' ')}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{request.payment_method.replace('_', ' ')} · Ref {request.transaction_id}</p>
                {request.verification_note && <p className="mt-2 text-sm font-bold text-slate-600">{request.verification_note}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminPayments() {
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const result = await apiGet<{ data: PaymentRequest[] }>('/api/admin/payment-requests');
    setRequests(result.data);
  }

  useEffect(() => {
    void load().catch((err) => setMessage(err instanceof Error ? err.message : 'Could not load admin payments.'));
  }, []);

  async function review(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setMessage('');
    try {
      await apiJson(`/api/admin/payment-requests/${id}/${action}`, 'POST', {
        note: action === 'approve' ? 'Payment verified against statement.' : 'Payment could not be verified.'
      });
      await load();
      setMessage(action === 'approve' ? 'Payment approved and Pro activated.' : 'Payment rejected.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black text-sidebar">Payment verification</h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">Approve only after matching transaction ID, sender name, amount, and date against your bank or wallet statement.</p>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 font-black text-sidebar shadow-indigo">
          <RefreshCw size={18} /> Refresh
        </button>
      </div>
      {message && <p className="mt-5 rounded-xl bg-coolSlate p-4 text-sm font-bold text-violetDeep">{message}</p>}
      <div className="mt-6 grid gap-4">
        {requests.length === 0 && <p className="rounded-2xl bg-white p-6 text-slate-500 shadow-indigo">No payment requests yet.</p>}
        {requests.map((request) => (
          <div key={request.id} className="rounded-2xl bg-white p-5 shadow-indigo">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-sidebar">PKR {Number(request.amount).toLocaleString()}</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${request.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : request.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{request.status.replace('_', ' ')}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{request.user_email || request.user_id} · {request.payment_method.replace('_', ' ')} · {request.billing_cycle}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={busyId === request.id || request.status === 'approved'} onClick={() => void review(request.id, 'approve')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Approve</button>
                <button disabled={busyId === request.id || request.status === 'rejected'} onClick={() => void review(request.id, 'reject')} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Reject</button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><b>Sender</b><br />{request.sender_name}</div>
              <div className="rounded-xl bg-slate-50 p-3"><b>Account</b><br />{request.sender_account}</div>
              <div className="rounded-xl bg-slate-50 p-3"><b>Reference</b><br />{request.transaction_id}</div>
              <div className="rounded-xl bg-slate-50 p-3"><b>Paid at</b><br />{request.paid_at}</div>
            </div>
            {request.notes && <p className="mt-3 rounded-xl bg-coolSlate p-3 text-sm text-violetDeep">{request.notes}</p>}
            {request.proof_file_name && <p className="mt-3 text-sm font-bold text-slate-500">Proof file: {request.proof_file_name}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState('');
  const [view, setView] = useState<View>('dashboard');
  const [meetingId, setMeetingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void authReady
      .then(() => getRedirectResult(auth))
      .catch((error) => {
        if (mounted) setAuthMessage(friendlyAuthError(error));
      });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!mounted) return;
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.removeItem('meetflow-demo-session');
  }, []);

  if (authLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F8FAFC] p-6">
        <div className="rounded-3xl bg-white p-8 text-center shadow-indigo">
          <Waveform />
          <p className="mt-4 font-black text-sidebar">Checking your session...</p>
        </div>
      </main>
    );
  }

  if (!user) return <AuthScreen initialMessage={authMessage} />;
  const isAdmin = Boolean(user.email && adminEmails.has(user.email.toLowerCase()));

  function openMeeting(id: string) {
    setMeetingId(id);
    setView('meeting');
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] lg:flex">
      <Sidebar
        view={view}
        setView={setView}
        isAdmin={isAdmin}
        signOut={() => {
          void signOut(auth);
        }}
      />
      <main className="w-full p-5 sm:p-8">
        {view === 'dashboard' && <Dashboard openMeeting={openMeeting} setView={setView} />}
        {view === 'upload' && <UploadMeeting openMeeting={openMeeting} />}
        {view === 'meeting' && meetingId && <MeetingView meetingId={meetingId} />}
        {view === 'actions' && <ActionsBoard />}
        {view === 'pro' && <BillingPage />}
        {view === 'admin' && isAdmin && <AdminPayments />}
      </main>
    </div>
  );
}
