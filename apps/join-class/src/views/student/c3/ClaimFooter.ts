import m from 'mithril';
import { t } from '@/lib/i18n';

/** The one filled control of the footer: "אני אשאל" at V1/V2, "בחרנו, לדבר" at A. */
export interface ClaimPrimary {
	label: string;
	testId: string;
	disabled: boolean;
	onclick: () => void;
}

export interface ClaimFooterAttrs {
	primary: ClaimPrimary | null;
	/** Show "ויתרתי על התור" above the primary. */
	canPass: boolean;
	busy: boolean;
	/** Changes when the table's step or turn changes: an open confirm closes by itself. */
	resetKey: string;
	onPass: () => void;
}

class ClaimState {
	confirming = false;
	key = '';
}

/**
 * The footer of the volunteer moments and of A (UX 16.D): the primary control,
 * and above it the text button "I'll pass on asking" with ONE inline confirm
 * (it costs the student their turn for the whole lesson). The primary stays
 * enabled while the confirm is open: tapping it cancels the confirm and runs.
 * Props in, vnodes out.
 */
export const ClaimFooter: m.ClassComponent<ClaimFooterAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: ClaimState }).self = new ClaimState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: ClaimState }).self as ClaimState;
		const { primary, canPass, busy, resetKey, onPass } = vnode.attrs;
		if (self.key !== resetKey) {
			self.key = resetKey;
			self.confirming = false;
		}
		const confirming = canPass && self.confirming;

		return m('.claim-footer', [
			canPass
				? confirming
					? m('.claim-footer__confirm', { role: 'group' }, [
							m('p.claim-footer__ask', t('turn.pass_ask_confirm')),
							m(
								'button.btn.btn--text.claim-footer__no',
								{
									type: 'button',
									'data-testid': 'pass-ask-cancel',
									oncreate: (node: m.VnodeDOM) => (node.dom as HTMLButtonElement).focus(),
									onclick: () => {
										self.confirming = false;
									},
								},
								t('common.cancel'),
							),
							m(
								'button.btn.btn--secondary.btn--small.claim-footer__yes',
								{
									type: 'button',
									'data-testid': 'pass-ask-yes',
									disabled: busy,
									onclick: () => {
										self.confirming = false;
										onPass();
									},
								},
								t('turn.pass_ask_yes'),
							),
						])
					: m(
							'button.btn.btn--text.claim-footer__pass',
							{
								type: 'button',
								'data-testid': 'pass-ask',
								disabled: busy,
								onclick: () => {
									self.confirming = true;
								},
							},
							t('turn.pass_ask'),
						)
				: null,
			primary
				? m(
						'button.btn.btn--primary.claim-footer__primary',
						{
							type: 'button',
							'data-testid': primary.testId,
							disabled: primary.disabled,
							onclick: () => {
								self.confirming = false;
								primary.onclick();
							},
						},
						primary.label,
					)
				: null,
		]);
	},
};
