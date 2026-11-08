# Agora: Teacher side bar on desktop — IA spec

Status: draft
Date: 2026-10-19
Amends: `docs/ia/agora-teacher-home.md` §5 (Global navigation, Menu). Labels and tree are unchanged; this spec moves the menu, it does not rename or re-order it.
Card: Trello ApuHABY9.

## 1. Audiences
| Audience | What changes | Must never see |
|---|---|---|
| Teacher | At ≥1024px the menu is always on screen as a side bar. Phone and tablet are unchanged. | Library rows if not approved (unchanged) |
| Supervisor | Same. The supervision row stays under "עוד", and the side bar is also on every `/supervise/*` screen. | — |
| System admin | Same. The library-admin row keeps its open-reports count. | — |
| Student | Nothing. Game and join screens never render `TeacherNav`. | — |

## 2. Objects
Nothing new. The side bar shows the same objects as the ≡ panel: live lessons (`AgoraSession` where `isSessionLive`), My classes (`TeacherDashboard.classes`), the teacher's places, and the account. The data comes from the same cache, `lib/teacherNav.ts`.

## 3. Labels
Every item reuses its current key. Only the fold control is new.

| Concept | HE | EN | i18n key | Status |
|---|---|---|---|---|
| The side bar itself (landmark name) | תפריט | Menu | nav.menu | reuse |
| Top bar landmark | ניווט המורה | Teacher navigation | nav.aria | reuse |
| This lesson (group) | השיעור הזה | This lesson | nav.this_lesson | reuse |
| Live lesson (group) | שיעור פעיל | Live lesson | nav.live_now | reuse |
| Live tag on a row | פעיל | Live | dashboard.game_live | reuse |
| Teachers' room | חדר המורה | Teacher room | teacher.title | reuse |
| My scenarios | התרחישים שלי | My scenarios | scenlib.seg_mine | reuse |
| Scenario library | ספריית התרחישים | Scenario library | scenlib.nav | reuse |
| Start a lesson | התחלת שיעור | Start a lesson | dashboard.start_game | reuse |
| My classes (group) | הכיתות שלי | My classes | dashboard.my_classes | reuse |
| No classes | אין לכם עדיין כיתות. | You have no classes yet. | nav.no_classes | reuse |
| Load failed | לא הצלחנו לטעון… | Couldn't load… | nav.load_failed | reuse |
| More (group) | עוד | More | nav.more | reuse |
| Past lessons | שיעורים קודמים | Past lessons | dashboard.my_games | reuse |
| My activity | הפעילות שלי | My activity | supervise.myActivity | reuse |
| Words we don't say | מילים שלא אומרים | Words we don't say | nav.banned_words | reuse |
| My Agora classrooms (Studio, new tab) | כיתות האגורה שלי | My Agora classrooms | nav.my_overview | reuse |
| Supervision | ריכוז אזורי | Regional coordination | supervise.title | reuse |
| Library admin | ניהול הספרייה | Library admin | scenlib.adm_link (+ scenlib.adm_badge) | reuse |
| How to run a lesson | איך מריצים שיעור | How to run a lesson | nav.how_to_run | reuse |
| Account (group) | החשבון | Account | nav.account | reuse |
| Sign out | יציאה מהחשבון | Sign out | nav.sign_out / nav.sign_out_failed | reuse |
| Fold the bar | קיפול התפריט | Fold the menu | **NEW nav.fold** | add |
| Unfold the bar | פתיחת התפריט | Unfold the menu | **NEW nav.unfold** | add |

NEW keys in all six blocks of `apps/agora/src/lib/i18n.ts` (or `teacherHomeStrings.ts`, where nav.more lives):
- nav.fold: he קיפול התפריט · en Fold the menu · ar طيّ القائمة · es Plegar el menú · de Menü einklappen · nl Menu inklappen
- nav.unfold: he פתיחת התפריט · en Unfold the menu · ar فتح القائمة · es Desplegar el menú · de Menü ausklappen · nl Menu uitklappen

There are no tooltip keys. The tooltip on a folded icon is that item's own label.

## 4. Side bar structure (≥1024px)
The groups and their order are exactly as in the ≡ panel today.
1. **השיעור הזה**: only on `/teach/session/:id` and `/teach/session/:id/class`. These are the screen's own `menuItems` (QR, projector QR on/off, move class, projector, settings). Per Q2: list only the rows the top bar does not already show at this width.
2. **שיעור פעיל**: one row per live lesson. The label is the class (or "guest lesson"), and the meta is "פעיל" plus the stage. Each row goes to `/teach/session/:id`. The group is absent when nothing is live. Always the second group.
3. **Places**, with no heading:
   - חדר המורה → `/teach`
   - התרחישים שלי → `/teach/scenarios`
   - ספריית התרחישים → `/teach/library` (approved only)
   - התחלת שיעור → `/teach/start`
4. **הכיתות שלי**: one row per active class (class label, plus the student count as meta) → `/teach/class/:id`.
   - Empty: "אין לכם עדיין כיתות." as plain text, not a link.
   - Loading: a spinner in the group only.
   - Error: nav.load_failed under the group. The rest of the bar still works.
