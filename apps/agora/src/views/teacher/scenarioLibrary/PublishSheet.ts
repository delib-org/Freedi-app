import m from 'mithril';
import {
	AGORA_LIBRARY,
	AgoraLibraryTag,
	AgoraLibraryTagKind,
	AgoraTopicPackage,
	AgoraTopicStatus,
	publishProblems,
	type PublishProblem,
} from '@freedi/shared-types';
import { Icon } from '../../../components/Icon';
import { t } from '../../../lib/i18n';
import { generateCover, publishScenario } from '../../../lib/scenarioLibrary/api';
import { uploadCover } from '../../../lib/scenarioLibrary/cover';
import { coverProblem, type CoverProblem } from '../../../lib/scenarioLibrary/coverRules';
import { CoverDrop } from './CoverDrop';
import { TagPicker } from './TagPicker';

export interface PublishSheetAttrs {
	/** The scenario being published (or whose listing is being edited) */
	pkg: AgoraTopicPackage;
	tags: readonly AgoraLibraryTag[];
	lang: string;
	onClose: () => void;
	onPublished: (scenarioId: string) => void;
	onCreateTag: (kind: AgoraLibraryTagKind, label: string) => Promise<string | null>;
}

const SHEET_ID = 'scn-publish';
const PHONE_QUERY = '(max-width: 600px)';
const EXIT_MS = 300;
const COUNT_FROM = 60;

/** The first lines of the framing text: a starting point for the summary, never published unread */
function suggestedSummary(pkg: AgoraTopicPackage): string {
	const text = pkg.framingText.replace(/\s+/g, ' ').trim();
	if (text.length <= AGORA_LIBRARY.SUMMARY_MAX) return text;
	const cut = text.slice(0, AGORA_LIBRARY.SUMMARY_MAX - 1);
	const space = cut.lastIndexOf(' ');

	return `${cut.slice(0, space > 120 ? space : cut.length)}…`;
}

/**
 * Publish a scenario to the library: a picture, a short summary, the subjects
 * and lesson types it belongs to, and nothing else. A full-screen sheet on a
 * phone, a centred dialog on a laptop (the same shell as the question sheet).
 * The button is never silently dead: pressing it with something missing names
 * the missing thing under the field.
 */
