import m from 'mithril';
import { AgoraSession, Statement, StatementType } from '@freedi/shared-types';
import { Collections } from '@freedi/shared-types';
import { db, collection, query, where, getDocs } from '../lib/firebase';
import { t } from '../lib/i18n';
import { rerateStances } from '../lib/callables';
import { RATE_OPTIONS } from '../components/RateScale';
import { Icon } from '../components/Icon';

export interface ReRateAttrs {
	session: AgoraSession;
	/** Called once the answers are in, so the controller can show the results */
	onDone: () => void;
}

/**
 * The last question of an event that never had camps.
 *
 * A room with two sides is scored on whether anything crossed between them.
 * A room without sides has to be asked directly: having heard everyone, where
 * do you stand on the island now? The difference between this answer and the
 * one they arrived with IS the score.
 *
 * It is asked once, at the end, and it is asked plainly — the same five faces
 * the square uses to rate proposals, over the island's own stances. Nothing
 * here suggests a right answer: moving is not rewarded and holding your ground
 * is not penalised, because a score that paid people to converge would only
 * measure how legible the reward was.
 */
export function ReRate(): m.Component<ReRateAttrs> {
	let stances: Statement[] = [];
	let ratings: Record<string, number> = {};
	let loading = true;
	let submitting = false;
	let error = '';

	async function loadStances(session: AgoraSession): Promise<void> {
		const islandStatementId = session.civic?.islandStatementId;
		if (!islandStatementId) {
			loading = false;
			m.redraw();

			return;
		}

		try {
			const snapshot = await getDocs(
				query(collection(db, Collections.statements), where('parentId', '==', islandStatementId)),
			);
			stances = snapshot.docs
				.map((doc) => doc.data() as Statement)
				.filter((statement) => statement.statementType === StatementType.option)
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		} catch (loadError) {
			console.error('[ReRate] Could not load the island stances:', loadError);
			error = t('rerate.load_failed');
		}
		loading = false;
		m.redraw();
	}

	async function submit(session: AgoraSession, onDone: () => void): Promise<void> {
		submitting = true;
		error = '';
		m.redraw();
		try {
			await rerateStances({ sessionId: session.sessionId, ratings });
			onDone();
		} catch (submitError) {
			console.error('[ReRate] Could not record the closing ratings:', submitError);
			error = t('rerate.submit_failed');
			submitting = false;
		}
		m.redraw();
	}

	return {
		oninit(vnode) {
			void loadStances(vnode.attrs.session);
		},

		view(vnode) {
			const { session, onDone } = vnode.attrs;

			if (loading) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			// Nothing to ask means nothing to hold anyone up for.
			if (!stances.length) {
				return m('.shell', [
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p', t('rerate.nothing_to_rate')),
						m('button.btn.btn--primary', { onclick: onDone }, t('rerate.skip')),
					]),
				]);
			}

			const answered = stances.every((stance) => ratings[stance.statementId] !== undefined);

			return m('.shell.shell--wide', [
				m('.shell__content', [
					m('.card.rerate', [
						m('h1.rerate__title', t('rerate.title')),
						m('p.rerate__lead', t('rerate.lead')),
						m(
							'.rerate__stances',
							stances.map((stance) =>
								m('.rerate__stance', [
									m('p.rerate__stance-text', stance.statement),
									m(
										'.rate-scale',
										{ role: 'radiogroup', 'aria-label': stance.statement },
										RATE_OPTIONS.map((option) => {
											const active = ratings[stance.statementId] === option.value;

											return m(
												`button.rate-scale__option.rate-scale__option--${option.variant}`,
												{
													class: active ? 'rate-scale__option--selected' : undefined,
													role: 'radio',
													'aria-checked': String(active),
													onclick: () => {
														ratings = { ...ratings, [stance.statementId]: option.value };
													},
												},
												[
													m('span.rate-scale__emoji', m(Icon, { name: option.icon, size: 30 })),
													m('span.rate-scale__label', t(option.labelKey)),
												],
											);
										}),
									),
								]),
							),
						),
						error ? m('p.rerate__error', error) : null,
						m(
							'button.btn.btn--primary.btn--full.btn--lg',
							{
								disabled: !answered || submitting,
								onclick: () => void submit(session, onDone),
							},
							submitting ? t('rerate.sending') : t('rerate.submit'),
						),
						m('p.rerate__note', t('rerate.note')),
					]),
				]),
			]);
		},
	};
}
