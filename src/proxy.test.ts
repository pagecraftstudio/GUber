import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

let user: { id: string } | null = null;
vi.mock('@/lib/supabase/proxy', () => ({
  updateSession: async () => ({ response: NextResponse.next(), user }),
}));
const { proxy } = await import('./proxy');

async function hit(path: string, signedIn = false) {
  user = signedIn ? { id: 'u1' } : null;
  const res = await proxy(new NextRequest(`http://localhost:3000${path}`));
  const loc = res.headers.get('location');
  return { status: res.status, to: loc ? new URL(loc).pathname + new URL(loc).search : null };
}

describe('proxy: unauthenticated visitor', () => {
  it('opens the public marketplace and customer auth pages without any redirect', async () => {
    for (const p of ['/', '/login', '/register', '/company/login', '/forgot-password', '/auth/confirm']) {
      expect(await hit(p), p).toEqual({ status: 200, to: null });
    }
  });
  it('is NOT redirected to the company login from "/" (the original bug)', async () => {
    expect((await hit('/')).to).toBeNull();
  });
  it('operator areas -> /company/login with a return path', async () => {
    expect(await hit('/dashboard/trips?x=1')).toEqual({ status: 307, to: '/company/login?next=%2Fdashboard%2Ftrips%3Fx%3D1' });
    expect((await hit('/driver')).to).toBe('/company/login?next=%2Fdriver');
    expect((await hit('/admin')).to).toBe('/company/login?next=%2Fadmin');
  });
  it('customer portal -> customer login', async () => {
    expect((await hit('/my-bookings')).to).toBe('/login?next=%2Fmy-bookings');
  });
});

describe('proxy: signed-in visitor', () => {
  it('passes through; per-role decisions belong to the server guards, not the proxy', async () => {
    for (const p of ['/', '/dashboard', '/driver', '/my-bookings', '/admin']) {
      expect(await hit(p, true), p).toEqual({ status: 200, to: null });
    }
  });
});
