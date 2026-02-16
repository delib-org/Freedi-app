import { QuestionType } from '@freedi/shared-types';

/**
 * Returns the default question type for new questions.
 * This centralizes the default value to ensure consistency across the application.
 *
 * @returns {QuestionType} The default question type (QuestionType.simple)
 */
export function getDefaultQuestionType(): QuestionType {
	return QuestionType.simple;
}
