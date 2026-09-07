/**
 * Survey admin invitations. The load-bearing rule under test: holding the
 * invite link is not enough — the signed-in account's email must match the
 * address the invitation was sent to.
 */

interface StoredDoc {
  data: Record<string, unknown>;
}

const stores: Record<string, Map<string, StoredDoc>> = {};
const mockTransactionSet = jest.fn();
const mockTransactionUpdate = jest.fn();

/** Minimal in-memory stand-in for the Admin SDK surface these functions use. */
function makeDb() {
  const collection = (name: string) => {
    if (!stores[name]) stores[name] = new Map();
    const store = stores[name];

    const docRef = (id: string) => ({
      id,
      get: async () => ({
        exists: store.has(id),
        id,
        data: () => store.get(id)?.data,
        ref: docRef(id),
      }),
      set: async (data: Record<string, unknown>) => {
        store.set(id, { data });
      },
      update: async (patch: Record<string, unknown>) => {
        store.set(id, { data: { ...(store.get(id)?.data ?? {}), ...patch } });
      },
      delete: async () => {
        store.delete(id);
      },
    });

    const buildQuery = (filters: [string, unknown][]) => ({
      where: (field: string, _op: string, value: unknown) =>
        buildQuery([...filters, [field, value]]),
      limit: () => buildQuery(filters),
      get: async () => {
        const docs = Array.from(store.entries())
          .filter(([, doc]) => filters.every(([f, v]) => doc.data[f] === v))
          .map(([id, doc]) => ({ id, data: () => doc.data, ref: docRef(id) }));

        return { empty: docs.length === 0, docs };
      },
    });

    return {
      doc: (id?: string) => docRef(id ?? `generated-${store.size + 1}`),
      where: (field: string, _op: string, value: unknown) => buildQuery([[field, value]]),
      get: async () => ({
        empty: store.size === 0,
        docs: Array.from(store.entries()).map(([id, doc]) => ({
          id,
          data: () => doc.data,
          ref: docRef(id),
        })),
      }),
    };
  };

  return {
    collection,
    runTransaction: async (
      fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (ref: { set: (d: Record<string, unknown>) => Promise<void> }, d: Record<string, unknown>) => void;
        update: (ref: { update: (d: Record<string, unknown>) => Promise<void> }, d: Record<string, unknown>) => void;
      }) => Promise<void>
    ) => {
      const writes: (() => Promise<void>)[] = [];
      await fn({
        get: (ref) => ref.get(),
        set: (ref, data) => {
          mockTransactionSet(data);
          writes.push(() => ref.set(data));
        },
        update: (ref, data) => {
          mockTransactionUpdate(data);
          writes.push(() => ref.update(data));
        },
      });
      for (const write of writes) await write();
    },
    getAll: async () => [],
    batch: () => ({ delete: jest.fn(), commit: jest.fn() }),
  };
}

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => makeDb(),
}));

jest.mock('@/lib/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  Collections,
  Survey,
  SurveyAdminInvitationStatus,
  SurveyAdminRole,
} from '@freedi/shared-types';
import {
  acceptSurveyAdminInvitation,
  createSurveyAdminInvitation,
  hashToken,
  normalizeEmail,
  revokeSurveyAdminInvitation,
} from '../surveyAdmins';

const survey = {
  surveyId: 'survey-1',
  creatorId: 'owner-1',
  title: 'Neighbourhood budget',
  defaultLanguage: 'en',
} as Survey;

const inviter = { inviterUserId: 'owner-1', inviterDisplayName: 'Owner' };

function resetStores() {
  Object.keys(stores).forEach((key) => delete stores[key]);
  stores[Collections.surveys] = new Map([
    ['survey-1', { data: survey as unknown as Record<string, unknown> }],
  ]);
}

async function inviteViewer(email = 'invited@example.com') {
  const created = await createSurveyAdminInvitation({
    survey,
    invitedEmail: email,
    role: SurveyAdminRole.viewer,
    ...inviter,
  });

  if (!created.ok) throw new Error(`invite failed: ${created.code}`);

  return created;
}

