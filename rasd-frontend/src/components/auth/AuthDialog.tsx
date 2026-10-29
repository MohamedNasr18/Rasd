'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import {
  useGetAuthConfigQuery,
  useGoogleSignInMutation,
  useLoginMutation,
  useResendOtpMutation,
  useSignupMutation,
  useVerifyOtpMutation,
} from '@/store/api';
import type { AuthSessionResponse } from '@/types';

export type AuthMode = 'login' | 'signup' | 'otp';

interface Props {
  initialMode: AuthMode;
  onClose: () => void;
  onAuthenticated: (result: AuthSessionResponse) => void;
}

interface ApiErrorLike {
  status?: string | number;
  data?: {
    code?: string;
    message?: string;
    email?: string;
    attemptsRemaining?: number;
    retryAfterSeconds?: number;
  };
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gsiPromise: Promise<void> | null = null;
let gsiLocale: 'ar' | 'en' | null = null;

function resetGoogleScript() {
  document.querySelector<HTMLScriptElement>('script[data-rasd-gsi]')?.remove();
  delete window.google;
  gsiPromise = null;
  gsiLocale = null;
}

function loadGoogleScript(locale: 'ar' | 'en'): Promise<void> {
  if (gsiLocale !== locale) resetGoogleScript();
  if (window.google?.accounts?.id) {
    gsiLocale = locale;
    return Promise.resolve();
  }
  if (gsiPromise) return gsiPromise;
  gsiLocale = locale;
  gsiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://accounts.google.com/gsi/client?hl=${locale}`;
    script.async = true;
    script.defer = true;
    script.dataset.rasdGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      gsiPromise = null;
      gsiLocale = null;
      reject(new Error('gsi load failed'));
    };
    document.head.appendChild(script);
  });
  return gsiPromise;
}

