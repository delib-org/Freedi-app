import m from 'mithril';
import type { Statement } from '@freedi/shared-types';

/**
 * Module state of the replies on a proposal (IA 22), Join's store pattern:
 * plain state + m.redraw. One replies sheet at a time, drawn by the reply host
 * over whatever step is showing (replies never close, so any step may open
 * them). Screens that own an edit box for the student's proposal register an
 * "improve" handler; the author's sheet offers "Improve my proposal" only when
 * one exists and the ballot is not frozen.
 */

export interface ReplyTarget {
	proposal: Statement;
	/** Back from the replies to the sheet they replaced ("כל ההצעות"): no sheet on a sheet. */
	onBack?: () => void;
}

export interface ReplyUiState {
	open: ReplyTarget | null;
	/** Every reply to the student's own proposal (the author listener). */
	toMe: Statement[];
	/** The read mark the unread count is measured from (ms). */
	readAt: number | undefined;
	improve: (() => void) | null;
}

let improveOwner: object | null = null;

export const replyUi: ReplyUiState = {
	open: null,
	toMe: [],
	readAt: undefined,
	improve: null,
};

export function openReplies(target: ReplyTarget): void {
	replyUi.open = target;
	m.redraw();
}

export function closeReplies(): void {
	replyUi.open = null;
	m.redraw();
}

/** Back from the replies: to the sheet they came from, else just closed. */
export function backFromReplies(): void {
	const back = replyUi.open?.onBack;
	replyUi.open = null;
	back?.();
	m.redraw();
}

/**
 * A screen with an edit box for the own proposal says how to open it. Called
 * on every draw (the handler closes over the screen's state); `owner` lets the
 * screen clear only its own handler when it goes away.
 */
export function setImproveHandler(owner: object, handler: () => void): void {
	improveOwner = owner;
	replyUi.improve = handler;
}

export function clearImproveHandler(owner: object): void {
	if (improveOwner !== owner) return;
	improveOwner = null;
	replyUi.improve = null;
}

/** "Improve my proposal": the sheet closes and the screen's edit box opens. */
export function improveFromReplies(): void {
	const improve = replyUi.improve;
	replyUi.open = null;
	improve?.();
	m.redraw();
}

export function resetReplyUi(): void {
	replyUi.open = null;
	replyUi.toMe = [];
	replyUi.readAt = undefined;
	replyUi.improve = null;
}
