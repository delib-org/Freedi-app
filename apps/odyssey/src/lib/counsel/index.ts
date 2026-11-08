import type { DefaultElder } from '../eldersDefaults';
import { counsel as aloni } from './aloni';
import { counsel as benGurion } from './ben-gurion';
import { counsel as geulaCohen } from './geula-cohen';
import { counsel as golda } from './golda';
import { counsel as habibi } from './habibi';
import { counsel as herzl } from './herzl';
import { counsel as jabotinsky } from './jabotinsky';
import { counsel as leibowitz } from './leibowitz';
import { counsel as ovadia } from './ovadia';
import { counsel as rachelYanait } from './rachel-yanait';
import { counsel as ravKook } from './rav-kook';
import { counsel as senesh } from './senesh';

/**
 * Per-shore counsel for every default sailor, keyed by elder slug.
 * Each file is one sailor's voice: island slug → one line per shore, in
 * shore order. A sailor who is silent on an island simply has no key for it.
 */
export const COUNSEL_BY_SLUG: Record<string, NonNullable<DefaultElder['counsel']>> = {
	herzl,
	'ben-gurion': benGurion,
	jabotinsky,
	'rav-kook': ravKook,
	'geula-cohen': geulaCohen,
	golda,
	'rachel-yanait': rachelYanait,
	ovadia,
	aloni,
	leibowitz,
	habibi,
	senesh,
};
