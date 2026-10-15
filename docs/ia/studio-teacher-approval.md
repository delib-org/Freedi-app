# Studio: Teacher and regional-coordinator approval, and each person's own overview — IA spec

Status: draft
Date: 2026-10-15
Trello: nWQzjCc1 (open and manage teachers), UrxdrKcP (approve every teacher and coordinator), iOUJAzXy (a board per teacher and coordinator)
Supersedes: in `docs/ia/agora-teacher-home.md` §7, the state "No classes, no school: ask the system admin to attach you" (replaced by the access-request states in §7 here).

## Open questions for Tal (each has a default; the spec is written on the default)
1. **What does a pending teacher lose?** Default: exactly what an unattached teacher loses today, no more: opening classes, the scenario library, and the Studio overview. A guest lesson and their own scenarios stay open, so a new teacher can try a lesson the same day and no past lesson-runner is locked out. (Hard gate = refuse `agoraCreateSession` until approved; it breaks demos and needs every past lesson-runner grandfathered.)
2. **How does an applicant name their school?** Default: a coordinator (or admin) copies a **teacher sign-up link** per school from Studio (`/teach/request?school=<schoolId>`); the request lands in that school's coordinators' queue already matched. Without a link, the applicant types school name and city as free text and the request goes to system admins, who pick or open the school while approving. Applicants cannot browse the school list (rules keep `list` admin-only).
3. **One home for the overview.** Agora already shows the same data at `/supervise` (coordinator) and `/teach/activity` (teacher). Default: Studio `/agora` becomes the canonical place; in v1 the Agora menu rows link to it and keep working; after one release `/supervise/*` redirects to Studio and `/teach/activity` is removed from the menu. Two live screens for one object is an IA defect we accept for one release only.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Applicant (signed in with Google, not approved) | Ask to be a teacher (or coordinator) and know where the request stands | Any school's teachers, classes, other requests |
| Teacher (approved) | Run lessons in Agora; see my classes and their activity in one place | Other teachers' classes; hours of other teachers; any request queue |
| Regional coordinator (= existing `supervisor`) | Approve the teachers of my schools; see my schools → teachers → classes and usage | Students' real names, PINs, class codes (unchanged supervision privacy); requests of schools I do not coordinate; coordinator requests |
| System admin | Approve anyone, including coordinators; manage schools; see everything | — |

Assumptions: a coordinator may also teach (both roles at once is allowed and common). A coordinator's "region" is the set of schools they are attached to; there is no Region object (§9 A1).

## 2. Object model
- **Person**: a `usersV2` account signed in with Google. Not a new document. Their **access** is derived, never stored as a flag:
  - *approved teacher* = attached to ≥1 active school (`agoraSchools.teacherMap[uid]`) — exactly today's `resolveApproval` in `functions/src/agora/libraryAccess.ts`, which was written as "the single seam for when Studio gains an approval step".
  - *coordinator* = attached as supervisor to ≥1 active school (`supervisorMap[uid]`).
  - *admin* = `usersV2.systemAdmin`.
  - *pending* = has an access request in status `pending`. *Declined* = last request declined and nothing approved.
- **Access request** (NEW, `agoraAccessRequests`): one person asks for one role at (at most) one school. Person 1—n requests over time; at most **one pending request per (person, role, school)**.
  - Lifecycle: `pending` → `approved` | `declined` | `withdrawn`. Terminal states are kept (history and audit). A declined or withdrawn person may submit again.
  - Approving a teacher request = attach the person to that school as teacher. Approving a coordinator request = attach them as supervisor to one or more schools the admin picks.
