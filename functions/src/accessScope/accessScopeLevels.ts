import type { Firestore } from 'firebase-admin/firestore';
import {
	AccessScopeLevel,
	Collections,
	OPEN_ACCESS_SCOPE,
	resolveAccessScope,
	type Statement,
} from '@freedi/shared-types';

/** Firestore's getAll takes any number, but one request should stay small. */
const GET_ALL_CHUNK = 300;

/** A chain longer than this is not a real tree; it stops the walk on a cycle. */
const MAX_DEPTH = 50;

const TOP = 'top';

/** Only what deciding a scope needs: a stamping pass reads every ancestor. */
const LEVEL_FIELDS = [
	'statementId',
	'statementType',
	'parentId',
	'topParentId',
	'membership',
	'statementSettings',
	'agreementBallot',
	'hide',
];

export type ScopeSubject = Pick<
	Statement,
	'statementId' | 'parentId' | 'topParentId' | 'membership' | 'statementSettings'
> &
	Partial<Pick<Statement, 'statementType' | 'agreementBallot'>>;

type LoadedLevel = AccessScopeLevel & { parentId?: string; hide?: boolean };

/**
 * The access settings of the levels above a set of statements, read once. A
 * stamping pass over many statements shares a few ancestors, so a statement
 * costs no reads once its tree has been seen.
 *
 * Walks `parentId`, one level at a time. `parents` cannot be trusted for this:
 * createStatementObject without it writes only the top and the direct parent.
 */
export class AccessScopeLevels {
	private readonly levels = new Map<string, LoadedLevel | null>();

	constructor(private readonly firestore: Firestore) {}

	/** How many ancestor documents this pass has read. */
	get readCount(): number {
		return this.levels.size;
	}

	/** The ids above a subject as far as is known, and the next id to fetch, if any. */
	private walk(subject: ScopeSubject): { ids: string[]; missing?: string } {
		const ids: string[] = [];
		const seen = new Set([subject.statementId]);
		let next: string | undefined = subject.parentId;
		while (next && next !== TOP && !seen.has(next) && ids.length < MAX_DEPTH) {
			const level = this.levels.get(next);
			if (level === undefined) return { ids, missing: next };
			if (level === null) break;
			ids.push(next);
			seen.add(next);
			next = level.parentId;
		}
		const top = subject.topParentId;
		if (top && top !== TOP && !seen.has(top)) {
			if (this.levels.get(top) === undefined) return { ids, missing: top };
			ids.push(top);
		}

		return { ids };
	}

	async load(subjects: readonly ScopeSubject[]): Promise<void> {
		const statements = this.firestore.collection(Collections.statements);
		for (;;) {
			const wanted = new Set<string>();
			for (const subject of subjects) {
				const { missing } = this.walk(subject);
				if (missing) wanted.add(missing);
			}
			if (wanted.size === 0) return;

			const ids = [...wanted];
			for (let start = 0; start < ids.length; start += GET_ALL_CHUNK) {
				const chunk = ids.slice(start, start + GET_ALL_CHUNK);
				const snaps = await this.firestore.getAll(...chunk.map((id) => statements.doc(id)), {
					fieldMask: LEVEL_FIELDS,
				});
				snaps.forEach((snap, index) => {
					this.levels.set(
						chunk[index],
						snap.exists ? ({ ...snap.data(), statementId: chunk[index] } as LoadedLevel) : null,
					);
				});
			}
		}
	}

	/** Reads one more level, when a stamped scope names one the chain did not reach. */
	async loadLevel(id: string): Promise<void> {
		await this.load([{ statementId: '', parentId: id } as ScopeSubject]);
	}

	/** The ids above a loaded statement, nearest first, its top last. */
	idsAbove(subject: ScopeSubject): string[] {
		return this.walk(subject).ids;
	}

	levelOf(id: string): LoadedLevel | undefined {
		return this.levels.get(id) ?? undefined;
	}

	/** The scope of a statement whose ancestors have been loaded. */
	scopeOf(subject: ScopeSubject): string {
		const levels = this.walk(subject)
			.ids.map((id) => this.levels.get(id))
			.filter((level): level is LoadedLevel => Boolean(level));

		return resolveAccessScope(subject, levels);
	}
}

/** Reads the tree above one statement and returns its scope. */
export async function resolveStatementScope(
	firestore: Firestore,
	subject: ScopeSubject,
): Promise<string> {
	const levels = new AccessScopeLevels(firestore);
	await levels.load([subject]);

	return levels.scopeOf(subject);
}

/**
 * The id of the level governing a statement, or null when it is open. Trusts the
 * stamp; a statement not stamped yet is resolved by walking its parents.
 */
export async function governingLevelId(
	firestore: Firestore,
	statement: ScopeSubject & Pick<Statement, 'accessScope'>,
): Promise<string | null> {
	const scope = statement.accessScope ?? (await resolveStatementScope(firestore, statement));

	return scope === OPEN_ACCESS_SCOPE ? null : scope;
}
