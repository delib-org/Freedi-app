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
import { MembershipSchema, StepSchema, UserSchema } from '../user/User';
import { ResultsSettingsSchema } from '../results/Results';
import { QuestionSettingsSchema } from '../question/Question';
import {
	AgreeSchema,
	DocumentApprovalSchema,
	DocumentImportanceSchema,
} from '../agreement/Agreement';
import { StageType } from '../stage/Stage';
import { SimpleStatementSchema } from './SimpleStatement';
import { StatementSettingsSchema } from './StatementSettings';
import { UserDataSchema } from '../user/UserSettings';
import { StatementEvaluationSchema } from '../evaluation/Evaluation';

export const StatementSchema = object({
	allowAnonymousLogin: optional(boolean()),
	statement: string(),
	description: optional(string()),
	statementId: string(),
	creatorId: string(),
	creator: UserSchema,
	statementType: enum_(StatementType),
	deliberativeElement: optional(enum_(DeliberativeElement)),
	color: optional(string()),
	defaultLanguage: optional(string()),
	followMe: optional(string()),
	parentId: string(),
	parents: optional(array(string())),
	topParentId: string(),
	hasChildren: optional(boolean()),
	lastMessage: optional(string()),
	lastUpdate: number(),
	lastChildUpdate: optional(number()),
	createdAt: number(),
	pro: optional(number()),
	con: optional(number()),
	doc: optional(
		object({
			isDoc: boolean(),
			order: number(),
		})
	),
	consensus: number(),
	order: optional(number()),
	elementHight: optional(number()),
	top: optional(number()),
	votes: optional(number()),
	selections: optional(any()),
	isSelected: optional(boolean()),
	voted: optional(number()),
	totalSubStatements: optional(number()),
	membership: optional(MembershipSchema),
	maxConsensus: optional(number()),
	selected: optional(boolean()),
	results: optional(array(SimpleStatementSchema)),
	isResult: optional(boolean()),
	imagesURL: optional(
		object({
			main: optional(string()),
			more: optional(array(string())),
		})
	),
	totalEvaluators: optional(number()),
	isInMultiStage: optional(boolean()),
	documentApproval: optional(DocumentApprovalSchema),
	documentImportance: optional(DocumentImportanceSchema),
	documentAgree: optional(AgreeSchema),
	stageId: optional(nullable(string())),
	viewed: optional(
		object({
			individualViews: optional(number()),
		})
	),
	stageType: optional(enum_(StageType)),
	creatorData: optional(UserDataSchema),
	isChosen: optional(boolean()),
	chosenSolutions: optional(array(string())),
	summary: optional(string()),
	evaluation: optional(StatementEvaluationSchema),
	importanceData: optional(
		object({
			sumImportance: number(),
			numberOfUsers: number(),
			numberOfViews: number(),
		})
	),
	documentSettings: optional(
		object({
			parentDocumentId: string(),
			order: number(),
			type: enum_(DocumentType),
			isTop: boolean(),
		})
	),
	resultsSettings: optional(ResultsSettingsSchema),
	steps: optional(
		object({
			currentStep: StepSchema,
			allSteps: optional(array(StepSchema)),
		})
	),
	questionSettings: optional(QuestionSettingsSchema),
	statementSettings: optional(StatementSettingsSchema),
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
