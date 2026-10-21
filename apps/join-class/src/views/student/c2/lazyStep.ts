import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';
import { StudentFrame } from '@/components/StudentFrame';
import { stepLabel } from '@/lib/lesson';
import type { StepAttrs } from '../steps/stepSlot';

type C2Views = typeof import('./views');
type C2ViewName = keyof C2Views;

/** The chunk is fetched once and shared by the four steps. */
let loading: Promise<C2Views> | null = null;
let loaded: C2Views | null = null;

function loadViews(): Promise<C2Views> {
	loading ??= import('./views').then((views) => {
		loaded = views;

		return views;
	});

	return loading;
}

/**
 * A step slot whose body lives in the lazy `c2/views` chunk, so the first
 * paint of Join's entry bundle does not carry the classroom screens (device
 * budget, IA 9b). While the chunk loads the student sees the empty frame
 * with the step name; a failed load is retried on the next step mount.
 */
export function lazyStep(view: C2ViewName, key: LessonStepKey): m.Component<StepAttrs> {
	return {
		oninit() {
			loadViews()
				.then(() => m.redraw())
				.catch((error: unknown) => {
					console.error('[StudentStage] c2 views failed to load:', error);
					loading = null;
				});
		},

		view({ attrs }) {
			if (!loaded) return m(StudentFrame, { headerLine: stepLabel(key) });

			return m(loaded[view], attrs);
		},
	};
}