export default function AuthDialog({ initialMode, onClose, onAuthenticated }: Props) {
  const { locale, dir, dict } = useI18n();
  const copy = dict.auth;

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [googleError, setGoogleError] = useState(false);
  const googleSlot = useRef<HTMLDivElement | null>(null);

  const [signup, { isLoading: signingUp }] = useSignupMutation();
  const [login, { isLoading: loggingIn }] = useLoginMutation();
  const [verifyOtp, { isLoading: verifying }] = useVerifyOtpMutation();
  const [resendOtp, { isLoading: resending }] = useResendOtpMutation();
  const [googleSignIn, { isLoading: googleLoading }] = useGoogleSignInMutation();
  const { data: config } = useGetAuthConfigQuery();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const messageForError = useCallback(
    (err: unknown): { text: string; code?: string; email?: string } => {
      const failure = err as ApiErrorLike;
      const code = failure.data?.code;
      const data = failure.data;
      switch (code) {
        case 'EMAIL_IN_USE':
          return { text: copy.errors.emailInUse, code };
        case 'EMAIL_NOT_VERIFIED':
          return { text: copy.errors.emailNotVerified, code, email: data?.email };
        case 'INVALID_CREDENTIALS':
          return { text: copy.errors.invalidCredentials, code };
        case 'INVALID_CODE':
          return { text: copy.errors.invalidCode(data?.attemptsRemaining), code };
        case 'OTP_EXPIRED':
          return { text: copy.errors.otpExpired, code };
        case 'TOO_MANY_ATTEMPTS':
          return { text: copy.errors.tooManyAttempts, code };
        case 'RESEND_COOLDOWN':
          return { text: copy.errors.resendCooldown, code };
        case 'RATE_LIMITED':
          return { text: copy.errors.rateLimited, code };
        case 'EMAIL_DELIVERY_FAILED':
          return { text: copy.errors.delivery, code };
        case 'GOOGLE_NOT_CONFIGURED':
          return { text: copy.googleUnavailable, code };
        case 'GOOGLE_TOKEN_INVALID':
        case 'GOOGLE_EMAIL_UNVERIFIED':
        case 'ACCOUNT_LINK_CONFLICT':
          return { text: copy.errors.google, code };
        default:
          break;
      }
      if (failure.status === 'FETCH_ERROR') return { text: copy.errors.network };
      if (failure.status === 400) return { text: copy.errors.validation };
      return { text: data?.message ?? copy.errors.fallback };
    },
    [copy],
  );

  const finish = useCallback(
    (result: AuthSessionResponse) => {
      setPassword('');
      setOtp('');
      onAuthenticated(result);
    },
    [onAuthenticated],
  );

  const goToOtp = useCallback(
    (targetEmail: string, cooldownSeconds = 60) => {
      setEmail(targetEmail);
      setMode('otp');
      setCooldown(cooldownSeconds);
      setOtp('');
    },
    [],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    try {
      if (mode === 'login') {
        finish(await login({ email: email.trim(), password }).unwrap());
        return;
      }
      if (mode === 'signup') {
        const res = await signup({
          name: name.trim(),
          email: email.trim(),
          password,
        }).unwrap();
        goToOtp(res.email, res.resendCooldownSeconds);
        return;
      }
      finish(await verifyOtp({ email: email.trim(), code: otp }).unwrap());
    } catch (err) {
      const mapped = messageForError(err);
      if (mapped.code === 'EMAIL_NOT_VERIFIED' && mapped.email) {
        goToOtp(mapped.email);
        setNotice(mapped.text);
        return;
      }
      setError(mapped.text);
    }
  }

  async function onResend() {
    setError(null);
    setNotice(null);
    try {
      const res = await resendOtp({ email: email.trim() }).unwrap();
      setCooldown(res.resendCooldownSeconds);
      setNotice(copy.otpResent);
    } catch (err) {
      const mapped = messageForError(err);
      const failure = err as ApiErrorLike;
      if (failure.data?.retryAfterSeconds) setCooldown(failure.data.retryAfterSeconds);
      setError(mapped.text);
    }
  }

  const onGoogleCredential = useCallback(
    async (response: { credential: string }) => {
      setError(null);
      try {
        finish(await googleSignIn({ idToken: response.credential }).unwrap());
      } catch (err) {
        setError(messageForError(err).text);
      }
    },
    [finish, googleSignIn, messageForError],
  );

  useEffect(() => {
    if (!config?.googleClientId || !googleSlot.current) return;
    let cancelled = false;
    const slot = googleSlot.current;

    loadGoogleScript(locale === 'ar' ? 'ar' : 'en')
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId!,
          callback: (response) => void onGoogleCredential(response),
        });
        slot.innerHTML = '';
        window.google.accounts.id.renderButton(slot, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          locale: locale === 'ar' ? 'ar' : 'en',
          width: 344,
        });
      })
      .catch(() => setGoogleError(true));

    return () => {
      cancelled = true;
    };
  }, [config?.googleClientId, onGoogleCredential, locale]);

  const heading = useMemo(() => {
    if (mode === 'otp') return copy.otpTitle;
    return mode === 'signup' ? copy.signupTitle : copy.loginTitle;
  }, [mode, copy]);

  const busy = signingUp || loggingIn || verifying || googleLoading;

  return (
    <div
      className="modal-overlay fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-container-lowest)' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div>
            <h2
              id="auth-dialog-title"
              className="text-lg font-bold tracking-tight"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {heading}
            </h2>
            <p className="mt-1 text-xs leading-6" style={{ color: 'var(--color-on-surface-variant)' }}>
              {mode === 'otp' ? copy.otpSubtitle(email) : mode === 'signup' ? copy.signupSubtitle : copy.loginSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.common.close}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div className="p-5">
          {mode !== 'otp' && (
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm font-medium">
              {(['login', 'signup'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setMode(tab);
                    setError(null);
                    setNotice(null);
                  }}
                  className={`rounded-md px-3 py-2 transition-colors ${
                    mode === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'login' ? copy.loginTitle : copy.signupTitle}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === 'signup' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">{copy.name}</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={copy.namePlaceholder}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            )}

            {mode !== 'otp' && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">{copy.email}</span>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={copy.emailPlaceholder}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">{copy.password}</span>
                  <input
                    type="password"
                    required
                    minLength={mode === 'signup' ? 8 : 1}
                    maxLength={128}
                    dir="ltr"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={copy.passwordPlaceholder}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  {mode === 'signup' && (
                    <span className="mt-1 block text-[11px] text-gray-400">{copy.passwordHint}</span>
                  )}
                </label>
              </>
            )}

            {mode === 'otp' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">{copy.otpLabel}</span>
                <input
                  type="text"
                  required
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-center font-mono text-xl tracking-[0.4em] text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                <span>{error}</span>
              </p>
            )}
            {notice && !error && (
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>mark_email_read</span>
                <span>{notice}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={busy || (mode === 'otp' && otp.length !== 6)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary-container)' }}
            >
              {busy && <span className="material-symbols-outlined animate-spin" style={{ fontSize: 18 }}>progress_activity</span>}
              {mode === 'login'
                ? loggingIn ? copy.loadingLogin : copy.submitLogin
                : mode === 'signup'
                  ? signingUp ? copy.loadingSignup : copy.submitSignup
                  : verifying ? copy.otpVerifying : copy.otpVerify}
            </button>
          </form>

          {mode === 'otp' && (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={onResend}
                disabled={resending || cooldown > 0}
                className="font-semibold text-blue-700 transition disabled:cursor-not-allowed disabled:text-gray-400"
              >
                {cooldown > 0 ? copy.otpResendIn(cooldown) : copy.otpResend}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setOtp('');
                  setError(null);
                  setNotice(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                {copy.otpChangeEmail}
              </button>
            </div>
          )}

          {mode !== 'otp' && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-[11px] font-medium text-gray-400">{copy.or}</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="flex min-h-11 w-full items-center justify-center">
                {config?.googleClientId ? (
                  <div ref={googleSlot} className="flex w-full justify-center" />
                ) : (
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setError(copy.googleUnavailable)}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      <GoogleGlyph />
                      {copy.google}
                    </button>
                  </div>
                )}
              </div>
              {googleError && <p className="mt-2 text-center text-[11px] text-red-600">{copy.errors.google}</p>}

              <p className="mt-5 text-center text-xs text-gray-500">
                {mode === 'login' ? (
                  <button type="button" onClick={() => setMode('signup')} className="font-semibold text-blue-700">
                    {copy.switchToSignup}
                  </button>
                ) : (
                  <button type="button" onClick={() => setMode('login')} className="font-semibold text-blue-700">
                    {copy.switchToLogin}
                  </button>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}
