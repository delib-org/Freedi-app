/**
 * Statement Sub-Types (ISP - Interface Segregation Principle)
 *
 * The full Statement type has 80+ fields spanning multiple domains.
 * These sub-types allow consumers to depend only on the fields they need.
 *
 * The full `Statement` type remains unchanged for backward compatibility.
 * Apps can gradually narrow their usage:
 *   - Main app: uses `Statement` (full type)
 *   - Sign app: can use `SignStatement` for document-specific features
 *   - MC app: can use `MCStatement` for mass-consensus features
 *
 * UI state fields (elementHight, top, isInMultiStage, selected) are
 * separated into `StatementUIState` — these should live in Redux UI slices
 * or component state, not in the domain type.
 */

import type { Statement } from './StatementTypes';
import type { SimpleStatement } from './SimpleStatement';
import type { StatementSettings } from './StatementSettings';
import type { ResultsSettings } from '../results/ResultsSettings';
import type { QuestionSettings } from '../question/QuestionType';
import type { VotingSettings } from '../vote/votingModel';
import type { FairDivisionSelection } from './fairDivision';
import type { Questionnaire } from '../questionnaire/questionnaireModel';
import type { PopperHebbianScore } from '../popper/popperTypes';
import type { StatementEvaluation, StatementEvaluationSettings } from '../evaluation/Evaluation';
import type { Membership, Creator, Step } from '../user/User';
import type { UserData } from '../user/UserSettings';
import type { Paragraph } from '../paragraph/paragraphModel';
import type { StatementType, DeliberativeElement } from '../TypeEnums';
import type { EvidenceType } from '../evidence/evidenceModel';
import type { StageSelectionType } from '../stage/stageTypes';

// ============================================================
// Core Statement Fields — what every consumer needs (~25 fields)
// ============================================================

/**
 * Core fields present on every statement.
 * Includes identity, hierarchy, content, timestamps, and basic metadata.
 */
export interface StatementCore {
	statement: string;
	paragraphs?: Paragraph[];
	reasoning?: string;
	statementId: string;
	creatorId: string;
	creator: Creator;
	statementType: StatementType;
	parentId: string;
	parents?: string[];
	topParentId: string;
	createdAt: number;
	lastUpdate: number;
	lastChildUpdate?: number;
	consensus: number;
	hasChildren?: boolean;
	totalSubStatements?: number;
	color?: string;
	hide?: boolean;
	anchored?: boolean;
	membership?: Membership;
	maxConsensus?: number;
	randomSeed?: number;
	results?: SimpleStatement[];
	isResult?: boolean;
	resultsSettings?: ResultsSettings;
	statementSettings?: StatementSettings;
	questionSettings?: QuestionSettings;
}

// ============================================================
// Sign Document Fields — Freedi-Sign specific
// ============================================================

/**
 * Fields specific to the Freedi-Sign document workflow.
 * Only the Sign app should depend on these.
 */
export interface SignDocumentFields {
	doc?: {
		isDoc: boolean;
		order: number;
		isOfficialParagraph?: boolean;
		paragraphType?: string;
		listType?: string;
		imageUrl?: string;
		imageAlt?: string;
		imageCaption?: string;
		versionControlSettings?: {
			enabled: boolean;
			reviewThreshold?: number;
			allowAdminEdit?: boolean;
			enableVersionHistory?: boolean;
			maxRecentVersions?: number;
			maxTotalVersions?: number;
			lastSettingsUpdate?: number;
			updatedBy?: string;
		};
	};
	documentApproval?: number;
	documentImportance?: number;
	documentAgree?: number;
	isDocument?: boolean;
	documentSettings?: {
		parentDocumentId: string;
		order: number;
		type: string;
		isTop: boolean;
	};
	versionControl?: {
		currentVersion: number;
		appliedSuggestionId?: string;
		appliedAt?: number;
		replacedBy?: string;
		replacedAt?: number;
		finalizedBy?: string;
		finalizedAt?: number;
		finalizedReason?: string;
		finalized?: boolean;
		adminEditedContent?: string;
		adminEditedAt?: number;
		adminNotes?: string;
	};
	viewed?: {
		individualViews?: number;
	};
}

// ============================================================
// Evaluation Fields — Evaluation/scoring specific
// ============================================================

/**
 * Fields related to statement evaluation and scoring.
 */
export interface EvaluationFields {
	evaluation?: StatementEvaluation;
	evaluationSettings?: StatementEvaluationSettings;
	pro?: number;
	con?: number;
	consensusValid?: number;
	totalEvaluators?: number;
}

// ============================================================
// Voting Fields — Voting specific
// ============================================================

/**
 * Fields related to voting functionality.
 */
export interface VotingFields {
	votes?: number;
	voted?: number;
	topVotedOption?: SimpleStatement;
	selections?: unknown;
	isSelected?: boolean;
	isVoted?: boolean;
	isChosen?: boolean;
	chosenSolutions?: string[];
	votingSettings?: VotingSettings;
	fairDivision?: FairDivisionSelection;
	numberOfOptions?: number;
}

