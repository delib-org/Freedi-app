import m from 'mithril';
import type { TableAssignment } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { safeStorage } from '@/lib/safeStorage';
import { forgetRegistration, loadMemory } from '@/logic/localDraft';
import { participantStage } from '@/logic/participantStage';
import type { ParticipantStage } from '@/logic/participantStage';
import { ParticipantFrame } from '@/components/ParticipantFrame';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { Redirect } from '@/components/Redirect';
import { StateBox } from '@/components/StateBox';
import { WaitingTableArt } from '@/components/TableArt';
import { joinIntro, NameForm } from '@/views/participant/ParticipantName';
import { ParticipantWaiting } from '@/views/participant/ParticipantWaiting';
import { participantHomePath, participantScreenPath } from '@/paths';

function stageOf(context: ParticipantContext): ParticipantStage {
	const { session, me, lost } = context;

	return participantStage({
		status: session.status,
		mode: session.mode,
		registered: me !== null,
		hasChosenTable: me?.chosenTableIndex !== undefined,
		lost,
		seated: context.seated,
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

interface GoneCopy {
	titleKey: string;
	bodyKey: string;
}

function cancelledCopy({ status }: TableAssignment): GoneCopy {
	return {
		titleKey: 'tableAssignment.cancelled.title',
		bodyKey:
			status === 'registrationOpen' || status === 'published'
				? 'tableAssignment.cancelled.body'
				: 'tableAssignment.cancelled.bodyClosed',
	};
}

/**
 * With return by full name on, the person may have moved to another device, which
 * this browser cannot tell from the host's removal: the words must be true of both.
 */
function removedCopy({ settings }: TableAssignment): GoneCopy {
	return settings.allowReturnByName
		? {
				titleKey: 'tableAssignment.removed.titleMaybeMoved',
				bodyKey: 'tableAssignment.removed.bodyMaybeMoved',
			}
		: { titleKey: 'tableAssignment.removed.title', bodyKey: 'tableAssignment.removed.body' };
}

/** Registering is possible while it is open, and after publishing for a latecomer. */
function isRegistrationAccepted({ status }: TableAssignment): boolean {
	return status === 'registrationOpen' || status === 'published';
}

function registrationGone(
	context: ParticipantContext,
	{ titleKey, bodyKey }: GoneCopy,
	onRegisterAgain: () => void,
): m.Vnode {
	return m('.screen.screen--airy', [
		m('.screen__center', [
			m('span.screen__context', { dir: 'auto' }, context.session.title),
			m('h1.screen__title.screen__title--hero', t(titleKey)),
			m('p.screen__text', t(bodyKey)),
		]),
		isRegistrationAccepted(context.session)
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
			const registerAgain = (): void => forgetRegistration(id, uid, safeStorage);

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
				case 'checkingSeat':
					return m(StateBox, { kind: 'loading' });
				case 'waiting':
				case 'waitingClosed':
				case 'waitingForSeat':
					return m(ParticipantWaiting, { context });
				case 'cancelled':
					return registrationGone(context, cancelledCopy(session), registerAgain);
				case 'removed':
					return registrationGone(context, removedCopy(session), registerAgain);
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
