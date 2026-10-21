import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';
import { stepLabel } from '@/lib/lesson';
import { StudentFrame } from '@/components/StudentFrame';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * A step slot whose body is a separate chunk: the phone downloads the Table
 * talk / Proposals / Vote / Summary code only when its step first opens, so the
 * entry bundle stays at Join's weight (IA §9b). Until the chunk lands the shared
 * frame shows the step name; a failed fetch is logged and retried on the next draw.
 */
export function lazyStep(
	key: LessonStepKey,
	load: () => Promise<m.ComponentTypes<StepAttrs>>,
): m.Component<StepAttrs> {
	let body: m.ComponentTypes<StepAttrs> | null = null;
	let loading = false;

	return {
		view({ attrs }) {
			if (body) return m(body, attrs);
			if (!loading) {
				loading = true;
				load()
					.then((component) => {
						body = component;
					})
					.catch((error: unknown) => {
						console.error(`[C3] loading the ${key} step failed:`, error);
					})
					.finally(() => {
						loading = false;
						m.redraw();
					});
			}

			return m(StudentFrame, { headerLine: stepLabel(key), instruction: stepLabel(key) });
		},
	};
}
