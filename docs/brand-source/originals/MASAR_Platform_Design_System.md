# MASAR Platform Design System

## Product UI/UX Redesign Specification

**Document status:** Design direction and implementation brief\
**Brand:** MASAR / مسار\
**Parent company:** MALAKY Studio\
**Product:** Transportation marketplace and multi-company transportation
SaaS platform\
**Version:** 1.0 --- November 2026

------------------------------------------------------------------------

## 1. Purpose

This document defines the visual and interaction system that will guide
the redesign of the MASAR platform. It translates the approved logo
direction into a consistent product experience across:

-   Passenger-facing website and mobile experiences
-   Bus-company portals and operational dashboards
-   Driver-facing interfaces
-   Platform administration tools
-   Booking, payment, ticketing, and trip-management journeys
-   Marketing pages and supporting product touchpoints

The goal is to make MASAR feel like one coherent, premium technology
product---not a collection of unrelated dashboards.

This is a design direction and starting specification. Exact component
dimensions, typography files, logo vectors, and detailed interaction
rules must be validated during design and implementation.

------------------------------------------------------------------------

## 2. Brand foundation

### 2.1 Brand idea

**MASAR (مسار)** means route, path, course, or trajectory. The product
connects passengers, transportation companies, drivers, and
administrators through a shared mobility platform.

The brand should communicate:

-   Clarity and confidence
-   Reliable movement and coordination
-   Simplicity across complex operations
-   A modern, premium technology experience
-   Trust for both passengers and business operators

### 2.2 Brand personality

  -----------------------------------------------------------------------
  Attribute                           Design expression
  ----------------------------------- -----------------------------------
  Confident                           Clear hierarchy, decisive layouts,
                                      restrained decoration

  Premium                             Thoughtful spacing, precise
                                      typography, limited color use

  Human                               Helpful language, understandable
                                      states, approachable interactions

  Efficient                           Short workflows, scannable
                                      information, useful defaults

  Connected                           Consistent patterns across
                                      passenger, company, driver, and
                                      admin products
  -----------------------------------------------------------------------

### 2.3 Relationship to MALAKY Studio

MASAR is an independent product identity developed by MALAKY Studio. It
should share visual DNA with the parent brand---especially the tall,
refined Arabic calligraphic character and monochrome restraint---without
copying the MALAKY symbol.

"Powered by MALAKY Studio" may appear as a subtle endorsement where
appropriate. It must never compete with the MASAR identity.

------------------------------------------------------------------------

## 3. Logo system

The current approved creative direction is an Arabic-first, elongated
calligraphic wordmark with a restrained English **MASAR** supporting
line.

### 3.1 Approved direction

-   Arabic **مسار** is the primary expressive element.
-   English **MASAR** is secondary and widely spaced.
-   The master presentation is white on black.
-   The identity relies on custom letterforms rather than a generic bus,
    road, pin, or arrow symbol.
-   Keep the silhouette simple enough to work at small sizes.

### 3.2 Required logo variants

Create and manually verify vector artwork for:

1.  Primary bilingual lockup
2.  Arabic-only wordmark
3.  English-only wordmark
4.  Compact app icon / favicon, only after confirming a legible
    standalone mark
5.  Light-background version
6.  Dark-background version
7.  One-color black and one-color white versions
8.  Optional "Powered by MALAKY Studio" endorsement lockup

### 3.3 Logo production rules

-   Recreate and refine the lettering as proper vector artwork.
-   Check the Arabic spelling, letter connections, dots, and reading
    direction manually.
-   Define clear space and minimum sizes after vector refinement.
-   Do not use AI-generated lettering as final production artwork.
-   Do not stretch, skew, outline, add shadows to, or arbitrarily
    rearrange the logo.
-   Do not invent a standalone symbol if the wordmark itself is
    stronger.

------------------------------------------------------------------------

## 4. Visual direction

### 4.1 Core principles

**Quiet confidence:** The interface should feel calm and assured, not
loud or overly decorated.

**Structure before decoration:** Use alignment, spacing, typography, and
hierarchy to make complex information understandable.

