import type { Firestore } from 'firebase-admin/firestore';
import { Access, Collections, Role, StatementType, type Statement } from '@freedi/shared-types';
import { findStatementAdminSource } from '../progress/assertStatementAdmin';
import { isSystemAdmin } from './httpAuth';
import { ancestorIds } from './statementAncestors';
import { isOpenAccess, judgeAccessLevels, type AccessLevel } from './statementAccess';

const TREE_ACCESS = {
	/**
	 * The bulk response window. A chain or page can be built from settings already
	 * this old and then kept this long, so a settings change reaches every caller
	 * within twice this. Roles are not cached at all.
	 */
	CACHE_TTL_MS: 30 * 1000,
	CACHE_MAX_ENTRIES: 200,
	/** Statements whose settings are kept per instance. Each entry is a few short fields. */
	NODE_CACHE_MAX_ENTRIES: 10000,
	/** Far deeper than any real tree. A longer chain, or a loop, is refused, not read. */
	MAX_DEPTH: 100,
} as const;

const NOT_FOUND = 404;
const FORBIDDEN = 403;
const TOP = 'top';

type LevelSettings = AccessLevel['statement'];

/** What the walk needs to know of one statement. Null is a statement that does not exist. */
interface TreeNode {
	parentId: string | undefined;
	settings: NonNullable<LevelSettings>;
	/** An answer-type statement, whose writer may have copied its parent's setting. */
	mayCopyParent: boolean;
}

type KnownNodes = Map<string, TreeNode | null>;

/** The levels from one statement upward, nearest first. */
interface ChainWalk {
	ids: string[];
	settings: LevelSettings[];
	nextId: string | null;
	/** Listed ancestors, used only past a broken `parentId` link. */
	listed: string[];
	/** A loop or an absurd depth: the chain cannot be trusted. */
	unsafe: boolean;
}

interface ClimbOptions {
	/** The level to stop below. Undefined climbs to the top. */
	stopId?: string;
	/** Stop once the nearest setting is open, since nothing above can then gate the statement. */
	stopAtOpenOwner: boolean;
}

/** The caller-independent half of the check: the root and each level above it. */
interface TreeChain {
	root: Statement;
	ids: string[];
	settings: LevelSettings[];
}

export type TreeReadAccess =
	| { allowed: true; levels: AccessLevel[] }
	| { allowed: false; status: number; error: string };

/**
 * A statement behind a private level: the levels below the root that own a
 * setting or are hidden. A level with neither is left out, so a child that only
 * inherits costs no role read, and a role placed directly on one does not count.
 */
export interface GatedChain {
	ids: string[];
	settings: LevelSettings[];
}

/** Statement id -> its chain, for the statements of a page governed by a private level below the root. */
export type PrivateGates = ReadonlyMap<string, GatedChain>;

/** Stands in for the settings of a chain that could not be followed: only a host passes. */
const UNTRUSTED_LEVEL: LevelSettings = { membership: { access: Access.secret } };

const chainCache = new Map<string, { at: number; chain: Promise<TreeChain | null> }>();
const nodeCache = new Map<string, { at: number; node: TreeNode | null }>();

function subscriptionRefs(firestore: Firestore, uid: string, statementIds: string[]) {
	const subscriptions = firestore.collection(Collections.statementsSubscribe);

	return statementIds.map((id) => subscriptions.doc(`${uid}--${id}`));
}

const ANSWER_TYPES: ReadonlySet<string> = new Set([
	StatementType.option,
	StatementType.synthesis,
	StatementType.agreement,
]);

/** A ballot is stored as a question, and only this field tells it from a real one. */
function isAnswerType(statement: Statement): boolean {
	return ANSWER_TYPES.has(statement.statementType) || !!statement.agreementBallot;
}

function toNode(statement: Statement): TreeNode {
	return {
		parentId: statement.parentId,
		settings: { membership: statement.membership, hide: statement.hide },
		mayCopyParent: isAnswerType(statement),
	};
}

/**
 * A level's settings for judging. Improved answers, ballots and agreements are
 * written with a copy of their question's setting, so on those types a setting
 * identical to the parent's is inherited, not the statement's own. Otherwise a
 * member of a private question would be refused its answers. Questions and
 * groups keep theirs: a nested secret question is its own private space.
 */
function ownSettings(node: TreeNode | null | undefined, known: KnownNodes): LevelSettings {
	if (!node) return undefined;

	const access = node.settings.membership?.access;
	if (!access || !node.mayCopyParent || !node.parentId) return node.settings;
	const parentAccess = known.get(node.parentId)?.settings.membership?.access;

	return parentAccess === access ? { hide: node.settings.hide } : node.settings;
}

