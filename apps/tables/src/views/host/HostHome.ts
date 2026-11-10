import m from 'mithril';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { Redirect } from '@/components/Redirect';
import { LiveBody } from '@/views/host/HostLive';
import { SetupBody } from '@/views/host/HostSetup';
import { hostHomePath, hostScreenPath } from '@/paths';

/** One assignment shows one screen at a time, chosen by its status (IA section 4). */
function stageScreen(context: HostContext): m.Children {
	const { session } = context;
	const id = session.tableAssignmentId;

	switch (session.status) {
		case 'draft':
			return m(SetupBody, { key: id, sessionId: id, session, topics: context.topics });
		case 'registrationOpen':
			return m(LiveBody, { key: id, context });
		case 'registrationClosed':
			return session.mode === 'ranked'
				? m(Redirect, { to: hostScreenPath(id, 'preview') })
				: m(LiveBody, { key: id, context });
		case 'published':
		case 'ended':
		default:
			return m(Redirect, { to: hostScreenPath(id, 'assignment') });
	}
}

/** `/host/sessions/:id`: the assignment, by status. */
export const HostHome: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.session',
			topics: true,
			participants: true,
			isHome: true,
			shellFor: (session) => ({
				title: undefined,
				wide: session.status === 'draft',
				barLabel: session.status === 'draft' ? undefined : session.title,
			}),
			render: stageScreen,
		});
	},
};

/** Old links to the retired topics and settings screens land on the stage screen. */
export const LegacyHostRedirect: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(Redirect, { to: hostHomePath(attrs.id) });
	},
};