**Purposeful color:** Green is a brand signal and action cue, not a
background color for every screen.

**Operational clarity:** Dense workflows must remain readable and
efficient, especially in company and admin dashboards.

**One system, different needs:** Passenger experiences can be more
welcoming; operational tools can be denser. Both must share the same
design language.

### 4.2 What to avoid

-   Generic transportation illustrations as the primary brand identity
-   Excessive gradients, glow effects, glassmorphism, and decorative
    blobs
-   Using mint for every button, icon, badge, and highlight
-   Over-rounded cards and pill-shaped controls everywhere
-   Dense screens with weak hierarchy
-   Inconsistent patterns between different user roles
-   Decorative Arabic text that compromises legibility

------------------------------------------------------------------------

## 5. Color system

The following colors are the current proposed palette from the identity
exploration. They are starting tokens, not yet accessibility-certified
final values.

### 5.1 Brand palette

  -----------------------------------------------------------------------
  Token                   Hex                     Intended use
  ----------------------- ----------------------- -----------------------
  `brand-green-900`       `#0B3D2E`               Primary deep green,
                                                  dark brand surfaces

  `brand-mint-500`        `#14C88A`               Accent, selected
                                                  states, limited
                                                  emphasis

  `neutral-050`           `#F5F5F5`               Soft neutral surface

  `neutral-000`           `#FFFFFF`               Main light surface

  `neutral-950`           `#000000`               Core black,
                                                  high-contrast brand use
  -----------------------------------------------------------------------

### 5.2 Recommended extended UI neutrals

These are proposed interface tokens to be validated in the actual
product:

  Token           Proposed value   Intended use
  --------------- ---------------- -------------------------
  `neutral-025`   `#FAFAFA`        Subtle page background
  `neutral-100`   `#EEEEEE`        Borders and separators
  `neutral-200`   `#DCDCDC`        Input borders, dividers
  `neutral-500`   `#777777`        Secondary text
  `neutral-700`   `#444444`        Strong secondary text
  `neutral-900`   `#171717`        Primary text

### 5.3 Semantic colors

Use semantic colors consistently and do not rely on color alone to
communicate status.

  Meaning       Suggested color   Typical use
  ------------- ----------------- -------------------------------------
  Success       `#16845B`         Confirmed booking, completed trip
  Warning       `#B7791F`         Delays, attention required
  Error         `#C43D3D`         Failed payment, blocking validation
  Information   `#2867A6`         Helpful notices and neutral updates

Semantic colors are functional UI colors, not additions to the core
brand palette. Validate contrast for every foreground/background
pairing.

### 5.4 Color usage rules

-   Use white or soft neutral surfaces for most information-heavy
    screens.
-   Use deep green for primary brand surfaces, navigation emphasis, and
    selected high-value moments.
-   Use mint sparingly for primary actions, selected indicators, or
    small highlights.
-   Use black and near-black for strong typography and the monochrome
    logo system.
-   Keep large text areas neutral to preserve readability.
-   Never communicate booking, payment, or trip status by color alone;
    pair color with a label and, where useful, an icon.

------------------------------------------------------------------------

## 6. Typography

Typography must support English and Arabic as equal first-class
interface languages.

### 6.1 Direction

-   Use a modern, highly legible sans-serif family for product UI.
-   Select a family with strong Arabic and Latin coverage, or use
    carefully matched Arabic and Latin families.
-   Reserve custom calligraphic lettering for the logo; do not use it
    for interface text.
-   Prefer clear, open letterforms and restrained weights.

### 6.2 Proposed type scale

  Token              Size Typical use
  ----------- ----------- -------------------------------------------
  `display`         40 px Marketing hero or major landing statement
  `h1`              32 px Main page title
  `h2`              24 px Section heading
  `h3`              20 px Card or subsection heading
  `h4`              18 px Small section heading
  `body-lg`         16 px Main body and important descriptions
  `body`            14 px Default interface text
  `body-sm`         13 px Supporting information
  `caption`         12 px Metadata and helper text
  `label`       12--14 px Form labels and compact controls

