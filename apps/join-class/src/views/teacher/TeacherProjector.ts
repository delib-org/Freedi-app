import m from 'mithril';
import '@/styles/projector.scss';
import '@/styles/projector-gate.scss';
// >>> voteSummary BEGIN
import '@/styles/projector-results.scss';
// >>> voteSummary END
import '@/styles/projector-video.scss';
import '@/styles/projector-controls.scss';
import '@/styles/game-projector.scss';
import { t } from '@/lib/i18n';
import { ensureUser } from '@/lib/user';
import { loadMainStatement, getMainStatement, setFollowLessonLanguage } from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { ensureClassCode, lessonStepOf, stepLabel } from '@/lib/lesson';
import { lessonStatusOfMain } from '@/lib/lessonCore';
import { readBallot } from './projector/projectorLogic';
import { watchClass } from '@/lib/classroom/classState';
import { projectorData, watchProjector } from '@/lib/classroom/projectorData';
import { NotYourLesson } from './NotYourLesson';
import { ProjectorBand } from './projector/ProjectorBand';
import { renderStep } from './projector/steps';
import { openingVideoActive } from './projector/OpeningStage';
import {
	ProjectorControls,
	ProjectorHint,
	controlsVisible,
	resetControls,
} from './projector/ProjectorControls';
import { projectorMode } from '@/lib/classroom/projectorScreen';
import { readClassCode } from './planHelpers';

/**
 * Projector (/t/:mid/screen, UX section 6): one thing per step, smallest text
 * 32 px, nothing interactive but the opening video's play button. A bottom band
 * carries the join code and QR on every step. Grid, not a room map.
 */

type Load = 'loading' | 'ready' | 'error' | 'denied';

let load: Load = 'loading';
let stops: Array<() => void> = [];
let openedFor = '';

function stopAll(): void {
	for (const stop of stops) stop();
	stops = [];
}

async function open(mid: string): Promise<void> {
	load = 'loading';
	openedFor = mid;
	m.redraw();
	try {
		await ensureUser();
		if (getMainStatement()?.statementId !== mid) await loadMainStatement(mid);
		const main = getMainStatement();
		if (!main || main.statementId !== mid) {
			load = 'error';

			return;
		}
		await checkAdminStatus(mid, main.creatorId);
		if (!isAdmin()) {
			load = 'denied';

			return;
		}
		await ensureClassCode(mid).catch((err: unknown) => {
			console.error('[Projector] ensureClassCode failed:', err);
		});
		if (openedFor !== mid) return;
		stopAll();
		stops = [watchProjector(mid), watchClass(mid, 'teacher')];
		load = 'ready';
	} catch (err) {
		console.error('[Projector] load failed:', err);
		load = 'error';
	} finally {
		m.redraw();
	}
}

/** Paused: the words and the code (late joiners can still join). Ended: the words and the decision. */
function stateFrame(status: 'paused' | 'ended', code: string | undefined): m.Vnode {
	const ended = status === 'ended';
	const ballot = readBallot(projectorData.challenge);
	const decision = projectorData.proposals.find((o) => o.statementId === ballot?.decisionId);

	return m('section.projector-step.projector-step--state', { class: `projector-step--${status}` }, [
		m('span.projector-mark', [
			m('span.status-mark', { class: `status-mark--${status}`, 'aria-hidden': 'true' }),
		]),
		m('h1.projector-instruction', t(ended ? 'lesson.ended.title' : 'lesson.paused.title')),
		ended ? m('p.projector-empty', t('lesson.ended.body')) : null,
		ended && decision
			? m('.projector-decision', [
					m('p.projector-eyebrow', t('projector.decision')),
					m('p.projector-decision__text', decision.statement),
				])
			: null,
		!ended && code ? m('p.projector-code', { dir: 'ltr' }, code) : null,
	]);
}

function body(): m.Children {
	if (load === 'loading') return m('p.projector__status', t('projector.loading'));
	if (load === 'error') return m('p.projector__status', t('projector.error'));
	const main = projectorData.main ?? getMainStatement();
	const code = readClassCode(main);
	const joinUrl = code ? `${window.location.origin}/c/${code}` : undefined;
	const step = lessonStepOf(main?.statementSettings?.lessonPlan);
	const status = lessonStatusOfMain(main);

	if (status === 'paused' || status === 'ended') {
		const ended = status === 'ended';

		return [
			m(
				'main.projector__stage',
				{ 'data-step': step.key, 'data-status': status },
				stateFrame(status, code),
			),
			// An ended lesson does not invite joining: no code, no QR in the band.
			m(ProjectorBand, {
				stepName: t(ended ? 'lesson.ended.title' : 'lesson.paused.title'),
				code: ended ? undefined : code,
				joinUrl: ended ? undefined : joinUrl,
			}),
		];
	}

	const video = step.key === 'opening' && openingVideoActive();

	return [
		m('main.projector__stage', { 'data-step': step.key }, renderStep(step.key, { code, joinUrl })),
		// video mode has its own strip instead of the code band (UX 15.C)
		video ? null : m(ProjectorBand, { stepName: stepLabel(step.key), code, joinUrl }),
	];
}

/** True when the ready, live projector shows a video (the root takes the black video look). */
function videoMode(): boolean {
	if (load !== 'ready') return false;
	const main = projectorData.main ?? getMainStatement();
	const status = lessonStatusOfMain(main);
	if (status === 'paused' || status === 'ended') return false;

	return (
		lessonStepOf(main?.statementSettings?.lessonPlan).key === 'opening' && openingVideoActive()
	);
}

export const TeacherProjector: m.Component = {
	oninit() {
		// The projector speaks the lesson's language, like the students' phones.
		setFollowLessonLanguage(true);
		const mid = m.route.param('mid');
		if (!mid) {
			m.route.set('/t');

			return;
		}
		resetControls(projectorMode(m.route.param('mode')), mid);
		void open(mid);
	},
	onremove() {
		openedFor = '';
		stopAll();
	},
	view() {
		if (load === 'denied') return m(NotYourLesson);
		const mid = m.route.param('mid') ?? openedFor;

		return m(
			'.projector',
			{
				role: 'region',
				tabindex: '-1',
				'aria-label': t('projector.title'),
				'data-controls': controlsVisible() ? 'on' : 'off',
				class: videoMode() ? 'projector--video' : undefined,
			},
			[
				body(),
				m(ProjectorHint),
				m(ProjectorControls, { mid, mode: projectorMode(m.route.param('mode')) }),
			],
		);
	},
};
