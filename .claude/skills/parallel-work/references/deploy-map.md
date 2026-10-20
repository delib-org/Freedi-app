# Deploy map: what each change needs, and the exact command

The orchestrator uses this in Step 10 to turn "files touched" into a command list for Tal.
Always the npm scripts, never raw `firebase deploy` (they load the right env, build, switch
the project alias and restore the dev env afterwards). All functions live in me-west1.

| What changed | Target | Command (from the repo root, on `dev` after the batch merge) |
|---|---|---|
| `functions/src/**` | Cloud Functions, **named**, 10-20 per batch | `npm run deploy:f:prod -- fnA fnB fnC` |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | rules (indexes: add via gcloud, never `--force`) | `npm run deploy:rules:prod` |
| `src/**` (main app) | hosting wizcol | `npm run deploy:h:prod` |
| `apps/agora/**` | hosting agora | `npm run deploy:agora` |
| `apps/studio/**` | hosting studio | `npm run deploy:studio` |
| `apps/odyssey/**` | hosting odyssey | `npm run deploy:odyssey` |
| `apps/join/**` | hosting join | `npm run deploy:join` |
| `apps/flow/**` | hosting flow | `npm run deploy:flow` |
| `apps/admin/**` | hosting admin | `npm run deploy:admin` |
| `apps/chat/**` | hosting chat + ssrChat | `npm run deploy:chat` |
| `apps/mass-consensus/**` (MC) | Vercel via git | `git merge dev` into `main-mc`, then `git push origin main-mc` |
| `apps/sign/**` | Vercel via git | `git merge dev` into `main-sign`, then `git push origin main-sign` |
| `packages/shared-types/**`, `packages/*` | nothing by itself | redeploy every consumer above that imports the changed export |

Rules for the list you hand Tal:

- **Functions by name.** List the exported functions whose code path changed (the function
  itself, or a helper it imports). A full `npm run deploy:f:prod` with no names hits the
  429 quota and leaves prod half-updated. Split into batches of 10-20.
- **Order:** rules → functions → hosting. A new hosting build that calls a function that
  is not there yet is a user-visible error; the other way round is harmless.
- **Stale functions block deploys.** A function that the batch deleted or renamed must be
  deleted in the console first; say so in the list.
- **Testing first when Tal asks:** the same scripts with `test` instead of `prod`
  (`deploy:f:test`, `deploy:rules:test`, `deploy:h:test`, `deploy:studio:dev`).
- **MC and Sign** deploy themselves from `main-mc` / `main-sign`; a push to `main` is not
  inert either (check `.github/workflows/` before pushing anything).
- `npm run deploy:sign:vercel` is a stale hook; do not list it.