Use a consistent line-height system: approximately 1.2--1.3 for headings
and 1.4--1.6 for body text. Adjust after testing the chosen Arabic font.

### 6.3 Typography rules

-   Use weight and size to establish hierarchy; avoid excessive
    uppercase text.
-   Keep labels concise and sentence case.
-   Use tabular numerals for prices, booking references, times, and
    operational metrics where supported.
-   Ensure Arabic numerals, dates, currency, and mixed-language content
    are formatted consistently.
-   Test Arabic shaping, punctuation, numerals, and mixed RTL/LTR
    strings in real screens.

------------------------------------------------------------------------

## 7. Layout, spacing, and shape

### 7.1 Spacing scale

Use a consistent 4 px base spacing system.

  Token          Value
  ------------ -------
  `space-1`       4 px
  `space-2`       8 px
  `space-3`      12 px
  `space-4`      16 px
  `space-5`      20 px
  `space-6`      24 px
  `space-8`      32 px
  `space-10`     40 px
  `space-12`     48 px
  `space-16`     64 px

### 7.2 Grid and page structure

-   Use a responsive grid with consistent page gutters.
-   Establish a clear maximum content width for desktop pages.
-   Keep dashboards aligned to a shared content grid.
-   Use consistent vertical rhythm between page titles, filters,
    content, and actions.
-   Allow tables and operational data views to use more horizontal space
    than marketing pages.
-   Design mobile layouts intentionally; do not simply shrink desktop
    screens.

### 7.3 Corner radius

Use a restrained radius system:

  ------------------------------------------------------------------------
  Token                                        Value Use
  --------------------- ---------------------------- ---------------------
  `radius-sm`                                   6 px Inputs, compact
                                                     elements

  `radius-md`                                  10 px Buttons, cards, menus

  `radius-lg`                                  14 px Larger panels and
                                                     dialogs

  `radius-xl`                                  20 px Selected feature
                                                     surfaces

  `radius-full`                               999 px Avatars, tags,
                                                     intentionally
                                                     circular controls
  ------------------------------------------------------------------------

Avoid applying the largest radius to every component.

### 7.4 Elevation

-   Prefer borders and subtle surface contrast over heavy shadows.
-   Use elevation to clarify overlays, menus, popovers, and dialogs.
-   Keep card shadows restrained and consistent.
-   Do not use shadows as a substitute for clear layout hierarchy.

------------------------------------------------------------------------

## 8. Iconography and imagery

### 8.1 Icons

-   Use one consistent outline icon family.
-   Keep stroke weight, optical size, and corner treatment consistent.
-   Use filled icons only for selected, active, or strongly emphasized
    states.
-   Pair unfamiliar icons with labels.
-   Avoid creating a separate transport-themed icon style that conflicts
    with the product UI.

### 8.2 Photography and illustration

-   Use real, relevant transportation imagery where it improves
    understanding or trust.
-   Prefer calm, well-composed photography over generic stock
    illustrations.
-   Use illustrations only when they explain an empty state, onboarding
    step, or concept.
-   Do not make roads, arrows, pins, or buses the recurring decorative
    motif of the brand.

------------------------------------------------------------------------

## 9. Core component system

All components should have documented default, hover, focus, active,
disabled, loading, success, and error states where relevant.

### 9.1 Buttons

Define at least:

-   Primary: deep green or a tested high-contrast brand treatment
-   Secondary: neutral surface with clear border
-   Tertiary / ghost: minimal treatment for low-emphasis actions
-   Destructive: semantic error treatment
-   Icon button: for compact, clearly recognizable actions

Rules: - Use action-led labels such as "Search trips," "Confirm
booking," and "Save changes." - Keep one visually dominant primary
action per logical section. - Do not make every action a filled mint
button. - Include visible keyboard focus and disabled states.

### 9.2 Form controls

Standardize: - Text input - Search input - Select / combobox - Date
picker - Time picker - Number input - Checkbox - Radio group - Switch -
Text area - File upload

