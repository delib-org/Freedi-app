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
import { CreatorSchema, MembershipSchema, StepSchema } from '../user/User';
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
import {
	StatementEvaluationSchema,
	StatementEvaluationSettingsSchema,
} from '../evaluation/Evaluation';

/*
Statement is everything in this app. It is a statement in a chat, an option in a solution, a group, a stage, etc.
Statements are connected to each other in a tree structure, where each statement can have parentStatement, and a list of all parents.
The entity type is StatementType.

*/

export const StatementSchema = object({
	allowAnonymousLogin: optional(boolean()), // if true, allow anonymous login
	statement: string(), // the text of the statement
	description: optional(string()), // the description of the statement
	statementId: string(), // the id of the statement
	creator: CreatorSchema, // the creator of the statement
	statementType: enum_(StatementType), // the type of the statement: group, stage, option, chat-message, etc.
	deliberativeElement: optional(enum_(DeliberativeElement)), // the deliberative element of the statement: need, explanation, question, suggestion, conclusion, etc.
	color: optional(string()), // it is a color assigned to a statement
	defaultLanguage: optional(string()), // the default language of the statement
	followMe: optional(string()),
	parentId: string(), // the id of the parent statement
	parents: optional(array(string())), // the list of all parents of the statement
	topParentId: string(), // the id of the top parent of the statement
	hasChildren: optional(boolean()), // if true, the user can add sub statements to the statement
	lastMessage: optional(string()), // the last message in the statement
	lastUpdate: number(), // the last update of the statement
	lastChildUpdate: optional(number()), // the last update of the last child of the statement
	createdAt: number(), // the creation date of the statement
	pro: optional(number()), // the number of supporters of the statement
	con: optional(number()), // the number of opponents of the statement
	doc: optional(
		object({
			isDoc: boolean(),
			order: number(),
		})
	), // I think it is relevant to Freedi-sign
	consensus: number(), // the consensus of the statement
	order: optional(number()), // the order of the statement relative to its siblings
	elementHight: optional(number()), // the height of the statement. It is used for animation purposes
	top: optional(number()), // the top of the statement. It is used for animation purposes
	votes: optional(number()), // the number of votes for the statement
	selections: optional(any()), // the top-options of the statement
	isSelected: optional(boolean()), // if true, the statement is selected
	voted: optional(number()), // the number of votes for the statement
	totalSubStatements: optional(number()), // the total number of sub statements of the statement
	membership: optional(MembershipSchema), // the membership of the statement
	maxConsensus: optional(number()), // the maximum consensus of the statement
	selected: optional(boolean()), // if true, the statement is selected
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
	isChosen: optional(boolean()), // if true, the statement is chosen by a vote
	chosenSolutions: optional(array(string())), // the chosen solutions of the statement
	summary: optional(string()), // the summary of the statement - should be generated by the AI
	evaluation: optional(StatementEvaluationSchema), // the evaluation of the statement
	evaluationSettings: optional(StatementEvaluationSettingsSchema), // the evaluation settings of the statement
	importanceData: optional(
		object({
			sumImportance: number(), // the sum of the importance of the statement
			numberOfUsers: number(), // the number of users who voted for the statement
			numberOfViews: number(), // the number of views of the statement
		})
	),
	documentSettings: optional(
		//used for Freedi-sign
		object({
			parentDocumentId: string(), // the id of the parent document of the statement
			order: number(), // the order of the statement relative to its siblings
			type: enum_(DocumentType), // the type of the document
			isTop: boolean(), // if true, the statement is a top-statement
		})
	),
	resultsSettings: optional(ResultsSettingsSchema), // the settings of the results of the statement
	steps: optional(
		// steps are used to generate a solution using several steps, like suggestion, and then voting
		object({
			currentStep: StepSchema,
			allSteps: optional(array(StepSchema)),
		})
	),
	questionSettings: optional(QuestionSettingsSchema), // the settings of the question of the statement
	statementSettings: optional(StatementSettingsSchema), // the settings of the statement
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