export function PublishSheet(): m.Component<PublishSheetAttrs> {
	let closeNow: (() => void) | null = null;
	let summary = '';
	let subjectIds: string[] = [];
	let lessonTypeIds: string[] = [];
	let coverUrl: string | null = null;
	let preview: string | null = null;
	let progress: number | null = null;
	let problem: CoverProblem | 'failed' | null = null;
	let aiWorking = false;
	let aiMade = false;
	let aiLeft: number | null = null;
	let aiNote: { key: string; error: boolean } | null = null;
	let submitting = false;
	let failed = false;
	let showProblems = false;

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeNow?.();
		}
	}

	function trapTab(event: KeyboardEvent, root: HTMLElement): void {
		if (event.key !== 'Tab') return;
		const focusable = Array.from(
			root.querySelectorAll<HTMLElement>(
				'button:not([disabled]), input:not([disabled]):not(.sr-only), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	async function takeFile(file: File, attrs: PublishSheetAttrs): Promise<void> {
		const bad = coverProblem(file);
		if (bad) {
			problem = bad;

			return;
		}
		problem = null;
		aiNote = null;
		progress = 0;
		preview = URL.createObjectURL(file);
		m.redraw();
		try {
			coverUrl = await uploadCover(attrs.pkg.topicPackageId, file, (percent) => {
				progress = percent;
				m.redraw();
			});
		} catch (error) {
			console.error('[Library] Uploading the cover failed:', error);
			problem = 'failed';
			preview = coverUrl;
		} finally {
			progress = null;
			m.redraw();
		}
	}

	async function makePicture(attrs: PublishSheetAttrs): Promise<void> {
		aiWorking = true;
		aiNote = null;
		problem = null;
		m.redraw();
		try {
			const answer = await generateCover({
				scenarioId: attrs.pkg.topicPackageId,
				summary: summary.trim(),
			});
			coverUrl = answer.coverUrl;
			preview = answer.coverUrl;
			aiLeft = answer.remainingToday;
			aiMade = true;
			aiNote = { key: 'scenlib.cover_ai_done', error: false };
		} catch (error) {
			console.error('[Library] Making the cover failed:', error);
			const code = (error as { code?: string }).code;
			aiNote = {
				key:
					code === 'functions/resource-exhausted'
						? 'scenlib.cover_ai_limit'
						: code === 'functions/invalid-argument'
							? 'scenlib.cover_ai_refused'
							: 'scenlib.cover_ai_failed',
				error: true,
			};
		} finally {
			aiWorking = false;
			m.redraw();
		}
	}

	async function submit(attrs: PublishSheetAttrs, problems: PublishProblem[]): Promise<void> {
		if (problems.length > 0) {
			showProblems = true;

			return;
		}
		if (submitting || progress !== null || aiWorking) return;
		submitting = true;
		failed = false;
		m.redraw();
		try {
			await publishScenario({
				scenarioId: attrs.pkg.topicPackageId,
				summary: summary.trim(),
				subjectIds,
				lessonTypeIds,
				...(coverUrl ? { coverUrl } : {}),
			});
			attrs.onPublished(attrs.pkg.topicPackageId);
		} catch (error) {
			console.error('[Library] Publishing failed:', error);
			failed = true;
		} finally {
			submitting = false;
			m.redraw();
		}
	}

	function problemText(problem: PublishProblem): string {
		switch (problem) {
			case 'not_ready':
				return t('scenlib.problem_not_ready');
			case 'no_language':
				return t('scenlib.problem_no_language');
			case 'summary_short':
				return t('scenlib.problem_summary_short', { n: AGORA_LIBRARY.SUMMARY_MIN });
			case 'summary_long':
				return t('scenlib.problem_summary_long', { n: AGORA_LIBRARY.SUMMARY_MAX });
			case 'subjects_missing':
				return t('scenlib.problem_subjects_missing');
			case 'subjects_many':
				return t('scenlib.problem_subjects_many', { n: AGORA_LIBRARY.SUBJECTS_MAX });
			case 'lesson_types_missing':
				return t('scenlib.problem_lesson_types_missing');
			case 'lesson_types_many':
				return t('scenlib.problem_lesson_types_many', { n: AGORA_LIBRARY.LESSON_TYPES_MAX });
		}
	}

	return {
		oninit({ attrs }) {
			const card = attrs.pkg.library;
			summary = card?.summary ?? suggestedSummary(attrs.pkg);
			subjectIds = [...(card?.subjectIds ?? [])];
			lessonTypeIds = [...(card?.lessonTypeIds ?? [])];
			coverUrl = card?.coverUrl ?? null;
			preview = coverUrl;
		},
		oncreate({ dom, attrs }) {
			closeNow = attrs.onClose;
			document.addEventListener('keydown', onKey);
			document.body.classList.add('is-panel-open');
			const root = dom as HTMLElement;
			root.addEventListener('keydown', (event) => trapTab(event, root));
			root.querySelector<HTMLElement>('.scn-cover__zone')?.focus();
		},
		onupdate({ attrs }) {
			closeNow = attrs.onClose;
		},
		onbeforeremove({ dom }) {
			const sheet = dom.querySelector('.question-sheet__dialog') as HTMLElement | null;
			if (!sheet || typeof sheet.animate !== 'function') return;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			const phone = window.matchMedia(PHONE_QUERY).matches;
			const exit = sheet.animate(
				[
					{ transform: 'none', opacity: 1 },
					{ transform: phone ? 'translateY(24px)' : 'scale(0.98)', opacity: 0 },
				],
				{ duration: EXIT_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
			);

			return exit.finished.then(
				() => undefined,
				() => undefined,
			);
		},
		onremove() {
			document.removeEventListener('keydown', onKey);
			document.body.classList.remove('is-panel-open');
			closeNow = null;
		},

		view({ attrs }) {
			const { pkg, tags, lang, onClose, onCreateTag } = attrs;
			const problems = publishProblems({
				summary,
				subjectIds,
				lessonTypeIds,
				ready: pkg.status === AgoraTopicStatus.ready,
				language: pkg.language,
			});
			const left = AGORA_LIBRARY.SUMMARY_MAX - summary.length;
			const summaryProblems = problems.filter(
				(entry) => entry === 'summary_short' || entry === 'summary_long',
			);
			const editing = pkg.visibility === 'public';

			return m('.question-sheet.scn-publish', [
				m('.question-sheet__scrim', { onclick: onClose }),
				m(
					'.question-sheet__dialog',
					{
						id: SHEET_ID,
						role: 'dialog',
						'aria-modal': 'true',
						'aria-labelledby': `${SHEET_ID}-title`,
					},
					[
						m('header.question-sheet__head', [
							m(
								'button.question-sheet__back',
								{ type: 'button', 'aria-label': t('common.back'), onclick: onClose },
								m(Icon, { name: 'arrow', size: 20 }),
							),
							m(
								'h2.question-sheet__title',
								{ id: `${SHEET_ID}-title` },
								editing ? t('scenlib.pub_title_edit') : t('scenlib.pub_title'),
							),
							m(
								'button.question-sheet__close',
								{ type: 'button', 'aria-label': t('common.close'), onclick: onClose },
								'✕',
							),
						]),

						m('.question-sheet__body.scn-publish__body', [
							m('p.question-sheet__hint', t('scenlib.pub_for', { title: pkg.title })),

							m(CoverDrop, {
								id: `${SHEET_ID}-cover`,
								previewUrl: preview,
								progress,
								problem,
								ai: {
									working: aiWorking,
									made: aiMade,
									left: aiLeft,
									noteKey: aiNote?.key ?? null,
									noteIsError: aiNote?.error ?? false,
									onGenerate: () => void makePicture(attrs),
								},
								onFile: (file: File) => void takeFile(file, attrs),
								onRemove: () => {
									coverUrl = null;
									preview = null;
									problem = null;
									aiNote = null;
								},
							}),

							m('.scn-field', [
								m(
									'label.scn-field__label',
									{ for: `${SHEET_ID}-summary` },
									t('scenlib.summary_label'),
								),
								m('textarea.text-input', {
									id: `${SHEET_ID}-summary`,
									rows: 4,
									value: summary,
									maxlength: AGORA_LIBRARY.SUMMARY_MAX + 40,
									placeholder: t('scenlib.summary_ph'),
									'aria-invalid': showProblems && summaryProblems.length > 0 ? 'true' : undefined,
									'aria-describedby': `${SHEET_ID}-summary-count`,
									oninput: (event: InputEvent) => {
										summary = (event.target as HTMLTextAreaElement).value;
									},
								}),
								m(
									'p.scn-field__hint.scn-field__hint--end',
									{ id: `${SHEET_ID}-summary-count` },
									left <= COUNT_FROM || summary.trim().length < AGORA_LIBRARY.SUMMARY_MIN
										? t('scenlib.summary_count', {
												n: summary.length,
												max: AGORA_LIBRARY.SUMMARY_MAX,
											})
										: '',
								),
							]),

							m(TagPicker, {
								id: `${SHEET_ID}-subjects`,
								kind: 'subject',
								label: t('scenlib.subjects_label', { n: AGORA_LIBRARY.SUBJECTS_MAX }),
								max: AGORA_LIBRARY.SUBJECTS_MAX,
								tags,
								selected: subjectIds,
								lang,
								onChange: (ids: string[]) => {
									subjectIds = ids;
								},
								onCreate: (label: string) => onCreateTag('subject', label),
							}),
							m(TagPicker, {
								id: `${SHEET_ID}-lessons`,
								kind: 'lessonType',
								label: t('scenlib.lesson_types_label', { n: AGORA_LIBRARY.LESSON_TYPES_MAX }),
								max: AGORA_LIBRARY.LESSON_TYPES_MAX,
								tags,
								selected: lessonTypeIds,
								lang,
								onChange: (ids: string[]) => {
									lessonTypeIds = ids;
								},
								onCreate: (label: string) => onCreateTag('lessonType', label),
							}),

							m('p.scn-note', t('scenlib.privacy_note')),

							showProblems && problems.length > 0
								? m(
										'ul.scn-problems',
										{ role: 'alert' },
										problems.map((entry) => m('li', { key: entry }, problemText(entry))),
									)
								: null,
							failed ? m('p.scn-field__error', { role: 'alert' }, t('scenlib.pub_failed')) : null,
						]),

						m('footer.question-sheet__foot', [
							m(
								'button.btn.btn--ghost.question-sheet__cancel',
								{ type: 'button', onclick: onClose },
								t('common.cancel'),
							),
							m(
								'button.btn.btn--primary.question-sheet__continue',
								{
									type: 'button',
									'aria-disabled':
										submitting || progress !== null || aiWorking ? 'true' : undefined,
									onclick: () => void submit(attrs, problems),
								},
								submitting
									? t('scenlib.pub_saving')
									: editing
										? t('scenlib.pub_save')
										: t('scenlib.pub_button'),
							),
						]),
					],
				),
			]);
		},
	};
}