5. **עוד**:
   - שיעורים קודמים → `/teach/lessons`
   - הפעילות שלי → `/teach/activity`
   - מילים שלא אומרים → `/teach/words`
   - כיתות האגורה שלי → Studio, in a new tab (only when there is a URL; never "current")
   - ריכוז אזורי → `/supervise` (supervisor or admin only)
   - ניהול הספרייה → `/teach/library/admin` (system admin only, with a count badge)
   - איך מריצים שיעור → `/teach?help=1`
6. **החשבון**, last: the signed-in email line, then יציאה מהחשבון. The failure note appears in place.

**Current item.** The route, without its query, maps to one item. This replaces today's exact-match rule (`here() === route`).
- `/teach` → חדר המורה. `/teach?help=1` → איך מריצים שיעור.
- `/teach/scenarios`, `/scenarios/new`, `/scenarios/:id` → התרחישים שלי.
- `/teach/library`, `/library/:id` → ספריית התרחישים. `/teach/library/admin` → ניהול הספרייה.
- `/teach/start` → התחלת שיעור.
- `/teach/class/:id` and `/class/:id/student/:m` → that class's row.
- `/teach/session/:id` (and `/class`) → that live lesson's row.
- `/teach/report/:id` → its class's row if listed, else שיעורים קודמים.
- `/teach/lessons`, `/activity`, `/words` → their own rows.
- `/supervise/*` → ריכוז אזורי.

**Role gating** is unchanged: the library needs `access === 'approved'`, supervision needs `canSupervise`, and library admin needs `isAdmin`.

**Data.** On desktop the bar is visible on load, so it calls `loadTeacherNav()` and `ensureLibraryAccess()` on mount, not on first open. The 60s cache and the hand-off from `/teach` stay as they are.

## 5. States
- **Open** (default, the first time on a device): icon plus label for every row, and group headings visible. Width roughly 240 to 280px.
- **Folded**: a strip of icons only.
  - Group headings become a thin divider.
  - The My classes rows collapse into one icon labelled הכיתות שלי. Pressing it unfolds the bar and moves focus to the first class.
  - Live-lesson rows keep one icon each, with the class name as the tooltip.
  - Every icon shows its label as a tooltip on hover and on keyboard focus. The tooltip can be dismissed with Escape and stays while hovered (WCAG 1.4.13).
  - The label stays in the accessibility tree (visually hidden, not `display:none`).
  - The email line is hidden. Sign out stays as an icon.
  - Badges (library-admin count) stay on the icon.
- **Fold control**: one button at the top of the side bar, first in its tab order. Toggle with `aria-expanded` true when open; label nav.fold when open, nav.unfold when folded; `aria-controls` points at the side bar.
- **Remembered**: only open or folded, in localStorage key `agora_teacher_sidebar`, values `open` or `folded`. Every read/write wrapped in try/catch, fallback `open`. Per device.
- **Resize below 1024px**: the side bar is removed and the ≡ button returns, with its panel closed. The stored value is not touched.
- **Resize back up**: the bar returns in its stored state, and an open ≡ panel closes.
- **RTL/LTR**: the bar sits on the inline-start edge (right in he/ar, left in en/es/de/nl). The fold chevron flips with script direction.
- **Keyboard**: DOM/tab order: top bar, then side bar (fold control, then items top to bottom), then the page. Current item has `aria-current="page"`. Focus is not moved into the bar on navigation. Not a dialog: Escape only closes a tooltip. It is a `<nav aria-label="תפריט">` landmark; the top bar keeps nav.aria.
- **Loading, empty, error**: per group. The bar never blanks as a whole.

## 6. Slim top bar at ≥1024px
- Stays: back arrow, title and subtitle, `segment` (Board ⇄ Class), join-code pill, `trailing` (language picker, device-role chip, projector button, cog, supervisor scope picker).
- Goes: the ≡ button, the house button.

## 7. Screen inventory
| Screen | Route | Side bar |
|---|---|---|
| חדר המורה | /teach | yes (not in the sign-in or access-gate views) |
| התרחישים שלי, תרחיש חדש, עריכת התרחיש | /teach/scenarios, /new, /:id | yes |
| ספריית התרחישים, library scenario, ניהול הספרייה | /teach/library, /:id, /admin | yes (via LibraryShell; not on its sign-in/denied gates) |
| התחלת שיעור | /teach/start | yes |
| כיתה, תלמיד/ה | /teach/class/:id, /student/:memberId | yes |
| שיעור פעיל (console, class view) | /teach/session/:id, /class | yes |
| סיכום השיעור | /teach/report/:id | yes |
| שיעורים קודמים, מילים שלא אומרים | /teach/lessons, /teach/words | yes |
| הפעילות שלי | /teach/activity | yes (via supervise shell()) |
| ריכוז אזורי and its pages | /supervise/* | yes (via supervise shell()) |
| Projector | /teach/screen/:id | NO (no TeacherNav; keep it that way) |
| Ask to teach | /teach/request | NO |
| Student and game screens | /, /join/:code, /play/:id | NO |

## 8. Task flows (desktop)
(a) Teacher room → class → back: click class row under הכיתות שלי; class page marks its row current; click חדר המורה (or back arrow).
(b) Fold, reload, still folded: click fold; `agora_teacher_sidebar = folded` saved; on reload the bar renders folded on first paint, no flash of the open bar.
(c) Narrow below 1024px: at 1023px the side bar disappears, ≡ and house return; ≡ opens today's dropdown. Widening restores the stored state.
