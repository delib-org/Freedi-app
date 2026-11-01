# Main app: People (settings) — IA spec

Status: draft (audit + proposed structure)
Date: 2026-11-01
Supersedes: the "Members & Access" group of the legacy settings page and the current `PeopleSection` composition of the Host hub

## 0. What the code does today (findings)

Two surfaces compose "People", differently:

- **Host hub** (`src/view/pages/statement/components/host/HostHub.tsx`, URL `/statement-screen/:id/settings?section=people`): card "People" / "אנשים" (`host.people`) renders `PeopleSection.tsx`: MembershipSettings → MembersSettings → AdminsManagement → MemberValidation (question only) → UserDemographicSetting → MembersManagement → OptionRooms → "Stakeholders" + ConfidenceIndexSettings.
- **Legacy page** (`StatementSettingsForm.tsx`, variant `legacy`): group "Members & Access" / "חברים והרשאות גישה" with the same list minus MembersManagement and minus OptionRooms (rendered as its own top-level section), and AdminsManagement gated on `isAdminOrCreator`.

Controls found under People today (22 at first level, ~40 with modals):

| # | Component | What it controls | UI title today (EN / HE) |
|---|---|---|---|
| 1 | MembershipSettings | access level (Access enum), inherit from parent | Membership Settings / הגדרות חברות |
| 2 | MembersSettings | share link "to anonymous users", upload xlsx list, joined list, banned list | Joined members / חברים שהצטרפו; "Banned users" (no key) |
| 3 | AdminsManagement | list admins, demote, search + promote | Current admins / מנהלים נוכחיים; Promote a member to admin |
| 4 | MemberValidation (question only) | review survey answers: approve / flag / ban | Member Validation / אימות חברים; "Review Members" (no key) |
| 5 | UserDemographicSetting | questions asked on joining; apply to whole group; exclude inherited | Member Information / מידע על משתתפים; Survey / סקר |
| 6 | MembersManagement | counts, Invite, search, role chips, list with make-admin / ban, Load more | "Member Management", "Invite", "total members" (no keys) |
| 7 | OptionRooms | join behaviour (one/many answers), room size, diversity, split, created rooms | Option Rooms / חדרי אפשרויות |
| 8 | ConfidenceIndexSettings | number of stakeholders (inherits), sampling quality, recalculate | Stakeholders / בעלי עניין |

People-shaped controls that live elsewhere:

- **Waiting list approval** (`view/components/approveMembers/WaitingList.tsx`): a header icon in `QuestionHeaderBar` and `HomeHeader`. Not reachable from People, although `host.peopleDesc` promises "waiting list / רשימת המתנה".
- **Invite link / PIN / QR**: Live now card (`LiveNowCard.tsx`, "Share this link").
- **Enable Joining Options, Join form, Conditional joining, Activation threshold**: "Participation Rules" group inside the hub's Settings card. Rooms depend on the first toggle and show a hint telling the host to go there (`host.joiningOffHint`).
- **Get Voters / Get Non Voters / Get Evaluators** (lists of people): "Data & Advanced", legacy page only.
- **Anonymity**: no setting exists. `Access.public` means "no sign-in needed". The label "Send a link to anonymous users" is a share button whose URL (`/statement-an/true/:id/options`) matches no route in `src/routes`.

Dead or broken: `SetWaitingListCont.ts` body is commented out (upload does nothing); `EnhancedMembersManagement.tsx` is imported nowhere; `MembersSettings` shows "Joined members (N)" where N is the count of users awaiting approval across every statement the admin manages, not the joined members of this one.

## 1. Audiences

| Audience | One-line goal | Must never see |
|---|---|---|
| Host (Role.admin, Role.creator) of a group or question | Decide who can join, let people in, give a co-host rights, know how many people the decision concerns | Firestore vocabulary (subscription, membership, index), controls that do nothing |
| Member (joined, Role.member) | Know whether they are in, waiting, or banned | Any People control; other members' survey answers |
| Person waiting (Role.waiting) | Know they are waiting and when they are in | The host's list |
| Participant without account (Access.public) | Respond without joining | Join prompts for a public question |

