import type { Firestore } from 'firebase-admin/firestore';
import {
	AccessScopeLevel,
	Collections,
	resolveAccessScope,
	type Statement,
} from '@freedi/shared-types';
import { ancestorIds } from '../utils/statementAncestors';

/** Firestore's getAll takes any number, but one request should stay small. */
const GET_ALL_CHUNK = 300;

/** Only what deciding a scope needs: a stamping pass reads every ancestor. */
const LEVEL_FIELDS = ['statementId', 'parentId', 'membership', 'statementSettings'];

export type ScopeSubject = Pick<
	Statement,
	'statementId' | 'parentId' | 'parents' | 'topParentId' | 'membership' | 'statementSettings'
>;

/**
 * The access settings of the levels above a set of statements, read once. A
 * stamping pass over many statements shares a few ancestors, so a statement
 * costs no reads once its tree has been seen.
 */
export class AccessScopeLevels {
	private readonly levels = new Map<string, AccessScopeLevel | null>();

	constructor(private readonly firestore: Firestore) {}

	/** How many ancestor documents this pass has read. */
	get readCount(): number {
		return this.levels.size;
	}

	async load(subjects: readonly ScopeSubject[]): Promise<void> {
		const wanted = new Set<string>();
		for (const subject of subjects) {
			for (const id of ancestorIds(subject)) {
				if (!this.levels.has(id)) wanted.add(id);
			}
		}
		const ids = [...wanted];
		const statements = this.firestore.collection(Collections.statements);
		for (let start = 0; start < ids.length; start += GET_ALL_CHUNK) {
			const chunk = ids.slice(start, start + GET_ALL_CHUNK);
			const snaps = await this.firestore.getAll(...chunk.map((id) => statements.doc(id)), {
				fieldMask: LEVEL_FIELDS,
			});
			snaps.forEach((snap, index) => {
				this.levels.set(
					chunk[index],
					snap.exists ? ({ ...snap.data(), statementId: chunk[index] } as AccessScopeLevel) : null,
				);
			});
		}
	}

	/** The scope of a statement whose ancestors have been loaded. */
	scopeOf(subject: ScopeSubject): string {
		const levels = ancestorIds(subject)
			.map((id) => this.levels.get(id))
			.filter((level): level is AccessScopeLevel => Boolean(level));

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