function rememberNode(id: string, node: TreeNode | null): void {
	nodeCache.delete(id);
	if (nodeCache.size >= TREE_ACCESS.NODE_CACHE_MAX_ENTRIES) {
		const oldest = nodeCache.keys().next().value;
		if (oldest !== undefined) nodeCache.delete(oldest);
	}
	nodeCache.set(id, { at: Date.now(), node });
}

async function loadNodes(firestore: Firestore, ids: string[], known: KnownNodes): Promise<void> {
	const toRead = ids.filter((id) => {
		const cached = nodeCache.get(id);
		if (!cached || Date.now() - cached.at > TREE_ACCESS.CACHE_TTL_MS) return true;
		known.set(id, cached.node);

		return false;
	});
	if (toRead.length === 0) return;

	const statements = firestore.collection(Collections.statements);
	const snaps = await firestore.getAll(...toRead.map((id) => statements.doc(id)));
	snaps.forEach((snap, index) => {
		const data = snap.data() as Statement | undefined;
		const node = snap.exists && data ? toNode(data) : null;
		known.set(toRead[index], node);
		rememberNode(toRead[index], node);
	});
}

function nextLevel(walk: ChainWalk, node: TreeNode | null): string | null {
	return node?.parentId || (walk.listed.find((id) => !walk.ids.includes(id)) ?? null);
}

function startWalk(id: string, statement: Statement): ChainWalk {
	const node = toNode(statement);
	const walk: ChainWalk = {
		ids: [id],
		settings: [node.settings],
		nextId: null,
		listed: ancestorIds(statement, Infinity),
		unsafe: false,
	};
	walk.nextId = nextLevel(walk, node);

	return walk;
}

function nearestAccess(settings: LevelSettings[]): string | undefined {
	return settings.find((level) => level?.membership?.access)?.membership?.access;
}

/** Climbs as far as the known nodes allow. Returns the id it needs next, or null when finished. */
function climb(walk: ChainWalk, known: KnownNodes, options: ClimbOptions): string | null {
	while (walk.nextId !== null) {
		const id = walk.nextId;
		const access = options.stopAtOpenOwner ? nearestAccess(walk.settings) : undefined;
		if (id === TOP || id === options.stopId || (access && isOpenAccess(access))) {
			walk.nextId = null;
			break;
		}
		if (walk.ids.includes(id) || walk.ids.length >= TREE_ACCESS.MAX_DEPTH) {
			walk.unsafe = true;
			walk.nextId = null;
			break;
		}
		const node = known.get(id);
		if (node === undefined) return id;

		walk.ids.push(id);
		walk.settings.push(node?.settings);
		walk.nextId = nextLevel(walk, node);
	}

	return null;
}

/**
 * Follows `parentId`, not the `parents` list: `createStatementObject` writes only
 * `[topParentId, parentId]` when it is given no list, so the list can skip a
 * private level. One batched read per level of depth, for all walks together.
 */
async function climbAll(
	firestore: Firestore,
	walks: ChainWalk[],
	known: KnownNodes,
	options: ClimbOptions,
): Promise<void> {
	for (;;) {
		const needed = new Set<string>();
		for (const walk of walks) {
			const id = climb(walk, known, options);
			if (id !== null) needed.add(id);
		}
		if (needed.size === 0) return;
		await loadNodes(firestore, [...needed], known);
	}
}

async function readChain(firestore: Firestore, rootId: string): Promise<TreeChain | null> {
	const rootSnap = await firestore.collection(Collections.statements).doc(rootId).get();
	const root = rootSnap.data() as Statement | undefined;
	if (!rootSnap.exists || !root) return null;

	const rootNode = toNode(root);
	rememberNode(rootId, rootNode);
	const known: KnownNodes = new Map([[rootId, rootNode]]);
	const walk = startWalk(rootId, root);
	await climbAll(firestore, [walk], known, { stopAtOpenOwner: false });
	if (walk.unsafe) return null;

	return {
		root,
		ids: walk.ids,
		settings: walk.ids.map((id) => ownSettings(known.get(id), known)),
	};
}

/**
 * Only settings are cached, never a person's role: a ban or an approval takes
 * effect on the very next call. The promise is what is cached, so a burst on a
 * cold instance still pays for one read.
 */
function loadChain(firestore: Firestore, rootId: string): Promise<TreeChain | null> {
	const cached = chainCache.get(rootId);
	if (cached && Date.now() - cached.at <= TREE_ACCESS.CACHE_TTL_MS) return cached.chain;

	chainCache.delete(rootId);
	if (chainCache.size >= TREE_ACCESS.CACHE_MAX_ENTRIES) {
		const oldest = chainCache.keys().next().value;
		if (oldest !== undefined) chainCache.delete(oldest);
	}

	const chain = readChain(firestore, rootId);
	chainCache.set(rootId, { at: Date.now(), chain });
	chain.then(
		(found) => {
			if (!found) chainCache.delete(rootId);
		},
		() => chainCache.delete(rootId),
	);

	return chain;
}

