import type { OdysseyAttitudeKey } from '@freedi/shared-types';

/**
 * Dictionary key for each attitude button.
 *
 * `ODYSSEY_ATTITUDES[].label` in shared-types is Hebrew and stays so — it is
 * read by functions and other apps. Odyssey shows its own translation and
 * keeps the KEY (`support` / `livewith` / `oppose`), which is what gets stored.
 */
export const ATTITUDE_KEY: Record<OdysseyAttitudeKey, string> = {
	support: 'attitude.support',
	livewith: 'attitude.livewith',
	oppose: 'attitude.oppose',
};
