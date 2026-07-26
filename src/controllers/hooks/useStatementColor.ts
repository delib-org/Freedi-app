import { StatementType, Statement } from '@freedi/shared-types';
import { useMemo } from 'react';

import { getHeaderContrastInk } from '@/utils/headerContrast';

export interface StyleProps {
	backgroundColor: string;
	color: string;
}

// Header accent backgrounds by statement type. The var() fallbacks mirror
// the token values in src/view/style/_variables.scss so the contrast ink can
// still be derived where custom properties don't resolve (jsdom tests).
const HEADER_BACKGROUNDS: Partial<Record<StatementType, string>> = {
	[StatementType.group]: 'var(--header-group, #b9a1e8)',
	[StatementType.option]: 'var(--header-not-chosen, #ffe16a)',
	[StatementType.question]: 'var(--header-question, #47b4ef)',
};

const DEFAULT_BACKGROUND = 'var(--header-home, #5f88e5)';

// Pure derivation from statementType — the previous useState/useEffect
// version cost two renders per card on mount.
// Note: Selection state (isVoted/isChosen) is determined by the parent's
// results array, not individual statement flags. This hook only handles
// type-based styling.
//
// The icon/text ink is derived from the accent's LUMINANCE (light ink on
// dark accents, dark ink on light accents) so header icons stay legible on
// any accent color in both light and dark app themes — fixed white icons
// used to vanish on the light option-yellow header.
export default function useStatementColor({
	statement,
}: {
	statement: Statement | undefined;
}): StyleProps {
	const statementType = statement?.statementType;

	return useMemo(() => {
		const backgroundColor =
			(statementType && HEADER_BACKGROUNDS[statementType]) || DEFAULT_BACKGROUND;

		return {
			backgroundColor,
			color: getHeaderContrastInk(backgroundColor),
		};
	}, [statementType]);
}
