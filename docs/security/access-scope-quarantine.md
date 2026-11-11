# Quarantined statements (`accessScope: 'quarantined'`)

Every statement carries `accessScope`: `'open'`, or the id of the private level
that governs it. The database rules read it on every list. The server sets a
third value, `'quarantined'`, when a statement has no trustworthy place in the
tree. Nobody lists a quarantined statement through a scope, and nobody writes
under it. Only a system admin, and a host of the top it claims, can still list
it. Its creator still finds it among their own statements. A `get` by id stays
as open as it is for every statement; see the comment above `allow get` in
`firestore.rules`.

## Why a statement gets quarantined

The server logs each one as an error, so each shows in Sentry:

| Log `operation` | Cause |
|---|---|
| `accessScope.scopeOf` | Its chain of parents loops back on itself, or is deeper than any real tree. Someone forged its place, for example to show an open statement among a private level's. |
| `accessScope.scopeOfReusedId` | Its id was deleted from a private level and made again somewhere else. The old children are still filed under the id and would be read through the new statement. |
| — | It is filed under a quarantined statement. Quarantine covers everything below it. |

A quarantine is never lifted by the server. Re-stamps, the backfill and the
re-stamp job all keep it. Only a person lifts it.

## Before lifting

1. Find out who made the statement and what it claims. Compare `parentId`,
   `parents` and `topParentId`.
2. **Loop:** fix the tree first. Move the statements so that `parentId` leads to
   a real top. The script refuses to lift a statement that is still on a loop.
3. **Reused id:** look at the children still filed under it. They belonged to
   the private level the id was deleted from (the tombstone in
   `statementDeletions/{id}` names it). Move or delete them before lifting,
   unless the new statement really belongs in that same private level.
4. If you are not sure, leave it quarantined. Nothing is lost: the content is
   only hidden.

## Lifting

`scripts/liftQuarantine.ts` lifts the statement you name and the quarantined
statements under it.
- It re-judges each one's scope from its tree, the same way new statements are
  stamped. So a statement inside a private level goes back to that level, never
  to a blanket `'open'`.
- Statements that are not quarantined are left as they are.
- It keeps a statement quarantined, and says why, when:
  - it is still on a loop (`loop`);
  - it sits under a quarantine you did not name (`under-quarantine`);
  - its parent was deleted (`parent-deleted`), since what is left of its chain
    could make it look open.

It is a dry run by default, with the same project guards as
`scripts/backfillAccessScope.ts`:

```bash
# 1. See what it would do
GCLOUD_PROJECT=<project> npx tsx scripts/liftQuarantine.ts --root=<statementId>

# 2. Write it (a real project needs --confirm-prod)
GCLOUD_PROJECT=<project> npx tsx scripts/liftQuarantine.ts --root=<statementId> --execute --confirm-prod
```

If the root's id was deleted from a private level and made again, writing needs
`--allow-reused-id` as well. Add it only after step 3 above.

The script writes only `accessScope`. That write starts no re-stamp of its own
(the update triggers skip writes that change only `accessScope`). It looks at
5000 statements at most (`--max=N`). If it stops there, it says so; run it again
from a lower statement.

## After lifting

Run the dry run again. It must report nothing left to lift, apart from the
statements it kept on purpose. Then check that the members of the private level
see the statements again, and that nobody else does.
