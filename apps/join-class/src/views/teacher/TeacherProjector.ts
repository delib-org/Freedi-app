import m from 'mithril';
import '@/styles/projector.scss';
import { t } from '@/lib/i18n';
import { ensureUser } from '@/lib/user';
import { loadMainStatement, getMainStatement } from '@/lib/store';
import { checkAdminStatus, isAdmin } from '@/lib/admin';
import { ensureClassCode, lessonStepOf, stepLabel } from '@/lib/lesson';
import { watchClass } from '@/lib/classroom/classState';
import { projectorData, watchProjector } from '@/lib/classroom/projectorData';
import { ProjectorBand } from './projector/ProjectorBand';
import { renderStep } from './projector/steps';
import { readClassCode } from './planHelpers';

/**
 * Projector (/t/:mid/screen, UX section 6): one thing per step, smallest text
 * 32 px, nothing interactive but the opening video's play button. A bottom band
 * carries the join code and QR on every step. Grid, not a room map.
 */

type Load = 'loading' | 'ready' | 'error';

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
			m.route.set(`/m/${mid}`);

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

function body(): m.Children {
	if (load === 'loading') return m('p.projector__status', t('projector.loading'));
	if (load === 'error') return m('p.projector__status', t('projector.error'));
	const main = projectorData.main ?? getMainStatement();
	const code = readClassCode(main);
	const joinUrl = code ? `${window.location.origin}/c/${code}` : undefined;
	const step = lessonStepOf(main?.statementSettings?.lessonPlan);

	return [
		m('main.projector__stage', { 'data-step': step.key }, renderStep(step.key, { code, joinUrl })),
		m(ProjectorBand, { stepName: stepLabel(step.key), code, joinUrl }),
	];
}

export const TeacherProjector: m.Component = {
	oninit() {
		const mid = m.route.param('mid');
		if (!mid) {
			m.route.set('/t');

			return;
		}
		void open(mid);
	},
	onremove() {
		openedFor = '';
		stopAll();
	},
	view() {
		return m('.projector', { 'aria-label': t('projector.title') }, body());
	},
};
