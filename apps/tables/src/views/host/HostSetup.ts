import m from 'mithril';
import { TABLE_ASSIGNMENT_TITLE_MAX_LENGTH } from '@freedi/shared-types';
import type { TableAssignment, TableAssignmentTopic } from '@freedi/shared-types';
import { logError } from '@freedi/shared-utils';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { goTo, rewriteAddress } from '@/lib/navigate';
import { safeStorage } from '@/lib/safeStorage';
import { tablesApi } from '@/lib/tableAssignment/client';
import { Autosaver } from '@/logic/autosave';
import type { SaveOutcome } from '@/logic/autosave';
import { clearSetupBackup, readSetupBackup, writeSetupBackup } from '@/logic/setupBackup';
import {
	emptySetupDraft,
	filledTopics,
	openProblem,
	settingsProblem,
	settingsRequest,
	setupDraftFromSession,
	topicInputs,
} from '@/logic/setupDraft';
import type { SetupDraft } from '@/logic/setupDraft';
import type { TopicDraft } from '@/logic/topics';
import { HostGate } from '@/components/HostGate';
import { Shell } from '@/components/Shell';
import { SetupPosition } from '@/views/host/SetupPosition';
import { SetupSummary } from '@/views/host/SetupSummary';
import { SetupTopics } from '@/views/host/SetupTopics';
import { hostHomePath, hostListPath } from '@/paths';

export interface SetupBodyAttrs {
	/** Null on `/host/new`, until the name is first saved. */
	sessionId: string | null;
	session?: TableAssignment;
	topics?: readonly TableAssignmentTopic[];
}

type SaveKind = 'title' | 'settings' | 'topics';

const SAVE_KINDS: readonly SaveKind[] = ['title', 'settings', 'topics'];
const MODES = ['ranked', 'direct'] as const;
const OPERATION = 'tables.host.setup';

function initialDraft(attrs: SetupBodyAttrs): SetupDraft {
	return (
		readSetupBackup(safeStorage, attrs.sessionId) ??
		(attrs.session ? setupDraftFromSession(attrs.session, attrs.topics ?? []) : emptySetupDraft())
	);
}

