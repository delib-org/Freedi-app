import { SortType, Statement, QuestionType } from '@freedi/shared-types';

/**
 * Defaults of every value that lives in the "Data & Advanced" group. The group
 * is folded away unless the user opted into advanced tools or one of these is
 * already set to something else (then hiding it would hide their own choice).
 */
export const ADVANCED_GROUP_DEFAULTS = {
	questionType: QuestionType.multiStage,
	autoBackup: false,
	hide: false,
	isDocument: false,
	enableTreeView: false,
	enableSubQuestionsMap: true,
	hasChildren: true,
	enableNavigationalElements: false,
	enableAddNewSubQuestionsButton: false,
	defaultView: 'chat',
	defaultSortType: SortType.newest,
	defaultLanguage: undefined,
	forceLanguage: false,
} as const;

/** Reads the current value for each advanced key, `undefined` meaning "not set". */
export function readAdvancedValues(
	statement: Statement,
): Record<keyof typeof ADVANCED_GROUP_DEFAULTS, unknown> {
	const s = statement.statementSettings ?? {};
	const q = statement.questionSettings;

	return {
		questionType: q?.questionType,
		autoBackup: q?.autoBackup,
		hide: statement.hide,
		isDocument: statement.isDocument,
		enableTreeView: s.enableTreeView,
		enableSubQuestionsMap: s.enableSubQuestionsMap,
		hasChildren: s.hasChildren,
		enableNavigationalElements: s.enableNavigationalElements,
		enableAddNewSubQuestionsButton: s.enableAddNewSubQuestionsButton,
		defaultView: s.defaultView,
		defaultSortType: s.defaultSortType,
		defaultLanguage: statement.defaultLanguage,
		forceLanguage: statement.forceLanguage,
	};
}

/** True when at least one advanced value differs from its default (unset counts as default). */
export function hasNonDefaultAdvancedValue(statement: Statement): boolean {
	const values = readAdvancedValues(statement);

	return (Object.keys(ADVANCED_GROUP_DEFAULTS) as Array<keyof typeof ADVANCED_GROUP_DEFAULTS>).some(
		(key) => {
			const value = values[key];
			if (value === undefined || value === null) return false;

			return value !== ADVANCED_GROUP_DEFAULTS[key];
		},
	);
}

export interface AdvancedGroupVisibilityArgs {
	statement: Statement;
	advanceUser: boolean | undefined;
}

/**
 * Show the "Data & Advanced" group by default only for advanced users or when
 * something in it is already customised. It never gates functionality: the
 * form offers a "Show advanced settings" reveal when this returns false.
 */
export function isAdvancedGroupVisible({
	statement,
	advanceUser,
}: AdvancedGroupVisibilityArgs): boolean {
	if (advanceUser) return true;

	return hasNonDefaultAdvancedValue(statement);
}