## 2. Object model

- **Space** (`Statement`, type group or question). Access, questions on joining and stakeholder count are declared on a space and **inherited** down `parentId` until a child declares its own. Top-level spaces (`parentId === 'top'`) never inherit.
- **Access level** (`statement.membership.access`, `Access`): public · openToAll · openForRegistered · moderated · secret (`open` is deprecated and treated as "inherit").
- **Membership** (`StatementSubscription`, one per person per space). `role`: creator · admin · member · waiting · banned · unsubscribed. Lifecycle: none → waiting (moderated) → member → admin ↔ member → banned → member (unban). The creator's role never changes.
- **Host** = membership with role admin or creator. **Member** = role member. **Waiting** = role waiting (`awaitingUsers` collection, keyed by admin ids). **Banned** = role banned.
- **Question on joining** (`UserDemographicQuestion`, one per statement or per top parent when "apply to group"). A person answers once; answers feed the **Entry check** (`memberValidation` status: pending · approved · flagged · banned).
- **Stakeholder count** (`evaluationSettings.targetPopulation`, plus `samplingQuality`). Resolved by `resolveStakeholderCount(self, parent, top)`.
- **Joining an answer** (question only; `statementSettings.joiningEnabled`): a member commits to one or many option Statements; **Room** = a split of the people joined to one option (`optionRooms`).
- **Response** (evaluation or vote, question only): the set of people who responded. Not a membership; a person may respond without joining when access is public.

Mapping: every object above hangs off one Statement; nothing here needs a node that the tree cannot express. Rooms are children of an option; questions on joining are a side collection keyed by `statementId` / `topParentId`.

## 3. Labels

One name per concept. Code types stay as they are; UI text and i18n keys change. Add every new key to all 7 language files (en, he, ar, de, es, fa, nl).

