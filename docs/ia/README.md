# Information Architecture specs

One file per feature: `docs/ia/<app>-<feature>.md` (for example `agora-results.md`, `mc-participant-flow.md`, `main-statement-screen.md`).

Written by the `information-architect` agent before any UI design. The `ux-ui-architect` and `ui-design-system-architect` agents design against the spec; implementation follows the design. If a spec and the code disagree, fix one of them, do not let them drift.

Before writing a new spec for an app, read the existing specs for that app so labels and navigation stay consistent across features.

## Template

```markdown
# <App>: <Feature> — IA spec

Status: draft | agreed | implemented
Date: YYYY-MM-DD
Supersedes: <older spec, if any>

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|

## 2. Object model
Nouns, relations, cardinality, lifecycle states.
Mapping onto the Statement tree (which object is which StatementType, what is parentId).

## 3. Labels
| Concept | EN label | HE label | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|

## 4. Hierarchy (per role)
Role: <name>
0 Home
1   <node>
2     <node>
1   <node>

## 5. Navigation model
- Global: ...
- Local: ...
- Contextual: ...
- Back paths: ...
- Deep-link entry points and URL shape: ...

## 6. Task flows
Role: <name>, task: <name> (<n> steps)
1. <screen> — <action>
2. ...

## 7. Screen inventory
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|

## 8. Findability
How lists longer than one phone screen are searched, filtered, sorted or grouped.

## 9. Open questions and assumptions

## 10. Handoff to UX
Fixed by this spec: ...
Yours to decide: ...
```

## Review checklist (the four systems)

- Organization: one grouping scheme per level; structure follows the audience's mental model, not Firestore.
- Labeling: one name per concept across UI, i18n, routes and code; works in Hebrew and for the least expert audience.
- Navigation: every screen has a parent and a way back; depth ≤ 3 from the role's home; one home and one primary task per role.
- Findability: any list that can outgrow a phone screen has search, filter, sort or grouping.
