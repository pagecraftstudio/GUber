import { z } from 'zod';
import { checkEnv, formatEnvIssues } from './env-check';

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated environment. Lazy so `next build` does not fail before variables exist.
 * Only public variables live here: Phase 3 needs no server-only secret.
 * NEXT_PUBLIC_* must be referenced literally so Next.js can inline them for the browser.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    // names + kinds of problems only; never values
    const r = checkEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    });
    const keys = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(r.issues.length ? formatEnvIssues(r.issues) : `Invalid or missing environment variables: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}