| Concept | EN label | HE label | i18n key | Route / anchor | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| The section | People | אנשים | `host.people` | `?section=people` | `PeopleSection` | "Members & Access" / "חברים והרשאות גישה" (legacy group) |
| Who may join | Who can join | מי יכול להצטרף | `people.whoCanJoin` | `#join` | `Access` | "Membership Settings" / "הגדרות חברות" |
| Access: public | Public, no sign-in | ציבורי, בלי התחברות | `people.access.public` | — | `Access.public` | "Public" + tooltip "Anyone can view and interact without login" |
| Access: openToAll | Open to all | פתוח לכולם | `people.access.openToAll` | — | `Access.openToAll` | "Open to all" + "Anyone can join the group" |
| Access: openForRegistered | Signed-in only | מחוברים בלבד | `people.access.signedIn` | — | `Access.openForRegistered` | "Registered" and "Open for registered members" (two labels, one value; HE "משתמשים  מחוברים" has a double space) |
| Access: moderated | By approval | באישור המארח/ת | `people.access.byApproval` | — | `Access.moderated` | "Moderated" / "דורש אישור מנהל/ת", "Requires approval to join" |
| Access: secret | Invite only | בהזמנה בלבד | `people.access.inviteOnly` | — | `Access.secret` | "Secret" / "סודי", "Invitation only" |
| Inherited value (any subsection) | Same as the group | כמו הקבוצה | `people.sameAsGroup` | — | — | "Inherit from parent group", "Apply to all sub-discussions", "Inherited from the group" |
| Override | Change for this question | שינוי לשאלה הזו | `people.changeHere` | — | — | "Set specific access level for this statement" |
| Invite link | Invite link | קישור הזמנה | `people.inviteLink` | Live now `#share` | — | "Send a link to anonymous users", "Invite", "Share invitation link", "Share this link" |
| People waiting | Waiting to join | ממתינים לאישור | `people.waiting` | `#waiting` | `Role.waiting` | "Waiting List" / "רשימת ממתינים" (keep key if reused), "awaiting users" |
| Approve / deny one | Let in / Decline | לאשר / לדחות | `people.letIn`, `people.decline` | — | — | "Approve All", "Deny All" (no keys) |
| The list of people | Members | חברים/ות | `people.members` | `#members` | `StatementSubscription[]` | "Member Management", "Joined members", "total members", "Member Information" |
| Person who runs the space | Host | מארח/ת | `people.role.host` | — | `Role.admin`, `Role.creator` | "Admin" / "מנהל", "Current admins" / "מנהלים נוכחיים", "מנחים" (`host.peopleDesc`) |
| Give / remove host rights | Make host / Remove host | הפיכה למארח/ת / הסרת מארח/ת | `people.makeHost`, `people.removeHost` | — | `updateMemberRole` | "Make admin", "Remove admin", "Promote a member to admin" |
| Creator badge | Creator | יוצר/ת | `Creator` (exists; HE gender) | — | `Role.creator` | — |
| Member role | Member | חבר/ה | `people.role.member` | — | `Role.member` | "participant / משתתפים" when it means a joined person |
| Banned | Banned | חסומים/ות | `people.role.banned` | — | `Role.banned` | "Banned users", "Banned" (HE "חסום", singular) |
| Block / unblock | Block / Unblock | חסימה / ביטול חסימה | `people.block`, `people.unblock` | — | — | "Ban member", "Unban member", "Remove/Ban" |
| Questions asked on joining | Questions on joining | שאלות בהצטרפות | `people.joinQuestions` | `#questions` | `UserDemographicQuestion` | "Member Information" / "מידע על משתתפים", "Survey" / "סקר", "Survey setting", "demographic" |
| Reviewing answers | Entry check | בדיקת כניסה | `people.entryCheck` | `#entry-check` | `memberValidation` | "Member Validation" / "אימות חברים", "Review Members", "Member Validation & Review" |
| Entry statuses | Waiting review · Flagged · Approved · Blocked | ממתין לבדיקה · מסומן · אושר · חסום | `people.entry.*` | — | status enum | "Pending" (clashes with waiting-to-join) |
| Stakeholders | Stakeholders | בעלי עניין | `host.people.stakeholders` (exists) | `#stakeholders` | `targetPopulation` | — |
| Count field | Number of stakeholders | מספר בעלי העניין | exists | — | — | — |
| Joining answers (master switch) | Joining answers | הצטרפות לתשובות | `people.joining` | `#joining` | `joiningEnabled` | "Enable Joining Options" / "אפשר הצטרפות לאפשרויות", "Join Behavior" |
| Rooms | Rooms | חדרים | `Rooms` (exists) | `#rooms` | `optionRooms` | "Option Rooms" / "חדרי אפשרויות", "Breakout Rooms" / "חדרי דיון" |
| People who responded | Responded / Did not respond | הגיבו / לא הגיבו (?) | `people.responded`, `people.notResponded` | Members filter | evaluations, votes | "Get Voters", "Get Non Voters", "Get Evaluators" |

Strings used in the UI today with **no entry in en.json or he.json** (Hebrew users see English): Inherit from parent group · Banned users · Invite · Review Members · Member Management · total members · Ban member · Unban member · Set specific access level for this statement · Inherited access level · all five access tooltips · Approve All · Deny All · Load More · Flagged · Admins (HE only). All are retired by the table above.

## 4. Hierarchy (role: Host)

```
0 Host tools                       /statement-screen/:id/settings
1   Live now                       ?section=live        (Invite link, PIN, QR live here)
1   People                         ?section=people
2     Who can join                 #join          access level · Same as the group
2     Waiting to join (n)          #waiting       only when access = By approval or n > 0
2     Members (n)                  #members       one list: search, role chips, Make host, Block
3       Person row                 actions on one person (no new screen)
2     Questions on joining         #questions     list of questions · Same as the group
3       Question editor            modal (add / edit one question)
2     Entry check (n to review)    #entry-check   only when questions exist
3       Review list                full-screen modal: status tabs, Approve / Flag / Block
2     Stakeholders                 #stakeholders  count · Same as the group · More (sampling, recalc)
2     Joining answers & rooms      #joining       question only: master switch, one/many, join form,
                                                  conditional joining, threshold, room size, split
3       Rooms created              list by answer
1   Answers · Results · AI · Clustering · Settings · Insights   (unchanged)
```

