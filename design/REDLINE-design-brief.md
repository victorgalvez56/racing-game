# REDLINE — Design Brief

> Working document. Lock these decisions before opening Pencil so the visual design is intentional, not improvised.

## 1. Brand voice

- **Genre:** arcade racer + vehicular combat (dual-mode)
- **Tone:** loud, fast, neon, slightly aggressive — *not* corporate, *not* cute
- **References:** Rocket League menus, Need for Speed Heat title screens, Hotline Miami palette
- **One-liner:** *"Race clean. Or wreck everything."*

## 2. Color tokens

Synthwave with restraint — three accents max so the UI doesn't feel like a 2014 GeoCities page.

| Token | Hex | Usage |
|---|---|---|
| `--bg-deep` | `#08080F` | Page background — near-black with cool shift |
| `--bg-surface` | `#13131F` | Card backgrounds |
| `--bg-elevated` | `#1C1C2E` | Hover states, modals |
| `--accent-redline` | `#FF2E4D` | Primary brand — combat mode, danger, CTAs |
| `--accent-cyan` | `#00E5FF` | Secondary — race mode, info, links |
| `--accent-amber` | `#FFB627` | Tertiary — arcade mode, warnings, highlights |
| `--text-primary` | `#F5F5FA` | Headings |
| `--text-secondary` | `#9999B0` | Body, captions |
| `--text-dim` | `#5A5A75` | Muted, disabled |
| `--border-subtle` | `#26263A` | Dividers |

**Mode-specific theming:**
- RACE → cyan accent dominant
- COMBAT → redline accent dominant
- ARCADE → amber accent dominant

## 3. Typography

- **Display:** `"Space Grotesk", sans-serif` — weight 700, tight tracking (-0.02em), for logo/headings
- **UI:** `"Inter", sans-serif` — weight 500/600, default for buttons/labels
- **Mono:** `"JetBrains Mono", monospace` — weight 500, for HUD numbers (lap times, HP, ammo)

Scale (modular, 1.25 ratio):
- `--text-xs` 12px • `--text-sm` 14px • `--text-base` 16px
- `--text-lg` 20px • `--text-xl` 25px • `--text-2xl` 32px
- `--text-3xl` 40px • `--text-4xl` 50px • `--text-display` 96px (logo only)

## 4. Spacing & layout

8px grid. Use `--space-1` (4px) through `--space-16` (128px).

**Title screen:** centered, max-width 720px, vertical rhythm 32px between blocks.
**Main menu:** 3-column card grid, gap 24px, max-width 1080px.
**Onboarding:** modal overlay 480×320, centered, dismissible.

## 5. Screens to design in Pencil

### Screen 1 — Title Screen
- Full viewport
- **REDLINE** wordmark large (96px), with subtle glow
- Tagline below: *"Race clean. Or wreck everything."* (20px, dim)
- "PRESS ANY KEY" prompt at bottom (14px, animated pulse)
- Background: faint racing-line motif or grid (low opacity, animated drift)
- No buttons — keyboard prompt only (game-feel)

### Screen 2 — Main Menu
- Top: "REDLINE" small (24px) + version badge
- Hero question: *"PICK YOUR LANE."* (40px)
- 3 mode cards in row:
  - **🏁 RACE** — cyan border, "5 laps. No mercy on the clock."
  - **💥 COMBAT** — redline border, "5 kills. Last car running."
  - **🎮 ARCADE** — amber border, "Both. At once. No rules."
- Each card: icon (top), mode name (heading), tagline (1 line), button "ENTER →"
- Hover: card lifts + border glows + tagline animates
- Bottom: small links — "Controls", "Credits"

### Screen 3 — Onboarding overlay
- Modal over game scene (blurred backdrop)
- Title: mode name + icon
- 3 columns: **OBJECTIVE** / **CONTROLS** / **TIPS**
- "GOT IT (any key)" button
- Skippable; localStorage flag `redline.onboardingSeen.{mode}` once dismissed

## 6. Animation principles (GSAP)

- **Title entrance:** logo scale 0.92→1, opacity 0→1, 0.8s `power3.out`. Tagline +0.15s delay. Prompt fade-in +0.4s with infinite pulse loop.
- **Menu enter:** cards stagger from below, 0.5s each, 0.08s stagger, `power2.out`.
- **Mode card hover:** `y: -4`, border `boxShadow` glow, 0.2s `power1.out`.
- **Screen transition:** outgoing scale-down + fade, incoming scale-up + fade, 0.4s, overlapping by 0.1s.
- **Onboarding entry:** scale 0.96→1 + opacity 0→1, 0.3s. Backdrop blur 0→8px in parallel.

## 7. Accessibility (audit will catch the rest)

- Tab focus order: top→bottom, left→right
- All interactive elements have visible focus ring (2px cyan outline, offset 2px)
- Contrast: WCAG AA minimum on all text vs background
- `prefers-reduced-motion` respected — disable shake, dampen entrances
- Keyboard-first navigation; mouse is secondary

## 8. Out of scope (for now)

- Settings menu (volume sliders, key remapping)
- Stats / leaderboard screen
- Cosmetics / unlocks
- In-game pause menu redesign

These get added once the core flow lands.