Each control needs a persistent label, optional helper text, validation
message, and clear focus/error state. Do not rely on placeholder text as
the only label.

### 9.3 Cards and panels

Use cards to group related information, not to wrap every element.
Define reusable patterns for: - Trip result - Booking summary -
Passenger details - Vehicle and driver details - Company overview
metric - Payment summary - Alert / notification - Operational task

### 9.4 Data tables

Company and admin dashboards will rely on tables. Standardize: - Column
alignment and widths - Sortable headers - Search and filters -
Pagination - Row actions - Empty, loading, and error states - Responsive
behavior for smaller screens - Clear status labels

Use tabular numerals for numeric data. Avoid excessive borders and
unnecessary columns.

### 9.5 Status badges

Define consistent labels and treatments for states such as: - Pending -
Confirmed - Paid - Unpaid - Cancelled - Completed - Delayed - In
progress - Failed

The exact status vocabulary must match the platform's business rules.
Use text labels and optional icons; do not invent or rename backend
states during visual redesign.

### 9.6 Feedback and overlays

Create consistent patterns for: - Toast notifications - Inline alerts -
Confirmation dialogs - Side panels / drawers - Tooltips - Empty states -
Loading skeletons - Error and retry states

Use dialogs only for decisions that require interruption or
confirmation.

------------------------------------------------------------------------

## 10. Navigation and information architecture

The platform serves multiple audiences. Each role should have a focused
navigation structure while sharing the same visual system.

### 10.1 Passenger experience

Prioritize the main passenger journey:

1.  Search for a trip
2.  Compare available trips
3.  Select seats and enter passenger details
4.  Review price and booking details
5.  Complete payment
6.  Receive ticket / booking confirmation
7.  View, manage, or cancel a booking where policy allows

Design priorities: - Make origin, destination, date, passenger count,
and availability easy to understand. - Make total price and any relevant
conditions visible before confirmation. - Keep booking progress clear. -
Make tickets and booking references easy to retrieve. - Design helpful
empty, unavailable, and payment-failure states.

### 10.2 Transportation company portal

Support operational tasks such as: - Overview and operational metrics -
Trips and schedules - Routes and stops - Vehicles and capacity - Drivers
and staff - Bookings and passenger manifests - Payments and settlements,
according to actual permissions - Reports and company settings

Design priorities: - Optimize for frequent use and information
scanning. - Keep filters and table actions predictable. - Make
operational status visible without overwhelming the screen. - Respect
company-level permissions and data boundaries.

### 10.3 Driver experience

Prioritize mobile usability and time-sensitive tasks, such as: -
Assigned trips - Trip details and route information - Passenger list or
boarding workflow, if supported - Trip status updates - Relevant alerts
and operational instructions

Design priorities: - Large, touch-friendly controls. - Minimal steps for
common tasks. - Clear current-trip context. - Strong readability in
varied lighting conditions. - Avoid exposing unnecessary administrative
complexity.

### 10.4 Platform administration

Support platform-wide oversight, including: - Companies and account
management - Users and roles - Platform-wide trips and bookings -
Configuration and operational monitoring - Reports and audit-related
workflows, where supported

Design priorities: - Clear distinction between platform-wide and
company-specific data. - Strong permission-aware actions. - Confirmation
for high-impact changes. - Traceable, understandable feedback after
administrative actions.

**Important:** These are design groupings, not a claim that every listed
feature currently exists. Confirm the live product's capabilities,
permissions, and workflows before finalizing navigation.

------------------------------------------------------------------------

## 11. RTL and localization

Arabic is a core language requirement, not a later visual adaptation.

### 11.1 RTL behavior

-   Support true RTL page layout when Arabic is selected.
-   Mirror directional navigation and layout where appropriate.
-   Do not mirror non-directional icons or brand marks automatically.
-   Keep numeric values, phone numbers, booking codes, and
    mixed-language strings readable.
-   Test tables, forms, menus, calendars, and dialogs in both
    directions.
