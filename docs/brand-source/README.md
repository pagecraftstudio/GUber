# MASAR brand assets (PROVISIONAL)

Everything here is derived from the 12 images and 3 videos you uploaded (`docs/brand-source/originals/`). **None of it is the approved master.** Plan Phase 1 and decision D10 still need a named designer and a named Arabic reviewer to approve the vector artwork. When that happens, replace the files in `svg/` and re-export `png/`, `icons/`, `og/`. File names stay the same, so no code changes.

## What is here
| Folder | Content | Use |
|---|---|---|
| `docs/brand-source/originals/` (not shipped) | Your originals, renamed (`stacked-white-on-black.png`, ...), the 3 focus videos, the logo brief, the design-system doc | Reference only. Never ship these (opaque backgrounds, AI raster) |
| `svg/` | `arabic-mark`, `arabic-wordmark`, `stacked-lockup`, `horizontal-lockup`, `english-wordmark`. One colour, `fill="currentColor"` | Header, footer, auth pages: colour them with CSS text colour. **Auto-traced from the raster**, edges are smooth but the curves are not designed |
| `png/` | The same five, transparent, in white, black and deep green (`#0B3D2E`), padded 10% | Email, documents, places that cannot use SVG |
| `icons/` | `favicon.ico` (32, 48), `favicon-16/32/48.png`, `icon-192/512.png`, `icon-maskable-192/512.png` (mark inside the 80% safe zone), `apple-touch-icon-180.png` (square, no transparency, iOS rounds it), `app-icon-1024-rounded.png`, `app-icon-1024-square.png` (store submissions), `icon-512-light.png` | PWA, browser tab, home screen, stores |
| `og/` | `og-image-green.png`, `og-image-cream.png`, 1200 x 630 | Link previews |
| `site.webmanifest` | Name, colours, the four icons | Link it from the layout |
| `docs/brand-source/qa/` | Favicon legibility sheet at 16, 32, 48 | Look before approving |

Colours: deep green `#0B3D2E`, white, black, cream `#FCFBF7`. Mint `#14C88A` is accent only and is not used in any logo file. The supplied app icon used `#063C2A`; I used the brief's `#0B3D2E`.

## Limits you must know
1. **Low resolution.** The artwork inside your PNGs is small: stacked lockup 440 x 560 px of ink, horizontal 908 x 280, Arabic mark 605 x 660, English wordmark 865 x 98. PNGs get soft above those sizes. Use SVG for anything large.
2. **Traced SVG is not a master.** It copies whatever the AI image drew, including any flaw in the Arabic. The reviewer must check the spelling م س ا ر, joins and dots on the real master. Do not treat these SVGs as approved.
3. **16 px favicon fails.** The Arabic mark is too thin and too wide to read at 16 px (see `_qa/`). The `.ico` therefore holds 32 and 48 only; browsers scale 32 down for tabs and it is a soft blob at 1x. The 32 and 48 favicons use a bolder copy of the mark (optical weight, about 2x strokes). Decision for the designer: a one-letter mark (م) for 16 px, as the brief allows.
4. The mark inside icons is the same Arabic mark, scaled. Maskable icons use 52% width so launchers that crop to a circle keep it whole.
5. No stroke-draw animation yet. The 3 focus videos are only references.
6. "Powered by MALAKY Studio" lockup (plan Phase 1) is not made: it needs the MALAKY logo, which was not uploaded.

## Wiring (not applied, so nothing changes by surprise)
Next picks up `src/app/favicon.ico`, `src/app/icon.png`, `src/app/apple-icon.png` by file name; those three are copied in. For the manifest and link previews add to `src/app/layout.tsx`:

```ts
export const metadata: Metadata = {
  // keep existing fields
  manifest: '/site.webmanifest',
  themeColor: '#0B3D2E',
  openGraph: { images: [{ url: '/brand/og/og-image-green.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/brand/og/og-image-green.png'] },
};
```
Tenant public sites should override `openGraph.images` with the company logo, not MASAR's.

## MALAKY Studio mark (added 12 Nov 2026)
`public/brand/malaky/`: `malaky-mark.svg` (one colour, auto-traced, provisional), transparent PNG in white, black, deep green. Original image in `originals/`. Ink is 336 x 858 px, so use the SVG. For the quiet "Powered by MALAKY Studio" footer line (D1) the mark should be small text-height or the words alone; do not place it near the MASAR mark, and do not reuse its lettering for MASAR (brief section 2.3). I read the image as the MALAKY wordmark: confirm that is the right file and that the Arabic spelling is the approved one.
