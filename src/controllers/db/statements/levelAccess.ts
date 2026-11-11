import { getDoc } from 'firebase/firestore';
import { Access, Creator, Role, Statement } from '@freedi/shared-types';
import { CACHE } from '@/constants/common';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import {
	EntryVerdict,
	getEntryVerdict,
	getLevelAccess,
	getLevelsAbove,
	getSubscriptionScopeId,
	isProvenOpen,
} from '@/helpers/entryVerdict';
import { isRefusedRead } from '@/helpers/firestoreRefusal';
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { logError } from '@/utils/errorHandling';
import { createSubscriptionRef } from '@/utils/firebaseUtils';
import { getStatementFromDB } from './getStatement';

type Person = Pick<Creator, 'uid' | 'isAnonymous'>;

interface RememberedRead<T> {
	expiresAt: number;
	read: Promise<T>;
}

const MAX_REMEMBERED_READS = 200;

const statementReads = new Map<string, RememberedRead<Statement | undefined>>();
const roleReads = new Map<string, RememberedRead<Role | undefined>>();

/** One screen asks about the same levels from several places; they share one read. */
function remember<T>(
	reads: Map<string, RememberedRead<T>>,
	key: string,
	startRead: () => Promise<T>,
): Promise<T> {
	const now = Date.now();
	const remembered = reads.get(key);
	if (remembered && remembered.expiresAt > now) return remembered.read;
	if (reads.size >= MAX_REMEMBERED_READS) reads.clear();

	const read = startRead();
	reads.set(key, { expiresAt: now + CACHE.SHORT_TTL, read });

	return read;
}

export function forgetLevelReads(): void {
	statementReads.clear();
	roleReads.clear();
}

function readLevel(levelId: string, uid: string | undefined): Promise<Statement | undefined> {
	return remember(statementReads, `${uid}--${levelId}`, () =>
		getStatementFromDB(levelId, { expectRefusal: true }),
	);
}

function isRole(value: unknown): value is Role {
	return Object.values(Role).includes(value as Role);
}

/**
 * Only the role matters here, so only the role is read. Real subscription docs
 * can hold Timestamps or miss fields; the gate's listener salvages the role
 * from those, and a full schema parse here would turn a member into a stranger.
 */
async function fetchRole(subscriptionId: string): Promise<Role | undefined> {
	try {
		const snapshot = await getDoc(createSubscriptionRef(subscriptionId));
		const role: unknown = snapshot.data()?.role;

		return isRole(role) ? role : undefined;
	} catch (error) {
		if (!isRefusedRead(error)) {
			logError(error, {
				operation: 'statements.levelAccess.fetchRole',
				metadata: { subscriptionId },
			});
		}

		return undefined;
	}
}

function readRole(scopeId: string | undefined, uid: string | undefined): Promise<Role | undefined> {
	const subscriptionId = scopeId && uid ? getStatementSubscriptionId(scopeId, uid) : undefined;
	if (!subscriptionId) return Promise.resolve(undefined);

	return remember(roleReads, subscriptionId, () => fetchRole(subscriptionId));
}

/** True when Redux alone holds enough to call the level open, so no read is needed. */
function isKnownOpen(levelId: string, person: Person | undefined): boolean {
	const state = store.getState();
	const level = statementSelector(levelId)(state);
	const scopeId = getSubscriptionScopeId(level);
	const governing = statementSelector(scopeId)(state);
	const subscription = statementSubscriptionSelector(scopeId)(state);

	return isProvenOpen(level, governing, subscription, person);
}

/** Judges one level for one person. Read-only: unlike useAuthorization it never subscribes or files a request. */
export async function readLevelVerdict(
	levelId: string,
	person: Person | undefined,
): Promise<EntryVerdict> {
	if (isKnownOpen(levelId, person)) return 'open';

	const uid = person?.uid;
	const level = await readLevel(levelId, uid);
	if (!level) return 'gone';

	const scopeId = getSubscriptionScopeId(level);
	const governing = scopeId && scopeId !== levelId ? await readLevel(scopeId, uid) : level;
	const access = getLevelAccess(level, governing);
	const role = access === Access.public ? undefined : await readRole(scopeId, uid);

	return getEntryVerdict(level, governing, role ? { role } : undefined, person);
}

/** The nearest level above the statement the person may enter, or undefined for Home. */
export async function findUpTarget(
	statement: Pick<Statement, 'statementId' | 'parents' | 'parentId' | 'topParentId'>,
	person: Person | undefined,
): Promise<string | undefined> {
	try {
		for (const levelId of getLevelsAbove(statement)) {
			if ((await readLevelVerdict(levelId, person)) === 'open') return levelId;
		}

		return undefined;
	} catch (error) {
		logError(error, {
			operation: 'statements.levelAccess.findUpTarget',
			userId: person?.uid,
			statementId: statement.statementId,
		});

		return undefined;
	}
}
