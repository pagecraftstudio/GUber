import { ERROR_MESSAGES, NOTICE_MESSAGES } from './messages';

export type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Reads ?error= / ?notice= / ?next= and maps codes to whitelisted messages (arbitrary URL text is never shown). */
export async function readFlash(searchParams: RawSearchParams) {
  const sp = await searchParams;
  const errorCode = first(sp.error);
  const noticeCode = first(sp.notice);
  return {
    error: errorCode ? (Object.hasOwn(ERROR_MESSAGES, errorCode) ? ERROR_MESSAGES[errorCode] : ERROR_MESSAGES.generic) : undefined,
    notice: noticeCode && Object.hasOwn(NOTICE_MESSAGES, noticeCode) ? NOTICE_MESSAGES[noticeCode] : undefined,
    next: first(sp.next),
    from: first(sp.from),
  };
}
