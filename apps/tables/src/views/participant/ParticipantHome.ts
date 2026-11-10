import m from 'mithril';
import { t } from '@/lib/i18n';
import { safeStorage } from '@/lib/safeStorage';
import { forgetRegistration, loadMemory } from '@/logic/localDraft';
import { participantStage } from '@/logic/participantStage';
import type { ParticipantStage } from '@/logic/participantStage';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { Redirect } from '@/components/Redirect';
import { WaitingTableArt } from '@/components/TableArt';
import { joinIntro, NameForm } from '@/views/participant/ParticipantName';
import { ParticipantWaiting } from '@/views/participant/ParticipantWaiting';
import { participantHomePath, participantScreenPath } from '@/paths';

function stageOf(context: ParticipantContext): ParticipantStage {
	const { session, me, cancelled } = context;

	return participantStage({
		status: session.status,
		mode: session.mode,
		registered: me !== null,
		hasChosenTable: me?.chosenTableIndex !== undefined,
		cancelled,
	});
}

function notOpen(context: ParticipantContext): m.Vnode {
	return m('.screen', [
		m('.screen__center.screen__center--middle', [
			m(WaitingTableArt),
			m('span.screen__context', { dir: 'auto' }, context.session.title),
			m('h1.screen__title.screen__title--notice', t('tableAssignment.notOpen.title')),
			m('p.screen__text', t('tableAssignment.notOpen.thanks')),
			m('p.screen__text', t('tableAssignment.notOpen.keepOpen')),
		]),
	]);
}

function plainMessage(context: ParticipantContext, messageKey: string): m.Vnode {
	return m('.screen', [
		m('.screen__center.screen__center--middle', [
			m('span.screen__context', { dir: 'auto' }, context.session.title),
			m('h1.screen__title.screen__title--notice', t(messageKey)),
		]),
	]);
}

function cancelled(context: ParticipantContext, onRegisterAgain: () => void): m.Vnode {
	return m('.screen.screen--airy', [
		m('.screen__center', [
			m('span.screen__context', { dir: 'auto' }, context.session.title),
			m('h1.screen__title.screen__title--hero', t('tableAssignment.cancelled.title')),
			m('p.screen__text', t('tableAssignment.cancelled.body')),
		]),
		context.session.status === 'registrationOpen'
			? m(
					'button.btn.btn--primary.btn--cta',
					{ type: 'button', onclick: onRegisterAgain },
					t('tableAssignment.cancelled.again'),
				)
			: null,
	]);
}

/** The assignment link shows the one thing that fits the person's state (IA section 4). */
const HomeBody: m.ClosureComponent<{ context: ParticipantContext }> = () => {
	let registering = false;

	return {
		view({ attrs }) {
			const { context } = attrs;
			const { session, uid } = context;
			const id = session.tableAssignmentId;

			// Move on only once the record is here, so step 2 does not find it missing.
			if (registering && context.me) {
				return m(Redirect, { to: participantScreenPath(id, 'preferences'), push: true });
			}

			switch (stageOf(context)) {
				case 'notOpen':
					return notOpen(context);
				case 'name':
					return m(
						NameForm,
						{
							context,
							initialName: loadMemory(id, uid, safeStorage).lastName,
							onPending: (pending: boolean) => {
								registering = pending;
							},
						},
						joinIntro(context),
					);
				case 'waiting':
				case 'waitingClosed':
					return m(ParticipantWaiting, { context });
				case 'cancelled':
					return cancelled(context, () => forgetRegistration(id, uid, safeStorage));
				case 'myTable':
					return m(Redirect, { to: participantScreenPath(id, 'my-table') });
				case 'closedNotRegistered':
					return plainMessage(context, 'tableAssignment.stage.closedNotRegistered');
				case 'ended':
				default:
					return plainMessage(context, 'tableAssignment.stage.ended');
			}
		},
	};
};

function homeBarLabel(context: ParticipantContext): string | undefined {
	return context.me && stageOf(context).startsWith('waiting') ? context.session.title : undefined;
}

/** `/sessions/:id`: the assignment link. */
export const ParticipantHome: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(ParticipantFrame, {
			sessionId: attrs.id,
			topics: true,
			counter: true,
			barLabel: homeBarLabel,
			largeLogo: (context: ParticipantContext) => stageOf(context) === 'name',
			render: (context: ParticipantContext) => m(HomeBody, { context }),
		});
	},
};

/** The old topic-list links go to the assignment link (IA section 5). */
export const LegacyTopicsRedirect: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(Redirect, { to: participantHomePath(attrs.id) });
	},
};
