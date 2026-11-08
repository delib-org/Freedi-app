import m from 'mithril';
import { AGORA_LIBRARY_COMMUNITY, AgoraReportTargetKind } from '@freedi/shared-types';
import { t } from '../../../lib/i18n';
import { reportItem } from '../../../lib/scenarioLibrary/api';

export interface ReportButtonAttrs {
	kind: AgoraReportTargetKind;
	targetId: string;
}

type State = 'closed' | 'open' | 'sending' | 'done' | 'again' | 'failed' | 'limit';

/**
 * "Report" on a scenario, a review or a post: one press opens a small form
 * (a reason, optional), a second sends it to the system admins. Reporting is
 * not hiding; it puts the thing in the admins' queue. One report per teacher
 * per thing, and the form says so when it is a repeat.
 */
export function ReportButton(): m.Component<ReportButtonAttrs> {
	let state: State = 'closed';
	let reason = '';

	async function send(attrs: ReportButtonAttrs): Promise<void> {
		if (state === 'sending') return;
		state = 'sending';
		m.redraw();
		try {
			const answer = await reportItem({
				targetKind: attrs.kind,
				targetId: attrs.targetId,
				...(reason.trim() ? { reason: reason.trim() } : {}),
			});
			state = answer.existed ? 'again' : 'done';
		} catch (error) {
			console.error('[Library] Reporting failed:', error);
			state =
				(error as { code?: string }).code === 'functions/resource-exhausted' ? 'limit' : 'failed';
		}
		m.redraw();
	}

	return {
		view({ attrs }) {
			const id = `scn-report-${attrs.kind}-${attrs.targetId}`;
			if (state === 'done' || state === 'again') {
				return m(
					'p.scn-note.scn-report__thanks',
					{ role: 'status' },
					t(state === 'done' ? 'scenlib.report_done' : 'scenlib.report_again'),
				);
			}

			return m('.scn-report', [
				m(
					'button.btn.btn--ghost.btn--sm.scn-report__open',
					{
						type: 'button',
						'aria-expanded': state === 'closed' ? 'false' : 'true',
						'aria-controls': id,
						'aria-label': t(`scenlib.report_${attrs.kind}`),
						onclick: () => {
							state = state === 'closed' ? 'open' : 'closed';
						},
					},
					t('scenlib.report'),
				),
				state === 'closed'
					? null
					: m('.scn-report__form', { id }, [
							m('p.scn-report__title', t('scenlib.report_title')),
							m('label.scn-field__label', { for: `${id}-reason` }, t('scenlib.report_label')),
							m('textarea.text-input', {
								id: `${id}-reason`,
								rows: 2,
								value: reason,
								maxlength: AGORA_LIBRARY_COMMUNITY.REPORT_REASON_MAX,
								oninput: (event: InputEvent) => {
									reason = (event.target as HTMLTextAreaElement).value;
								},
							}),
							m('.scn-compose__actions', [
								m(
									'button.btn.btn--secondary.btn--sm',
									{
										type: 'button',
										'aria-disabled': state === 'sending' ? 'true' : undefined,
										onclick: () => void send(attrs),
									},
									state === 'sending' ? t('scenlib.report_sending') : t('scenlib.report_send'),
								),
								m(
									'button.btn.btn--ghost.btn--sm',
									{
										type: 'button',
										onclick: () => {
											state = 'closed';
										},
									},
									t('common.cancel'),
								),
							]),
							state === 'failed'
								? m('p.scn-field__error', { role: 'alert' }, t('scenlib.report_failed'))
								: null,
							state === 'limit'
								? m('p.scn-field__error', { role: 'alert' }, t('scenlib.report_limit'))
								: null,
						]),
			]);
		},
	};
}
