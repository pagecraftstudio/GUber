'use client';
import type { FormEvent } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/ds/primitives/Button';
import { Field } from '@/ds/primitives/Field';
import { DigitInput, Input } from '@/ds/primitives/Input';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { Modal } from '@/ds/feedback/Dialog';
import { cx, FOCUS } from '@/ds/primitives/cx';

export type AuthMode = 'login' | 'register' | 'forgot_password' | 'reset_sent';

const linkBtn = cx('inline-flex min-h-9 items-center text-sm text-ink-link underline-offset-2 hover:underline', FOCUS);

export interface AuthModalMasarProps {
  isOpen: boolean; onClose: () => void; title: string; subtitle: string; mode: AuthMode; setMode: (m: AuthMode) => void; loading: boolean;
  error: string | null; notice: string | null; clearError: () => void; locale: 'en' | 'ar'; tr: (key: string) => string;
  login: { email: string; password: string; setEmail: (v: string) => void; setPassword: (v: string) => void; onSubmit: (e: FormEvent) => void };
  register: { fullName: string; email: string; phone: string; password: string; studentId: string; setFullName: (v: string) => void; setEmail: (v: string) => void; setPhone: (v: string) => void; setPassword: (v: string) => void; setStudentId: (v: string) => void; showStudentId: boolean; onSubmit: (e: FormEvent) => void };
  reset: { email: string; setEmail: (v: string) => void; onSubmit: (e: FormEvent) => void };
  /** Only passed in mock mode outside production. */
  quickFill?: (who: 'karim' | 'nourhan') => void;
  onGuestContinue?: () => void;
}

/**
 * MASAR look of the passenger sign-in, sign-up and reset dialog. All state, validation and service calls stay in AuthModal (one implementation);
 * this view only draws what it is given. Phone and student ID use the digit-normalising input (plan 5.7), so Arabic-Indic digits typed on a phone keyboard arrive as ASCII.
 */