Group vs question: a group shows Who can join, Waiting, Members, Questions on joining, Entry check (if questions exist), Stakeholders. A question shows the same plus Joining answers & rooms. On a question, Who can join / Questions / Stakeholders open in the "Same as the group" state unless overridden.

Depth from the host's home is 3 at most. Every subsection is reachable in two taps (card, then subsection anchor).

## 5. Navigation model

- Global: unchanged (statement header, Back). The header's waiting-list badge stays as a shortcut and deep-links to `?section=people#waiting` instead of opening its own modal.
- Local: the People card lists its subsections at the top as a jump list (one line each, with the live summary: "Who can join: Open to all · 42 members · 3 waiting"). Subsections are collapsed by default except the first with something to act on (waiting > 0, entry check > 0).
- Contextual: Who can join ends with "Invite link → Live now" (link, not a second control). Joining answers & rooms is one block; no hint sending the host to another card. Stakeholders on a question links to the group's value when inherited.
- Back: card header collapses; modals return to the anchor they were opened from; browser back works because `?section=people` is already in the URL and anchors are hash-only.
- Deep links: `?section=people` (card), `?section=people#members` etc. The host chip, the header waiting badge and notifications use these.

## 6. Task flows (role: Host)

Set who can join (3 steps; today 3, but labels mislead)
1. Host tools — open People
2. People — Who can join
3. Who can join — tap a level (saves on tap)

Let a waiting person in (3 steps; today: not reachable from People; header icon → modal → Approve)
1. Header waiting badge, or Host tools → People
2. People — Waiting to join
3. Row — Let in

Make a member a host (4 steps; today the same action exists in three components)
1. Host tools — People
2. People — Members
3. Members — search the name
4. Row — Make host

