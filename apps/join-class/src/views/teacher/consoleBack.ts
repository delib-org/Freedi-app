import m from 'mithril';
import { CLASS_PLANS_COLLECTION } from '@freedi/shared-types';
import { db, doc, getDoc } from '@/lib/firebase';
import { getMainStatement } from '@/lib/store';
import { linkOf, planPathOf } from '@/lib/lessonLinks';
import { t } from '@/lib/i18n';
import { captureException } from '@/lib/sentry';

/**
 * The console's way back (docs/ia/join-class-lesson-plan.md 5): up to the lesson's plan
 * screen, named after the plan. "סיום השיעור" returns there too. An old lesson is its own
 * plan (named after itself). While the plan's title loads, or if it cannot be read, the link
 * still goes to the plan and is named "מערך השיעור" (`classPlan.parent`). With no lesson
 * loaded there is no parent: back is the home (`/t`) and the bar shows the home chip only.
 */

const titles = new Map<string, string>();
const asked = new Set<string>();

function fetchTitle(planId: string): void {
	if (asked.has(planId)) return;
	asked.add(planId);
	getDoc(doc(db, CLASS_PLANS_COLLECTION, planId))
		.then((snap) => {
			const title = snap.exists() ? (snap.data() as { title?: unknown }).title : undefined;
			if (typeof title === 'string') {
				titles.set(planId, title);
				m.redraw();
			}
		})
		.catch((err: unknown) => {
			captureException(err, { operation: 'consoleBack.readPlan', planId });
		});
}

export interface BackTarget {
	href: string;
	label: string;
}

/**
 * Where "back" goes from the lesson on screen, and what it is called. `routeMid` is the
 * route's lesson: a loaded lesson with another id is not loaded yet.
 */
export function planBack(routeMid?: string): BackTarget {
	const loaded = getMainStatement();
	// a lesson left over from another route's mid is not this route's lesson
	const main = loaded && (!routeMid || loaded.statementId === routeMid) ? loaded : null;
	if (!main) return { href: '/t', label: t('classPlan.parent') };
	const link = linkOf(main);
	if (link.legacy) return { href: planPathOf(link.planId), label: main.statement };
	fetchTitle(link.planId);

	return { href: planPathOf(link.planId), label: titles.get(link.planId) ?? t('classPlan.parent') };
}
