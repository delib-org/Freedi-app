/**
 * `/q/[id]` Question page (§6.2). SSR; public/unlisted indexed-or-noindex;
 * private auth-gated (enforced in `loadConversation`). Each question node is its
 * own addressable route + its own QAPage. Form actions: `sendMessage`,
 * `evaluate` — both work without JS and redirect to sign-in (draft-preserving)
 * when anonymous.
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Visibility, StatementType } from '@freedi/shared-types';
import { loadConversation, getMyEvaluations, getStatement } from '$lib/server/conversation';
import { sendMessage, evaluate } from '$lib/server/writeActions';
import type { ComposerChoice } from '$lib/chat/node';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { root, statements } = await loadConversation(params.id, locals.user);

	const visibility = root.visibility ?? Visibility.public;

	// When the current question is itself a sub-question (its parent isn't the
	// synthetic "top" root), expose the parent so the breadcrumb can link back to
	// the question above instead of jumping all the way to "All questions".
	let parent: { statementId: string; statement: string } | null = null;
	if (root.parentId && root.parentId !== 'top') {
		try {
			const parentStatement = await getStatement(root.parentId);
			if (parentStatement) {
				parent = {
					statementId: parentStatement.statementId,
					statement: parentStatement.statement,
				};
			}
		} catch (e) {
			console.error('[chat] parent load failed:', e instanceof Error ? e.message : e);
		}
	}

	// The signed-in user's own votes, so the face rater can highlight them.
	let myEvaluations: Record<string, number> = {};
	if (locals.user) {
		const scoredIds = statements
			.filter(
				(s) =>
					s.statementType === StatementType.option || s.statementType === StatementType.evidence,
			)
			.map((s) => s.statementId);
		try {
			myEvaluations = await getMyEvaluations(locals.user.uid, scoredIds);
		} catch (e) {
			console.error('[chat] my-evaluations load failed:', e instanceof Error ? e.message : e);
		}
	}

	return {
		root,
		parent,
		statements,
		visibility,
		myEvaluations,
		indexable: visibility === Visibility.public,
		signedIn: Boolean(locals.user),
		currentUid: locals.user?.uid ?? null,
	};
};

function draftRedirect(parentId: string, returnTo: string): never {
	const params = new URLSearchParams({ redirectTo: returnTo, draftParent: parentId });
	throw redirect(303, `/signin?${params.toString()}`);
}

export const actions: Actions = {
	sendMessage: async ({ request, locals, url }) => {
		const form = await request.formData();
		const parentId = String(form.get('parentId') ?? '');
		const kind = String(form.get('kind') ?? 'standard') as ComposerChoice;
		const text = String(form.get('text') ?? '');

		if (!locals.user) draftRedirect(parentId, url.pathname);
		if (!text.trim()) return fail(400, { error: 'Message cannot be empty' });

		try {
			await sendMessage(locals.user, { parentId, kind, text });
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to post' });
		}

		return { success: true };
	},

	evaluate: async ({ request, locals, url }) => {
		const form = await request.formData();
		const statementId = String(form.get('statementId') ?? '');
		const value = Number(form.get('value') ?? 0);

		if (!locals.user) draftRedirect(statementId, url.pathname);

		try {
			await evaluate(locals.user, statementId, value);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to evaluate' });
		}

		return { success: true };
	},
};
