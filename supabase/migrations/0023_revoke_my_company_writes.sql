-- 0023: close tenant write access through the my_company view.
-- Problem: my_company is a simple, auto-updatable, SECURITY DEFINER view. Supabase default privileges grant
--   INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES on new views to authenticated; 0006 only revoked from public, anon.
--   A tenant user could therefore UPDATE their own companies row (name, slug, status ...) bypassing RLS.
-- Applied to PRODUCTION by hand on 2026-11-04 (project zsclpwcehqqggoenlshq), with the owner's approval. Verified: SELECT works; UPDATE/DELETE/INSERT denied.
-- Rollback: grant insert, update, delete on public.my_company to authenticated;   (do not do this)
revoke insert, update, delete, truncate, references, trigger on public.my_company from authenticated, anon, public;
grant select on public.my_company to authenticated;