describe('normalizeEmail', () => {
  it('lowercases and trims a valid address', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com');
  });

  it('rejects anything that is not an address', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe('createSurveyAdminInvitation', () => {
  beforeEach(resetStores);

  it('stores only the token hash, never the raw token', async () => {
    const created = await inviteViewer();

    expect(created.invitation.tokenHash).toBe(hashToken(created.rawToken));
    expect(JSON.stringify(created.invitation)).not.toContain(created.rawToken);
  });

  it('puts the raw token in the invite link', async () => {
    const created = await inviteViewer();

    expect(created.inviteLink).toContain(encodeURIComponent(created.rawToken));
    expect(created.inviteLink).toContain('/admin/invite?token=');
  });

  it('refuses a second live invite to the same address', async () => {
    await inviteViewer();

    const second = await createSurveyAdminInvitation({
      survey,
      invitedEmail: 'invited@example.com',
      role: SurveyAdminRole.editor,
      ...inviter,
    });

    expect(second.ok).toBe(false);
    expect(second.ok === false && second.code).toBe('already-invited');
  });

  it('refuses an address that already has access', async () => {
    stores[Collections.surveyAdmins] = new Map([
      [
        'survey-1--user-2',
        {
          data: {
            surveyId: 'survey-1',
            userId: 'user-2',
            email: 'invited@example.com',
            role: SurveyAdminRole.viewer,
          },
        },
      ],
    ]);

    const result = await createSurveyAdminInvitation({
      survey,
      invitedEmail: 'invited@example.com',
      role: SurveyAdminRole.viewer,
      ...inviter,
    });

    expect(result.ok === false && result.code).toBe('already-admin');
  });
});

describe('acceptSurveyAdminInvitation', () => {
  beforeEach(resetStores);

  it('grants access when the signed-in email matches the invite', async () => {
    const created = await inviteViewer();

    const result = await acceptSurveyAdminInvitation(created.rawToken, {
      userId: 'user-2',
      email: 'invited@example.com',
      displayName: 'Invited Person',
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.role).toBe(SurveyAdminRole.viewer);
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', role: SurveyAdminRole.viewer })
    );
  });

  it('refuses a different signed-in email holding the same link', async () => {
    const created = await inviteViewer();

    const result = await acceptSurveyAdminInvitation(created.rawToken, {
      userId: 'attacker',
      email: 'someone-else@example.com',
      displayName: 'Someone Else',
    });

    expect(result.ok === false && result.code).toBe('wrong-email');
  });

  it('matches the invited address case-insensitively', async () => {
    const created = await inviteViewer();

    const result = await acceptSurveyAdminInvitation(created.rawToken, {
      userId: 'user-2',
      email: 'Invited@Example.com',
      displayName: 'Invited Person',
    });

    expect(result.ok).toBe(true);
  });

  it('rejects an unknown token', async () => {
    await inviteViewer();

    const result = await acceptSurveyAdminInvitation('not-a-real-token', {
      userId: 'user-2',
      email: 'invited@example.com',
      displayName: 'Invited Person',
    });

    expect(result.ok === false && result.code).toBe('not-found');
  });

  it('rejects a token that has already been redeemed', async () => {
    const created = await inviteViewer();
    const acceptor = {
      userId: 'user-2',
      email: 'invited@example.com',
      displayName: 'Invited Person',
    };

    await acceptSurveyAdminInvitation(created.rawToken, acceptor);
    const second = await acceptSurveyAdminInvitation(created.rawToken, acceptor);

    expect(second.ok === false && second.code).toBe('accepted');
  });

  it('rejects an expired invitation', async () => {
    const created = await inviteViewer();
    const stored = stores[Collections.surveyAdminInvitations].get(
      created.invitation.invitationId
    );
    stored!.data.expiresAt = Date.now() - 1000;

    const result = await acceptSurveyAdminInvitation(created.rawToken, {
      userId: 'user-2',
      email: 'invited@example.com',
      displayName: 'Invited Person',
    });

    expect(result.ok === false && result.code).toBe('expired');
  });

  it('rejects a revoked invitation', async () => {
    const created = await inviteViewer();
    await revokeSurveyAdminInvitation('survey-1', created.invitation.invitationId);

    const result = await acceptSurveyAdminInvitation(created.rawToken, {
      userId: 'user-2',
      email: 'invited@example.com',
      displayName: 'Invited Person',
    });

    expect(result.ok === false && result.code).toBe('revoked');
  });
});

describe('revokeSurveyAdminInvitation', () => {
  beforeEach(resetStores);

  it('marks a pending invitation revoked', async () => {
    const created = await inviteViewer();

    expect(await revokeSurveyAdminInvitation('survey-1', created.invitation.invitationId)).toBe(
      true
    );
    expect(
      stores[Collections.surveyAdminInvitations].get(created.invitation.invitationId)!.data.status
    ).toBe(SurveyAdminInvitationStatus.revoked);
  });

  it('refuses to revoke an invitation belonging to another survey', async () => {
    const created = await inviteViewer();

    expect(
      await revokeSurveyAdminInvitation('other-survey', created.invitation.invitationId)
    ).toBe(false);
  });
});
