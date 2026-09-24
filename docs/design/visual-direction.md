# Visual direction — "calm notice board"

Status: **approved** by Billy on 2026-09-24 (Phase 1 step 0).

## Mood

Calm, trustworthy and warm, like a well-kept community notice board. The interface stays quiet so
that the one thing that matters (an urgent job) stands out. No gradients, no decoration that does
not carry meaning, generous spacing, big text and big buttons.

## Colour

A warm off-white page, white cards, near-black text and one brand colour: **KaziForce green**
(opportunity, "go"). Red, amber and slate are reserved for the three priority levels, so colour
always means something. Light and dark mode follow the phone's setting.

| Token | Light | Dark | Use | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| canvas | `#FAF8F5` | `#161311` | page background | — |
| surface | `#FFFFFF` | `#221E1B` | cards, sidebar | — |
| ink | `#1C1917` | `#F5F5F4` | main text | 16.5:1 / 15.2:1 |
| ink-muted | `#57534E` | `#B5AFA9` | secondary text | 7.2:1 / 7.6:1 |
| line-strong | `#78716C` | `#8A837D` | input and button borders | 4.8:1 / 4.4:1 (needs 3:1) |
| primary | `#0B6B45` | `#4CC38A` | main buttons, active menu item | 6.6:1 with its text / 7.8:1 |
| focus | `#1D4ED8` | `#7AA2FF` | keyboard focus ring (3 px) | 6.3:1 / 7.4:1 |

WCAG 2.2 AA needs 4.5:1 for normal text and 3:1 for large text, icons and borders. Every pair
above passes; ratios were calculated with the WCAG formula.

## Priority levels: colour + icon + word, always

| Level (users see) | Internal | Icon | Text colour on tint (light / dark) | Side bar |
| --- | --- | --- | --- | --- |
| **Urgent** / Dharura | `urgent` | warning triangle | `#B42318` on `#FEF3F2` = 6.1:1 / `#FDA29B` on `#3A1512` = 8.4:1 | red |
| **Important** / Muhimu | `medium` | bell | `#93370D` on `#FFFAEB` = 7.2:1 / `#FEC84B` on `#35230A` = 9.7:1 | amber (3.5:1) |
| **For later** / Baadaye | `low` | clock | `#344054` on `#F2F4F7` = 9.5:1 / `#D0D5DD` on `#262B33` = 9.7:1 | slate (5.0:1) |

The three icons have different shapes (triangle, bell, clock), so they can be told apart without
colour (colour blindness, sunlight glare, greyscale phones). Urgent cards also show the countdown
("Closes in 38 minutes") in bold. Unread alerts show a dot **and** the word "New" **and** a bold
title.

## Type

**Atkinson Hyperlegible Next**, a free font designed by the Braille Institute for readers with low
vision. Letters that are easy to confuse (I, l, 1; O, 0) have distinct shapes. It is bundled with
the app (no Google Fonts request), which matters on slow connections.

- Body text 18 px on phones, 16 px on tablets and laptops; line height 1.5.
- Titles 20–30 px, bold. Nothing the user must read is smaller than 16 px.
- Everything is sized in rem, so the later "Text size: Large" setting scales the whole app.

## Shape, spacing and motion

- Rounded corners: 12 px cards, 12 px buttons, fully rounded filter chips and badges.
- Tap targets at least 44 px (buttons 48 px, bottom menu items 64 px), with at least 8 px between.
- Motion: 150 ms (colour changes), 200 ms (panels), 300 ms (larger moves), ease-out, no bounce.
  `prefers-reduced-motion` turns all of it off.

## Layout

- **Phones (< 768 px):** logo bar on top, bottom menu with 4 items (icon + label), one column.
  Opening an alert shows it as its own page with a "Back to alerts" button.
- **Tablets (768–1023 px):** left sidebar menu, one column.
- **Laptops (>= 1024 px):** left sidebar, alert list and alert details side by side.
