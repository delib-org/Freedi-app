/**
 * Survey co-admin invitations against a real Firestore.
 *
 * The unit tests in surveyAdmins.test.ts run on an in-memory stand-in, which
 * proves the branching but not that the queries and the transaction actually
 * work. This one talks to the Firestore emulator and is skipped when none is
 * running, so it never blocks a plain `npm test`.
 *
 * Start one with: firebase emulators:start --only firestore
 */

import fs from 'fs';
import path from 'path';
import type { Firestore } from 'firebase-admin/firestore';

/** Read apps/mass-consensus/.env — jest does not apply Next's env loading. */
function loadEnvFile(): void {
  const envPath = path.join(__dirname, '../../../../../.env');

  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    });
}

loadEnvFile();

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const hasEmulator =
  process.env.USE_FIREBASE_EMULATOR === 'true' && Boolean(emulatorHost);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const describeWithEmulator: jest.Describe = hasEmulator ? describe : describe.skip;

describeWithEmulator('survey co-admins (Firestore emulator)', () => {
  // A run-scoped id keeps parallel runs, and anyone else using the same
  // emulator, out of each other's way.
  const runId = `it-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const surveyId = `${runId}--survey`;
  const invitedEmail = `invited-${runId}@example.com`;
  const ownerId = `${runId}--owner`;
  const inviteeId = `${runId}--invitee`;

  type SurveyAdminsModule = typeof import('../surveyAdmins');
  type SurveyAccessModule = typeof import('@/lib/auth/surveyAccess');
  type SharedTypes = typeof import('@freedi/shared-types');

  let mod: SurveyAdminsModule;
  let accessMod: SurveyAccessModule;
  let types: SharedTypes;
  let db: Firestore;
  let survey: import('@freedi/shared-types').Survey;

  beforeAll(async () => {
    // Imported lazily: the admin module reads emulator env vars at import time.
    types = await import('@freedi/shared-types');
    mod = await import('../surveyAdmins');
    accessMod = await import('@/lib/auth/surveyAccess');
    const admin = await import('@/lib/firebase/admin');
    admin.initializeFirebaseAdmin();
    db = admin.getFirestoreAdmin();

    survey = {
      surveyId,
      title: 'Integration survey',
      creatorId: ownerId,
      questionIds: [],
      status: types.SurveyStatus.draft,
      settings: types.DEFAULT_SURVEY_SETTINGS,
      defaultLanguage: 'en',
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    } as unknown as import('@freedi/shared-types').Survey;

    await db.collection(types.Collections.surveys).doc(surveyId).set(survey);
  }, 30000);

  afterAll(async () => {
    if (!db) return;

    await mod.deleteSurveyAdminRecords(surveyId);
    await db.collection(types.Collections.surveys).doc(surveyId).delete();
  }, 30000);

  it('runs the whole invite → accept → promote → remove cycle', async () => {
    // 1. Invite, at view-only.
    const created = await mod.createSurveyAdminInvitation({
      survey,
      invitedEmail,
      role: types.SurveyAdminRole.viewer,
      inviterUserId: ownerId,
      inviterDisplayName: 'Owner',
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // The stored document must not carry the raw token.
    const storedInvite = await db
      .collection(types.Collections.surveyAdminInvitations)
      .doc(created.invitation.invitationId)
      .get();

    expect(storedInvite.exists).toBe(true);
    expect(storedInvite.data()?.tokenHash).toBe(mod.hashToken(created.rawToken));
    expect(JSON.stringify(storedInvite.data())).not.toContain(created.rawToken);

    // 2. It shows up as pending for the owner.
    const pending = await mod.listSurveyAdminInvitations(surveyId);
    expect(pending.map((i) => i.invitedEmail)).toContain(invitedEmail);

    // 3. Someone else holding the link cannot redeem it.
    const wrongEmail = await mod.acceptSurveyAdminInvitation(created.rawToken, {
      userId: `${runId}--attacker`,
      email: `attacker-${runId}@example.com`,
      displayName: 'Attacker',
    });

    expect(wrongEmail.ok === false && wrongEmail.code).toBe('wrong-email');

    // 4. The invited address redeems it.
    const accepted = await mod.acceptSurveyAdminInvitation(created.rawToken, {
      userId: inviteeId,
      email: invitedEmail.toUpperCase(),
      displayName: 'Invited Person',
    });

    expect(accepted.ok).toBe(true);
    expect(accepted.ok === true && accepted.role).toBe(types.SurveyAdminRole.viewer);

    // 5. That grant is what the access gate now reads.
    expect(await accessMod.resolveSurveyAccess(survey, inviteeId)).toEqual({
      level: 'viewer',
      canEdit: false,
      canManageAdmins: false,
    });

    // 6. The invitation is no longer pending, and cannot be replayed.
    expect(await mod.listSurveyAdminInvitations(surveyId)).toHaveLength(0);

    const replay = await mod.acceptSurveyAdminInvitation(created.rawToken, {
      userId: inviteeId,
      email: invitedEmail,
      displayName: 'Invited Person',
    });

    expect(replay.ok === false && replay.code).toBe('accepted');

    // 7. Promote to editor.
    expect(
      await mod.updateSurveyAdminRole(surveyId, inviteeId, types.SurveyAdminRole.editor)
    ).toBe(true);

    expect(await accessMod.resolveSurveyAccess(survey, inviteeId)).toEqual({
      level: 'editor',
      canEdit: true,
      canManageAdmins: false,
    });

    // 8. The survey now appears in the invitee's own list.
    const shared = await mod.getSurveysSharedWithUser(inviteeId);
    expect(shared.surveys.map((s) => s.surveyId)).toContain(surveyId);
    expect(shared.rolesBySurveyId[surveyId]).toBe(types.SurveyAdminRole.editor);

    // 9. Re-inviting an address that already has access is refused.
    const duplicate = await mod.createSurveyAdminInvitation({
      survey,
      invitedEmail,
      role: types.SurveyAdminRole.viewer,
      inviterUserId: ownerId,
      inviterDisplayName: 'Owner',
    });

    expect(duplicate.ok === false && duplicate.code).toBe('already-admin');

    // 10. Removing access revokes it everywhere.
    expect(await mod.removeSurveyAdmin(surveyId, inviteeId)).toBe(true);
    expect(await accessMod.resolveSurveyAccess(survey, inviteeId)).toBeNull();
  }, 60000);

  it('never grants the owner role through an invitation', async () => {
    const created = await mod.createSurveyAdminInvitation({
      survey,
      invitedEmail: `owner-path-${runId}@example.com`,
      role: types.SurveyAdminRole.editor,
      inviterUserId: ownerId,
      inviterDisplayName: 'Owner',
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // The creator redeeming their own survey's invite gains nothing new.
    const result = await mod.acceptSurveyAdminInvitation(created.rawToken, {
      userId: ownerId,
      email: `owner-path-${runId}@example.com`,
      displayName: 'Owner',
    });

    expect(result.ok === false && result.code).toBe('owner');

    const adminDoc = await db
      .collection(types.Collections.surveyAdmins)
      .doc(types.getSurveyAdminId(surveyId, ownerId))
      .get();

    expect(adminDoc.exists).toBe(false);
  }, 60000);
});
