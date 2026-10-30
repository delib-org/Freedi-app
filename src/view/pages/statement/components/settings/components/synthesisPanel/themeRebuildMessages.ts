import {
	classifyThemeRebuildError,
	type ThemeRebuildErrorKind,
} from '@/controllers/db/synthesis/themeRebuildErrors';
import type { ThemeRebuildApplyResponse } from '@/controllers/db/synthesis/synthesisOperations';

type Translate = (text: string) => string;

const ERROR_TEXT: Record<ThemeRebuildErrorKind, string> = {
	'in-progress': 'Another clustering run is in progress. Try again when it finishes.',
	expired: 'This preview expired. Run the preview again.',
	'no-atoms': 'There are no ideas to group yet.',
};

/**
 * A message the admin can act on for a failed "Re-theme with AI" call, or
 * undefined when the error is not one of the known refusals.
 */
export function themeRebuildErrorMessage(error: unknown, t: Translate): string | undefined {
	const kind = classifyThemeRebuildError(error);

	return kind ? t(ERROR_TEXT[kind]) : undefined;
}

export function themeRebuildAppliedMessage(
	result: ThemeRebuildApplyResponse,
	t: Translate,
): string {
	const otherIdeas = result.atomsToOther + result.lateArrivalsToOther;

	return `${t('Themes rebuilt')} · ${t('Themes')}: ${result.themesWritten} · ${t('Ideas placed')}: ${result.atomsPlaced} · ${t('Other ideas')}: ${otherIdeas}`;
}
