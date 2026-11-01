import type { ClassPlan } from '@freedi/shared-types';
import { subscribeToClassPlans } from './classPlans';
import { subscribeToClassLessons, type ClassLessonEntry } from './joinSubscriptions';
import type { Unsubscribe } from './firebase';

/**
 * The teacher's whole library as the home and the plan screen read it: the plan docs
 * and the lessons, live. `ready` is true once both have answered at least once.
 */
export interface TeacherLibrary {
	plans: ClassPlan[];
	lessons: ClassLessonEntry[];
	ready: boolean;
}

export function watchLibrary(
	uid: string,
	onChange: (library: TeacherLibrary) => void,
): Unsubscribe {
	let plans: ClassPlan[] = [];
	let lessons: ClassLessonEntry[] = [];
	let plansReady = false;
	let lessonsReady = false;
	const emit = (): void => onChange({ plans, lessons, ready: plansReady && lessonsReady });

	const stopPlans = subscribeToClassPlans(uid, (next) => {
		plans = next;
		plansReady = true;
		emit();
	});
	const stopLessons = subscribeToClassLessons(uid, (next) => {
		lessons = next;
		lessonsReady = true;
		emit();
	});

	return () => {
		stopPlans();
		stopLessons();
	};
}