-   Use logical CSS properties such as `margin-inline-start` rather than
    hard-coded left/right rules.

### 11.2 Language switching

-   Preserve the user's current workflow when switching languages where
    feasible.
-   Ensure labels, validation, notifications, and empty states are
    translated consistently.
-   Avoid mixing Arabic and English randomly in the same interface.
-   Confirm preferred Arabic terminology with product stakeholders and
    users.

### 11.3 Dates, time, and currency

-   Localize date, time, number, and currency presentation.
-   Keep stored values and displayed values clearly separated in
    implementation.
-   Validate timezone behavior for trip departure and arrival times.
-   Ensure booking references and payment identifiers remain copyable
    and unambiguous.

------------------------------------------------------------------------

## 12. Accessibility and usability

Target WCAG 2.2 AA as the accessibility goal for the redesigned
interfaces.

Minimum design expectations: - Text and controls must meet contrast
requirements. - Never use color as the only way to communicate
meaning. - All interactive controls need visible keyboard focus. -
Support keyboard navigation and logical focus order. - Provide labels
and accessible names for controls. - Use touch targets large enough for
mobile use; aim for at least 44 × 44 CSS px where practical. - Respect
reduced-motion preferences. - Avoid tiny helper text and low-contrast
metadata. - Provide clear validation messages and recovery guidance. -
Test Arabic and English experiences with assistive technology.

Accessibility must be verified in the implemented product, not assumed
from design files.

------------------------------------------------------------------------

## 13. Interaction principles

-   Give immediate feedback after meaningful actions.
-   Prevent duplicate submissions during booking and payment.
-   Preserve entered information when validation fails.
-   Explain why an action is unavailable when the reason is useful.
-   Use confirmation for destructive or high-impact actions.
-   Make loading states reflect the task being performed.
-   Make errors actionable: explain what happened and what the user can
    do next.
-   Keep navigation and filters consistent across related pages.

For booking and payment flows, prioritize correctness, clarity, and user
confidence over animation or visual novelty.

------------------------------------------------------------------------

## 14. Responsive behavior

Design and test at these practical viewport ranges:

  ------------------------------------------------------------------------
  Layout                            Indicative width Guidance
  --------------------- ---------------------------- ---------------------
  Small mobile                           320--374 px Single-column,
                                                     essential actions
                                                     prioritized

  Mobile                                 375--767 px Touch-first, compact
                                                     navigation

  Tablet                                768--1023 px Adaptive columns and
                                                     navigation

  Desktop                              1024--1439 px Full product
                                                     navigation and
                                                     workspace

  Wide desktop                     1440 px and above Controlled content
                                                     width; avoid
                                                     excessive line length
  ------------------------------------------------------------------------

These are design breakpoints to validate against actual user devices and
product analytics, not rigid device categories.

------------------------------------------------------------------------

## 15. Product-specific design priorities

### Passenger booking

-   Search should be the clearest starting point.
-   Trip results should make departure, arrival, duration, operator,
    seat availability, and total price easy to compare---only where
    those data are available.
-   The booking summary should remain easy to review.
-   Clearly communicate payment status and ticket availability.
-   Avoid hidden fees or ambiguous totals.

### Company operations

-   Optimize for scanning, filtering, and repeated tasks.
-   Keep key trip and booking identifiers visible.
-   Use consistent table and detail-page patterns.
-   Provide clear empty states when no trips or bookings match the
    current filters.

### Driver workflows

-   Keep the most important task visible immediately.
-   Minimize typing and complex navigation during active trips.
-   Use clear action labels and confirmation for consequential updates.
-   Do not assume a driver is using a large screen or ideal network
    connection.

### Admin workflows

-   Make scope and permissions explicit.
-   Distinguish global actions from company-specific actions.
-   Use confirmation and clear consequences for destructive operations.
-   Provide useful feedback after changes.

------------------------------------------------------------------------

## 16. Design tokens and implementation handoff

Maintain design tokens centrally rather than repeating raw values
throughout the codebase.

Suggested token groups:

