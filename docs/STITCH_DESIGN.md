---
name: Clinical High-Reliability Downtime Interface
colors:
  surface: '#f8f9fb'
  surface-dim: '#d9dadc'
  surface-bright: '#f8f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#edeef0'
  surface-container-high: '#e7e8ea'
  surface-container-highest: '#e1e2e4'
  on-surface: '#191c1e'
  on-surface-variant: '#45474c'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f3'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#555e72'
  primary: '#071020'
  on-primary: '#ffffff'
  primary-container: '#1c2536'
  on-primary-container: '#838ca1'
  inverse-primary: '#bdc6dd'
  secondary: '#4a6078'
  on-secondary: '#ffffff'
  secondary-container: '#cae2fd'
  on-secondary-container: '#4e657c'
  tertiary: '#001309'
  on-tertiary: '#ffffff'
  tertiary-container: '#002b1a'
  on-tertiary-container: '#4f9a76'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fa'
  primary-fixed-dim: '#bdc6dd'
  on-primary-fixed: '#121c2c'
  on-primary-fixed-variant: '#3e4759'
  secondary-fixed: '#cee5ff'
  secondary-fixed-dim: '#b1c9e4'
  on-secondary-fixed: '#031d31'
  on-secondary-fixed-variant: '#32495f'
  tertiary-fixed: '#a6f3ca'
  tertiary-fixed-dim: '#8ad6af'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9fb'
  on-background: '#191c1e'
  surface-variant: '#e1e2e4'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  vital-display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.03em
  vital-display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.04em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 15px
  label-uppercase:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
  label-badge:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
  code-tabular:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style
This design system provides a high-reliability, zero-latency clinical workspace tailored for acute hospital environments experiencing EHR network outage, cyberattack failover, or planned downtime. Designed primarily for mobile Workstations on Wheels (COWs), wall mounts, and nurses' station terminal displays, the aesthetic fuses rigorous clinical utility with cognitive calm.

The visual direction centers on **Systematic Clinical Pragmatism**:
- **High-Density Legibility:** Immediate clarity under harsh fluorescent lighting and rapid bedside triage conditions.
- **Fail-Safe Visibility:** Constant, ambient awareness of offline/online sync state, shift clocks, and mesh replication status via an authoritative status rail.
- **Anatomical & Triage Precision:** Integration of warm ivory and soft slate-blue anatomical mapping, tactile step-counters for vitals entry, and standardized triage color-coding (NEWS2, critical anaphylaxis alarms).
- **Reduced Cognitive Load:** Pure white cards over a soft clinical grey canvas with low-contrast structural boundaries create distinct zones for vitals, observations, neurological status, and drug reconciliation without visual fatigue.

## Colors
The palette balances an authoritative, dark clinical rail for situational awareness with clean, medical-grade whites and greys for long-duration ward documentation.

### Core Roles
- **Primary (`#1C2536`):** Deep Clinical Navy. Applied to top status banners, selected state pills, primary bedside actions, and bold vitals data display.
- **Secondary (`#7D94AD`):** Muted Slate-Blue. Serves as interactive controls, unselected anatomical zones, steppers, and secondary action badges.
- **Tertiary (`#277453`):** Medical Sync Green. Communicates synced records, normal vitals, optimal telemetry parameters, and active connectivity.
- **Neutral Canvas (`#F7F8FA`):** Soft Clinical Grey. Prevents high-contrast glare on workstation monitors during extended night and day shifts.

### Clinical Status & Semantic Alerts
- **Critical Red (`#B3261E`):** Reserved exclusively for severe allergies (e.g., penicillin anaphylaxis), elevated NEWS2 deterioration scores, and immediate emergency clinical alerts. Background tint: `#FDF2F2`, border: `#F5C2C0`.
- **Downtime Amber (`#C18A28`):** Offline mode notice, pending reconciliation items, manual sync delays, and moderate NEWS2 alerts. Background tint: `#FEF8EC`, border: `#F6DFB3`.
- **Card Surface (`#FFFFFF`):** Base container for clinical groupings, vital cards, and data forms.
- **Border Neutral (`#DEE3E9`):** 1px structural framing for cards, input dividers, and tabular grids.
- **Slate Text Muted (`#5A6E85`):** Secondary clinical metadata (units of measurement, timestamps, MRN tags).

## Typography
All typography is built on `Inter` with OpenType tabular figures (`tnum`) activated by default across vital indicators, time markers, and score tables.

- **Vitals Display (`vital-display`, `vital-display-lg`):** Extra-bold, dense numbers for rapid reading at a distance of 3–6 feet from the COW screen (e.g., blood pressure, heart rate, SpO2).
- **Tabular Alignment:** All blood pressure numbers, timestamps, dosages, and trend columns must render in fixed-width tabular alignment to prevent shift jitter when streaming or incrementing.
- **Section Headers (`label-uppercase`):** 11px uppercase in `#5A6E85` with `0.06em` tracking to differentiate anatomical segments, clinical protocols, and observation zones.
- **Patient Context:** Patient name (`headline-lg`) is flanked by high-contrast metadata pills (Bed, MRN, DOB, Age) rendered in crisp medium-weight labels.

## Layout & Spacing
The layout adheres to a fixed-sidebar, fluid-dashboard grid optimized for 1366x768 up to 1920x1080 horizontal hospital displays.

