import React, { useEffect, useState } from 'react';

/** Renders a QR image for a server-issued payload, in the browser only. The payload text is never printed on the page. */
export const TicketQrImage: React.FC<{ payload: string; label: string }> = ({ payload, label }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    import('qrcode')
      .then((m) => m.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 220 }))
      .then((u) => { if (live) setSrc(u); })
      .catch(() => { if (live) setSrc(null); });
    return () => { live = false; };
  }, [payload]);
  if (!src) return <div className="w-28 h-28 animate-pulse rounded-lg bg-slate-200" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label} className="w-36 h-36 rounded-lg bg-white p-1" data-testid="ticket-qr" />;
};