``` text
color.brand.*
color.neutral.*
color.semantic.*
typography.family.*
typography.size.*
typography.weight.*
typography.lineHeight.*
spacing.*
radius.*
border.*
shadow.*
breakpoint.*
motion.*
```

Example CSS custom properties for the initial palette:

``` css
:root {
  --color-brand-green-900: #0B3D2E;
  --color-brand-mint-500: #14C88A;

  --color-neutral-000: #FFFFFF;
  --color-neutral-050: #F5F5F5;
  --color-neutral-950: #000000;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
}
```

Implementation guidance: - Keep tokens independent from individual
pages. - Build reusable components before duplicating patterns. -
Support RTL through logical layout properties. - Keep business logic and
permission rules separate from visual components. - Document component
variants and states. - Validate the design system in real passenger,
company, driver, and admin workflows.

------------------------------------------------------------------------

## 17. Redesign process

Follow this sequence to reduce rework and keep the platform coherent.

### Phase 1 --- Product audit

-   Inventory existing screens and workflows.
-   Identify user roles, permissions, and navigation.
-   Document current business rules and status values.
-   Identify usability issues and inconsistent patterns.
-   Separate existing capabilities from proposed future features.

**Deliverable:** Current-state product map and redesign priorities.

### Phase 2 --- Brand and foundation

-   Refine the MASAR logo as vector artwork.
-   Confirm the Arabic and Latin typefaces.
-   Validate the color palette and contrast.
-   Define spacing, layout, radius, elevation, and icon rules.
-   Establish RTL and localization foundations.

**Deliverable:** Approved visual foundation and token set.

### Phase 3 --- Component library

-   Design buttons, fields, selects, cards, tables, badges, dialogs, and
    navigation.
-   Specify component states and responsive behavior.
-   Validate components in both Arabic RTL and English LTR.

**Deliverable:** Reusable component library and usage documentation.

### Phase 4 --- Core journeys

Redesign and validate the most important journeys first: 1. Passenger
trip search and booking 2. Company trip and booking management 3. Driver
assigned-trip workflow 4. Admin company and user management

**Deliverable:** High-fidelity screens and tested end-to-end flows.

### Phase 5 --- Implementation and QA

-   Implement tokens and reusable components.
-   Migrate workflows incrementally.
-   Test responsive layouts, RTL, accessibility, and permissions.
-   Verify booking, payment, and trip-state behavior.
-   Collect feedback from real users and refine.

**Deliverable:** Consistent, production-tested MASAR experience.

------------------------------------------------------------------------

## 18. Definition of done

A redesigned screen is ready when:

-   It uses the shared MASAR tokens and components.
-   Its hierarchy and primary action are clear.
-   It works in Arabic RTL and English LTR, where the screen is
    localized.
-   It behaves correctly at supported viewport sizes.
-   It includes loading, empty, error, disabled, and success states as
    relevant.
-   It meets accessibility expectations.
-   It respects user roles, permissions, and existing business rules.
-   Its labels and status terminology match the actual product.
-   It has been reviewed in the context of the full workflow, not only
    as an isolated mockup.

------------------------------------------------------------------------

## 19. Decisions still to confirm

The following items should remain open until validated:

-   Final vector logo and standalone app mark
-   Final Arabic and Latin font families
-   Final semantic and extended neutral palette
-   Exact button heights, input heights, and component dimensions
-   Final navigation and information architecture for each role
-   Current feature availability and permission model
-   Supported languages, currencies, and date conventions
-   Actual mobile and desktop usage patterns
-   Accessibility and browser support requirements

Do not treat illustrative mockups or generated brand boards as proof
that these decisions are finalized.

------------------------------------------------------------------------

## 20. Guiding statement

> **MASAR should make complex transportation feel clear, connected, and
> effortless.**

Every screen should express the same underlying identity: refined Arabic
character, disciplined typography, purposeful green accents, calm
neutral surfaces, and a consistent experience across every part of the
platform.

The design system succeeds when passengers can book with confidence and
transportation teams can operate efficiently---while both experiences
unmistakably feel like MASAR.
