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
