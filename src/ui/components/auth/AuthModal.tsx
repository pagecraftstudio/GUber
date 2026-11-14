import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { AuthServiceError, describeAuthError } from '../../lib/real/authService.real';
import { isMockMode } from '../../lib/runtime';

import { AuthModalMasarView } from '../masar/AuthModalMasarView';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register' | 'forgot_password';
  onGuestContinue?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultMode = 'login',
  onGuestContinue,
}) => {
  const { signIn, signUp, resetPassword } = useAuth();
  const { locale, t } = useLocale();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password' | 'reset_sent'>(defaultMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-error outcome (e.g. "check your email to confirm"): informational styling, role=status, never the red error banner.
  const [notice, setNotice] = useState<string | null>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regStudentId, setRegStudentId] = useState('');
  const [regUniversity, setRegUniversity] = useState('Galala University');

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');

  const handleQuickFill = (type: 'karim' | 'nourhan') => {
    // Development-mock credentials. `process.env.NODE_ENV` is a build-time constant: stripped from production bundles.
    if (process.env.NODE_ENV === 'production') return;
    if (type === 'karim') {
      setLoginEmail('karim.galala@student.gu.edu.eg');
      setLoginPassword('Pass1234!');
    } else {
      setLoginEmail('nourhan.transit@gmail.com');
      setLoginPassword('Pass1234!');
    }
    setError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!loginEmail || !loginPassword) {
      setError(locale === 'ar' ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn({ email: loginEmail, password: loginPassword });
      setLoading(false);
      onClose();
    } catch (err: any) {
      setLoading(false);
      setError(err instanceof AuthServiceError ? describeAuthError(err, locale) : err.message || (locale === 'ar' ? 'فشل تسجيل الدخول. تأكد من صحة البيانات.' : 'Login failed. Please check your credentials.'));
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!regFullName.trim()) {
      setError(locale === 'ar' ? 'يرجى إدخال الاسم بالكامل' : 'Please enter your full name.');
      return;
    }
    if (!regEmail.trim()) {
      setError(locale === 'ar' ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email.');
      return;
    }
    const cleanPhone = regPhone.replace(/\s+/g, '');
    if (!cleanPhone) {
      setError(locale === 'ar' ? 'يرجى إدخال رقم الهاتف' : 'Please enter your phone number.');
      return;
    }
    if (regPassword.length < 6) {
      setError(locale === 'ar' ? 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل' : 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await signUp({
        fullName: regFullName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        studentId: regStudentId.trim() || undefined,
        university: regUniversity,
      });
      setLoading(false);
      onClose();
    } catch (err: any) {
      setLoading(false);
      if (err instanceof AuthServiceError && err.reason === 'confirm_email') {
        // Account exists but has no session until the email is confirmed: success, not failure.
        setLoginEmail(regEmail);
        setLoginPassword('');
        setMode('login');
        setNotice(describeAuthError(err, locale));
        return;
      }
      setError(err instanceof AuthServiceError ? describeAuthError(err, locale) : err.message || (locale === 'ar' ? 'فشل إنشاء الحساب.' : 'Registration failed.'));
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!resetEmail.trim()) {
      setError(locale === 'ar' ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(resetEmail);
      setLoading(false);
      setMode('reset_sent');
    } catch (err: any) {
      setLoading(false);
      setError(err instanceof AuthServiceError ? describeAuthError(err, locale) : err.message || 'Error sending reset instructions.');
    }
  };

  const heading = mode === 'login' ? t('signIn') : mode === 'register' ? t('signUp') : t('resetPasswordTitle');
  const subheading =
    mode === 'login'
      ? locale === 'ar'
        ? (isMockMode() ? 'سجل دخولك لإدارة رحلاتك وتعبئة التذاكر تلقائياً' : 'سجّل دخولك لإدارة حجوزاتك')
        : isMockMode() ? 'Access your trips, verified student discounts, and saved travel companions' : 'Access and manage your bookings'
      : mode === 'register'
      ? locale === 'ar'
        ? 'أنشئ حساب راكب في منصة ملاكي باص بخطوة واحدة'
        : 'Create your passenger account for Galala University intercity transit'
      : locale === 'ar'
      ? 'استرجع حسابك بإدخال بريدك الإلكتروني المسجل'
      : 'Enter your registered email to receive reset instructions';

  // Same state, validation and service calls for both looks; only the drawing differs (D9).
  return (
    <AuthModalMasarView
      isOpen={isOpen} onClose={onClose} title={heading} subtitle={subheading} mode={mode} setMode={setMode} loading={loading}
      error={error} notice={notice} clearError={() => setError(null)} locale={locale} tr={(k) => t(k as Parameters<typeof t>[0])}
      login={{ email: loginEmail, password: loginPassword, setEmail: setLoginEmail, setPassword: setLoginPassword, onSubmit: handleLoginSubmit }}
      register={{ fullName: regFullName, email: regEmail, phone: regPhone, password: regPassword, studentId: regStudentId, setFullName: setRegFullName, setEmail: setRegEmail, setPhone: setRegPhone, setPassword: setRegPassword, setStudentId: setRegStudentId, showStudentId: isMockMode(), onSubmit: handleRegisterSubmit }}
      reset={{ email: resetEmail, setEmail: setResetEmail, onSubmit: handleResetSubmit }}
      quickFill={isMockMode() && process.env.NODE_ENV !== 'production' ? handleQuickFill : undefined}
      onGuestContinue={onGuestContinue}
    />
  );
};
