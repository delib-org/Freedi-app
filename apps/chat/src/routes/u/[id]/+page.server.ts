/**
 * `/u/[id]` Profile (§6.3, public SSR). Satisfies `author.url`; lists the
 * creator's public questions and options. Resilient to Firestore being down.
 */
import type { PageServerLoad } from './$types';
import { Collections, StatementType, Visibility } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { adminDb } from '$lib/server/firebaseAdmin';

export const load: PageServerLoad = async ({ params }) => {
	let statements: Statement[] = [];
	let displayName = 'Member';

	try {
		const snap = await adminDb
			.collection(Collections.statements)
			.where('creatorId', '==', params.id)
			.where('visibility', '==', Visibility.public)
			.limit(50)
			.get();
		statements = snap.docs.map((d) => d.data() as Statement);
		displayName = statements[0]?.creator?.displayName ?? 'Member';
	} catch (e) {
		console.error('[chat] profile load failed:', e instanceof Error ? e.message : e);
	}

	return {
		userId: params.id,
		displayName,
		questions: statements
			.filter((s) => s.statementType === StatementType.question && s.isRoot)
			.map((s) => ({ id: s.statementId, title: s.statement, optionCount: s.optionCount ?? 0 })),
		options: statements
			.filter((s) => s.statementType === StatementType.option)
			.map((s) => ({ id: s.statementId, title: s.statement, c: s.corroborationScore ?? 0 })),
	};
};
