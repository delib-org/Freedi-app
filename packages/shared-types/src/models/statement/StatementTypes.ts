import {
	object,
	string,
	number,
	boolean,
	optional,
	nullable,
	array,
	any,
	enum_,
	InferOutput,
} from 'valibot';
import { DeliberativeElement, DocumentType, StatementType } from '../TypeEnums';
import { CreatorSchema, MembershipSchema, StepSchema, UserSchema } from '../user/User';
import { ResultsSettingsSchema } from '../results/Results';
import { QuestionSettingsSchema } from '../question/QuestionType';
import {
	AgreeSchema,
	DocumentApprovalSchema,
	DocumentImportanceSchema,
} from '../agreement/Agreement';
import { StageSelectionType } from '../stage/stageTypes';
import { SimpleStatementSchema } from './SimpleStatement';
import { StatementSettingsSchema } from './StatementSettings';
import { UserDataSchema } from '../user/UserSettings';
import { StatementEvaluationSchema, StatementEvaluationSettingsSchema } from '../evaluation/Evaluation';
import { QuestionnaireSchema } from '../questionnaire/questionnaireModel';
import { FairDivisionSelectionSchema } from './fairDivision';
import { VotingSettingsSchema } from '../vote/votingModel';
import { EvidenceType } from '../evidence/evidenceModel';
import { PopperHebbianScoreSchema } from '../popper/popperTypes';
import { ParagraphSchema } from '../paragraph/paragraphModel';

/*
Statement is everything in this app. It is a statement in a chat, an option in a solution, a group, a stage, etc.
Statements are connected to each other in a tree structure, where each statement can have parentStatement, and a list of all parents.
The entity type is StatementType.

*/

export const LastMessageSchema = object({
	message: string(),
	creator: string(),
	createdAt: number(),
});

export type LastMessage = InferOutput<typeof LastMessageSchema>;

