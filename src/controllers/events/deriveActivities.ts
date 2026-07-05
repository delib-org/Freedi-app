import { deriveActivities as coreDeriveActivities, type DerivedActivity } from '@freedi/event-core';
import type { Statement } from '@freedi/shared-types';
import { getMainAppResolver } from './activityUrls';

/**
 * Event Control Center — main-app activity derivation.
 *
 * Delegates to `@freedi/event-core` with the main app's URL resolver so the
 * dashboard components can keep importing `deriveActivities` from here.
 */

export type { DerivedActivity, ActivityRunState } from '@freedi/event-core';

export function deriveActivities(children: Statement[]): DerivedActivity[] {
	return coreDeriveActivities(children, getMainAppResolver());
}
