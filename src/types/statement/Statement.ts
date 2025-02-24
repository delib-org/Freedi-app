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
import { MembershipSchema, StepSchema, CreatorSchema } from '../user/User';
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
import { StatementEvaluationSchema } from '../evaluation/Evaluation';

export const StatementSchema = object({
	allowAnonymousLogin: optional(boolean()),
	chosenSolutions: optional(array(string())),
	color: optional(string()),
	con: optional(number()),
	consensus: number(),
	createdAt: number(),
	creator: CreatorSchema,
	deliberativeElement: optional(enum_(DeliberativeElement)),
	description: optional(string()),
	doc: optional(
		object({
			isDoc: boolean(),
			order: number(),
		})
	),
	documentAgree: optional(AgreeSchema),
	documentApproval: optional(DocumentApprovalSchema),
	documentImportance: optional(DocumentImportanceSchema),
	documentSettings: optional(
		object({
			isTop: boolean(),
			order: number(),
			parentDocumentId: string(),
			type: enum_(DocumentType),
		})
	),
	elementHight: optional(number()),
	evaluation: optional(StatementEvaluationSchema),
	followMe: optional(string()),
	hasChildren: optional(boolean()),
	imagesURL: optional(
		object({
			main: optional(string()),
			more: optional(array(string())),
		})
	),
	importanceData: optional(
		object({
			numberOfUsers: number(),
			numberOfViews: number(),
			sumImportance: number(),
		})
	),
	isChosen: optional(boolean()),
	isInMultiStage: optional(boolean()),
	isResult: optional(boolean()),
	isSelected: optional(boolean()),
	lastChildUpdate: optional(number()),
	lastMessage: optional(string()),
	lastUpdate: number(),
	maxConsensus: optional(number()),
	membership: optional(MembershipSchema),
	order: optional(number()),
	parentId: string(),
	parents: optional(array(string())),
	pro: optional(number()),
	questionSettings: optional(QuestionSettingsSchema),
	results: optional(array(SimpleStatementSchema)),
	resultsSettings: optional(ResultsSettingsSchema),
	selected: optional(boolean()),
	selections: optional(any()),
	stageId: optional(nullable(string())),
	stageType: optional(enum_(StageType)),
	statement: string(),
	statementId: string(),
	statementSettings: optional(StatementSettingsSchema),
	statementType: enum_(StatementType),
	steps: optional(
		object({
			allSteps: optional(array(StepSchema)),
			currentStep: StepSchema,
		})
	),
	summary: optional(string()),
	top: optional(number()),
	topParentId: string(),
	totalEvaluators: optional(number()),
	totalSubStatements: optional(number()),
	viewed: optional(
		object({
			individualViews: optional(number()),
		})
	),
	votes: optional(number()),
	voted: optional(number()),
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