- **Persistent Header (44px):** Fixed status banner in `#1C2536` pinned to the top viewport edge. Carries operational status, downtime timer, offline storage health, and mesh sync status.
- **Clinical Navigation Rail (200px – 220px):** Fixed white left sidebar with high-contrast icon-and-label buttons, status notification badges, and section dividers.
- **Main Canvas Grid:**
  - 12-column responsive grid with dense `0.75rem` (12px) gutters and `1rem` (16px) margins.
  - Vitals parameters span 4 columns on 1080p, reflowing to 6 columns on 1366px screens.
  - Patient header spans the full 12 columns, incorporating priority alert badges on the right quadrant.
- **Rhythm & Touch Targets:** Touch-operable tap targets for steppers and segmented chips maintain a minimum height of 32px (ideal for rapid mouse use or touch-panel COWs while gloved).

## Elevation & Depth
This system eschews decorative drop shadows in favor of sterile, tactile clinical boundaries that maintain legibility across varying display qualities and monitor viewing angles.

- **Layer 0 (Canvas):** `#F7F8FA` matte background.
- **Layer 1 (Card Modules):** `#FFFFFF` surface bounded by a crisp 1px stroke of `#DEE3E9`. No drop shadows; cards rely on outline containment.
- **Layer 2 (Nested Groupings & Stepper Fields):** Light tinted recessed panels (`#F0F3F7` or `#F7F9FA`) inside vital cards for data fields and segmented switches.
- **Floating Modals & Overlays:** In the rare case of emergency override modals or full-screen anatomical charts, apply an authoritative scrim (`#1C2536` with 60% opacity) and a tight border elevation: `0 8px 24px -4px rgba(28, 37, 54, 0.25)`.
- **Status Warnings:** Critical alerts (anaphylaxis, high NEWS2) use flat border emphasis (1px solid `#B3261E` with `#FDF2F2` surface fill) rather than elevated glowing shadows.

## Shapes
Shapes employ a disciplined, soft radius (`roundedness: 1` — 4px to 6px) that conveys clinical order, efficiency, and system durability.

- **Cards & Data Modules:** 6px radius (`rounded-md`).
- **Segmented Toggle Controls & Chips:** 4px radius (`rounded-sm`).
- **Pill Badges:** Fully rounded capsule buttons reserved solely for status highlights (e.g., Bed Number, Stable/Critical status, Sync State).
- **Steppers (+ / - adjustments):** Square 28x28px or 32x32px keys with a 4px corner radius for tactile input feedback.

## Components

### 1. Patient Banner & Triage Header
- **Container:** Full-width `#FFFFFF` card with 1px `#DEE3E9` perimeter.
- **Identification:** Large bold patient name, flanked by bed assignment pill in `#1C2536` text on light slate tint.
- **Alert Stack:** Critical Allergy banner directly inside the header container styled with `#FDF2F2` fill, `#B3261E` border, warning triangle icon, and bold red typography.
- **Sync Badge:** Device capture pill indicating data origin (e.g., "Mindray Spot COW-048 • Synced 09:12") in `#5A6E85`.

### 2. Vital Sign Documentation Cards
- **Card Structure:** Top title bar with parameter icon, title, sync timestamp, and status tag (e.g., "Afebrile", "Optimal").
- **Display Zone:** Giant tabular numbers (32px–40px) with small inline measurement unit (`mmHg`, `bpm`, `°C`, `%`).
- **Increment Controls:** Tactile `-` and `+` square buttons positioned directly beneath or adjacent to the value for gloved bedside adjustments.
- **Segmented Selectors:** Multi-option bar directly below the numeric readouts (e.g., Cuff Site: Left Arm / Right Arm / Thigh; Rhythm: Regular / Irregular). Active selection fills with `#1C2536` and white text; inactive uses `#FFFFFF` with `#7D94AD` text.

### 3. Pain Score & Anatomical Mapping (Theme 2 Style)
- **Visual Style:** Warm Ivory (`#FBF9F5`) and Soft Slate-Blue (`#7D94AD`) vector anatomical outline.
- **Target Site Pin:** Clear circular indicator pinpointing active surgical incisions, drains, or injury zones.
- **Scale Selector:** Numeric 0 to 10 inline scale with step buttons, where the chosen level inverts to `#1C2536` background.

### 4. Status Indicator Rails & Badges
- **Offline Banner:** Solid `#1C2536` strip with amber (`#C18A28`) status dot, uppercase bold indicator: `"OFFLINE MODE: EHR DOWNTIME ACTIVE"`, and secondary node info (`"Direct P2P Mesh Active"`).
- **NEWS2 Score Indicator:** Rounded card featuring giant composite score (e.g., "0"), categorical risk label ("Low Clinical Risk"), and routine monitoring interval tag.

### 5. Input Fields & Quick Tags
- **Observation Input:** Monospace or clean sans multi-line field with 1px `#DEE3E9` border and auto-save timestamp ("Local draft auto-saved 1m ago").
- **Quick Tag Pills:** `#F0F3F7` fill, `#31435A` label, with leading `+` symbol for single-tap insertion into clinical notes (e.g., `+ Post-Op Hip Protocol`, `+ Sips & Light Diet`).

### 6. Action Bars & Navigation
- **Sidebar Nav Items:** Height 36px, left icon + label. Hover state displays `#F0F3F7` tint; active state features `#1C2536` text with `#E6EBF2` pill container.
- **Primary Save/Handover Action:** Bottom action bar with secondary actions in white stroke and primary action ("Save & Flag for MO Review") filled in `#1C2536` with high-contrast white text.