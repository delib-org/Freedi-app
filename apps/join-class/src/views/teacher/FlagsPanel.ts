import m from 'mithril';
import '@/styles/teacher-threads.scss';
import { t, getLang } from '@/lib/i18n';
import { classState } from '@/lib/classroom/classState';
import { rosterStudents } from '@/lib/classroom/consoleHelpers';
import { flagCountKey, flagRows, flagsLineKey, unseenFlagCount } from '@/lib/classroom/flagLogic';
import type { FlagRow } from '@/lib/classroom/flagLogic';
import { flagState, markFlagsSeen } from '@/lib/classroom/languageFlags';
import { consoleState } from './consoleState';

/**
 * The teacher's language flags at the top of "מה כתבו" (IA 24.4): one line
 * "n attempts to post hurtful words" while some are unseen, and, opened, one
 * row per student with their real name, table, how many attempts, the last
 * time, what it was and which proposal it answered. The attempted words stay
 * behind "Show the text". "Seen" marks the student's attempts seen. Never on
 * the projector or a phone: it lives only in the console.
 */

let open = false;

function timeOf(at: number): string {
	try {
		return new Date(at).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' });
	} catch {
		return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
}

/** The proposal text a flag points at, cut short; empty when it is not on the board. */
function targetText(targetId: string | undefined): string {
	if (!targetId) return '';
	for (const options of consoleState.options.values()) {
		const found = options.find((o) => o.statementId === targetId);
		if (found)
			return found.statement.length > 60 ? `${found.statement.slice(0, 60)}…` : found.statement;
	}

	return '';
}

function row(r: FlagRow): m.Vnode {
	const shown = flagState.revealed.has(r.uid);
	const target = targetText(r.last.targetId);

	return m('li.flag-row', { key: r.uid, 'data-testid': 'flag-row' }, [
		m('p.flag-row__who', [
			m('strong', r.name),
			r.tableN === null ? null : m('span', t('console.table_n', { n: r.tableN })),
			m('span', t(flagCountKey(r.count), { n: r.count })),
			m('span', timeOf(r.last.createdAt)),
		]),
		m('p.flag-row__what', [
			m('span', t(r.last.kind === 'proposal' ? 'console.proposal_label' : 'console.reply_label')),
			target ? m('span', { dir: 'auto' }, t('console.flag_target', { text: target })) : null,
		]),
		shown
			? m(
					'ul.flag-row__texts',
					r.unseen.map((f) => m('li.flag-row__text', { key: f.flagId, dir: 'auto' }, f.text)),
				)
			: null,
		m('div.flag-row__actions', [
			m(
				'button.btn.btn--tertiary.btn--small',
				{
					type: 'button',
					'aria-expanded': shown ? 'true' : 'false',
					'data-testid': 'flag-show',
					onclick: () => {
						if (shown) flagState.revealed.delete(r.uid);
						else flagState.revealed.add(r.uid);
					},
				},
				t(shown ? 'console.flag_hide_text' : 'console.flag_show'),
			),
			m(
				'button.btn.btn--secondary.btn--small',
				{
					type: 'button',
					'data-testid': 'flag-seen',
					onclick: () => {
						flagState.revealed.delete(r.uid);
						void markFlagsSeen(
							r.unseen.map((f) => f.flagId),
							consoleState.mainId,
							Date.now(),
						).catch(() => undefined);
					},
				},
				t('console.flag_seen'),
			),
		]),
	]);
}

export const FlagsPanel: m.Component = {
	view() {
		const unseen = unseenFlagCount(flagState.flags);
		if (unseen === 0) return null;
		const rows = flagRows(flagState.flags, rosterStudents(classState.roster), classState.tables);

		return m('section.flags', { 'data-testid': 'flags-panel' }, [
			m(
				'button.flags__line',
				{
					type: 'button',
					'aria-expanded': open ? 'true' : 'false',
					'data-testid': 'flags-line',
					onclick: () => {
						open = !open;
					},
				},
				[
					m('span.flags__mark', { 'aria-hidden': 'true' }, '!'),
					m('span', t(flagsLineKey(unseen), { n: unseen })),
					m('span.flags__chevron', { 'aria-hidden': 'true' }, open ? '▾' : '▸'),
				],
			),
			open ? m('ul.flags__rows', rows.map(row)) : null,
		]);
	},
};
