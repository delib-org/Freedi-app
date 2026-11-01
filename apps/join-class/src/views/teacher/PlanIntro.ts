import m from 'mithril';
import '@/styles/teacher-intro.scss';
import { t } from '@/lib/i18n';
import { INTRO_VIDEOS_MAX } from '@/lib/classroom/introVideos';
import { fieldValue, getFieldError, getMainId } from './planController';
import { IntroEditor } from './IntroEditor';
import {
	VIDEO_TITLE_MAX,
	VIDEO_URL_MAX,
	addVideoRow,
	canAddVideo,
	commitVideoTitle,
	commitVideoUrl,
	getIntroAnnouncement,
	introReorder,
	isUrlInvalid,
	moveVideo,
	onVideoInput,
	openIntro,
	removeVideo,
	savedVideoIds,
	takeIntroFocus,
	teardownIntro,
	titleKey,
	urlKey,
	videoRows,
	type VideoRow,
} from './planIntroController';

/** The plan screen's "הקדמה" section (UX 14.B): the text, then the videos.
 *  Sits between "השאלה לפתרון" and "השאלות לשולחנות". */

const URL_PLACEHOLDER = 'https://…';

function fieldError(key: string): m.Vnode | null {
	const retry = getFieldError(key);
	if (!retry) return null;

	return m('.plan-card__error', { role: 'alert' }, [
		m('span', t('plan.error.save')),
		m(
			'button.btn.btn--tertiary.btn--small',
			{ type: 'button', onclick: retry },
			t('plan.error.retry'),
		),
	]);
}

function focusHandleAfterMove(id: string): void {
	m.redraw.sync();
	window.requestAnimationFrame(() => {
		document.querySelector<HTMLElement>(`[data-handle-id="${id}"]`)?.focus();
	});
}

function nameOf(row: VideoRow, position: number): string {
	const title = fieldValue(titleKey(row.id), row.saved?.title ?? '').trim();

	return title !== '' ? title : t('opening.video_n', { n: position });
}

function handle(row: VideoRow, position: number, ids: string[]): m.Vnode {
	if (!row.saved) {
		return m('span.plan-card__handle.plan-card__handle--idle', { 'aria-hidden': 'true' }, '⋮⋮');
	}
	const drag = introReorder.cardAttrs(row.id, ids);

	return m(
		'span.plan-card__handle',
		{
			role: 'button',
			tabindex: '0',
			'data-handle-id': row.id,
			title: t('plan.reorder.title'),
			'aria-label': t('plan.reorder.aria', {
				name: nameOf(row, position),
				n: position,
				total: ids.length,
			}),
			draggable: drag.draggable,
			ondragstart: (e: DragEvent) => {
				drag.ondragstart?.(e);
				const card = (e.target as HTMLElement).closest('.plan-card');
				if (card && e.dataTransfer) e.dataTransfer.setDragImage(card, 24, 24);
			},
			ondragend: drag.ondragend,
			onkeydown: (e: KeyboardEvent) => {
				if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
				e.preventDefault();
				moveVideo(row.id, e.key === 'ArrowUp' ? -1 : 1, (n, total) =>
					t('plan.intro.video.moved', { n, total }),
				);
				focusHandleAfterMove(row.id);
			},
		},
		m('span.plan-card__handle-dots', { 'aria-hidden': 'true' }, '⋮⋮'),
	);
}

