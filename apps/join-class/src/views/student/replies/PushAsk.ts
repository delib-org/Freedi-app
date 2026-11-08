import m from 'mithril';
import { t } from '@/lib/i18n';
import {
	enableReplyPush,
	pushSupport,
	readPushAnswer,
	shouldAskPush,
	writePushAnswer,
	type PushSupport,
} from '@/lib/classroom/replyPush';

export interface PushAskAttrs {
	mainId: string;
}

interface PushAskState {
	busy: boolean;
	/** The answer given on this screen (hides the question at once). */
	result: PushSupport | 'no' | null;
}

/**
 * The one inline question under the sent proposal (IA 22.7): "Want to know when
 * someone replies to your proposal?" Shown once per lesson on a device that can
 * push; "Not now" is remembered on the device for the lesson. A browser that
 * blocks notifications gets one plain line instead, then nothing.
 */
export const PushAsk: m.ClassComponent<PushAskAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: PushAskState }).self = { busy: false, result: null };
	},

	view(vnode) {
		const self = (vnode.state as { self?: PushAskState }).self as PushAskState;
		const { mainId } = vnode.attrs;
		if (self.result === 'denied') return m('p.push-ask__blocked', t('reply.push_blocked'));
		if (self.result !== null) return null;
		if (!shouldAskPush(pushSupport(), readPushAnswer(mainId))) return null;

		return m('div.push-ask', { 'data-testid': 'push-ask' }, [
			m('p.push-ask__question', t('reply.push_ask')),
			m('div.push-ask__actions', [
				m(
					'button.btn.btn--secondary.btn--small',
					{
						type: 'button',
						'data-testid': 'push-yes',
						disabled: self.busy ? true : undefined,
						onclick: () => {
							self.busy = true;
							void enableReplyPush(mainId).then((result) => {
								self.busy = false;
								self.result = result;
								m.redraw();
							});
						},
					},
					t('reply.push_yes'),
				),
				m(
					'button.btn.btn--tertiary.btn--small',
					{
						type: 'button',
						'data-testid': 'push-no',
						onclick: () => {
							writePushAnswer(mainId, 'no');
							self.result = 'no';
						},
					},
					t('reply.push_no'),
				),
			]),
		]);
	},
};
