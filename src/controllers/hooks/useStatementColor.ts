import { StatementType, Statement } from '@freedi/shared-types';
import { useMemo } from 'react';

export interface StyleProps {
	backgroundColor: string;
	color: string;
}

const DEFAULT_STYLE: StyleProps = {
	backgroundColor: 'var(--header-home)',
	color: 'white',
};

// Pure derivation from statementType — the previous useState/useEffect
// version cost two renders per card on mount.
// Note: Selection state (isVoted/isChosen) is determined by the parent's
// results array, not individual statement flags. This hook only handles
// type-based styling.
export default function useStatementColor({
	statement,
}: {
	statement: Statement | undefined;
}): StyleProps {
	const statementType = statement?.statementType;

	return useMemo(() => {
		switch (statementType) {
			case StatementType.group:
				return {
					backgroundColor: 'var(--header-group)', // Purple shade for group type
					color: 'var(--group-text, #ffffff)',
				};
			case StatementType.option:
				return {
					backgroundColor: 'var(--header-not-chosen, #ffe16a)',
					color: 'var(--option-text, #ffffff)',
				};
			case StatementType.question:
				return {
					backgroundColor: 'var(--header-question, #47b4ef)',
					color: 'var(--question-text, #fff)',
				};
			default:
				return DEFAULT_STYLE;
		}
	}, [statementType]);
}