/**
 * Whether the caller may read the tree under `rootId`. Follows the participation
 * gate (`judgeAccessLevels`), except that no access setting at any level means
 * open, and system admins pass. System-admin and statement-admin lookups run
 * only when the caller would otherwise be refused.
 */
export async function authorizeTreeRead(
	firestore: Firestore,
	uid: string,
	rootId: string,
): Promise<TreeReadAccess> {
	const chain = await loadChain(firestore, rootId);
	if (!chain) return { allowed: false, status: NOT_FOUND, error: 'Statement not found' };

	const roleSnaps = await firestore.getAll(...subscriptionRefs(firestore, uid, chain.ids));
	const levels: AccessLevel[] = chain.settings.map((statement, index) => ({
		statement,
		role: (roleSnaps[index].data() as { role?: string } | undefined)?.role,
	}));

	const verdict = judgeAccessLevels(levels, 'open');
	if (verdict === 'allowed') return { allowed: true, levels };
	if (await isSystemAdmin(uid)) return { allowed: true, levels };
	if (verdict === 'banned') {
		return { allowed: false, status: FORBIDDEN, error: 'You cannot take part in this space' };
	}
	if ((await findStatementAdminSource(uid, chain.root)) !== null) {
		// Counts as a host level when statements below the root are judged.
		return { allowed: true, levels: [...levels, { statement: undefined, role: Role.admin }] };
	}
	if (verdict === 'hidden') {
		return { allowed: false, status: NOT_FOUND, error: 'Statement not found' };
	}
	if (verdict === 'waiting') {
		return { allowed: false, status: FORBIDDEN, error: 'Waiting for approval' };
	}

	return { allowed: false, status: FORBIDDEN, error: 'You are not a member of this space' };
}

function judgedLevels(ids: string[], settings: LevelSettings[]): GatedChain {
	const kept = ids
		.map((id, index) => ({ id, level: settings[index] }))
		.filter(({ level }) => level?.membership?.access || level?.hide);

	return { ids: kept.map(({ id }) => id), settings: kept.map(({ level }) => level) };
}

/**
 * Which statements of a page are governed by a private level below the root. A
 * level at or above the root needs no entry: the caller has already passed it.
 * The result does not depend on the caller, so it is cached with the page.
 */
export async function findPrivateGates(
	firestore: Firestore,
	rootId: string,
	page: Statement[],
): Promise<PrivateGates> {
	const known: KnownNodes = new Map();
	for (const statement of page) {
		const node = toNode(statement);
		known.set(statement.statementId, node);
		rememberNode(statement.statementId, node);
	}

	const walks = page.map((statement) => startWalk(statement.statementId, statement));
	await climbAll(firestore, walks, known, { stopId: rootId, stopAtOpenOwner: true });
	// The walks stop below the root, but a direct child is compared with it.
	await loadNodes(firestore, [rootId], known);

	const gates = new Map<string, GatedChain>();
	walks.forEach((walk, index) => {
		const id = page[index].statementId;
		const settings = walk.ids.map((levelId) => ownSettings(known.get(levelId), known));
		const access = nearestAccess(settings);
		if (walk.unsafe) gates.set(id, { ids: [id], settings: [UNTRUSTED_LEVEL] });
		else if (access && !isOpenAccess(access)) gates.set(id, judgedLevels(walk.ids, settings));
	});

	return gates;
}

/**
 * The statements this caller may not see. Each is judged on its gated levels plus
 * the levels from the root up, by the same rules as the root. Roles are read
 * fresh and by document id, once per distinct level that owns a setting.
 */
export async function findRefusedStatements(
	firestore: Firestore,
	uid: string,
	gates: PrivateGates,
	rootLevels: AccessLevel[],
): Promise<ReadonlySet<string>> {
	if (gates.size === 0) return new Set();

	const levelIds = [...new Set([...gates.values()].flatMap(({ ids }) => ids))];
	const roleSnaps = await firestore.getAll(...subscriptionRefs(firestore, uid, levelIds));
	const roles = new Map(
		levelIds.map((id, index) => [
			id,
			(roleSnaps[index].data() as { role?: string } | undefined)?.role,
		]),
	);

	const refused = [...gates]
		.filter(([, { ids, settings }]) => {
			const levels = ids.map((id, index) => ({ statement: settings[index], role: roles.get(id) }));

			return judgeAccessLevels([...levels, ...rootLevels], 'open') !== 'allowed';
		})
		.map(([statementId]) => statementId);
	if (refused.length === 0 || (await isSystemAdmin(uid))) return new Set();

	return new Set(refused);
}
