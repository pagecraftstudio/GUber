import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { AuthServiceError, describeAuthError } from '../../lib/real/authService.real';
import { isMockMode } from '../../lib/runtime';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  User,
  Mail,
  Lock,
  Phone,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building,
} from 'lucide-react';

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        mode === 'login'
          ? t('signIn')
          : mode === 'register'
          ? t('signUp')
          : t('resetPasswordTitle')
      }
      subtitle={
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
          : 'Enter your registered email to receive reset instructions'
      }
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Error notification banner */}
        {notice && !error && (
          <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
            <div className="flex-1">{notice}</div>
          </div>
        )}
        {error && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Quick Demo Pre-seed Logins (For evaluators) */}
        {mode === 'login' && isMockMode() && process.env.NODE_ENV !== 'production' && (
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/60 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
              <Sparkles className="w-3.5 h-3.5 text-[#3563E9]" />
              <span>{t('quickDemoLogin')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('karim')}
                className="px-2.5 py-1.5 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg text-start transition-colors cursor-pointer text-xs"
              >
                <div className="font-semibold text-slate-800 flex items-center gap-1">
                  <GraduationCap className="w-3 h-3 text-[#3563E9]" />
                  <span>{t('loginAsKarim')}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">karim.galala@student...</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('nourhan')}
                className="px-2.5 py-1.5 bg-white border border-blue-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg text-start transition-colors cursor-pointer text-xs"
              >
                <div className="font-semibold text-slate-800 flex items-center gap-1">
                  <User className="w-3 h-3 text-emerald-600" />
                  <span>{t('loginAsNourhan')}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">nourhan.transit@gmail...</div>
              </button>
            </div>
          </div>
        )}

        {/* MODE: LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <Input
              label={t('emailLabel')}
              type="email"
              icon={<Mail className="w-4 h-4" />}
              placeholder="e.g. name@student.gu.edu.eg"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">{t('passwordLabel')}</label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode('forgot_password');
                  }}
                  className="text-xs text-[#3563E9] hover:underline cursor-pointer"
                >
                  {t('forgotPassword')}
                </button>
              </div>
              <Input
                type="password"
                icon={<Lock className="w-4 h-4" />}
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" loading={loading} className="w-full">
              {t('signIn')}
            </Button>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>{locale === 'ar' ? 'ليس لديك حساب؟' : "Don't have an account?"}</span>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('register');
                }}
                className="font-bold text-[#3563E9] hover:underline cursor-pointer"
              >
                {t('signUp')}
              </button>
            </div>

            {onGuestContinue && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGuestContinue();
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  {t('continueAsGuest')}
                </button>
              </div>
            )}
          </form>
        )}

        {/* MODE: REGISTER */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <Input
              label={t('fullNameLabel')}
              icon={<User className="w-4 h-4" />}
              placeholder="e.g. Karim El-Sayed"
              value={regFullName}
              onChange={(e) => setRegFullName(e.target.value)}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label={t('emailLabel')}
                type="email"
                icon={<Mail className="w-4 h-4" />}
                placeholder="name@student.gu.edu.eg"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />

              <Input
                label={t('phoneLabel')}
                type="tel"
                icon={<Phone className="w-4 h-4" />}
                placeholder="01012345678"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                helperText={locale === 'ar' ? 'رقم هاتف مصري محلي' : 'Egyptian mobile number'}
                required
              />
            </div>

            <Input
              label={t('passwordLabel')}
              type="password"
              icon={<Lock className="w-4 h-4" />}
              placeholder="••••••••"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              helperText={locale === 'ar' ? '٦ أحرف على الأقل' : 'Minimum 6 characters'}
              required
            />

            {/* Student ID (Optional, with 15% discount perk) */}
            {isMockMode() && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-[#3563E9]" />
                  <span>{t('optionalStudentId')}</span>
                </label>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                  {locale === 'ar' ? 'خصم ١٥٪' : '15% Off'}
                </span>
              </div>
              <Input
                placeholder="e.g. GU-2024-8841"
                value={regStudentId}
                onChange={(e) => setRegStudentId(e.target.value)}
                helperText={t('studentIdHint')}
              />
            </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              {t('signUp')}
            </Button>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>{locale === 'ar' ? 'لديك حساب بالفعل؟' : 'Already have an account?'}</span>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode('login');
                }}
                className="font-bold text-[#3563E9] hover:underline cursor-pointer"
              >
                {t('signIn')}
              </button>
            </div>
          </form>
        )}

        {/* MODE: FORGOT PASSWORD */}
        {mode === 'forgot_password' && (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <p className="text-xs text-slate-500">
              {locale === 'ar'
                ? 'أدخل بريدك الإلكتروني المسجل، وسنقوم بإرسال رابط آمن لإعادة تعيين كلمة المرور فوراً.'
                : 'Enter your registered email address, and we will send a secure password reset link.'}
            </p>

            <Input
              label={t('emailLabel')}
              type="email"
              icon={<Mail className="w-4 h-4" />}
              placeholder="e.g. name@student.gu.edu.eg"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />

            <Button type="submit" loading={loading} className="w-full">
              {t('resetPasswordTitle')}
            </Button>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('login');
              }}
              className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 mx-auto cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
              <span>{locale === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}</span>
            </button>
          </form>
        )}

        {/* MODE: RESET SENT SUCCESS */}
        {mode === 'reset_sent' && (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-900 text-sm">
              {locale === 'ar' ? 'تم إرسال التعليمات بنجاح' : 'Instructions Sent'}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {t('resetInstructionsSent')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMode('login');
              }}
              className="mt-2"
            >
              {locale === 'ar' ? 'العودة لتسجيل الدخول' : 'Return to Login'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
