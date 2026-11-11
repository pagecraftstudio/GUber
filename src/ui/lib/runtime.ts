/**
 * Data-mode guard. The UI talks to the REAL backend unless a developer explicitly opts into mock data.
 *
 *   production build  -> always 'real'. Asking for mock in production THROWS (fail closed, never a silent fallback).
 *   development       -> 'real' by default; 'mock' only with NEXT_PUBLIC_UI_DATA_MODE=mock.
 *
 * NEXT_PUBLIC_* and NODE_ENV are referenced literally so Next.js inlines them.
 */
export type DataMode = 'real' | 'mock';

export class NotIntegratedError extends Error {
  readonly code = 'not_integrated';
  constructor(operation: string) {
    super(
      `"${operation}" is not connected to the backend yet. ` +
        `Real mode never falls back to mock data. See docs/INTEGRATION-MAP.md.`,
    );
    this.name = 'NotIntegratedError';
  }
}

export function resolveDataMode(nodeEnv: string | undefined, requested: string | undefined): DataMode {
  if (requested !== undefined && requested !== '' && requested !== 'real' && requested !== 'mock') {
    throw new Error(`NEXT_PUBLIC_UI_DATA_MODE must be "real" or "mock", got "${requested}"`);
  }
  if (requested === 'mock') {
    if (nodeEnv === 'production') {
      throw new Error('NEXT_PUBLIC_UI_DATA_MODE=mock is not allowed in a production build.');
    }
    return 'mock';
  }
  return 'real';
}

let cached: DataMode | undefined;
export function getDataMode(): DataMode {
  return (cached ??= resolveDataMode(process.env.NODE_ENV, process.env.NEXT_PUBLIC_UI_DATA_MODE));
}
export const isMockMode = (): boolean => getDataMode() === 'mock';
