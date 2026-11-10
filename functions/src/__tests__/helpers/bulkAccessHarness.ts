/**
 * Shared by the getBulkStatements access suites. Each suite mocks Firestore and
 * makes `verifyAuthToken` return the `x-test-uid` header.
 */
import type { Request, Response } from 'firebase-functions/v1';
import { getBulkStatements } from '../../fn_bulkStatements';
import { seed } from '../../services/__tests__/helpers/fakeFirestore';

export const MEMBER = 'member';
export const OUTSIDER = 'outsider';

export interface PageBody {
	ok: boolean;
	statements?: Array<{ statementId: string }>;
	nextCursor?: string | null;
	error?: string;
}

export interface Result {
	status: number | undefined;
	body: PageBody;
	ids: string[];
}

let treeCounter = 0;

/** A fresh id per tree, because the module-level caches outlive a test. */
export function newId(name: string): string {
	treeCounter++;

	return `${name}-${treeCounter}`;
}

export function statement(id: string, data: Record<string, unknown>): void {
	seed('statements', id, { statementId: id, lastUpdate: 1, ...data });
}

export function role(uid: string, statementId: string, value: string): void {
	seed('statementsSubscribe', `${uid}--${statementId}`, { userId: uid, statementId, role: value });
}

export const withAccess = (access?: string) => (access ? { membership: { access } } : {});

/** top (access given) -> q (access given) -> one answer with no setting of its own. */
export function tree(access: { top?: string; question?: string }): { top: string; q: string } {
	const top = newId('top');
	const q = newId('q');
	statement(top, {
		parentId: 'top',
		parents: ['top'],
		topParentId: top,
		...withAccess(access.top),
	});
	statement(q, {
		parentId: top,
		parents: ['top', top],
		topParentId: top,
		...withAccess(access.question),
	});
	statement(`${q}-answer`, { parentId: q, parents: ['top', top, q], topParentId: top });

	return { top, q };
}

export async function load(
	uid: string,
	rootId: string,
	mode: 'direct' | 'descendants' = 'direct',
	extraQuery: Record<string, string> = {},
): Promise<Result> {
	const result: { status?: number; body?: unknown } = {};
	const res = {
		status(code: number) {
			result.status = code;

			return res;
		},
		type() {
			return res;
		},
		json(body: unknown) {
			result.body = body;

			return res;
		},
		send(body: string) {
			result.body = JSON.parse(body);

			return res;
		},
	};
	await getBulkStatements(
		{
			query: { rootId, mode, ...extraQuery },
			headers: { 'x-test-uid': uid },
		} as unknown as Request,
		res as unknown as Response,
	);
	const body = result.body as PageBody;

	return {
		status: result.status,
		body,
		ids: (body.statements ?? []).map(({ statementId }) => statementId).sort(),
	};
}
