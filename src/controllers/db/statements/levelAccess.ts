import { Access, Creator, Statement, StatementSubscription } from '@freedi/shared-types';
import { CACHE } from '@/constants/common';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import {
	EntryVerdict,
	getEntryVerdict,
	getLevelsAbove,
	getSubscriptionScopeId,
} from '@/helpers/entryVerdict';
import { logError } from '@/utils/errorHandling';
import { getStatementSubscriptionFromDB } from '../subscriptions/getSubscriptions';
import { getStatementFromDB } from './getStatement';

type Person = Pick<Creator, 'uid' | 'isAnonymous'>;

interface RememberedRead<T> {
	expiresAt: number;
	read: Promise<T>;
}

const MAX_REMEMBERED_READS = 200;
const EXPECT_REFUSAL = { expectRefusal: true };

const statementReads = new Map<string, RememberedRead<Statement | undefined>>();
const subscriptionReads = new Map<string, RememberedRead<StatementSubscription | undefined>>();

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
	subscriptionReads.clear();
}

function readLevel(levelId: string, uid: string | undefined): Promise<Statement | undefined> {
	return remember(statementReads, `${uid}--${levelId}`, () =>
		getStatementFromDB(levelId, EXPECT_REFUSAL),
	);
}

function readSubscription(
	scopeId: string | undefined,
	uid: string | undefined,
): Promise<StatementSubscription | undefined> {
	const subscriptionId = scopeId && uid ? getStatementSubscriptionId(scopeId, uid) : undefined;
	if (!subscriptionId) return Promise.resolve(undefined);

	return remember(subscriptionReads, subscriptionId, () =>
		getStatementSubscriptionFromDB(subscriptionId, EXPECT_REFUSAL),
	);
}

/** Judges one level for one person. Read-only: unlike useAuthorization it never subscribes or files a request. */
export async function readLevelVerdict(
	levelId: string,
	person: Person | undefined,
): Promise<EntryVerdict> {
	const uid = person?.uid;
	const level = await readLevel(levelId, uid);
	if (!level) return 'gone';

	const inheritsAccess = !level.membership?.access && level.topParentId !== levelId;
	const topParent = inheritsAccess ? await readLevel(level.topParentId, uid) : level;
	const access = level.membership?.access || topParent?.membership?.access;
	const subscription =
		access === Access.public
			? undefined
			: await readSubscription(getSubscriptionScopeId(level), uid);

	return getEntryVerdict(level, topParent, subscription, person);
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
