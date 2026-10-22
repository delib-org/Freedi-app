import m from 'mithril';
import { IntroText, blocksFromPlainText } from '@/components/IntroText';
import { t } from '@/lib/i18n';
import { projectorData } from '@/lib/classroom/projectorData';
import {
	type IntroVideo,
	introVideoEmbed,
	introVideoLabel,
	introVideosOf,
	projectorVideoOf,
} from '@/lib/classroom/introVideos';

/**
 * The projector at the Opening step (UX 14.D): the question and the teacher's
 * introduction text by default; when the console picks a video, the video
 * fills the stage, loaded but never playing (the teacher presses the player's
 * own play). Nothing here is interactive and nothing plays by itself.
 */

/** Text sizes tried in order until the stage fits without scrolling (UX 14.D). */
const FIT_STEPS = [48, 40, 32] as const;

let fitStep: number = FIT_STEPS[0];
let resizeBound = false;
const failedIds = new Set<string>();

function overflowing(): boolean {
	return document.documentElement.scrollHeight > window.innerHeight;
}

/** Steps the text 48 -> 40 -> 32 until the page no longer scrolls. Runs after every draw of the text. */
function fitText(vnode: m.VnodeDOM): void {
	const text = (vnode.dom as HTMLElement).querySelector<HTMLElement>('.intro-text--projector');
	if (!text) return;
	let chosen: number = FIT_STEPS[0];
	for (const step of FIT_STEPS) {
		chosen = step;
		text.setAttribute('data-fit', String(step));
		if (!overflowing()) break;
	}
	fitStep = chosen;
	if (!resizeBound) {
		resizeBound = true;
		window.addEventListener('resize', () => m.redraw());
	}
}

function question(): string {
	return projectorData.challenge?.statement ?? projectorData.main?.statement ?? '';
}

function textLayout(failedLabel: string | null): m.Vnode {
	const description = (projectorData.main?.description ?? '').trim();
	// the listener's blocks once they arrive; the plain description until then
	const blocks = projectorData.intro ?? blocksFromPlainText(description);

	return m(
		'section.projector-step.projector-step--opening',
		{ key: 'text', oncreate: fitText, onupdate: fitText },
		[
			failedLabel ? m('p.projector-eyebrow', failedLabel) : null,
			m('p.projector-eyebrow', t('projector.lessonQuestion')),
			m('h1.projector-question', question()),
			m(IntroText, { blocks, size: 'projector', fit: fitStep }),
		],
	);
}

function player(src: string, kind: 'youtube' | 'file', label: string, id: string): m.Vnode {
	if (kind === 'youtube') {
		return m('iframe.intro-stage__player.intro-stage__player--youtube', {
			src,
			title: label,
			allow: 'encrypted-media; picture-in-picture; fullscreen',
			referrerpolicy: 'strict-origin-when-cross-origin',
			allowfullscreen: true,
		});
	}

	return m('video.intro-stage__player.intro-stage__player--file', {
		src,
		controls: true,
		playsinline: true,
		// one small range request buys a visible first frame instead of a black box (the phone keeps "none")
		preload: 'metadata',
		'aria-label': label,
		onerror: () => {
			failedIds.add(id);
			m.redraw();
		},
	});
}

/**
 * Video mode (UX 15.C): the player is the largest box that fits above a 64 px
 * strip, on black. The strip carries the video's label and is where a mouse
 * move still reaches the page (the iframe swallows pointer events).
 */
function videoLayout(id: string, label: string, src: string, kind: 'youtube' | 'file'): m.Vnode {
	return m('section.projector-step.projector-step--opening.intro-stage', { key: id }, [
		m('.intro-stage__screen', player(src, kind, label, id)),
		m('.intro-stage__strip', m('h1.intro-stage__title', label)),
	]);
}

interface ActiveVideo {
	id: string;
	label: string;
	src: string;
	kind: 'youtube' | 'file';
}

function labelOf(chosen: IntroVideo): string {
	const position = introVideosOf(projectorData.main).findIndex((v) => v.id === chosen.id) + 1;

	return introVideoLabel(chosen, position);
}

/** The video the console chose, when it can be shown; null for the text layout. */
function activeVideo(): ActiveVideo | null {
	const chosen = projectorVideoOf(projectorData.main);
	if (!chosen || failedIds.has(chosen.id)) return null;
	const embed = introVideoEmbed(chosen.url);
	if (!embed) return null;

	return { id: chosen.id, label: labelOf(chosen), src: embed.src, kind: embed.kind };
}

/** True while the projector shows a video: no band, no question line (UX 15.C). */
export function openingVideoActive(): boolean {
	return activeVideo() !== null;
}

export function openingStage(): m.Vnode {
	const video = activeVideo();
	if (video) return videoLayout(video.id, video.label, video.src, video.kind);
	const chosen = projectorVideoOf(projectorData.main);
	if (chosen && failedIds.has(chosen.id)) {
		return textLayout(t('projector.video_failed', { title: labelOf(chosen) }));
	}

	return textLayout(null);
}
