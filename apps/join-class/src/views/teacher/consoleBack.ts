import m from 'mithril';
import { CLASS_PLANS_COLLECTION } from '@freedi/shared-types';
import { db, doc, getDoc } from '@/lib/firebase';
import { getMainStatement } from '@/lib/store';
import { linkOf, planPathOf } from '@/lib/lessonLinks';
import { t } from '@/lib/i18n';

/**
 * The console's way back (docs/ia/join-class-lesson-plan.md 5): up to the lesson's plan
 * screen, named after the plan. "סיום השיעור" returns there too. An old lesson is its own
 * plan (named after itself); a lesson whose plan cannot be read falls back to the home.
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
			console.error('[consoleBack] reading the plan failed:', err);
		});
}

export interface BackTarget {
	href: string;
	label: string;
}

/** Where "back" goes from the lesson on screen, and what it is called. */
export function planBack(): BackTarget {
	const main = getMainStatement();
	if (!main) return { href: '/t', label: t('classPlan.back') };
	const link = linkOf(main);
	if (link.legacy) return { href: planPathOf(link.planId), label: main.statement };
	fetchTitle(link.planId);

	return { href: planPathOf(link.planId), label: titles.get(link.planId) ?? t('classPlan.back') };
}
