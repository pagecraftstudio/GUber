import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
// 72 = bcrypt input limit used by Supabase Auth; shorter than 10 is rejected.
const newPassword = z.string().min(10, 'too_short').max(72, 'too_long');

export const inviteTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const loginSchema = z.object({ email, password: z.string().min(1).max(72) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'mismatch' });
export const inviteSignupSchema = z.object({
  token: inviteTokenSchema,
  fullName: z.string().trim().min(2).max(100),
  password: newPassword,
});
