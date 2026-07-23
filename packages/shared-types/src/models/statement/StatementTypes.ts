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
	picklist,
	InferOutput,
	pipe,
	transform,
} from 'valibot';
import {
	DeliberativeElement,
	DocumentType,
	StatementType,
	DialogicType,
	EvidenceRelation,
	EvidenceStatus,
	Visibility,
} from '../TypeEnums';
import { Role } from '../user/UserSettings';
import { CreatorSchema, MembershipSchema, StepSchema, UserSchema } from '../user/User';
import { ResultsSettingsSchema } from '../results/ResultsSettings';
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
import {
	StatementEvaluationSchema,
	StatementEvaluationSettingsSchema,
} from '../evaluation/Evaluation';
import { QuestionnaireSchema } from '../questionnaire/questionnaireModel';
import { FairDivisionSelectionSchema } from './fairDivision';
import { VotingSettingsSchema } from '../vote/votingModel';
import { EvidenceType } from '../evidence/evidenceModel';
import { ParagraphType, ListTypeSchema } from '../paragraph/paragraphModel';
import { PopperHebbianScoreSchema } from '../popper/popperTypes';
import { ParagraphSchema } from '../paragraph/paragraphModel';
import { StatementLockedSchema } from '../question/CompoundQuestionTypes';
import { SourceApp } from '../engagement/SourceApp';

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
	description: optional(string()), // auto-generated preview from child paragraph sub-statements (~200 chars)
	brief: optional(string()), // admin-authored context/brief for the statement
	isTitleQuestion: optional(boolean()), // if true, responses detected as questions are suggested as options instead
	/** @deprecated Legacy embedded rich-body. Canonical body = child Statements with statementType === paragraph (see createParagraphChildStatement + @freedi/shared-utils). Kept for backward-compatible reads; new code must not write it. */
	paragraphs: optional(array(ParagraphSchema)), // the paragraphs of the statement (rich text content)
	reasoning: optional(string()), // explanation/reasoning for the statement (used in suggestions)
	statementId: string(), // the id of the statement
	creatorId: string(), // the id of the creator of the statement
	creator: UserSchema, // the creator of the statement
	statementType: enum_(StatementType), // the type of the statement: group, stage, option, chat-message, etc.
	blockType: optional(enum_(ParagraphType)), // for paragraph child-statements (statementType === paragraph): visual block type (h1..h6, paragraph, li). Distinct from the nested doc.paragraphType used by Sign app.
	evidence: optional(
		object({
			evidenceType: optional(enum_(EvidenceType)), // the type of evidence: data, testimony, argument, anecdote, fallacy
			support: optional(number()), // the strength of support of the evidence (-1 to 1): -1 = strongly challenges, 0 = neutral, 1 = strongly supports
			helpfulCount: optional(number()), // the number of helpful votes for the evidence
			notHelpfulCount: optional(number()), // the number of not-helpful votes for the evidence
			netScore: optional(number()), // the net score of the evidence (helpfulCount - notHelpfulCount)
			evidenceWeight: optional(number()), // calculated weight based on evidence type and vote quality (can be > 1.0)
		}),
	),
	deliberativeElement: optional(enum_(DeliberativeElement)), // the deliberative element of the statement: need, explanation, question, suggestion, conclusion, etc.
	color: optional(string()), // it is a color assigned to a statement
	defaultLanguage: optional(string()), // the default language of the statement
	forceLanguage: optional(boolean()), // if true, force the language of the statement
	followMe: optional(string()),
	powerFollowMe: optional(string()), // when set, auto-redirects non-admin users to this path
	joinFollowMe: optional(string()), // join-app-only follow-me; isolated from `powerFollowMe` so a main-app session with power-follow active can't fight the join admin's broadcasts
	parentId: string(), // the id of the parent statement
	parents: optional(array(string())), // the list of all parents of the statement
	topParentId: string(), // the id of the top parent of the statement
	hasChildren: optional(boolean()), // if true, the user can add sub statements to the statement
	lastMessage: optional(
		object({
			message: string(),
			creator: string(),
			createdAt: number(),
		}),
	), // the last message in the statement
	lastSubStatements: optional(array(SimpleStatementSchema)), // the last sub-statements of the statement
	lastUpdate: number(), // the last update of the statement
	lastChildUpdate: optional(number()), // the last update of the last child of the statement
	createdAt: number(), // the creation date of the statement
	pro: optional(number()), // the number of supporters of the statement
	con: optional(number()), // the number of opponents of the statement
	doc: optional(
		object({
			isDoc: optional(boolean()),
			order: optional(number()),
			isOfficialParagraph: optional(boolean()), // Sign app: marks standing paragraphs (vs suggestions)
			// Paragraph type info (for official paragraphs converted from embedded array)
			paragraphType: optional(enum_(ParagraphType)), // h1, h2, paragraph, li, etc.
			listType: optional(ListTypeSchema), // ul or ol (for list items)
			contentHtml: optional(string()), // Inline-formatted paragraph content (<strong>/<em> only); `statement` stays plain text
			imageUrl: optional(string()), // Firebase Storage URL for image paragraphs
			imageAlt: optional(string()), // Alt text for accessibility
			imageCaption: optional(string()), // Optional caption for images

			// Removal tracking
			removed: optional(boolean()), // true if paragraph was auto-removed by consensus

			// Insertion point fields
			isInsertionPoint: optional(boolean()), // true if this is an insertion point (not a real paragraph)
			insertionBetween: optional(
				object({
					beforeParagraphId: optional(string()), // null/undefined = beginning of document
					afterParagraphId: optional(string()), // null/undefined = end of document
				}),
			),
			consumed: optional(boolean()), // true after a suggestion on this insertion point was accepted

			versionControlSettings: optional(
				object({
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

					// Consensus-driven action settings
					consensusSettings: optional(
						object({
							removalThreshold: optional(number()), // default: -0.4
							additionThreshold: optional(number()), // default: 0.4
							minEvaluators: optional(number()), // default: 3
						}),
					),

					// Tracking
					lastSettingsUpdate: optional(number()),
					updatedBy: optional(string()), // userId
				}),
			),
		}),
	), // I think it is relevant to Freedi-sign
	numberOfOptions: optional(number()), // the number of options of the statement
	consensus: pipe(
		nullable(number()),
		transform((v) => v ?? 0),
	), // the consensus of the statement
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
	integratedInto: optional(string()), // cluster statement ID this original was merged into (set with hide:true by performIntegration; cleared on reverse)
	derivedFromStatementId: optional(string()), // origin statement when this option was synthesized by a pipeline (e.g. compound-response decomposition)
	derivedByPipeline: optional(picklist(['topic-cluster', 'synthesis'])), // identifies the pipeline that created this synthetic option (used for idempotent rerun)
	synthesisRunId: optional(string()), // id of the run that produced this derived option — enables surgical per-run cleanup & provenance
	synthesisMechanism: optional(picklist(['bulk', 'live-spawn', 'live-attach'])), // which synthesis path created this derived option
	titleLockedByCreator: optional(boolean()), // when true, the creator has manually edited the cluster title — suppress AI regeneration
	condensationStatus: optional(
		object({
			// set on parent questions when the grouping pipeline runs
			lastRunAt: optional(number()),
			lastRunBy: optional(string()), // userId of the creator, or 'scheduler' for auto runs
			isStale: optional(boolean()), // marked true when new suggestions arrive, cleared after run
			inputCount: optional(number()), // number of candidate originals in the last run
			producedGroupCount: optional(number()), // number of clusters produced by the last run
			level: optional(picklist(['loose', 'balanced', 'tight'])),
			error: optional(string()),
		}),
	),
	synthesisRun: optional(
		object({
			// set on parent questions when bulk idea synthesis runs (see docs/clusters and synthesis/clustering-and-synthesis-paper.md §5)
			lastRunAt: optional(number()),
			lastRunBy: optional(string()), // userId of the admin who triggered the run
			threshold: optional(number()), // cosine candidate threshold used (e.g. 0.90)
			filters: optional(
				object({
					// engagement pre-filters applied for this run
					minAverage: optional(number()),
					minConsensus: optional(number()),
					minEvaluators: optional(number()),
				}),
			),
			inputCount: optional(number()), // number of options surviving pre-filter
			candidateEdgeCount: optional(number()), // edges produced by ANN before LLM verdict
			groupsCreated: optional(number()), // number of synthesis groups committed by the admin
			runId: optional(string()), // synthesisRuns subcollection doc id, for audit drill-down
			status: optional(picklist(['building-graph', 'awaiting-confirmation', 'complete', 'error'])),
			error: optional(string()),
		}),
	),
	creatorOverrides: optional(
		object({
			// set on parent questions — manual reassignments by the creator
			// map of originalStatementId → clusterStatementId | '__standalone__'
			// the pipeline respects these on re-run instead of re-grouping them automatically
			assignments: optional(any()), // Record<string, string> — validated at call sites
			updatedAt: optional(number()),
		}),
	),
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
		}),
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
		}),
	),
	stageSelectionType: optional(enum_(StageSelectionType)), // the type of the stage selection of the statement
	creatorData: optional(UserDataSchema), // the creator data of the statement
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
		}),
	),
	documentSettings: optional(
		//used for Freedi-sign
		object({
			parentDocumentId: string(), // the id of the parent document of the statement
			order: number(), // the order of the statement relative to its siblings
			type: enum_(DocumentType), // the type of the document
			isTop: boolean(), // if true, the statement is a top-statement
		}),
	),
	resultsSettings: optional(ResultsSettingsSchema), // the settings of the results of the statement
	steps: optional(
		// steps are used to generate a solution using several steps, like suggestion, and then voting
		object({
			currentStep: StepSchema,
			allSteps: optional(array(StepSchema)),
		}),
	),
	votingSettings: optional(VotingSettingsSchema), // the settings of the voting of the statement
	questionSettings: optional(QuestionSettingsSchema), // the settings of the question of the statement
	statementSettings: optional(StatementSettingsSchema), // the settings of the statement
	/** Activists — users who joined this option to help it happen.
	 *  During `joinResolution.phase === 'intent'` these are conditional intents;
	 *  after resolve they are firm commitments. */
	joined: optional(array(CreatorSchema)),
	/** Organizers — users who coordinate / lead the option's team. Parallel to
	 *  `joined`, always firm, never cleared by resolve, never counted toward
	 *  `minJoinMembers`. */
	organizers: optional(array(CreatorSchema)),
	/** Post-resolve status. Undefined before resolve. Set by `fn_resolveJoinIntents`. */
	joinStatus: optional(picklist(['activated', 'failed'])),
	hide: optional(boolean()), // if true, the statement is hidden
	/** If true, admin-promoted: always shown in Join app even if below resultsSettings cutoff. */
	forceShow: optional(boolean()),
	/** The role of the user who created this statement. Set to Role.admin for
	 *  organizer suggestions created from the Join app admin UI — these render
	 *  in a separate "Organizer suggestions" section and carry a badge. */
	creatorRole: optional(enum_(Role)),
	isDocument: optional(boolean()), // if true, this statement is treated as a document in Freedi-sign (allows options to be signable)
	mergedInto: optional(string()), // ID of the statement this was merged into (for tracking merged proposals)
	replyTo: optional(
		object({
			// reference to the message this is a reply to (chat view threading)
			statementId: string(),
			statement: string(), // text preview of the replied-to message
			creatorDisplayName: string(), // display name of the original author
		}),
	),
	// ===== Dialectical Chat app (apps/chat) =====
	// All optional + denormalized for SSR/UI. Authoritative verdict history lives
	// in the `evidenceVerdicts/{statementId}/{scorerVersion}` subcollection.
	dialecticType: optional(enum_(DialogicType)), // polarity of an evidence node; 'standard' on chatter
	dialecticSnapshot: optional(boolean()), // archived revision snapshot; tree-builder skips
	isRoot: optional(boolean()), // true on a conversation root (enables the discovery query)
	visibility: optional(enum_(Visibility)), // root-authoritative; denormalized to every node
	memberIds: optional(array(string())), // private only — uids allowed to read the subtree
	// active evidence verdict (option/evidence nodes):
	relation: optional(enum_(EvidenceRelation)),
	evidenceClass: optional(string()),
	effectiveWeight: optional(number()), // [0,1] applied in noisy-OR
	evidenceConfidence: optional(number()), // [0,1]
	evidenceStatus: optional(enum_(EvidenceStatus)), // drives the "evaluating…" chip
	activeScorerVersion: optional(string()),
	corroborationScore: optional(number()), // [0,1] C — option/evidence only
	// question aggregates (question nodes only):
	optionCount: optional(number()),
	leadingOptionId: optional(string()),
	convergenceIndex: optional(number()), // [0,1]
	lastActivityAt: optional(number()),
	questionnaire: optional(QuestionnaireSchema), // if a statement is a questionnaire, it will have this field
	fairDivision: optional(FairDivisionSelectionSchema), // if true, the statement is a fair division
	anchored: optional(boolean()), // if true, the statement is anchored to be represented in the evaluation.
	randomSeed: optional(number()), // an optional random seed for the statement
	locked: optional(StatementLockedSchema), // generic locking: any admin can lock a statement
	sourceApp: optional(enum_(SourceApp)), // which app created this statement: main, sign, mass-consensus, flow
	versionControl: optional(
		object({
			// Version info
			currentVersion: number(), // increments on each replacement (starts at 1)
			// Applied suggestion tracking
			appliedSuggestionId: optional(string()), // last suggestion that replaced this
			appliedAt: optional(number()),
			// History entry tracking (for archived versions)
			replacedBy: optional(string()), // statementId of the suggestion that replaced this
			replacedAt: optional(number()), // timestamp when replaced
			// Finalization info (MVP: manual only)
			finalizedBy: optional(string()), // userId
			finalizedAt: optional(number()),
			finalizedReason: optional(string()), // 'manual_approval' | 'rollback' (MVP only)
			finalized: optional(boolean()), // true if this suggestion was finalized
			// Admin actions
			adminEditedContent: optional(string()), // if admin modified before approval
			adminEditedAt: optional(number()),
			adminNotes: optional(string()),
			// Suggestion versioning (for preservation on replacement)
			forVersion: optional(number()), // For suggestions: which paragraph version this was an alternative for
			promotedToVersion: optional(number()), // For winning suggestions: which version number they became
			promotedAt: optional(number()), // Timestamp when promoted to official
			evaluationSnapshot: optional(
				object({
					// Snapshot of evaluation state at time of archival
					numberOfProEvaluators: optional(number()),
					numberOfConEvaluators: optional(number()),
					numberOfEvaluators: optional(number()),
					consensus: optional(number()),
				}),
			),
		}),
	),
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