/** The whole gathering on one page, saved as it is typed. */
export const SetupBody: m.ClosureComponent<SetupBodyAttrs> = ({ attrs: first }) => {
	let sessionId = first.sessionId;
	const hadBackup = readSetupBackup(safeStorage, sessionId) !== null;
	const draft = initialDraft(first);
	let creating: Promise<string> | null = null;
	const open = new Action('tables.host.openRegistration', 'tableAssignment.error.statusRefused');
	let openErrorKey: string | null = null;

	function createSession(title: string): Promise<string> {
		creating ??= tablesApi
			.createSession({ title, mode: draft.mode })
			.then((result) => {
				const id = result.session.tableAssignmentId;

				clearSetupBackup(safeStorage, sessionId);
				sessionId = id;
				rewriteAddress(hostHomePath(id));
				writeSetupBackup(safeStorage, id, draft);
				// Whatever was typed before the name existed goes up now.
				saver.touch('settings');
				saver.touch('topics');

				return id;
			})
			.finally(() => {
				creating = null;
			});

		return creating;
	}

	/** The session's id, creating it the first time; null while it has no name to be created with. */
	async function ensureSession(): Promise<string | null> {
		if (sessionId) return sessionId;
		const title = draft.title.trim();

		return title === '' ? null : createSession(title);
	}

	async function saveTitle(): Promise<SaveOutcome> {
		const title = draft.title.trim();

		if (title === '') return 'blocked';
		const existed = sessionId !== null;
		const id = await ensureSession();

		if (id === null) return 'blocked';
		if (existed) await tablesApi.saveSettings({ sessionId: id, title });

		return 'saved';
	}

	async function saveSettings(): Promise<SaveOutcome> {
		const id = await ensureSession();
		const request = id === null ? null : settingsRequest(id, draft);

		if (request === null) return 'blocked';
		await tablesApi.saveSettings(request);

		return 'saved';
	}

	/** New rows learn their ids from the answer; a row left out lost its id on the server. */
	function adoptTopicIds(sent: readonly TopicDraft[], topicIds: readonly string[]): void {
		const stillKept = new Set(sent);

		for (const topic of draft.topics) {
			if (!stillKept.has(topic)) delete topic.topicId;
		}
		sent.forEach((topic, index) => {
			topic.topicId = topicIds[index];
		});
	}

	async function saveTopics(): Promise<SaveOutcome> {
		const id = await ensureSession();

		if (id === null) return 'blocked';
		const sent = filledTopics(draft);
		const result = await tablesApi.saveTopics({ sessionId: id, topics: topicInputs(draft) });

		adoptTopicIds(sent, result.topicIds);

		return 'saved';
	}

	function afterSaveChange(): void {
		if (saver.state === 'saved' && !saver.hasUnsaved) clearSetupBackup(safeStorage, sessionId);
		m.redraw();
	}

	const saver: Autosaver<SaveKind> = new Autosaver<SaveKind>(
		{ title: saveTitle, settings: saveSettings, topics: saveTopics },
		afterSaveChange,
		(kind, error) => logError(error, { operation: OPERATION, metadata: { kind, sessionId } }),
	);

	function changed(kind: SaveKind): void {
		writeSetupBackup(safeStorage, sessionId, draft);
		openErrorKey = null;
		saver.touch(kind);
	}

	function changeSettings(patch: Partial<SetupDraft>): void {
		Object.assign(draft, patch);
		changed('settings');
	}

	function changeTopics(topics: TopicDraft[]): void {
		draft.topics = topics;
		changed('topics');
	}

	async function openRegistration(): Promise<void> {
		openErrorKey = null;
		const allSaved = await saver.flush();

		if (!allSaved || !sessionId || openProblem(draft) !== null) {
			openErrorKey = 'tableAssignment.autosave.failed';
			m.redraw();

			return;
		}
		const id = sessionId;
		const opened = await open.run(
			() => tablesApi.setStatus({ sessionId: id, status: 'registrationOpen' }),
			{
				sessionId: id,
			},
		);

		if (opened) {
			clearSetupBackup(safeStorage, id);
			goTo(hostHomePath(id));
		}
	}

	function warnIfUnsaved(event: BeforeUnloadEvent): void {
		if (saver.hasUnsaved) event.preventDefault();
	}

	function flushWhenHidden(): void {
		if (document.visibilityState === 'hidden') void saver.flush();
	}

	function saveMark(): m.Vnode {
		const { state } = saver;
		const problem = settingsProblem(draft) ?? (draft.title.trim() === '' ? 'name' : null);

		if (state === 'failed') {
			return m('p.autosave.autosave--failed', { role: 'alert' }, [
				t('tableAssignment.autosave.failed'),
				' ',
				m(
					'button.autosave__retry',
					{ type: 'button', onclick: () => saver.retry() },
					t('tableAssignment.retry'),
				),
			]);
		}
		if (state === 'blocked' && problem) {
			return m(
				'p.autosave.autosave--blocked',
				{ role: 'status' },
				t(`tableAssignment.setup.problem.${problem}`),
			);
		}
		if (state === 'saving') {
			return m('p.autosave', { role: 'status' }, t('tableAssignment.saving'));
		}

		return m('p.autosave.autosave--saved', { role: 'status' }, [
			state === 'saved' ? m('span.autosave__tick', { 'aria-hidden': 'true' }) : null,
			state === 'saved' ? t('tableAssignment.autosave.saved') : '',
		]);
	}

	function modeCard(mode: (typeof MODES)[number]): m.Vnode {
		return m(
			'button.setup__mode',
			{
				key: mode,
				type: 'button',
				'aria-pressed': String(draft.mode === mode),
				onclick: () => changeSettings({ mode }),
			},
			[
				m('span.setup__mode-title', t(`tableAssignment.mode.${mode}`)),
				m('span.setup__mode-text', t(`tableAssignment.mode.${mode}.hint`)),
			],
		);
	}

	function returnByName(): m.Vnode {
		return m('section.setup__card', [
			m('h2.setup__heading', t('tableAssignment.setup.return.title')),
			m('label.setup__check', [
				m('input', {
					type: 'checkbox',
					checked: draft.allowReturn,
					onchange: (event: Event) =>
						changeSettings({ allowReturn: (event.target as HTMLInputElement).checked }),
				}),
				t('tableAssignment.returnByName'),
			]),
			m('p.setup__text', t('tableAssignment.setup.return.body')),
			m('p.setup__warning', t('tableAssignment.setup.return.warning')),
		]);
	}

	return {
		oninit() {
			if (hadBackup) SAVE_KINDS.forEach((kind) => saver.touch(kind));
		},
		oncreate() {
			window.addEventListener('beforeunload', warnIfUnsaved);
			document.addEventListener('visibilitychange', flushWhenHidden);
		},
		onremove() {
			window.removeEventListener('beforeunload', warnIfUnsaved);
			document.removeEventListener('visibilitychange', flushWhenHidden);
			void saver.flush();
		},
		view() {
			return m('.setup', [
				m('h1.setup__title', t('tableAssignment.setup.title')),
				m('.setup__mark', saveMark()),
				m('.setup__columns', [
					m('.setup__main', [
						m('section.setup__card', [
							m('label.setup__heading', { for: 'setup-name' }, t('tableAssignment.setup.name')),
							m('input.field__input.field__input--large', {
								id: 'setup-name',
								type: 'text',
								dir: 'auto',
								value: draft.title,
								maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
								oninput: (event: Event) => {
									draft.title = (event.target as HTMLInputElement).value;
									changed('title');
								},
							}),
						]),
						m('section.setup__card', [
							m('h2.setup__heading', t('tableAssignment.setup.mode')),
							m('.setup__modes', MODES.map(modeCard)),
						]),
						m(SetupTopics, { topics: draft.topics, onChange: changeTopics }),
						draft.mode === 'ranked' ? m(SetupPosition, { draft, onChange: changeSettings }) : null,
						returnByName(),
					]),
					m(SetupSummary, {
						draft,
						opening: open.busy,
						errorKey: open.errorKey ?? openErrorKey,
						onChange: changeSettings,
						onOpen: () => void openRegistration(),
					}),
				]),
			]);
		},
	};
};

/** `/host/new`: Setup before anything exists. */
export const HostNew: m.Component = {
	view() {
		const backHref = hostListPath();
		const backLabel = t('tableAssignment.back.toList');

		return m(HostGate, {
			title: t('tableAssignment.setup.title'),
			backHref,
			wide: true,
			render: () =>
				m(Shell, { backHref, backLabel, wide: true }, m(SetupBody, { sessionId: null })),
		});
	},
};