Share the invite link (2 steps; today People's link goes to a route that does not exist)
1. Host tools — Live now
2. Live now — Invite link (copy / QR / share)

Set the stakeholder count (3 steps)
1. Host tools — People
2. People — Stakeholders
3. Field — type the number (saves on blur; inherited value shown until overridden)

Ask joiners a question (4 steps)
1. Host tools — People
2. People — Questions on joining
3. Add question (modal)
4. Save

Split joined people into rooms (4 steps; today 6 across two cards)
1. Host tools — People
2. People — Joining answers & rooms, switch on
3. Room size (defaults are fine)
4. Split

## 7. Screen inventory

| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| People card | `?section=people` | Everything about who is in this space | "Nobody has joined yet" + Invite link | skeleton rows | banner, controls stay | card absent (non-hosts never reach Host tools) | — |
| Who can join | `#join` | Pick the access level; inherit or override | n/a | — | "Could not save" inline | — | level shown in summary |
| Waiting to join | `#waiting` | Let people in or decline | hidden when 0 and access ≠ By approval; "Nobody is waiting" otherwise | — | inline per row | — | row leaves the list |
| Members | `#members` | Find a person; change role; block | "Nobody has joined yet" | Load more | inline per row (`Failed to update role` exists) | hosts only act; creator row has no actions | — |
| Questions on joining | `#questions` | Define what joiners are asked | "No questions yet" (exists) | — | inline | — | list updated |
| Question editor | modal | Add or edit one question | — | — | inline | — | closes to `#questions` |
| Entry check | `#entry-check` | Count to review; open the list | hidden when no questions | — | — | — | — |
| Review list | modal | Approve / flag / block by answers | "No answers yet" | "Loading member data…" (exists) | inline | — | counts update |
| Stakeholders | `#stakeholders` | Declare how many people the decision concerns | placeholder shows inherited value or "Not set anywhere" (exists) | — | "Recalculation failed" (exists) | — | "Recalculated for n answers" |
| Joining answers & rooms | `#joining` (question) | Turn joining on, shape rooms, split | switch off: one line, nothing else | — | split error inline | — | rooms list |

## 8. Findability

- Members: one list with search by name and role chips Hosts · Members · Waiting · Blocked (counts add up to All: creator counts as Host, waiting is a chip, not a separate page); hosts first, then alphabetical; Load more in pages. On a question add a chip Responded / Did not respond (replaces Get Voters / Get Evaluators).
- Waiting: select all, Let in all, Decline all (exist as "Approve All / Deny All").
- Entry check: status tabs with counts (exist); search by name inside the modal.
- Questions on joining: under 10 items, ordered list, no search.
- Rooms: grouped by answer, count per room.

## 9. Defects (most severe first) and fixes

1. **Members list built three times, role actions four times.** `MembersSettings` (joined + banned lists with MembershipCard ban/admin toggles), `AdminsManagement` (promote/demote with its own search), `MembersManagement` (filtered list with EnhancedMemberCard make-admin/ban), `MemberValidation` (ban). Scenario: a host demotes someone in one list and the other list still shows them as admin until the listener fires; a host does not know which "ban" removes votes. Fix: one Members subsection built on `MembersManagement` + `FilteredMembersList`; delete `MembersSettings`, `AdminsManagement`, `EnhancedMembersManagement`; keep "hosts first", the Creator/You badges and the "nobody to promote" hint.
2. **Wrong number.** `MembersSettings` prints "Joined members (N)" where N = users awaiting approval across all statements the admin manages. Fix: goes with defect 1.
3. **Invite link is a dead end.** `MembersSettings` and `MembersManagement` share `/statement-an/true/:id/options`; no route matches. Three labels for the same link; a fourth (Share) in Live now. Fix: one Invite link control in Live now; People links to it.
4. **Waiting list has no home in People.** The section's description promises it; the control is a header icon only; moderated access is set in People but its consequence is handled elsewhere. Fix: Waiting to join subsection; header badge deep-links to it.
5. **Rooms depend on a switch in another card.** `OptionRooms` shows `host.joiningOffHint` sending the host to Participation Rules inside the Settings card. Join form, conditional joining and activation threshold also sit there. Fix: one block "Joining answers & rooms" under People; Participation Rules keeps only "Ask for their own idea first" and "Discussion chat". (Alternative: move the whole block to Answers; see Q2.)
6. **Three idioms for inheritance.** Access: checkbox "Inherit from parent group" (hidden on top level). Questions: toggle "Apply to all sub-discussions" plus an exclude list for inherited questions. Stakeholders: placeholder text with source. Fix: one idiom, "Same as the group" with the group's value shown and "Change for this question".
7. **Section named three ways.** "People / אנשים" (hub), "Members & Access / חברים והרשאות גישה" (legacy group title), plus `host.peopleDesc` listing synonyms ("hosts / מנחים"). Fix: `host.people` everywhere; legacy page renders `PeopleSection`.
8. **Legacy and hub compose People differently** (legacy lacks `MembersManagement`, renders rooms as a separate top-level section, gates `AdminsManagement` on role). Fix: one `PeopleSection`; the `FORM_COMPOSITION` guard (`settings/__tests__/duplicateControls.test.ts`) lists it once.
9. **Host / admin / מנהל / מארח / מנחה.** Hub title says Host tools (כלי מארח/ת); the list says admins (מנהלים); the description says מנחים. Fix: Host / מארח/ת in UI; `Role.admin` unchanged in code.
10. **Members vs participants** (חברים vs משתתפים) inside one card: "Member Information" is מידע על משתתפים; demographic copy says המשתתפים; lists say חברים. Fix: Member = joined; Participant only in Live now / Results where it means anyone who responded.
11. **Access values have two labels each** ("Registered" on the switch vs "Open for registered members" in the inherited note; "Secret" vs tooltip "Invitation only"; "Moderated" vs HE "דורש אישור מנהל/ת"). Fix: label set in §3.
12. **Untranslated strings** (list under §3). Hebrew hosts see English on the inherit checkbox, every tooltip, Invite, Banned users, Review Members, Approve All / Deny All, Load More. Fix: new keys in all 7 files.
13. **Role counts do not add up.** `MembersManagement` buckets admin/member/banned; creator and waiting are in "All" but no chip. Fix: chips Hosts (admin + creator) · Members · Waiting · Blocked.
14. **"Pending" means two things**: waiting to join (header) and waiting for entry review (MemberValidation). Fix: "Waiting to join" vs "Waiting review".
15. **Entry check is question-only while its data is group-level.** Questions on joining can "apply to all sub-discussions"; a group host cannot review answers from the group. Fix: show Entry check wherever questions exist (assumption A3).
16. **Upload members list does nothing** (`SetWaitingListCont.ts` commented out). A host uploads an xlsx and nothing happens. Fix: remove from People until it has a backend; when it returns, it belongs under Waiting to join as "Pre-approve a list".
17. **Rooms named three ways**: Option Rooms / חדרי אפשרויות, Breakout Rooms / חדרי דיון (`host.peopleDesc`), Rooms / חדרים. And "options" vs the hub's "answers". Fix: Rooms; answers.
18. **Expert controls at first level under Stakeholders**: sampling quality presets and "Recalculate indices" sit beside the count, with a four-line explainer. Fix: count first; sampling and recalculate under a "More" disclosure.
19. **No local navigation inside People**: eight stacked subsections, two full-screen modals, one long scroll on a phone, no anchors. Fix: jump list with summaries and `#anchors` (§5).
20. **Lists of people in Data & Advanced** (Get Voters / Non Voters / Evaluators, legacy only) duplicate the Members list with a different filter. Fix: Responded chip on Members for questions; remove the three buttons.
21. **Anonymity is implied but not a setting.** "Send a link to anonymous users" suggests an anonymous mode; the real control is the access level Public (no sign-in). Fix: retire the label; if hiding names from other members is wanted, that is a new setting (Q3).
22. **States missing**: People card has no empty state (nobody joined); Waiting has none; Rooms has no error state for a failed split; MembershipSettings logs to console instead of showing a save error. Fix: §7.

## 10. Open questions and assumptions

- A1: Hosts (admin/creator) are the only audience of People; `SwitchScreen` already drops the settings view for everyone else.
- A2: `Role.unsubscribed` never appears in any list (treated as not a member).
- A3: Entry check is wanted on groups too once questions apply to the group. If not, it stays question-only and the group shows a note "Review happens on each question".
- A4: "Host" is the UI word for `Role.admin`. If Tal prefers "Admin / מנהל/ת", only rows 15–17 of §3 change and `host.title` becomes "Admin tools".
- Q1: Should Secret ("Invite only") spaces also hide the Invite link from the Live now card for non-hosts? Not answered by the code.
- Q2: "Joining answers & rooms" — People (people are assigned to answers) or Answers (answers get people)? This spec says People; moving the block is a one-line change in §4.
- Q3: Is per-person anonymity (names hidden from other members) a real requirement? If yes it is one toggle under Who can join, named "Hide names from members"; otherwise nothing.
- Q4: Does the pre-approved list upload (xlsx) come back? If yes it lives under Waiting to join.

## 11. Handoff to UX (ux-ui-architect / ui-design-system-architect)

Fixed by this spec: the subsection set and order, the labels in §3 and their keys, one Members list, one inheritance idiom ("Same as the group" + "Change for this question"), one Invite link control (Live now), the Waiting subsection, the Joining & rooms block, the jump list with live summaries, anchors `#join #waiting #members #questions #entry-check #stakeholders #joining`, the states in §7, and that the legacy page renders the same `PeopleSection`.

Yours to decide: the collapse/expand component and its summary line layout, how the access level picker looks (five values must fit a 360 px RTL screen), the row layout of a person with two actions, whether Entry check stays a full-screen modal or becomes an in-card list, where the "More" disclosure under Stakeholders sits, the badge treatment for Creator / You / Host, the waiting-count badge in the header, and empty-state illustrations. Nothing in this spec fixes colours, spacing or components.
