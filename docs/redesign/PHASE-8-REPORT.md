# Phase 8 report: motion

Principle: motion answers something the person did, or confirms something that just happened. No entrance effects on page sections and no hover motion on cards (both read as templated).

## What moves (all in `src/styles/motion.css`, durations and easing from `tokens.css`)
| Where | Motion |
|---|---|
| Every dialog (booking, sign-in, trip details, confirms) | 200 ms rise and fade; backdrop fades |
| Mobile drawer | 280 ms slide from its own edge; flips in Arabic (RTL) |
| Toasts | 200 ms rise on arrival |
| Ticket issued (the one orchestrated moment) | the check draws itself, then heading and text follow once |
| Driver boarding result | the result banner settles in (slight overshoot), so a scan visibly changes the screen |
| Light/dark switch | colours cross-fade for 260 ms instead of jumping (never on first load) |

Closing is immediate, so focus returns without waiting.

## Reduced motion
Every rule is inside `prefers-reduced-motion: no-preference`: people who ask for less get none, not a shortened version. `src/ds/motion.test.ts` enforces this, requires token durations and easing, and forbids hover and section-entrance rules.

## Checked
tsc, full suite (1,380 passing), `next build`, bundle scan. In a real browser: the dialog animates with normal settings (opacity 0.41 at 40 ms, 1.0 settled; backdrop fades) and has no animation under reduced motion; the driver result animates.

## Not checked
The check-draw on the ticket, the drawer slide (including RTL), toast arrival and the theme cross-fade were not watched in a browser; they follow the same CSS but only the dialog and driver result were measured. Mobile Safari not tested. Exit animations were left out on purpose.

## Loading reveal (15 Nov 2026)
The Arabic mark is written on right to left, like a pen: loop, teeth, tall stem, then the last letter with its tail. A thin mint edge travels at the pen tip. Constant pen speed (`--ease-ds-write: linear`), a brief lead-in (about 70 ms), about 1.4 s of writing, a short hold, then a fade with a slight push-out: about 2 s. `src/ds/splash`, `motion.css`, wired in the root layout. Pen strokes come from `scripts/brand/trace-pen-path.py` (skeleton of the glyph, 0 uncovered pixels).
- Plays once per browser session (`sessionStorage`), decided before first paint. Never on `/dashboard`, `/admin`, `/driver`, and never when storage is blocked.
- Never plays with reduced motion (the element stays hidden). Ignores pointer input and is hidden from assistive tech.
- Uses the provisional traced mark (`src/ds/brand/arabicMarkProvisional.ts`); swap `d` and `viewBox` when the approved master exists.
- It is a deliberate wait of about 2 s on the first visit, on top of load time. It does not hide a slow load (it ends on a timer, not when the page is ready).

## Trip card to details morph (15 Nov 2026)
"View details" on the public site's trip card grows the card into the details dialog using the browser's View Transitions API (`src/ds/motion/morph.ts`, a few lines in `motion.css`). No new dependency.
- Opening only. Closing stays immediate so focus returns without waiting.
- Where the browser has no View Transitions, or the person asks for reduced motion, the dialog opens exactly as before.
- Applies to the public site only; the marketplace trip card has no details step.
