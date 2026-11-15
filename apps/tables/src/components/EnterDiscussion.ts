import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { CLASS_BASE_URL, classSeatUrl } from '@freedi/table-assignment-client';
import { t } from '@/lib/i18n';
import { tablesApi } from '@/lib/tableAssignment/client';
import { seatLinkFailure } from '@/logic/enterDiscussion';

export interface EnterDiscussionAttrs {
	sessionId: string;
}

type EntryState =
	| { kind: 'loading' }
	| { kind: 'ready'; url: string }
	| { kind: 'hidden' }
	| { kind: 'failed' };

/**
 * "כניסה לדיון": the personal link into the connected Class lesson, made when
 * the button first shows. A refusal (not connected, not registered, ended)
 * leaves nothing on screen; a link that could not be made says to use the
 * class code instead.
 */
export const EnterDiscussion: m.ClosureComponent<EnterDiscussionAttrs> = ({ attrs }) => {
	let state: EntryState = { kind: 'loading' };
	let removed = false;

	async function load(): Promise<void> {
		try {
			const { seatCode } = await tablesApi.seatLink({ sessionId: attrs.sessionId });

			state = { kind: 'ready', url: classSeatUrl(CLASS_BASE_URL, seatCode) };
		} catch (error) {
			const failure = seatLinkFailure(error);

			if (failure === 'failed') {
				logError(error, {
					operation: 'tables.participant.seatLink',
					metadata: { sessionId: attrs.sessionId },
				});
			}
			state = { kind: failure };
		}
		if (!removed) m.redraw();
	}

	return {
		oninit() {
			void load();
		},
		onremove() {
			removed = true;
		},
		view() {
			if (state.kind === 'ready') {
				return m('section.my-table__enter', [
					m('a.btn.btn--primary.btn--cta', { href: state.url }, t('tableAssignment.myTable.enter')),
					m('p.my-table__enter-hint', t('tableAssignment.myTable.enter.hint')),
				]);
			}
			if (state.kind === 'failed') {
				return m(
					'p.notice.my-table__enter-failed',
					{ role: 'status' },
					t('tableAssignment.myTable.enter.failed'),
				);
			}

			return null;
		},
	};
};