export const StatementSchema = object({
	allowAnonymousLogin: optional(boolean()), // if true, allow anonymous login
	statement: string(), // the text of the statement (title - auto-extracted from first paragraph)
	paragraphs: optional(array(ParagraphSchema)), // the paragraphs of the statement (rich text content)
	statementId: string(), // the id of the statement
	creatorId: string(), // the id of the creator of the statement
	creator: UserSchema, // the creator of the statement
	statementType: enum_(StatementType), // the type of the statement: group, stage, option, chat-message, etc.
	evidence: optional(object({
		evidenceType: optional(enum_(EvidenceType)), // the type of evidence: data, testimony, argument, anecdote, fallacy
		support: optional(number()), // the strength of support of the evidence (-1 to 1): -1 = strongly challenges, 0 = neutral, 1 = strongly supports
		helpfulCount: optional(number()), // the number of helpful votes for the evidence
		notHelpfulCount: optional(number()), // the number of not-helpful votes for the evidence
		netScore: optional(number()), // the net score of the evidence (helpfulCount - notHelpfulCount)
		evidenceWeight: optional(number()), // calculated weight based on evidence type and vote quality (can be > 1.0)
	})),
	deliberativeElement: optional(enum_(DeliberativeElement)), // the deliberative element of the statement: need, explanation, question, suggestion, conclusion, etc.
	color: optional(string()), // it is a color assigned to a statement
	defaultLanguage: optional(string()), // the default language of the statement
	forceLanguage: optional(boolean()), // if true, force the language of the statement
	followMe: optional(string()),
	parentId: string(), // the id of the parent statement
	parents: optional(array(string())), // the list of all parents of the statement
	topParentId: string(), // the id of the top parent of the statement
	hasChildren: optional(boolean()), // if true, the user can add sub statements to the statement
	lastMessage: optional(object({
		message: string(),
		creator: string(),
		createdAt: number(),
	})), // the last message in the statement
	lastSubStatements: optional(array(SimpleStatementSchema)), // the last sub-statements of the statement
	lastUpdate: number(), // the last update of the statement
	lastChildUpdate: optional(number()), // the last update of the last child of the statement
	createdAt: number(), // the creation date of the statement
	pro: optional(number()), // the number of supporters of the statement
	con: optional(number()), // the number of opponents of the statement
	doc: optional(
		object({
			isDoc: boolean(),
			order: number(),
			isOfficialParagraph: optional(boolean()), // Sign app: marks standing paragraphs (vs suggestions)
			versionControlSettings: optional(object({
				// MVP: Manual mode only
				enabled: boolean(), // default: false (opt-in per document)
				// Minimum consensus to appear in review queue
				reviewThreshold: optional(number()), // default: 0.5 (50%)
				// Admin can edit suggestion before approval
				allowAdminEdit: optional(boolean()), // default: true
				// History settings
				enableVersionHistory: optional(boolean()), // default: true
				maxRecentVersions: optional(number()), // default: 4 (full storage)
				maxTotalVersions: optional(number()), // default: 50 (including compressed)
				// Tracking
				lastSettingsUpdate: optional(number()),
				updatedBy: optional(string()), // userId
			})),
		})
	), // I think it is relevant to Freedi-sign
	numberOfOptions: optional(number()), // the number of options of the statement
	consensus: number(), // the consensus of the statement
	consensusValid: optional(number()), // gives a combine number of the level of consensus and its validity
	PopperHebbianScore: optional(PopperHebbianScoreSchema), // the Popper Hebbian score of the statement
	order: optional(number()), // the order of the statement relative to its siblings
	elementHight: optional(number()), // the height of the statement. It is used for animation purposes
	top: optional(number()), // the top of the statement. It is used for animation purposes
	suggestions: optional(number()), // the number of suggestions of the statement
	optionContributors: optional(number()), // the number of participants that suggested an option
	massMembers: optional(number()), // the number of members of the statement
	votes: optional(number()), // the number of votes for the statement
	topVotedOption: optional(SimpleStatementSchema), // the top voted option of the statement
	selections: optional(any()), // the top-options of the statement
	isSelected: optional(boolean()), // if true, the statement is selected
	isCluster: optional(boolean()),
	integratedOptions: optional(array(string())), // source statement IDs merged into this cluster-option (many-to-many)
	voted: optional(number()), // the number of votes for the statement
	totalSubStatements: optional(number()), // the total number of sub statements of the statement
	membership: optional(MembershipSchema), // the membership of the statement
	maxConsensus: optional(number()), // the maximum consensus of the statement
	selected: optional(boolean()), // if true, the statement is selected
	isVoted: optional(boolean()), // if true - this is the top voted option of the statement
	results: optional(array(SimpleStatementSchema)), // the results of the statement
	isResult: optional(boolean()), // if true, the statement a top-statement
	imagesURL: optional(
		object({
			main: optional(string()), // the main image of the statement
			more: optional(array(string())), // the other images of the statement
		})
	),
	totalEvaluators: optional(number()), // the total number of evaluators of the statement
	isInMultiStage: optional(boolean()), // if true, the statement is in a multi-stage
	documentApproval: optional(DocumentApprovalSchema), // the approval of the statement - used for Freedi-sign.
	documentImportance: optional(DocumentImportanceSchema), // the importance of the statement - used for Freedi-sign.
	documentAgree: optional(AgreeSchema), // the agreement of the statement - used for Freedi-sign.
	stageId: optional(nullable(string())), // the id of the stage of the statement
	viewed: optional(
		object({
			individualViews: optional(number()), // the number of views of the statement - used for Freedi-sign.
		})
	),
	stageSelectionType: optional(enum_(StageSelectionType)), // the type of the stage selection of the statement
	creatorData: optional(UserDataSchema), // the creator data of the statement
	isChosen: optional(boolean()), // if true, the statement is chosen by a vote
	chosenSolutions: optional(array(string())), // the chosen solutions of the statement
	summary: optional(string()), // the summary of the statement - should be generated by the AI
	evaluation: optional(StatementEvaluationSchema), // the evaluation of the statement
	evaluationSettings: optional(StatementEvaluationSettingsSchema),// the evaluation settings of the statement	
	importanceData: optional(
		object({
			sumImportance: number(), // the sum of the importance of the statement
			numberOfUsers: number(), // the number of users who voted for the statement
			numberOfViews: number(), // the number of views of the statement
		})
	),
	documentSettings: optional( //used for Freedi-sign
		object({
			parentDocumentId: string(), // the id of the parent document of the statement
			order: number(), // the order of the statement relative to its siblings
			type: enum_(DocumentType), // the type of the document
			isTop: boolean(), // if true, the statement is a top-statement
		})
	),
	resultsSettings: optional(ResultsSettingsSchema), // the settings of the results of the statement
	steps: optional( // steps are used to generate a solution using several steps, like suggestion, and then voting
		object({
			currentStep: StepSchema,
			allSteps: optional(array(StepSchema)),
		})
	),
	votingSettings: optional(VotingSettingsSchema), // the settings of the voting of the statement
	questionSettings: optional(QuestionSettingsSchema), // the settings of the question of the statement
	statementSettings: optional(StatementSettingsSchema), // the settings of the statement
	joined: optional(array(CreatorSchema)), // the joined users of the statement
	hide: optional(boolean()), // if true, the statement is hidden
	mergedInto: optional(string()), // ID of the statement this was merged into (for tracking merged proposals)
	questionnaire: optional(QuestionnaireSchema), // if a statement is a questionnaire, it will have this field
	fairDivision: optional(FairDivisionSelectionSchema), // if true, the statement is a fair division
	anchored: optional(boolean()), // if true, the statement is anchored to be represented in the evaluation.
	randomSeed: optional(number()), // an optional random seed for the statement
	versionControl: optional(object({
		// Version info
		currentVersion: number(), // increments on each replacement (starts at 1)
		// Applied suggestion tracking
		appliedSuggestionId: optional(string()), // last suggestion that replaced this
		appliedAt: optional(number()),
		// Finalization info (MVP: manual only)
		finalizedBy: optional(string()), // userId
		finalizedAt: optional(number()),
		finalizedReason: optional(string()), // 'manual_approval' | 'rollback' (MVP only)
		// Admin actions
		adminEditedContent: optional(string()), // if admin modified before approval
		adminEditedAt: optional(number()),
		adminNotes: optional(string()),
	})),
});

export type Statement = InferOutput<typeof StatementSchema>;

export const StatementMetaDataSchema = object({
	lastUpdate: number(),
	numberOfMembers: optional(number()),
	numberOfEvaluators: optional(number()),
	numberOfEvaluatedStatements: optional(number()),
	numberOfFirstSuggesters: optional(number()),
	numberOfFirstEvaluators: optional(number()),
	numberOfSecondEvaluators: optional(number()),
	statementId: string(),
});

export type StatementMetaData = InferOutput<typeof StatementMetaDataSchema>;