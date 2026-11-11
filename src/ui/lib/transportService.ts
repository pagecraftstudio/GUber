import { getDataMode, NotIntegratedError } from './runtime';
import type { MockTransportService } from './mock/transportService.mock';
import { RealTransportService } from './real/transportService.real';
import { createCustomerBackend } from './real/customerBackend';
import { getSupabaseBrowser } from './real/supabaseBrowser';
import { toE164Egypt } from './real/adapters';

export type TransportService = MockTransportService;

let real: RealTransportService | undefined;
const getReal = () => (real ??= new RealTransportService(createCustomerBackend(getSupabaseBrowser()), toE164Egypt));

/** Dynamic import behind a build-time constant: production bundles contain no mock service or mock data. */
const loadMock = (): Promise<Record<string, unknown>> =>
  process.env.NODE_ENV === 'production'
    ? Promise.reject(new Error('Mock data is not available in production.'))
    : import('./mock/transportService.mock').then((m) => m.getMockTransportService() as unknown as Record<string, unknown>);

/**
 * Mock mode (development only): the localStorage mock, unchanged.
 * Real mode: ONLY methods implemented by RealTransportService exist. Any other call rejects with NotIntegratedError;
 * it never returns mock data. This is what keeps a half-wired UI from silently showing fake dashboards in production.
 */
export const transportService: TransportService = new Proxy({} as TransportService, {
  get(_t, prop: string | symbol) {
    if (typeof prop === 'symbol' || prop === 'then') return undefined;
    if (getDataMode() === 'mock') {
      return async (...args: unknown[]) => {
        const m = await loadMock();
        const v = m[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).apply(m, args) : v;
      };
    }
    const r = getReal() as unknown as Record<string, unknown>;
    const v = r[prop];
    if (typeof v === 'function' && !prop.startsWith('_')) return (v as (...a: unknown[]) => unknown).bind(r);
    return () => Promise.reject(new NotIntegratedError(`transportService.${prop}`));
  },
});
