import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import {
	requestHubSummary,
	updateStatementSummary,
	SummarizationNotReadyError,
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
let saving = false;
let errorKey: string | null = null;

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
		errorKey =
			err instanceof SummarizationNotReadyError ? 'mainHub.summary.notReady' : 'mainHub.summary.failed';
	} finally {
		generating = false;
		m.redraw();
	}
}

function startEdit(current: string): void {
	draft = current;
	editing = true;
	errorKey = null;
}

function cancelEdit(): void {
	if (saving) return;
	editing = false;
	draft = '';
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
												date: new Date(generatedAt).toLocaleDateString(),
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
				? m('.main-hub__summary-controls', [
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
						errorKey ? m('.main-hub__summary-error', { role: 'alert' }, t(errorKey)) : null,
					])
				: null,
		]);
	},
};
