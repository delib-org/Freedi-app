import m from 'mithril';
import { t } from '@/lib/i18n';
import type { DropTarget } from '@/lib/classroom/dragReducer';
import type { AnswerMark, AskMark } from '@/lib/classroom/tableTurnConsole';
import { moveStudent, requestNewName } from './consoleActions';
import { blurChip, keyChip, pressChip, targetName } from './dragController';
import { consoleState } from './consoleState';

/**
 * One student (or a "no device" member) as a chip: a mark that says whether the
 * student chose a side (never which one: Tal 2026-11-05), name, and a menu: "move to another table" (the pointer-free
 * equivalent of dragging) and "ask for a new name". Draggable by pointer and by keyboard.
 */

export interface MemberChipAttrs {
	uid?: string;
	name: string;
	/**
	 * Has this student chosen a side? It says "chose" or "no side yet", never which side.
	 * `undefined` = not asked (before the Side step, no device).
	 */
	chosen?: boolean;
	noDevice?: boolean;
	/** Where the chip sits now: table number, or null = unplaced. */
	from: DropTarget;
	tableNumbers: readonly number[];
	/** Table talk, before the name: ✓ has asked, ? asking now, – passed asking. */
	askMark?: AskMark;
	/** Table talk, after the name: ✓ answered, ● answering now, – passed this question. */
	answerMark?: AnswerMark;
	/** A no-device chip: opens the act-for sheet on this student. */
	onOpen?: () => void;
}

const RENAME_VALUE = 'rename';

/** The student's menu. An ended lesson allows no move (paused does), but still the rename. */
function studentMenu(attrs: MemberChipAttrs, uid: string): m.Vnode {
	const label = t('console.student_menu', { name: attrs.name });
	const moves = !consoleState.ended;

	return m(
		'select.member-chip__select',
		{
			'aria-label': label,
			'data-move-select': uid,
			onchange: (e: Event) => {
				const raw = (e.target as HTMLSelectElement).value;
				consoleState.menuUid = null;
				if (raw === '') return;
				if (raw === RENAME_VALUE) {
					void requestNewName(consoleState.mainId, uid, attrs.name);

					return;
				}
				void moveStudent(consoleState.mainId, uid, raw === 'none' ? null : Number(raw));
			},
			onblur: () => {
				consoleState.menuUid = null;
			},
			oncreate: (vnode: m.VnodeDOM) => (vnode.dom as HTMLSelectElement).focus(),
		},
		[
			m('option', { value: '' }, label),
			moves && attrs.from !== null
				? m('option', { value: 'none' }, `${t('console.move')}: ${targetName(null)}`)
				: null,
			moves
				? attrs.tableNumbers
						.filter((n) => n !== attrs.from)
						.map((n) => m('option', { value: String(n) }, `${t('console.move')}: ${targetName(n)}`))
				: null,
			m('option', { value: RENAME_VALUE }, t('console.rename')),
		],
	);
}

export const MemberChip: m.Component<MemberChipAttrs> = {
	view({ attrs }) {
		const { uid, name, noDevice } = attrs;
		const drag = consoleState.drag;
		const active = uid !== undefined && drag.mode !== 'idle' && 'uid' in drag && drag.uid === uid;
		const askWord: Record<AskMark, string> = {
			'✓': 'console.mark_asked',
			'?': 'console.mark_asking',
			'–': 'console.mark_passed_ask',
			'': '',
		};
		const answerWord: Record<AnswerMark, string> = {
			'✓': 'console.mark_answered',
			'●': 'turn.answering',
			'–': 'console.mark_passed_answer',
			'': '',
		};
		const turnWord = [
			attrs.askMark ? askWord[attrs.askMark] : '',
			attrs.answerMark ? answerWord[attrs.answerMark] : '',
		]
			.filter(Boolean)
			.map((key) => `, ${t(key, { name })}`)
			.join('');
		const noSide = attrs.chosen === false;
		const spoken = noSide ? `${name}, ${t('console.side_none')}` : name;
		const label = (noDevice ? `${name}, ${t('console.no_device')}` : spoken) + turnWord;
		// Once the lesson has ended nobody moves (paused still allows it): no drag, no move menu.
		const ref = uid !== undefined && !consoleState.ended ? { uid, name, from: attrs.from } : null;

		return m('span.member-chip-wrap', { key: uid ?? `nd:${name}` }, [
			m(
				'button.member-chip',
				{
					type: 'button',
					class: [
						noDevice ? 'member-chip--no-device' : '',
						active ? 'member-chip--active' : '',
						attrs.askMark === '?' ? 'member-chip--asking' : '',
						attrs.askMark === '–' ? 'member-chip--passed-ask' : '',
						attrs.answerMark === '●' ? 'member-chip--answering' : '',
					].join(' '),
					title: label,
					'aria-label': label,
					'data-uid': uid,
					disabled: false,
					onclick: attrs.onOpen,
					'aria-pressed': active && drag.mode === 'keyboard' ? 'true' : undefined,
					onpointerdown: ref ? (e: PointerEvent) => pressChip(e, ref) : undefined,
					onkeydown: ref ? (e: KeyboardEvent) => keyChip(e, ref, attrs.tableNumbers) : undefined,
					onblur: ref ? () => blurChip(ref) : undefined,
					oncreate: (vnode: m.VnodeDOM) => {
						if (uid !== undefined && consoleState.focusUid === uid) {
							consoleState.focusUid = null;
							(vnode.dom as HTMLElement).focus();
						}
					},
				},
				[
					m('span.member-chip__mark', { 'aria-hidden': 'true' }, attrs.chosen ? '●' : '○'),
					attrs.askMark
						? m(
								'span.member-chip__turn.member-chip__turn--ask',
								{ 'aria-hidden': 'true' },
								attrs.askMark,
							)
						: null,
					m('span.member-chip__name', name),
					attrs.answerMark
						? m(
								'span.member-chip__turn.member-chip__turn--answer',
								{ 'aria-hidden': 'true' },
								attrs.answerMark,
							)
						: null,
					noDevice ? m('span.member-chip__tag', t('console.no_device')) : null,
					noSide
						? m('span.member-chip__tag.member-chip__tag--no-side', t('console.side_none'))
						: null,
				],
			),
			uid !== undefined
				? m(
						'button.member-chip__menu',
						{
							type: 'button',
							'aria-label': t('console.student_menu', { name }),
							'aria-expanded': consoleState.menuUid === uid ? 'true' : 'false',
							onclick: () => {
								consoleState.menuUid = consoleState.menuUid === uid ? null : uid;
							},
						},
						'▾',
					)
				: null,
			uid !== undefined && consoleState.menuUid === uid ? studentMenu(attrs, uid) : null,
		]);
	},
};
