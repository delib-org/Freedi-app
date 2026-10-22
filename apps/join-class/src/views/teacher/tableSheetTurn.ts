import m from 'mithril';
import { notAskedUids, type ClassTable, type ClassTableAction } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { claimMoment } from '@/lib/classroom/turnMoment';
import {
	QUICK_KEYS,
	quickActionFor,
	type QuickKind,
	type TableMode,
} from '@/lib/classroom/tableTurnConsole';
import { tableAction } from './consoleActions';
import { consoleState, isBusy } from './consoleState';
import { quickActionName } from './TableCard';

/**
 * The teacher's per-member turn fallbacks and the step verbs of the table sheet
 * (UX 16.E, 16.F). All verbs are infinitives. At Table talk:
 *   V1 / A   per not-yet member: "להעביר את התור ל…" and "לוותר על התור בשם …" (one inline confirm)
 *   B / C    per member: "לדבר עכשיו"; on the speaker: "לוותר בשם …" while the minute runs
 *   V2       per not-yet member: "לוותר על התור בשם …"
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

/** The turn buttons of one member row at Table talk (empty at Proposals and the plenum). */
export function turnButtons(
	table: ClassTable,
	uid: string,
	name: string,
	mode: TableMode,
	now: number,
): m.Children {
	if (mode !== 'tableTalk') return null;
	const { phase } = claimMoment(table, uid, now);
	const notYet = notAskedUids(table).includes(uid);
	const out: m.Children[] = [];
	if (phase === 'v1' || phase === 'a') {
		if (notYet) {
			out.push(
				plain(table, {
					label: t('console.pass_asker', { name }),
					testId: 'sheet-pass-asker',
					action: { action: 'passAsker', uid },
				}),
				passAskingFor(table, uid, name),
			);
		}
	} else if (phase === 'v2') {
		if (notYet) out.push(passAskingFor(table, uid, name));
	} else if (phase === 'talk') {
		out.push(
			plain(table, {
				label: t('console.speak_now', { name }),
				testId: 'sheet-speak-now',
				action: { action: 'nextSpeaker', uid },
			}),
		);
		const running = table.speakerEndsAt !== undefined && table.speakerEndsAt > now;
		if (table.speakerUid === uid && running) {
			out.push(
				plain(table, {
					label: t('turn.pass_for', { name }),
					testId: 'sheet-pass-speak',
					action: { action: 'passSpeaking' },
				}),
			);
		}
	}

	return out;
}

/** The sheet's whole row of step verbs; the one that matches the table's step is disabled. */
export function stepButtons(table: ClassTable, mode: TableMode, now: number): m.Children {
	const kinds: QuickKind[] =
		mode === 'plenum'
			? ['rate']
			: mode === 'tableTalk'
				? ['talk', 'turn']
				: ['talk', 'write', 'rate'];
	const own = quickActionFor(table, mode, now);
	const phase = claimMoment(table, '', now).phase;

	return kinds.map((kind) => {
		const quick = kind === 'turn' ? { kind, n: table.turn + 1 } : { kind };
		const sameStep =
			(kind === 'talk' && table.step === 'talk') ||
			(kind === 'write' && table.step === 'write') ||
			(kind === 'rate' && table.step === 'rate');
		const noTurnLeft = kind === 'turn' && notAskedUids(table).length === 0 && phase !== 'a';
		const name = quickActionName(quick);

		return m(
			'button.btn.btn--secondary',
			{
				type: 'button',
				'data-quick': kind,
				'data-next': own?.kind === kind ? 'true' : undefined,
				disabled:
					consoleState.held || sameStep || noTurnLeft || isBusy(`table:${table.tableId}:${name}`),
				onclick: () => void tableAction(table.tableId, { action: name }),
			},
			t(QUICK_KEYS[kind], { n: quick.n ?? 0 }),
		);
	});
}