function videoCard(row: VideoRow, index: number, ids: string[]): m.Vnode {
	const position = index + 1;
	const uKey = urlKey(row.id);
	const tKey = titleKey(row.id);
	const invalid = isUrlInvalid(row.id);
	const drag = row.saved ? introReorder.cardAttrs(row.id, ids) : {};
	const classes = [
		'plan-card',
		'intro-video',
		introReorder.isDragging(row.id) ? 'plan-card--dragging' : '',
		introReorder.isDropTarget(row.id) ? 'plan-card--drop-target' : '',
	]
		.filter(Boolean)
		.join(' ');

	return m(
		'li',
		{
			key: row.id,
			class: classes,
			ondragover: drag.ondragover,
			ondragleave: drag.ondragleave,
			ondrop: drag.ondrop,
		},
		[
			handle(row, position, ids),
			m('.plan-card__main', [
				m('.intro-video__row', [
					m('span.intro-video__n', { 'aria-hidden': 'true' }, position),
					m('input.plan-card__text.intro-video__url', {
						type: 'url',
						inputmode: 'url',
						dir: 'ltr',
						autocomplete: 'off',
						spellcheck: false,
						maxlength: VIDEO_URL_MAX,
						value: fieldValue(uKey, row.saved?.url ?? ''),
						placeholder: URL_PLACEHOLDER,
						'aria-label': t('plan.intro.video.url_aria', { n: position }),
						'aria-invalid': invalid ? 'true' : undefined,
						'aria-describedby': invalid ? `${uKey}-err` : undefined,
						oncreate: (vn: m.VnodeDOM) => {
							if (takeIntroFocus(uKey)) (vn.dom as HTMLInputElement).focus();
						},
						onupdate: (vn: m.VnodeDOM) => {
							if (takeIntroFocus(uKey)) (vn.dom as HTMLInputElement).focus();
						},
						oninput: (e: Event) =>
							onVideoInput(uKey, row.id, (e.target as HTMLInputElement).value, VIDEO_URL_MAX),
						onblur: () => commitVideoUrl(row.id),
						onkeydown: (e: KeyboardEvent) => {
							if (e.key !== 'Enter' || e.isComposing) return;
							e.preventDefault();
							commitVideoUrl(row.id);
							document.querySelector<HTMLInputElement>(`[data-title-id="${row.id}"]`)?.focus();
						},
					}),
				]),
				invalid
					? m(
							'.plan-card__error',
							{ id: `${uKey}-err`, role: 'alert' },
							t('plan.intro.video.invalid'),
						)
					: null,
				m('input.plan-card__hint.intro-video__title', {
					type: 'text',
					dir: 'auto',
					'data-title-id': row.id,
					maxlength: VIDEO_TITLE_MAX,
					value: fieldValue(tKey, row.saved?.title ?? ''),
					placeholder: t('plan.intro.video.title'),
					'aria-label': t('plan.intro.video.title_aria', { n: position }),
					oninput: (e: Event) =>
						onVideoInput(tKey, row.id, (e.target as HTMLInputElement).value, VIDEO_TITLE_MAX),
					onblur: () => commitVideoTitle(row.id),
					onkeydown: (e: KeyboardEvent) => {
						if (e.key === 'Enter' && !e.isComposing) {
							e.preventDefault();
							(e.target as HTMLInputElement).blur();
						}
					},
				}),
				fieldError(`intro:video:${row.id}`),
			]),
			m(
				'button.btn.btn--tertiary.btn--small.plan-card__delete',
				{
					type: 'button',
					'aria-label': t('plan.intro.video.delete_aria', { name: nameOf(row, position) }),
					onclick: () => removeVideo(row.id),
				},
				t('plan.delete'),
			),
		],
	);
}

function videos(): m.Vnode {
	const rows = videoRows();
	const ids = savedVideoIds();

	return m('.plan-videos', [
		m('h3.plan-videos__title', t('plan.intro.videos')),
		rows.length > 0
			? m(
					'ul.plan__list.plan-videos__list',
					introReorder.listAttrs(),
					rows.map((row, i) => videoCard(row, i, ids)),
				)
			: null,
		canAddVideo()
			? m(
					'button.plan__add',
					{ type: 'button', onclick: addVideoRow },
					m('span.plan__add-label', t('plan.intro.video.add')),
				)
			: m('p.plan__help', t('plan.intro.video.max', { max: INTRO_VIDEOS_MAX })),
		fieldError('intro:order'),
		m('.visually-hidden', { role: 'status', 'aria-live': 'polite' }, getIntroAnnouncement()),
	]);
}

/**
 * `/t/:mid/plan?focus=intro` (the console's "add / edit the introduction" links,
 * UX 15.L): bring the section into view and put the cursor in the text box. When
 * the text box is not there yet, the section heading takes focus instead.
 */
/** The text box is disabled until the lesson's paragraphs have loaded: wait up to ~4 s for it. */
const FOCUS_RETRY_MS = 100;
const FOCUS_RETRIES = 40;

function focusIntroSection(section: HTMLElement): void {
	if (m.route.param('focus') !== 'intro') return;
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	section.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
	let tries = 0;
	const focusWhenReady = (): void => {
		const input = section.querySelector<HTMLTextAreaElement>('.intro-editor__input');
		if (input && !input.disabled) {
			input.focus({ preventScroll: true });

			return;
		}
		tries += 1;
		if (tries < FOCUS_RETRIES && section.isConnected) {
			window.setTimeout(focusWhenReady, FOCUS_RETRY_MS);

			return;
		}
		const heading = section.querySelector<HTMLElement>('#plan-intro-title');
		if (heading) {
			heading.tabIndex = -1;
			heading.focus({ preventScroll: true });
		}
	};
	focusWhenReady();
}

export const PlanIntro: m.Component = {
	oninit() {
		void openIntro(getMainId());
	},

	onremove() {
		teardownIntro();
	},

	view() {
		return m(
			'section.plan__intro',
			{
				'aria-labelledby': 'plan-intro-title',
				oncreate: (vnode: m.VnodeDOM) => focusIntroSection(vnode.dom as HTMLElement),
			},
			[
				m('h2.plan__section-title', { id: 'plan-intro-title' }, t('plan.intro.title')),
				m('p.plan__help', t('plan.intro.help')),
				m(IntroEditor),
				videos(),
			],
		);
	},
};
