// AuthPages — Login / Register / ForgotPassword / ResetPassword / VerifyEmail
// Presented at top of the app when there is no logged-in user, or from user-menu links.

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Mail, Lock, User, ShieldCheck, KeyRound, ArrowRight, CheckCircle2, AlertTriangle, Award, Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export default function AuthPages() {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'reset' | 'verify'
  const [devLinks, setDevLinks] = useState(null);

  // Auto-detect verify/reset token in URL (?token=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname.includes('/auth/verify-email') && params.get('token')) {
      setMode('verify');
    } else if (window.location.pathname.includes('/auth/reset-password') && params.get('token')) {
      setMode('reset');
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 grid lg:grid-cols-2">
      {/* Left showcase */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-brand-900 via-brand-700 to-indigo-800 text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-24 opacity-10">
          <Award className="w-[520px] h-[520px]" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-serif">CampusCert Pro</h1>
              <p className="text-xs text-slate-200">Secure certificate automation</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-4xl font-bold font-serif leading-tight">Issue thousands of tamper-proof certificates in minutes.</h2>
          <div className="space-y-3 text-sm">
            {[
              { icon: ShieldCheck, text: 'JWT + refresh rotation, session revocation, brute-force protection' },
              { icon: CheckCircle2, text: 'Bulk generation with drag-and-drop templates & QR verification' },
              { icon: KeyRound, text: 'Multi-org RBAC — invite editors, viewers, admins' }
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="p-1.5 bg-white/15 rounded-lg backdrop-blur"><Icon className="w-4 h-4" /></div>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-300">© 2025 CampusCert Pro · Powered by Node.js · MongoDB · JWT</p>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center p-6 md:p-12 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="p-2 bg-brand-600 text-white rounded-xl"><Award className="w-6 h-6" /></div>
            <h1 className="text-xl font-bold font-serif text-slate-900">CampusCert Pro</h1>
          </div>
          {mode === 'login' && <LoginForm setMode={setMode} setDevLinks={setDevLinks} />}
          {mode === 'register' && <RegisterForm setMode={setMode} setDevLinks={setDevLinks} />}
          {mode === 'forgot' && <ForgotForm setMode={setMode} setDevLinks={setDevLinks} />}
          {mode === 'reset' && <ResetForm setMode={setMode} />}
          {mode === 'verify' && <VerifyForm setMode={setMode} />}
          {devLinks && (
            <div data-testid="auth-dev-links" className="mt-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <p className="font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Dev-mode link (no SendGrid key set)</p>
              <a href={devLinks} className="font-mono underline break-all">{devLinks}</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldError({ children }) {
  if (!children) return null;
  return (
    <div data-testid="auth-error" className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5" /> {children}
    </div>
  );
}

function Field({ icon: Icon, label, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</span>
      <div className="mt-1 relative">
        <Icon className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
        <input
          {...props}
          className="w-full pl-9 pr-3 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
      </div>
    </label>
  );
}

function SubmitBtn({ loading, children, ...props }) {
  return (
    <button
      {...props}
      disabled={loading}
      className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60 transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
      {children}
    </button>
  );
}

function LoginForm({ setMode, setDevLinks }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setDevLinks(null); setErr(''); setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (!res.ok) setErr(res.error);
  };
  return (
    <form data-testid="login-form" onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-2xl font-bold font-serif text-slate-900">Welcome back</h3>
        <p className="text-sm text-slate-500 mt-1">Sign in to your certificate workspace.</p>
      </div>
      <Field icon={Mail} label="Email" type="email" required autoComplete="email"
        data-testid="login-email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field icon={Lock} label="Password" type="password" required autoComplete="current-password"
        data-testid="login-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <FieldError>{err}</FieldError>
      <SubmitBtn data-testid="login-submit" loading={loading} type="submit">Sign in</SubmitBtn>
      <div className="flex justify-between text-xs">
        <button type="button" data-testid="link-forgot" onClick={() => { setDevLinks(null); setMode('forgot'); }} className="text-brand-600 hover:underline font-semibold">Forgot password?</button>
        <button type="button" data-testid="link-register" onClick={() => { setDevLinks(null); setMode('register'); }} className="text-slate-600 hover:text-brand-600 font-semibold">Create an account →</button>
      </div>
    </form>
  );
}

function RegisterForm({ setMode, setDevLinks }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    const res = await register({ name, email, password });
    setLoading(false);
    if (!res.ok) setErr(res.error);
    else if (res.data?.email_verification?.link) setDevLinks(res.data.email_verification.link);
  };
  return (
    <form data-testid="register-form" onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-2xl font-bold font-serif text-slate-900">Create your account</h3>
        <p className="text-sm text-slate-500 mt-1">The very first user becomes the workspace super-admin.</p>
      </div>
      <Field icon={User} label="Full name" type="text" required autoComplete="name"
        data-testid="register-name" value={name} onChange={(e) => setName(e.target.value)} />
      <Field icon={Mail} label="Email" type="email" required autoComplete="email"
        data-testid="register-email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field icon={Lock} label="Password (min 8, letter + digit)" type="password" required autoComplete="new-password"
        data-testid="register-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <FieldError>{err}</FieldError>
      <SubmitBtn data-testid="register-submit" loading={loading} type="submit">Create account</SubmitBtn>
      <button type="button" data-testid="link-login" onClick={() => setMode('login')} className="text-xs text-slate-600 hover:text-brand-600 font-semibold w-full text-center">
        Already have an account? Sign in →
      </button>
    </form>
  );
}

function ForgotForm({ setMode, setDevLinks }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      const res = await axios.post(`${API}/auth/forgot-password`, { email });
      setMsg(res.data.message);
      if (res.data.link) setDevLinks(res.data.link);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed');
    } finally { setLoading(false); }
  };
  return (
    <form data-testid="forgot-form" onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-2xl font-bold font-serif text-slate-900">Reset your password</h3>
        <p className="text-sm text-slate-500 mt-1">We&apos;ll email you a link to set a new password.</p>
      </div>
      <Field icon={Mail} label="Email" type="email" required data-testid="forgot-email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <FieldError>{err}</FieldError>
      {msg && <div data-testid="forgot-success" className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      <SubmitBtn data-testid="forgot-submit" loading={loading} type="submit">Send reset link</SubmitBtn>
      <button type="button" data-testid="link-login-from-forgot" onClick={() => setMode('login')} className="text-xs text-slate-600 hover:text-brand-600 font-semibold w-full text-center">← Back to sign in</button>
    </form>
  );
}

function ResetForm({ setMode }) {
  const [token] = useState(new URLSearchParams(window.location.search).get('token') || '');
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const res = await axios.post(`${API}/auth/reset-password`, { token, new_password: pwd });
      setMsg(res.data.message);
      setTimeout(() => { window.location.href = '/'; setMode('login'); }, 1200);
    } catch (e) { setErr(e.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };
  return (
    <form data-testid="reset-form" onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-2xl font-bold font-serif text-slate-900">Set a new password</h3>
        <p className="text-sm text-slate-500 mt-1">Choose a strong password (min 8 chars, one letter + one digit).</p>
      </div>
      <Field icon={Lock} label="New password" type="password" required data-testid="reset-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
      <FieldError>{err}</FieldError>
      {msg && <div data-testid="reset-success" className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">{msg}</div>}
      <SubmitBtn data-testid="reset-submit" loading={loading} type="submit">Reset password</SubmitBtn>
    </form>
  );
}

function VerifyForm() {
  const [token] = useState(new URLSearchParams(window.location.search).get('token') || '');
  const [status, setStatus] = useState('checking');
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try {
        await axios.post(`${API}/auth/verify-email`, { token });
        setStatus('ok');
        setTimeout(() => { window.location.href = '/'; }, 1500);
      } catch (e) {
        setErr(e.response?.data?.error || 'Verification failed');
        setStatus('err');
      }
    })();
  }, [token]);
  return (
    <div data-testid="verify-view" className="text-center space-y-4 py-8">
      {status === 'checking' && (<><Loader2 className="w-10 h-10 mx-auto text-brand-600 animate-spin" /><p className="text-slate-600">Verifying your email…</p></>)}
      {status === 'ok' && (<><CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" /><h3 className="text-xl font-bold text-slate-900">Email verified!</h3><p className="text-sm text-slate-500">Redirecting…</p></>)}
      {status === 'err' && (<><AlertTriangle className="w-12 h-12 mx-auto text-rose-600" /><h3 className="text-xl font-bold text-slate-900">Verification failed</h3><p className="text-sm text-rose-700">{err}</p></>)}
    </div>
  );
}
