/**
 * `/q/[id]` Question page (§6.2). SSR; public/unlisted indexed-or-noindex;
 * private auth-gated (enforced in `loadConversation`). Each question node is its
 * own addressable route + its own QAPage. Form actions: `sendMessage`,
 * `evaluate` — both work without JS and redirect to sign-in (draft-preserving)
 * when anonymous.
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Visibility } from '@freedi/shared-types';
import { loadConversation } from '$lib/server/conversation';
import { sendMessage, evaluate } from '$lib/server/writeActions';
import type { ComposerChoice } from '$lib/chat/node';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { root, statements } = await loadConversation(params.id, locals.user);

	const visibility = root.visibility ?? Visibility.public;

	return {
		root,
		statements,
		visibility,
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
