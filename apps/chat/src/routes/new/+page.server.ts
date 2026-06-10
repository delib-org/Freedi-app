/**
 * `/new` — start a new conversation (a root `question`). Auth-gated;
 * draft-preserving redirect to sign-in when anonymous. Creates the root via the
 * admin SDK and redirects to its `/q/[id]` page.
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Visibility } from '@freedi/shared-types';
import { createRootQuestion } from '$lib/server/writeActions';

export const load: PageServerLoad = async ({ locals }) => {
	return { signedIn: Boolean(locals.user) };
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const text = String(form.get('text') ?? '');
		const visibility = String(form.get('visibility') ?? 'public') as Visibility;

		if (!locals.user) {
			throw redirect(303, `/signin?redirectTo=${encodeURIComponent(url.pathname)}`);
		}
		if (!text.trim()) return fail(400, { error: 'Question cannot be empty' });

		let id: string;
		try {
			const root = await createRootQuestion(locals.user, { text, visibility });
			id = root.statementId;
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to create question' });
		}

		throw redirect(303, `/q/${id}`);
	},
};
