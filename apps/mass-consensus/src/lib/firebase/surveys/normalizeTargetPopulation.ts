import type { SurveySettings } from '@freedi/shared-types';
import { parseTargetPopulation } from '@/lib/utils/targetPopulation';

/**
 * Make settings.targetPopulation either a positive whole number or absent.
 * The form sends 0 to say "cleared"; 0, null, negatives and junk all drop the
 * key so nothing falsy is ever stored (null would fail the schema and shadow
 * a number inherited from a group above the question).
 */
export function normalizeTargetPopulation(settings: SurveySettings): SurveySettings {
	const { targetPopulation, ...rest } = settings;
	const parsed = parseTargetPopulation(targetPopulation);

	return parsed === undefined ? rest : { ...rest, targetPopulation: parsed };
}
