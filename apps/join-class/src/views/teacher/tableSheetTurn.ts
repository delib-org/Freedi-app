import m from 'mithril';
import {
	choosing,
	notAskedUids,
	proposalsTurnOf,
	tableDone,
	type ClassTable,
	type ClassTableAction,
} from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { hasAnswered } from '@/lib/classroom/tableTalkState';
import {
	QUICK_KEYS,
	anotherTurnFor,
	minuteRunning,
	quickActionFor,
	type QuickKind,
	type TableMode,
} from '@/lib/classroom/tableTurnConsole';
import { tableAction } from './consoleActions';
import { consoleState, isBusy } from './consoleState';
import { proposalsDoneNow, quickActionName } from './TableCard';

/**
 * The teacher's per-member turn fallbacks and the step verbs of the table sheet
 * (UX 16.L rev 3). All verbs are infinitives. At Table talk:
 *   Pick   per member who has not asked: "לוותר על התור בשם …" (one inline confirm)
 *   Talk   per member who has not answered: "לענות עכשיו", "לוותר בשם …";
 *          on the one answering: "לסיים את הדקה"; a no-device member: "לענות עכשיו" only
 */

/** The member whose "pass asking for them" is waiting for its one confirm. */
let confirmingUid: string | null = null;

interface TurnButton {
	label: string;
	testId: string;
	action: ClassTableAction;
}

function plain(table: ClassTable, button: TurnButton): m.Vnode {
	return m(
		'button.btn.btn--tertiary.table-sheet__turn',
		{
			type: 'button',
			'data-testid': button.testId,
			'aria-label': button.label,
			disabled: consoleState.held || isBusy(`table:${table.tableId}:${button.action.action}`),
			onclick: () => void tableAction(table.tableId, button.action),
		},
		button.label,
	);
}

/** "Pass asking for {{name}}" with its one inline confirm: it is irreversible for the student. */
function passAskingFor(table: ClassTable, uid: string, name: string): m.Vnode {
	if (confirmingUid !== uid) {
		return m(
			'button.btn.btn--tertiary.table-sheet__turn',
			{
				type: 'button',
				'data-testid': 'sheet-pass-ask',
				'aria-label': t('console.pass_ask_for', { name }),
				disabled: consoleState.held,
				onclick: () => {
					confirmingUid = uid;
				},
			},
			t('console.pass_ask_for', { name }),
		);
	}

	return m('span.table-sheet__confirm', { role: 'group' }, [
		m('span', t('console.pass_ask_confirm', { name })),
		m(
			'button.btn.btn--text',
			{
				type: 'button',
				'data-testid': 'sheet-pass-ask-cancel',
				onclick: () => {
					confirmingUid = null;
				},
			},
			t('common.cancel'),
		),
		m(
			'button.btn.btn--secondary.btn--small',
			{
				type: 'button',
				'data-testid': 'sheet-pass-ask-yes',
				disabled: consoleState.held || isBusy(`table:${table.tableId}:passAsking`),
				onclick: () => {
					confirmingUid = null;
					void tableAction(table.tableId, { action: 'passAsking', uid });
				},
			},
			t('turn.pass_ask_yes'),
		),
	]);
}

/** A question is on the table and not everyone has answered: a turn is running. */
function turnRunning(table: ClassTable, now: number): boolean {
	return (
		table.step === 'talk' && !!table.questionId && !choosing(table, now) && !tableDone(table, now)
	);
}

/** The turn buttons of one member row at Table talk (empty at Proposals and the plenum). */
export function turnButtons(
	table: ClassTable,
	uid: string,
	name: string,
	mode: TableMode,
	now: number,
): m.Children {
	if (mode !== 'tableTalk') return null;
	if (turnRunning(table, now)) {
		if (minuteRunning(table, now) && table.speakerUid === uid) {
			return plain(table, {
				label: t('console.finish_minute'),
				testId: 'sheet-finish',
				action: { action: 'finishSpeaking' },
			});
		}
		if (hasAnswered(table, uid, now)) return null;

		return [
			plain(table, {
				label: t('console.speak_now', { name }),
				testId: 'sheet-speak-now',
				action: { action: 'nextSpeaker', uid },
			}),
			plain(table, {
				label: t('turn.pass_for', { name }),
				testId: 'sheet-pass-answer',
				action: { action: 'passSpeaking', uid },
			}),
		];
	}
	if (choosing(table, now) && notAskedUids({ ...table, askerUid: null }).includes(uid)) {
		return passAskingFor(table, uid, name);
	}

	return null;
}

/** A no-device member: "answer now" only (the teacher puts their minute on the phones). */
export function noDeviceButtons(
	table: ClassTable,
	id: string,
	name: string,
	mode: TableMode,
	now: number,
): m.Children {
	if (mode !== 'tableTalk' || !turnRunning(table, now)) return null;
	if (table.speakerUid === id && minuteRunning(table, now)) return null;

	return plain(table, {
		label: t('console.speak_now', { name }),
		testId: 'sheet-speak-now-nd',
		action: { action: 'nextSpeaker', uid: id },
	});
}

/**
 * The sheet's row of step verbs. Table talk has one: "start turn n" (the last
 * resort: it opens the next pick, the asker counts as asked); it is off when
 * nobody is left to ask. Proposals walk talk, write, rate and give "another
 * turn" (IA 25.6); the plenum rates.
 */
export function stepButtons(table: ClassTable, mode: TableMode, now: number): m.Children {
	const kinds: QuickKind[] =
		mode === 'plenum'
			? ['rate']
			: mode === 'tableTalk'
				? ['turn']
				: ['talk', 'write', 'rate', 'anotherTurn'];
	const own = quickActionFor(table, mode, now);
	const another = anotherTurnFor(table, mode, proposalsDoneNow(table, mode));

	return kinds.map((kind) => {
		const quick = kind === 'turn' ? { kind, n: table.turn + 1 } : { kind };
		const sameStep =
			(kind === 'talk' && table.step === 'talk') ||
			(kind === 'write' && table.step === 'write') ||
			(kind === 'rate' && table.step === 'rate');
		const eligible = notAskedUids({
			...table,
			askerUid: table.step === 'pick' ? null : table.askerUid,
		});
		const noTurnLeft = kind === 'turn' && eligible.length === 0;
		// "Another turn" only while the table talks (the server refuses otherwise); it names the turn seen.
		const notTalking = kind === 'anotherTurn' && table.step !== 'talk';
		const name = quickActionName(quick);
		const action: ClassTableAction =
			kind === 'anotherTurn'
				? { action: 'nextProposalsTurn', fromTurn: proposalsTurnOf(table) }
				: { action: name };

		return m(
			'button.btn.btn--secondary',
			{
				type: 'button',
				'data-quick': kind,
				'data-next': own?.kind === kind || another?.kind === kind ? 'true' : undefined,
				disabled:
					consoleState.held ||
					sameStep ||
					noTurnLeft ||
					notTalking ||
					isBusy(`table:${table.tableId}:${name}`),
				onclick: () => void tableAction(table.tableId, action),
			},
			t(QUICK_KEYS[kind], { n: quick.n ?? 0 }),
		);
	});
}