- **Attachment** (existing): person × school × role, on the school doc. **Revoke** = remove one attachment (existing `removeTeacher` / `removeSupervisor`). There is no separate "suspended" state: a person with no active attachment is simply not approved; past lessons stay theirs.
- **School** 1—n Class (existing). A teacher may be attached to several schools; access is per school.
- **Overview** (Tal's "board"): a view, not an object. Teacher overview = `SupervisorTeacherDetail` of oneself (already served by `agoraTeacherConsole {view:'activity'}`). Coordinator overview = `SupervisorOverview` of one school at a time (already served by `agoraSupervisorConsole {view:'overview'}`).

Statement tree: none of these are `Statement`s; Agora's classroom layer lives in its own collections. No mapping needed.

## 3. Labels
One name per concept. Studio strings live in `packages/shared-i18n/src/languages/{he,en,ar,de,es,fa,nl}.json` (English text is the key). Agora strings live in the six blocks of `apps/agora/src/lib/i18n.ts` (he, en, ar, es, de, nl). Code identifiers and wire fields keep `supervisor` (`supervisorIds`, `supervisorMap`, `agoraSupervisorConsole`, `/supervise`): renaming wire formats is out of scope, so `supervisor` in code ⇔ "Regional coordinator" in UI is the one documented exception. New code also uses `supervisor`, never `coordinator`, so code has one name too.

| Concept | EN | HE | i18n key (NEW unless noted) | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Regional coordinator | Regional coordinator | רכז/ת אזורי/ת (?) ; pl. רכזים אזוריים | Studio "Regional coordinator", "Regional coordinators"; Agora `role.coordinator` | — | `supervisor` | Studio "Supervisor", "Supervisors", "מפקח", "מפקחים" (all keys listed below) |
| Coordination area (Agora screen) | Regional coordination | ריכוז אזורי | Agora `supervise.title` (change from "פיקוח"), `dashboard.supervise_card` (merge into it) | /supervise (kept) | — | "פיקוח", "Supervision" |
| Teacher | Teacher | מורה | Studio "Teacher" (exists) | — | — | — |
| Access request | Access request | בקשת גישה | Studio "Access request"; Agora `access.request` | requests | `AgoraAccessRequest` | "join request", "invitation" (an invitation is outgoing; do not reuse "Pending invitations") |
| Access requests (list) | Access requests | בקשות גישה | Studio "Access requests" | /agora/requests, /admin/agora/requests | — | — |
| Request access (action) | Request teacher access | בקשת גישה כמורה | Agora `access.cta` | /teach/request | — | dashboard.no_school_text, startGame.no_school_hint ("ask your admin to attach you") |
| Pending | Waiting for approval | ממתינה לאישור | Studio "Waiting for approval"; Agora `access.pending` | ?status=pending | `'pending'` | "Pending" / "ממתינים" (generic key, used elsewhere) |
| Approved | Approved | אושרה | Studio "Approved" | — | `'approved'` | — |
| Declined | Declined | לא אושרה | Studio "Declined"; Agora `access.declined` | — | `'declined'` | "Rejected" / "נדחה" |
| Approve | Approve | אישור | Studio "Approve" (exists, value "אשר" → change to "אישור") | — | `approve` | — |
| Decline | Decline | לא לאשר | Studio "Decline request" | — | `decline` | "Reject" / "דחה" |
| Withdraw | Withdraw my request | ביטול הבקשה | Agora `access.withdraw` | — | `withdraw` | — |
| Revoke | Remove access | הסרת הגישה | Studio "Remove access" | — | `revoke` | "Remove teacher" / "Remove supervisor" (button text) |
| Teacher sign-up link | Teacher sign-up link | קישור הרשמה למורים | Studio "Teacher sign-up link" | — | — | — |
| Own overview (Tal's "board") | My Agora classrooms | כיתות האגורה שלי | Studio "My Agora classrooms"; Agora `nav.my_overview` | /agora | scope kind `agora` | "לוח", "board", "dashboard" for this view (see note) |
| Admin overview (existing) | Agora classrooms | כיתות אגורה | Studio "Agora classrooms" (exists) | /admin/agora | scope kind `admin` | — |

Note on "board": Tal's cards say "לוח". In Studio "board" already means an organization's question board (`useBoardTitle`, "Name on this board"), and in Agora "לוח" is the village board and the lesson board. A third meaning would be a synonym defect, so the view is named by what it holds: "כיתות האגורה שלי", the personal counterpart of the admin's "כיתות אגורה".

Studio keys to retire (replace with "Regional coordinator" wording, all seven language files): "Supervisor", "Supervisors", "Supervisor email", "Assign supervisor", "Attach supervisor", "Remove supervisor", "Supervisors of this school", "{{count}} supervisors", "Supervisors see the teachers of this school in Agora. Narrow each one to some teachers if needed.", "Assign by sign-in email. The supervisor must sign in with Google once first.", "Could not assign — the supervisor must sign in to Agora with Google once first.", "No supervision access. Ask your administrator to assign a school.", "Could not update supervision. Please try again.". Agora keys to reword (six blocks): `supervise.title`, `supervise.denied`, `supervise.not_supervisor`, `supervise.privacy` ("מסכי הוראה ופיקוח" → "מסכי הוראה וריכוז"), `dashboard.supervise_card`, `dashboard.supervise_sub`.

## 4. Hierarchy (per role, Studio unless marked)
Role: applicant
0 Agora חדר המורה /teach (as today, with the access banner)
1   בקשת גישה כמורה /teach/request  (form; done state = status)
0 Studio /agora shows only the request status and a link to the form (no nav items)

Role: teacher
0 כיתות האגורה שלי /agora  (activity, my classes, my lessons)
1   class /agora/classes/:classId
2     student /agora/students/:memberId
1   lesson row → Agora /teach/report/:id (leaves Studio; contextual)

Role: regional coordinator (school picker is a filter on the home, not a level)
0 כיתות האגורה שלי /agora?school=:schoolId  (pending-requests strip, teachers, classes, sign-up link)
1   בקשות גישה /agora/requests
2     one request /agora/requests/:requestId
1   teacher /agora/teachers/:schoolId/:uid
2     class /agora/classes/:classId
3       student /agora/students/:memberId
1   class (from the home's class list) /agora/classes/:classId
2     student
1   My own classes /agora/mine  (only when also attached as a teacher; the teacher home above)

Role: system admin (existing tree + one branch)
0 ניהול מערכת → כיתות אגורה /admin/agora  (gains a "N waiting for approval" line)
1   בקשות גישה /admin/agora/requests
2     one request /admin/agora/requests/:requestId
1   school /admin/agora/schools/:schoolId (existing; teachers and coordinators get "Remove access" and the sign-up link)
2     teacher, class → 3 student (existing)

Max depth 3 everywhere. A coordinator of several schools never gets a school level: the home shows one school at a time, the same pattern Agora's SuperviseHome uses.

## 5. Navigation model
- **Global (Studio)**: the AppShell workspace switcher gains one entry, "כיתות האגורה שלי", for anyone approved or pending (between the organizations and "אישי"). New scope kind `agora` read from `/agora/*` in `useStudioScope`.
- **Local (Studio, scope `agora`)**: sidebar items by role. Teacher: "כיתות האגורה שלי". Coordinator: "כיתות האגורה שלי", "בקשות גישה" (with a waiting count), "הכיתות שלי" only if also a teacher. Applicant: none. Admin workspace: "בקשות גישה" is added beside "כיתות אגורה" with the same count.
- **Home redirect (Studio `/`)**: existing order stays (one org → org; several → picker). For a person with no organizations: system admin → `/admin/orgs` (unchanged); approved or pending in Agora → `/agora`; otherwise `/personal` (unchanged).
- **Agora**: teacher menu group "עוד" gains "כיתות האגורה שלי" (opens Studio `/agora`). Teacher home shows an access banner when not approved (§7). The coordinator's "ריכוז אזורי" row stays (Q3).
- **Contextual**: request row → approve / decline inline, or open the request; home's pending strip → `/agora/requests`; teacher row → teacher page; class card → class page; lesson row → Agora lesson summary; school page → "Teacher sign-up link" copy.
- **Back paths**: request → requests list; teacher page → `/agora?school=:schoolId`; class → the page it came from, by deep link → its teacher page if one teacher, else home; student → its class. Admin variants keep today's breadcrumbs.
- **Deep links**: `/teach/request?school=:schoolId` (sign-up link), `/agora/requests/:requestId` and `/admin/agora/requests/:requestId` (from the approver email), `/agora` (from the approval email), `/agora?school=:schoolId`.

## 6. Task flows
Applicant, sign up with a sign-up link (3 steps)
1. Agora `/teach/request?school=X` → Google sign-in if needed (existing popup)
2. Form, school pre-filled and read-only: full name, role (teacher), optional note → "שליחה"
3. Done state: "ממתינה לאישור", who approves (the school's coordinators), "meanwhile you can try a guest lesson" → `/teach`
(Without a link: step 2 adds school name + city as free text; the request goes to admins.)

Applicant, check status (1 step): open `/teach` → banner shows the status; or Studio `/` → `/agora` status card.

Coordinator, approve a teacher (3 taps)
1. Email "בקשת גישה חדשה" → `/agora/requests/:id` (or home strip → requests list)
2. Request: name, email (from usersV2, shown to approvers only), school, note, lessons already run → "אישור"
3. Confirmed; teacher appears in the school's teachers; applicant is emailed. If the coordinator is narrowed to some teachers, the new teacher is added to that coordinator's scope.

Coordinator or admin, decline (3 taps): request → "לא לאשר" → optional reason (sent in the email) → confirm.

Admin, approve a teacher request with no school (4 steps)
1. `/admin/agora/requests` (filter: no school) → open request
2. Pick school from the list, or "+ פתיחת בית ספר" (existing OpenSchoolModal), back to the request
3. "אישור" 4. confirmed.

Admin, approve a coordinator (4 steps)
1. `/admin/agora/requests` filtered "רכז/ת אזורי/ת" → open
2. Pick one or more schools (multi-select); optional narrowing stays on the school page as today
3. "אישור" 4. coordinator emailed; their Studio home is `/agora`.

Revoke (3 taps): school page (admin) or teacher page (coordinator, in scope) → "הסרת הגישה" → confirm naming the school. Removes that one attachment; other schools untouched.

Teacher, land on the overview after approval (1 tap): approval email → Studio `/agora` (Google sign-in if needed). Later: Agora menu "עוד" → "כיתות האגורה שלי".

Applicant, withdraw (2 taps): `/teach` banner → "ביטול הבקשה" → confirm.

## 7. Screen inventory
| Screen | Route | Status | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|---|
| Request form | Agora /teach/request | NEW | Ask for access | — | school name lookup | retry, input kept | anonymous → Google sign-in; already approved → /teach | status card |
| Teacher home banner | Agora /teach | REUSE + state | Show where my access stands | none: "בקשת גישה כמורה"; pending: "ממתינה לאישור" + withdraw; declined: reason + "בקשה חדשה" | as today | as today | — | approved: no banner |
| Overview, teacher | Studio /agora | NEW page, REUSE sections (IndicatorGrid teacher, ClassesTable, LessonsTable from AdminTeacherDetail) | My classes and their activity | "עוד אין כיתות" + open-class link to Agora | skeleton | LoadError retry | not approved → status card | — |
| Overview, coordinator | Studio /agora?school= | NEW page, REUSE data (`overview` view) + TeachersTable + class cards | My school's teachers and classes; pending strip | "עוד אין מורים" + sign-up link | skeleton | retry | coordinator of no active school → "no schools" text | — |
| Status card | Studio /agora (state) | NEW | Pending/declined/none in Studio | none: link to Agora form | — | — | — | — |
| Access requests | /agora/requests, /admin/agora/requests | NEW (one component, scoped by role) | Decide requests | "אין בקשות ממתינות" | list wait | retry | non-coordinator → /agora | row moves to the decided filter |
| One request | …/requests/:requestId | NEW | Approve or decline one | — | wait | not found | not in my schools → list | approved / declined summary |
| Teacher page | /agora/teachers/:schoolId/:uid | REUSE AdminTeacherDetail (gate + base path) | One teacher's lessons and time | as today | as today | as today | out of scope → /agora | — |
| Class page | /agora/classes/:classId | REUSE AdminClassDetail | One class | as today | | | not my class / out of scope → /agora | — |
| Student page | /agora/students/:memberId | REUSE AdminStudentDetail | One student (alias only) | as today | | | as class | — |
| Admin Agora home | /admin/agora | REUSE + count line | All schools; link to requests | — | | | | — |
| Admin school page | /admin/agora/schools/:id | REUSE + relabel, "Remove access", sign-up link | One school's people and classes | | | | | — |

## 8. Findability
- Access requests: default filter "ממתינה לאישור", oldest first (fairness, nothing rots at the bottom); filters: status, role, school (admin: also "no school"); search by name or email; admin list grouped by school. The waiting count is on the nav item, the home strip and the admin home.
- Coordinator home: teachers table sorted by last active, searchable when over ~12 rows (existing TeachersTable behaviour to confirm); class cards grouped by teacher when over 8.
- School picker on the coordinator home: shown only with ≥2 schools; remembers the last pick (`?school=` plus local preference).

## 9. Assumptions, rules and edge cases
**Approval rule (stated as the rule):** a system admin approves, declines and revokes anyone, for any school and role. A regional coordinator approves, declines and revokes **teachers only**, and only at schools they coordinate (narrowed or not; a narrowed coordinator's approvals join their scope). Nobody but an admin approves a coordinator, opens a school or changes a coordinator's narrowing. Approval belongs to the school, not to the approver.

| Action | Admin | Coordinator of S | Teacher at S | Applicant |
|---|---|---|---|---|
| Submit request | — | yes (e.g. to teach) | yes (another school) | yes |
| Withdraw own pending | yes | yes | yes | yes |
| See requests for S | all schools | S only | no | own only |
| Approve / decline teacher at S | yes | yes | no | no |
| Approve / decline coordinator | yes | no | no | no |
| Remove access of teacher at S | yes | yes (in scope) | no | no |
| Remove coordinator / narrow scope / open school | yes | no | no | no |
| Studio overview | all (admin tree) | own schools | own classes | status only |

- **Grandfathering**: approval stays derived from attachment, so every teacher and coordinator attached to an active school today is approved with no migration. One backfill (dry run first, list shown to Tal): teachers on an active class of an active school but not in that school's `teacherMap` (co-teachers added by email) are attached to it. People who only ran guest lessons get nothing: next visit they see "בקשת גישה כמורה" and their history stays.
- **Co-teacher added by email** (existing `agoraTeacherClass addTeacher`): still works; if that account is not approved at the class's school, a pending request (`source: 'coTeacher'`) is created so the school's coordinators see it.
- **Teacher in two schools**: one request per school; access, revoke and coordinator visibility are per school. The teacher overview spans all their classes.
- **Coordinator removed**: their pending queue needs no handover (queues are per school); teachers they approved stay approved; if they lose every school their `/agora` shows the "no schools" text, and if they also teach they keep the teacher overview.
- **School archived**: its pending requests are auto-declined with reason "the school was closed"; attachments stop counting (existing `status === 'active'` checks).
- **Applicant already approved elsewhere** opens a sign-up link: the form becomes "request access at this school too".
- **Spam guard**: at most one pending request per (person, role, school) and 5 requests per person per week.
- A1. No Region object: "אזורי" describes the coordinator, the region is their school list. If regions must be named or reported on, that is a separate spec.
- A2. Hebrew gender: "רכז/ת אזורי/ת" follows ministry-document style; Tal may prefer "רכזת אזורית" as written on the cards (?).
- A3. Approvers see the applicant's sign-in email (needed to vet them); it is read from `usersV2` by the callable and never stored on the request. Run privacy-guardian over this before build.

## 10. Data model sketch (no code)
`agoraAccessRequests/{requestId}` (NEW, `packages/shared-types/src/models/agora/agoraAccess.ts`, Valibot, timestamps in ms):
`requestId, uid, role: 'teacher'|'supervisor', fullName, schoolId?, schoolNameText?, city?, note? (≤300), source: 'form'|'link'|'coTeacher', status: 'pending'|'approved'|'declined'|'withdrawn', grantedSchoolIds? (coordinator approvals), decidedBy?, decidedVia?: 'admin'|'supervisor', decidedAt?, declineReason?, createdAt, lastUpdate`.
Callables (me-west1): `agoraRequestAccess` (submit, withdraw) and `agoraManageAccess` (list, approve, decline, revoke; scope via `resolveSupervisorScope`). Approve reuses the attach logic of `agoraAdminManageSchool` by uid and then `syncApprovalMarker`, so the library opens at once.
Rules: `match /agoraAccessRequests/{id}`: `get` if `resource.data.uid == request.auth.uid` or system admin; `list` system admin only; `write: false`. Coordinators read through the callable (same pattern as supervision). `agoraSchools`, `agoraClasses`, `agoraApprovedTeachers` rules unchanged.
Indexes (create via gcloud, never `--force`): `status+schoolId+createdAt`, `status+createdAt`, `uid+status`.
Supervisor console: add a `self` reading path so a teacher may open the `class` and `student` views of their own classes (today those views require a coordinator scope).

## 11. Notifications (proposal)
- Applicant: email on approved (links: Agora `/teach`, Studio `/agora`) and on declined (reason if given, "you may apply again"). No email on submit; the done screen says what happens next. Existing `functions/src/utils/emailTransporter.ts`, Hebrew first by the applicant's language.
- Coordinators of the request's school: one email per new teacher request linking to the request; in-app count always.
- Admins: in-app count; one daily digest of requests with no school, coordinator requests, and any request waiting over 3 days.

## 12. Handoff to UX
Fixed by this spec: the labels in §3 (including "כיתות האגורה שלי" instead of "board", "רכז/ת אזורי/ת" instead of "מפקח"); routes and depth in §4–5; the approval rule and matrix in §9; one request component for admin and coordinator; every state in §7 has a place; approve/decline reachable inline from the list.
Yours to decide: how the waiting count shows on nav items; request row layout and what goes in it beyond name, school, date; the decline-reason input (free text vs presets); the applicant done screen and Agora banner treatment; how the school picker sits on the coordinator home; confirmation pattern for "הסרת הגישה".

## 13. Implementation slices (each mergeable on its own; 1 first)
1. **Backend: access requests.** shared-types `agoraAccess.ts` + callable types in `agoraClassroomCallables.ts`; `functions/src/agora/fn_agoraRequestAccess.ts`, `fn_agoraManageAccess.ts`, register in `functions/src/agora/index.ts`; reuse attach code from `fn_agoraAdminManageSchool.ts`, `libraryAccess.ts` (`syncApprovalMarker`, update the seam comment); auto-request in `fn_agoraTeacherClass.ts` addTeacher; emails via `utils/emailTransporter.ts`; `firestore.rules` new match; grandfather backfill script under `functions/scripts/` (dry run); tests in `functions/src/agora/__tests__/`. Repack the shared-types tgz for functions.
2. **Agora: applicant side.** `apps/agora/src/views/teacher/AccessRequest.ts` (NEW, route `/teach/request` in `src/index.ts`), access banner in `TeacherHome.ts` / `views/teacher/home/*`, menu row "כיתות האגורה שלי" (Studio URL from config), callable wrappers in `src/lib/callables.ts`, relabel `supervise.*` and retire `dashboard.no_school_text` / `startGame.no_school_hint` in all six blocks of `src/lib/i18n.ts`. Run `npm run preflight` first.
3. **Studio: approve and manage.** `apps/studio/src/pages/AccessRequests/` (list + one request, role-scoped), `src/db/agoraAccess.ts` wrappers, routes in `App.tsx` (`/admin/agora/requests[/:id]`, `/agora/requests[/:id]`), admin nav item + count in `pages/_shared/useStudioNav.tsx`, count line in `AdminAgora.tsx`, "Remove access" + sign-up link in `AdminSchoolDetail.tsx` / `SchoolSupervisors.tsx`, relabel supervisor keys in all seven `shared-i18n` language files.
4. **Studio: personal overview.** scope kind `agora` in `useStudioScope.ts`, switcher entry in `AppShell.tsx`, redirect in `HomeRedirect.tsx`, `pages/AgoraHome/` (teacher view via `agoraTeacherConsole` activity, coordinator view via `overview`, status card), base-path prop on `sections/TeachersTable.tsx` / `ClassesTable.tsx` links, gates on `AdminTeacherDetail` / `AdminClassDetail` / `AdminStudentDetail` widened to scoped readers and mounted under `/agora/*`; functions: `self` path in `fn_agoraSupervisorConsole.ts` / `supervisorScope.ts`. The teacher and coordinator views can merge before slice 1; the status card needs slice 1.
