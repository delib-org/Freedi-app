import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t, getLang } from '@/lib/i18n';
import {
	requestHubSummary,
	updateStatementSummary,
	SummarizationNotReadyError,
	SummarizationPermissionError,
} from '@/lib/summarize';
import { renderSummaryMarkdown } from '@/lib/summaryMarkdown';

interface SummarySectionAttrs {
	statement: Statement;
	admin: boolean;
}

// Module-level UI state — only one hub summary is on screen at a time.
let generating = false;
let editing = false;
let draft = '';
// The summary the draft was opened against. The hub is multi-facilitator, so
// another admin can regenerate while this textarea is open; comparing against
// the live value is what lets us warn before a save overwrites their run.
let editBase = '';
let saving = false;
let errorKey: string | null = null;

function errorKeyFor(err: unknown): string {
	if (err instanceof SummarizationNotReadyError) return 'mainHub.summary.notReady';
	if (err instanceof SummarizationPermissionError) return 'mainHub.summary.noPermission';

	return 'mainHub.summary.failed';
}

async function generate(statementId: string): Promise<void> {
	if (generating) return;
	generating = true;
	errorKey = null;
	m.redraw();
	try {
		// The function writes summary + summaryGeneratedAt onto the statement
		// doc; the hub's live listener delivers it, so nothing to store here.
		await requestHubSummary(statementId);
	} catch (err) {
		errorKey = errorKeyFor(err);
	} finally {
		generating = false;
		m.redraw();
	}
}

function startEdit(current: string): void {
	draft = current;
	editBase = current;
	editing = true;
	errorKey = null;
}

function cancelEdit(): void {
	if (saving) return;
	editing = false;
	draft = '';
	editBase = '';
	errorKey = null;
}

/** Adopt a summary that landed while the draft was open. */
function adoptLatest(latest: string): void {
	if (saving) return;
	draft = latest;
	editBase = latest;
}

async function saveEdit(statementId: string): Promise<void> {
	const trimmed = draft.trim();
	if (saving || trimmed === '') return;
	saving = true;
	m.redraw();
	try {
		await updateStatementSummary(statementId, trimmed);
		editing = false;
		draft = '';
		editBase = '';
	} catch (err) {
		console.error('[SummarySection] save failed:', err);
		errorKey = 'mainHub.summary.failed';
	} finally {
		saving = false;
		m.redraw();
	}
}

export const SummarySection: m.Component<SummarySectionAttrs> = {
	onremove() {
		generating = false;
		editing = false;
		draft = '';
		editBase = '';
		saving = false;
		errorKey = null;
	},

	view(vnode) {
		const { statement, admin } = vnode.attrs;
		const summary = statement.summary;

		// Participants only ever see the finished summary; the generate/edit
		// controls are facilitator tools.
		if (!summary && !admin) return null;

		const statementId = statement.statementId;
		const generatedAt = statement.summaryGeneratedAt;

		return m('section.main-hub__summary', [
			summary
				? m('.main-hub__summary-card', [
						m('.main-hub__summary-header', [
							m('h2.main-hub__summary-title', t('mainHub.summary.title')),
							m('.main-hub__summary-meta', [
								generatedAt
									? m(
											'span.main-hub__summary-date',
											t('mainHub.summary.generatedAt', {
												// The hub can force its own language, so follow the
												// app locale rather than the browser's.
												date: new Date(generatedAt).toLocaleDateString(getLang()),
											}),
										)
									: null,
								admin && !editing
									? m(
											'button.btn.btn--secondary.btn--small',
											{ onclick: () => startEdit(summary) },
											t('mainHub.summary.edit'),
										)
									: null,
							]),
						]),
						editing
							? m('.main-hub__summary-edit', [
									summary !== editBase
										? m('.main-hub__summary-conflict', { role: 'status' }, [
												m('span', t('mainHub.summary.changedElsewhere')),
												m(
													'button.btn.btn--secondary.btn--small',
													{
														onclick: () => adoptLatest(summary),
														disabled: saving,
													},
													t('mainHub.summary.loadLatest'),
												),
											])
										: null,
									m('textarea.main-hub__summary-textarea', {
										value: draft,
										rows: 14,
										disabled: saving,
										'aria-label': t('mainHub.summary.title'),
										oninput: (e: Event) => {
											draft = (e.target as HTMLTextAreaElement).value;
										},
									}),
									m('.main-hub__summary-actions', [
										m(
											'button.btn.btn--secondary.btn--small',
											{ onclick: cancelEdit, disabled: saving },
											t('mainHub.summary.cancel'),
										),
										m(
											'button.btn.btn--primary.btn--small',
											{
												onclick: () => saveEdit(statementId),
												disabled: saving || draft.trim() === '',
												'aria-busy': saving ? 'true' : undefined,
											},
											saving ? t('mainHub.summary.saving') : t('mainHub.summary.save'),
										),
									]),
								])
							: m('.main-hub__summary-body', renderSummaryMarkdown(summary)),
					])
				: null,
			admin && !editing
				? m(
						'.main-hub__summary-controls',
						m(
							'button.btn.btn--primary.btn--small',
							{
								onclick: () => generate(statementId),
								disabled: generating,
								'aria-busy': generating ? 'true' : undefined,
							},
							generating
								? t('mainHub.summary.busy')
								: t(summary ? 'mainHub.summary.regenerate' : 'mainHub.summary.generate'),
						),
					)
				: null,
			// Section level, not inside the controls: a save that fails while the
			// textarea is open must still be visible to the facilitator.
			errorKey ? m('.main-hub__summary-error', { role: 'alert' }, t(errorKey)) : null,
		]);
	},
};
