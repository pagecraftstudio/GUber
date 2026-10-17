'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { active: boolean; onToken: (text: string) => void };
type Detector = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Camera QR reader. Uses the native BarcodeDetector where it exists (Chrome/Android), otherwise jsQR on canvas frames
 * (iOS Safari, Firefox). It only hands the decoded TEXT to the parent; the server decides whether it is a valid ticket.
 * Camera permission is requested only when `active`, and every track is stopped on unmount / deactivate.
 */
export function QrScanner({ active, onToken }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    let lastText = '';
    let lastAt = 0;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = BD ? new BD({ formats: ['qr_code'] }) : null;
        const jsQR = detector ? null : (await import('jsqr')).default;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              let text = '';
              if (detector) text = (await detector.detect(v))[0]?.rawValue ?? '';
              else if (jsQR && ctx) {
                canvas.width = v.videoWidth; canvas.height = v.videoHeight;
                ctx.drawImage(v, 0, 0);
                text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? '';
              }
              const now = Date.now();
              if (text && (text !== lastText || now - lastAt > 10000)) { lastText = text; lastAt = now; cb.current(text); }
            }
          } catch { /* a bad frame is not an error */ }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setError('Camera unavailable. Allow camera access, or type the code below.');
      }
    })();

    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [active]);

  return (
    <div className="space-y-2">
      <video ref={video} playsInline muted className={`aspect-square w-full rounded-lg bg-slate-900 object-cover ${active ? '' : 'hidden'}`} />
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
