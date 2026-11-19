import m from 'mithril';
import { t } from '@/lib/i18n';
import { nextLineView } from './ProposalsNext';
import { WriteBox } from './WriteBox';

/** Number of rows of the box a tablemate reads the pen holder's text in (a proposal is at most 280 characters). */
const WATCH_ROWS = 6;

export interface PenClaimAttrs {
	/** The state line: "Who writes first?" (W1) or "Sent" (W4). Empty = none. */
	statusText: string;
	/** The "what is next" line, already in words; null = nothing to say. */
	nextText: string | null;
	busy: boolean;
	/** "I want to write": take the table's one pen. A lost race just shows who holds it. */
	onClaim: () => void;
	/** Writing is closed (the vote opened, or no question to answer): says why and offers no pen. */
	closedText?: string;
	/** "I want to pass": no proposal from me (W1 only). */
	onPass?: () => void;
}

/**
 * W1, the pen is free: one button that works now, a quiet "pass", and the line
 * naming who has not written yet. Props in, vnodes out.
 */
export const PenClaim: m.Component<PenClaimAttrs> = {
	view({ attrs }) {
		return m('.pen', [
			attrs.statusText
				? m('p.pen__status', { 'data-testid': 'pen-status' }, attrs.statusText)
				: null,
			attrs.closedText
				? m('p.pen__closed', { role: 'status', 'data-testid': 'pen-closed' }, attrs.closedText)
				: m(
						'button.btn.btn--primary.pen__claim',
						{
							type: 'button',
							'data-testid': 'pen-claim',
							disabled: attrs.busy,
							'aria-busy': attrs.busy ? 'true' : undefined,
							onclick: attrs.onClaim,
						},
						t('proposals.write.claim'),
					),
			attrs.onPass
				? m(
						'button.btn.btn--text.pen__pass',
						{
							type: 'button',
							'data-testid': 'pen-pass',
							disabled: attrs.busy,
							onclick: attrs.onPass,
						},
						t('proposals.pass'),
					)
				: null,
			nextLineView(attrs.nextText),
		]);
	},
};

export interface PenWatchAttrs {
	/** The pen holder's name. */
	name: string;
	/** What they have typed so far (read only). */
	text: string;
	/** The "what is next" line; null = none. */
	nextText: string | null;
	/** W3 (the whole screen) or the box under my own card (W4). */
	testId: string;
}

/**
 * W3 / W4: the pen holder's text as it is typed, read only, as the screen itself
 * (no pop-up, no picker). "Noa is writing" is the box's own label.
 */
export const PenWatch: m.Component<PenWatchAttrs> = {
	view({ attrs }) {
		return m('.pen.pen--watch', [
			m(WriteBox, {
				label: t('answer.live_one', { name: attrs.name }),
				value: attrs.text,
				onInput: () => undefined,
				readOnly: true,
				state: 'idle',
				rows: WATCH_ROWS,
				testId: attrs.testId,
			}),
			nextLineView(attrs.nextText),
		]);
	},
};