// ============================================================
// Mass Consensus Fields — MC app specific
// ============================================================

/**
 * Fields specific to the Mass Consensus app.
 */
export interface MassConsensusFields {
	massMembers?: number;
	isCluster?: boolean;
	integratedOptions?: string[];
	mergedInto?: string;
}

// ============================================================
// Discussion Fields — Chat/evidence/deliberation
// ============================================================

/**
 * Fields related to discussions, evidence, and deliberative elements.
 */
export interface DiscussionFields {
	evidence?: {
		evidenceType?: EvidenceType;
		support?: number;
		helpfulCount?: number;
		notHelpfulCount?: number;
		netScore?: number;
		evidenceWeight?: number;
	};
	deliberativeElement?: DeliberativeElement;
	PopperHebbianScore?: PopperHebbianScore;
	lastMessage?: {
		message: string;
		creator: string;
		createdAt: number;
	};
	lastSubStatements?: SimpleStatement[];
	suggestions?: number;
	optionContributors?: number;
}

// ============================================================
// Access/Localization Fields
// ============================================================

/**
 * Fields related to access control and localization.
 */
export interface AccessFields {
	allowAnonymousLogin?: boolean;
	followMe?: string;
	powerFollowMe?: string;
	defaultLanguage?: string;
	forceLanguage?: boolean;
	joined?: Creator[];
}

// ============================================================
// Media/Content Fields
// ============================================================

/**
 * Fields related to images and content display.
 */
export interface MediaFields {
	imagesURL?: {
		main?: string;
		more?: string[];
	};
	summary?: string;
}

// ============================================================
// Stage/Step Fields
// ============================================================

/**
 * Fields related to multi-stage question workflows.
 */
export interface StageFields {
	stageId?: string | null;
	stageSelectionType?: StageSelectionType;
	steps?: {
		currentStep: Step;
		allSteps?: Step[];
	};
}

// ============================================================
// Questionnaire Fields
// ============================================================

/**
 * Fields for questionnaire functionality.
 */
export interface QuestionnaireFields {
	questionnaire?: Questionnaire;
}

// ============================================================
// User Data Fields
// ============================================================

/**
 * Fields for creator-specific data attached to statements.
 */
export interface CreatorDataFields {
	creatorData?: UserData;
}

// ============================================================
// UI State Fields — SHOULD NOT be in domain type
// ============================================================

/**
 * UI-only state that should live in Redux UI slices or component state,
 * NOT in the persisted domain model. These are kept here for backward
 * compatibility but new code should use local state instead.
 *
 * @deprecated Move these to Redux UI slice or component state
 */
export interface StatementUIState {
	/** @deprecated Use component state or Redux UI slice */
	elementHight?: number;
	/** @deprecated Use component state or Redux UI slice */
	top?: number;
	/** @deprecated Use component state or Redux UI slice */
	isInMultiStage?: boolean;
	/** @deprecated Use component state or Redux UI slice */
	selected?: boolean;
	/** @deprecated Use component state or Redux UI slice */
	order?: number;
}

// ============================================================
// Composed Types per App
// ============================================================

/**
 * Sign app statement — core + document-specific fields.
 * Use this type when working exclusively with Sign app features.
 */
export type SignStatement = StatementCore &
	SignDocumentFields &
	EvaluationFields &
	AccessFields &
	MediaFields;

/**
 * Mass Consensus statement — core + MC-specific fields.
 * Use this type when working exclusively with MC app features.
 */
export type MCStatement = StatementCore &
	MassConsensusFields &
	VotingFields &
	EvaluationFields &
	StageFields;

/**
 * Minimal statement type for read-only displays.
 * Use when you only need to show basic statement info.
 */
export type StatementSummary = Pick<
	StatementCore,
	| 'statementId'
	| 'statement'
	| 'statementType'
	| 'parentId'
	| 'topParentId'
	| 'creatorId'
	| 'creator'
	| 'createdAt'
	| 'lastUpdate'
	| 'consensus'
>;

// ============================================================
// Type guard utilities
// ============================================================

/**
 * Check if a statement has sign document fields.
 */
export function isSignDocument(statement: Statement): statement is Statement & Required<Pick<SignDocumentFields, 'doc'>> {
	return statement.doc !== undefined && statement.doc.isDoc === true;
}

/**
 * Check if a statement has mass consensus fields.
 */
export function isMassConsensusStatement(statement: Statement): statement is Statement & Required<Pick<MassConsensusFields, 'massMembers'>> {
	return statement.massMembers !== undefined;
}

/**
 * Check if a statement has evaluation data.
 */
export function hasEvaluation(statement: Statement): statement is Statement & Required<Pick<EvaluationFields, 'evaluation'>> {
	return statement.evaluation !== undefined;
}

/**
 * Check if a statement has voting data.
 */
export function hasVotingData(statement: Statement): statement is Statement & Required<Pick<VotingFields, 'votes'>> {
	return statement.votes !== undefined;
}