export function AuthModalMasarView(p: AuthModalMasarProps) {
  const ar = p.locale === 'ar';
  const t = p.tr;
  const back = () => { p.clearError(); p.setMode('login'); };
  return (
    <Modal open={p.isOpen} onClose={p.onClose} title={p.title} subtitle={p.subtitle} size="md">
      <div className="space-y-5">
        {p.notice && !p.error ? <InlineAlert tone="info">{p.notice}</InlineAlert> : null}
        {p.error ? <InlineAlert tone="error">{p.error}</InlineAlert> : null}

        {p.mode === 'login' && p.quickFill ? (
          <div className="space-y-2 rounded-ds-md bg-surface-sunken p-3">
            <p className="text-[13px] font-medium text-ink-primary">{t('quickDemoLogin')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="secondary" onClick={() => p.quickFill?.('karim')}>{t('loginAsKarim')}</Button>
              <Button type="button" variant="secondary" onClick={() => p.quickFill?.('nourhan')}>{t('loginAsNourhan')}</Button>
            </div>
          </div>
        ) : null}

        {p.mode === 'login' ? (
          <form onSubmit={p.login.onSubmit} className="space-y-4" noValidate>
            <Field label={t('emailLabel')} required><Input type="email" size="lg" autoComplete="email" dir="ltr" value={p.login.email} onChange={(e) => p.login.setEmail(e.target.value)} /></Field>
            <div className="space-y-1.5">
              <Field label={t('passwordLabel')} required><Input type="password" size="lg" autoComplete="current-password" dir="ltr" value={p.login.password} onChange={(e) => p.login.setPassword(e.target.value)} /></Field>
              <button type="button" className={linkBtn} onClick={() => { p.clearError(); p.setMode('forgot_password'); }}>{t('forgotPassword')}</button>
            </div>
            <Button type="submit" size="lg" fullWidth loading={p.loading}>{t('signIn')}</Button>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-default pt-3 text-sm text-ink-secondary">
              <span>{ar ? 'ليس لديك حساب؟' : "Don't have an account?"}</span>
              <button type="button" className={linkBtn} onClick={() => { p.clearError(); p.setMode('register'); }}>{t('signUp')}</button>
            </div>
            {p.onGuestContinue ? <div className="text-center"><button type="button" className={linkBtn} onClick={() => { p.onClose(); p.onGuestContinue?.(); }}>{t('continueAsGuest')}</button></div> : null}
          </form>
        ) : null}

        {p.mode === 'register' ? (
          <form onSubmit={p.register.onSubmit} className="space-y-4" noValidate>
            <Field label={t('fullNameLabel')} required><Input size="lg" autoComplete="name" value={p.register.fullName} onChange={(e) => p.register.setFullName(e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('emailLabel')} required><Input type="email" size="lg" autoComplete="email" dir="ltr" value={p.register.email} onChange={(e) => p.register.setEmail(e.target.value)} /></Field>
              <Field label={t('phoneLabel')} required hint={ar ? 'رقم هاتف مصري محلي' : 'Egyptian mobile number'}><DigitInput kind="tel" size="lg" autoComplete="tel" dir="ltr" placeholder="01012345678" value={p.register.phone} onChange={(e) => p.register.setPhone(e.target.value)} /></Field>
            </div>
            <Field label={t('passwordLabel')} required hint={ar ? '٦ أحرف على الأقل' : 'Minimum 6 characters'}><Input type="password" size="lg" autoComplete="new-password" dir="ltr" value={p.register.password} onChange={(e) => p.register.setPassword(e.target.value)} /></Field>
            {p.register.showStudentId ? (
              <Field label={t('optionalStudentId')} hint={t('studentIdHint')}><DigitInput kind="identifier" size="lg" dir="ltr" value={p.register.studentId} onChange={(e) => p.register.setStudentId(e.target.value)} /></Field>
            ) : null}
            <Button type="submit" size="lg" fullWidth loading={p.loading}>{t('signUp')}</Button>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-default pt-3 text-sm text-ink-secondary">
              <span>{ar ? 'لديك حساب بالفعل؟' : 'Already have an account?'}</span>
              <button type="button" className={linkBtn} onClick={back}>{t('signIn')}</button>
            </div>
          </form>
        ) : null}

        {p.mode === 'forgot_password' ? (
          <form onSubmit={p.reset.onSubmit} className="space-y-4" noValidate>
            <p className="text-sm text-ink-secondary">{ar ? 'أدخل بريدك الإلكتروني المسجل، وسنقوم بإرسال رابط آمن لإعادة تعيين كلمة المرور فوراً.' : 'Enter your registered email address, and we will send a secure password reset link.'}</p>
            <Field label={t('emailLabel')} required><Input type="email" size="lg" autoComplete="email" dir="ltr" value={p.reset.email} onChange={(e) => p.reset.setEmail(e.target.value)} /></Field>
            <Button type="submit" size="lg" fullWidth loading={p.loading}>{t('resetPasswordTitle')}</Button>
            <button type="button" className={cx(linkBtn, 'mx-auto gap-1.5')} onClick={back}><ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" className="rtl:rotate-180" />{ar ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}</button>
          </form>
        ) : null}

        {p.mode === 'reset_sent' ? (
          <div className="space-y-3 py-2 text-center">
            <CheckCircle2 size={32} strokeWidth={1.5} className="mx-auto text-status-success-fg" aria-hidden="true" />
            <h3 className="text-base font-medium text-ink-primary">{ar ? 'تم إرسال التعليمات بنجاح' : 'Instructions sent'}</h3>
            <p className="mx-auto max-w-sm text-sm text-ink-secondary">{t('resetInstructionsSent')}</p>
            <Button type="button" variant="secondary" onClick={() => p.setMode('login')}>{ar ? 'العودة لتسجيل الدخول' : 'Return to login'}</Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
