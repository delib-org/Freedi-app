/**
 * Types for the Integrate Similar Suggestions feature
 */

/**
 * Statement with evaluation data for integration
 */
export interface StatementWithEvaluation {
	statementId: string;
	statement: string;
	description?: string;
	numberOfEvaluators: number;
	consensus: number;
	sumEvaluations: number;
}

/**
 * Response from findSimilarForIntegration function
 */
export interface FindSimilarForIntegrationResponse {
	sourceStatement: StatementWithEvaluation;
	similarStatements: StatementWithEvaluation[];
	suggestedTitle?: string;
	suggestedDescription?: string;
}

/**
 * Request params for executing integration
 */
export interface ExecuteIntegrationParams {
	parentStatementId: string;
	selectedStatementIds: string[];
	integratedTitle: string;
	integratedDescription: string;
}

/**
 * Response from executeIntegration function
 */
export interface ExecuteIntegrationResponse {
	success: boolean;
	newStatementId: string;
	migratedEvaluationsCount: number;
	hiddenStatementsCount: number;
}

/**
 * Props for the main integration modal
 */
export interface IntegrateSuggestionsModalProps {
	sourceStatementId: string;
	parentStatementId: string;
	onClose: () => void;
	onSuccess: (newStatementId: string) => void;
}

/**
 * Props for the similar group selector component
 */
export interface SimilarGroupSelectorProps {
	sourceStatement: StatementWithEvaluation;
	similarStatements: StatementWithEvaluation[];
	selectedIds: string[];
	onSelectionChange: (selectedIds: string[]) => void;
}

/**
 * Props for the integration preview component
 */
export interface IntegrationPreviewProps {
	selectedStatements: StatementWithEvaluation[];
	suggestedTitle: string;
	suggestedDescription: string;
	onTitleChange: (title: string) => void;
	onDescriptionChange: (description: string) => void;
	onBack: () => void;
	onConfirm: () => void;
	isSubmitting: boolean;
}

/**
 * Integration modal step
 */
export type IntegrationStep = 'loading' | 'selection' | 'preview' | 'success' | 'error';
