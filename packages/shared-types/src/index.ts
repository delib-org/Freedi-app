// Base types and utilities
export {
  StatementType,
  DeliberativeElement,
  QuestionStage,
  Access,
  membersAllowed,
  QuestionType,
  QuestionStagesType,
  DocumentType,
  DeliberationType,
  StepType,
  Screen,
  SortType,
  QuestionStep,
  ThemeStyle,
  DialogicType,
  EvidenceRelation,
  EvidenceStatus,
  Visibility
} from "./models/TypeEnums";
export { isMember, maxKeyInObject, getRandomUID } from "./models/TypeUtils";
export { functionConfig } from "./models/ConfigFunctions";

// Agreement models
export type {
  Agreement,
  AgreeDisagree,
  Agree,
  Importance,
  DocumentApproval,
  DocumentImportance
} from "./models/agreement/Agreement";

export {
  AgreementSchema,
  AgreeDisagreeSchema,
  AgreeSchema,
  ImportanceSchema,
  DocumentApprovalSchema,
  DocumentImportanceSchema,
  AgreeDisagreeEnum
} from "./models/agreement/Agreement";

// Approval models
export type { Approval } from "./models/approval/Approval";
export { ApprovalSchema } from "./models/approval/Approval";

// Suggestion models
export type { Suggestion, TypingStatus } from "./models/suggestion/suggestionModel";
export { SuggestionSchema, TypingStatusSchema } from "./models/suggestion/suggestionModel";

// Refinement models
export type { RefinementState, RefinementPhase } from "./models/suggestion/refinementModel";
export { RefinementStateSchema, RefinementPhaseEnum } from "./models/suggestion/refinementModel";

// ChoseBy models
export type {
  ChoseBy
} from "./models/choseBy/ChoseByTypes";

export {
  ChoseBySchema,
  CutoffType,
  ChoseByEvaluationType,
  defaultChoseBySettings
} from "./models/choseBy/ChoseByTypes";

// Document models
export type {
  DocumentSigns,
  Signature
} from "./models/document/index";

export {
  DocumentSignsSchema,
  SignatureSchema,
  SignatureType
} from "./models/document/index";

// Evaluation models
export type {
  Evaluation,
  Evaluator,
  StatementEvaluation,
  StatementEvaluationSettings,
  UserEvaluation,
  UserEvaluationSchema
} from "./models/evaluation/Evaluation";

// Cluster evaluation provenance (grouped suggestions feature)
export type { ClusterEvaluationLink } from "./models/evaluation/ClusterEvaluationLink";
export {
  ClusterEvaluationLinkSchema,
  getClusterEvaluationLinkId,
} from "./models/evaluation/ClusterEvaluationLink";

export {
  EvaluationSchema,
  EvaluatorSchema,
  StatementEvaluationSchema,
  StatementEvaluationSettingsSchema,
  SelectionFunction,
  EvaluationUI
} from "./models/evaluation/Evaluation";

// Invitation models
export type { Invitation } from "./models/invitation/Invitation";
export { InvitationSchema } from "./models/invitation/Invitation";

// Admin Invitation models
export type {
  AdminInvitation,
  ViewerLink,
  DocumentCollaborator
} from "./models/adminInvitation/AdminInvitation";

export {
  AdminInvitationSchema,
  ViewerLinkSchema,
  DocumentCollaboratorSchema,
  AdminPermissionLevel,
  AdminInvitationStatus,
  hasPermissionLevel,
  INVITATION_EXPIRY
} from "./models/adminInvitation/AdminInvitation";

// Join Delegate models (per-question solution-editing delegation in the join app)
export type {
  JoinDelegatePermissions,
  JoinDelegateInvitation,
  JoinDelegate,
} from "./models/joinDelegate";

export {
  JoinDelegateInvitationStatus,
  JoinDelegatePermissionsSchema,
  JoinDelegateInvitationSchema,
  JoinDelegateSchema,
  JOIN_DELEGATE_INVITE_EXPIRY_MS,
  getJoinDelegateId,
} from "./models/joinDelegate";

// MassConsensus models
export type {
  MassConsensusMember,
  MassConsensusProcess,
  MassConsensusStage,
  ExplanationConfig,
  PostActionConfig,
  ExplanationDisplayMode
} from "./models/massConsensus/massConsensusModel";

export {
  MassConsensusPageUrls,
  MassConsensusPageUrlsSchema,
  MassConsensusMemberSchema,
  MassConsensusProcessSchema,
  MassConsensusStageSchema,
  MassConsensusStageType,
  MassConsensusStageTypeSchema,
  ExplanationConfigSchema,
  PostActionConfigSchema,
  ExplanationDisplayModeSchema,
  defaultStageTemplates
} from "./models/massConsensus/massConsensusModel";

// Notification models
export type { NotificationType, ReadContext, NotificationReadStatusType } from "./models/notification/Notification";
export { NotificationSchema, NotificationReadStatusSchema } from "./models/notification/Notification";
export type {
  NotificationSettings,
  QuietHours,
  ChannelSwitches,
  PerAppNotificationSettings,
} from "./models/notification/NotificationSettings";
export {
  NotificationSettingsSchema,
  QuietHoursSchema,
  ChannelSwitchesSchema,
  PerAppNotificationSettingsSchema,
  createDefaultNotificationSettings,
} from "./models/notification/NotificationSettings";

// Question models
export type { QuestionSettings } from "./models/question/QuestionType";
export { QuestionSettingsSchema } from "./models/question/QuestionType";

// Compound Question models
export type {
  CompoundSettings,
  StatementLocked,
  LockedTitle,
  SignDocumentLink,
  PhaseHistoryEntry,
} from "./models/question/CompoundQuestionTypes";

export {
  CompoundPhase,
  CompoundSettingsSchema,
  StatementLockedSchema,
  LockedTitleSchema,
  SignDocumentLinkSchema,
  PhaseHistoryEntrySchema,
} from "./models/question/CompoundQuestionTypes";

// Results models
export type { Results, ResultsSettings } from "./models/results/Results";
export { ResultsBy, CutoffBy, ResultsSettingsSchema, defaultResultsSettings } from "./models/results/Results";

// Stage models
export { StageSelectionType } from "./models/stage/stageTypes";

// Paragraph models
export type {
  Paragraph,
  ListType
} from "./models/paragraph/paragraphModel";

export {
  ParagraphSchema,
  ListTypeSchema,
  ParagraphType
} from "./models/paragraph/paragraphModel";

// Statement models
export type {
  SimpleStatement
} from "./models/statement/SimpleStatement";

export {
  SimpleStatementSchema,
} from "./models/statement/SimpleStatement";
export {
  statementToSimpleStatement
} from "./models/statement/statementToSimple";
export type {
  StatementSettings,
  JoinFormField,
  JoinFormFieldType,
  JoinFormDestination,
  JoinFormConfig,
  JoinResolutionPhase,
  JoinResolutionConfig,
  ActivationThreshold,
  CondensationConfig,
  CondensationLevel,
  CondensationSurfaceVisibility,
  CondensationVisibility,
  ViewLayers,
  QuestionStatus
} from "./models/statement/StatementSettings";

export {
  StatementSettingsSchema,
  evaluationType,
  JoinFormFieldSchema,
  JoinFormFieldTypeSchema,
  JoinFormDestinationSchema,
  JoinFormConfigSchema,
  JoinResolutionPhaseSchema,
  JoinResolutionConfigSchema,
  ActivationThresholdSchema,
  CondensationConfigSchema,
  CondensationLevelSchema,
  CondensationSurfaceVisibilitySchema,
  CondensationVisibilitySchema,
  ViewLayersSchema,
  QuestionStatusSchema
} from "./models/statement/StatementSettings";

export type {
  JoinFormSubmission
} from "./models/statement/JoinFormSubmission";

export {
  JoinFormSubmissionSchema,
  JOIN_FORM_SUBMISSIONS_SUBCOLLECTION
} from "./models/statement/JoinFormSubmission";

export type {
  JoinFormSubmissionHistoryEntry,
  JoinFormSubmissionHistoryOperation,
  JoinFormSubmissionHistoryRole,
  JoinFormSubmissionHistoryRetention,
  JoinFormMembershipSnapshot
} from "./models/statement/JoinFormSubmissionHistory";

export {
  JoinFormSubmissionHistoryEntrySchema,
  JoinFormSubmissionHistoryOperationSchema,
  JoinFormSubmissionHistoryRoleSchema,
  JoinFormSubmissionHistoryRetentionSchema,
  JoinFormMembershipSnapshotSchema,
  JOIN_FORM_SUBMISSIONS_HISTORY_COLLECTION,
  JOIN_FORM_SUBMISSIONS_HISTORY_RETENTION_DAYS,
  getJoinFormSubmissionHistoryId
} from "./models/statement/JoinFormSubmissionHistory";

export type {
  JoinResolutionUser,
  JoinResolutionUserStatus
} from "./models/statement/JoinResolutionUser";

export {
  JoinResolutionUserSchema,
  JoinResolutionUserStatusSchema,
  JOIN_RESOLUTION_USERS_SUBCOLLECTION
} from "./models/statement/JoinResolutionUser";
export type {
  StatementSubscription,
  StatementView,
  WaitingMember
} from "./models/statement/StatementSubscription";

export {
  StatementSubscriptionSchema,
  getStatementSubscriptionId,
  StatementViewSchema,
  WaitingMemberSchema
} from "./models/statement/StatementSubscription";
export type {
  Statement,
  LastMessage,
  StatementMetaData
} from "./models/statement/StatementTypes";

export {
  LastMessageSchema,
  StatementSchema,
  StatementMetaDataSchema
} from "./models/statement/StatementTypes";
export {
  createBasicStatement,
  createStatementObject,
  createParagraphStatement,
  createParagraphChildStatement,
  statementToParagraph,
  paragraphToFactoryParams,
  createSuggestionStatement,
  defaultStatementSettings
} from "./models/statement/StatementUtils";
export type { CreateStatementParams, CreateParagraphChildParams } from "./models/statement/StatementUtils";

// User models
export type {
  User,
  Membership,
  Step,
  Creator
} from "./models/user/User";

export {
  UserSchema,
  MembershipSchema,
  StepSchema,
  CreatorSchema,
  LoginType
} from "./models/user/User";
export type {
  UserSettings,
  UserData
} from "./models/user/UserSettings";

export {
  Role,
  Languages,
  userSettingsSchema,
  UserDataSchema
} from "./models/user/UserSettings";

export {
  createSubscription,
  updateArray
} from "./controllers/helpers";

// Vote models
export type { Vote, VotingSettings } from "./models/vote/votingModel";
export { VoteSchema, getVoteId, VotingSettingsSchema } from "./models/vote/votingModel";

export type { StatementSnapShot } from "./models/statement/StatementSnapShot";
export { statementSnapShotSchema } from "./models/statement/StatementSnapShot";
export type { StatementHistoryEntry, StatementHistorySource } from "./models/statement/StatementHistoryEntry";
export { StatementHistoryEntrySchema, StatementHistorySourceSchema } from "./models/statement/StatementHistoryEntry";

export type { UserDemographicQuestion, DemographicOption, DemographicQuestionScope, ExcludedInheritedDemographics } from "./models/userDemographic/userDemographicModel";
export {
  UserDemographicQuestionType, UserDemographicQuestionSchema,
  DemographicOptionSchema, DemographicQuestionScopeSchema, ExcludedInheritedDemographicsSchema } from "./models/userDemographic/userDemographicModel";

export { Collections } from "./models/collections/collectionsModel";

export type {
  PolarizationIndex,
  AxesItem,
  DemographicGroup
} from "./models/polarizationIndex/polarizationIndexModel";

export {
  PolarizationIndexSchema,
  AxesItemSchema,
  DemographicGroupSchema
} from "./models/polarizationIndex/polarizationIndexModel";

export type {
  Online
} from "./models/statement/online";

export {
  OnlineSchema
} from "./models/statement/online";

export type {
  StatementDeletion
} from "./models/statement/StatementDeletion";

export {
  StatementDeletionSchema
} from "./models/statement/StatementDeletion";


export type {
  Questionnaire,
  QuestionnaireQuestion
} from "./models/questionnaire/questionnaireModel";

export {
  QuestionnaireSchema,
  QuestionnaireQuestionSchema
} from "./models/questionnaire/questionnaireModel";

export type {
  FairDivisionSelection,
  FairDivisionUserSelection
} from "./models/statement/fairDivision";

export {
  FairDivisionSelectionSchema,
  FairDivisionUserSelectionSchema
} from "./models/statement/fairDivision";

export type { Feedback } from "./models/feedback/feedbackModel";
export { FeedbackSchema } from "./models/feedback/feedbackModel";


export { RoomSchema, RoomSettingsSchema, RoomParticipantSchema, DemographicTagSchema } from "./models/rooms/roomsModel";
export type { Room, RoomSettings, RoomParticipant, DemographicTag } from "./models/rooms/roomsModel";

// Survey models
export type {
  Survey,
  SurveySettings,
  SurveyProgress,
  SurveyLogo,
  QuestionOverrideSettings,
  SurveyDemographicPage,
  SurveyDemographicQuestion,
  SurveyDemographicAnswer,
  SurveyExplanationPage,
} from "./models/survey/surveyModel";
export {
  SurveySchema,
  SurveySettingsSchema,
  SurveyProgressSchema,
  SurveyLogoSchema,
  SurveyStatus,
  SurveyStatusSchema,
  SuggestionMode,
  SuggestionModeSchema,
  DisplayMode,
  DisplayModeSchema,
  DEFAULT_SURVEY_SETTINGS,
  QuestionOverrideSettingsSchema,
  DEFAULT_QUESTION_OVERRIDE_SETTINGS,
  SurveyDemographicPageSchema,
  SurveyDemographicQuestionSchema,
  SurveyDemographicAnswerSchema,
  SurveyExplanationPageSchema,
} from "./models/survey/surveyModel";

// MAD Calculation utilities
export type { MadResult } from "./utils/madCalculation";
export {
  calcMadAndMean,
  calculateAgreementOnEvaluation,
  meetsKAnonymity,
  interpretDivergence,
  interpretAgreementOnEvaluation,
  DEMOGRAPHIC_CONSTANTS,
} from "./utils/madCalculation";

// Consensus Calculation utilities
export {
  FLOOR_STD_DEV,
  BAYESIAN_PRIOR_K,
  CONFIDENCE_ALPHA,
  tCritical,
  calcSmoothedSEM,
  calcStandardError,
  calcAgreement,
  calcBinaryConsensus,
  calcMeanSentiment,
  DEFAULT_REMOVAL_THRESHOLD,
  DEFAULT_ADDITION_THRESHOLD,
  DEFAULT_MIN_EVALUATORS,
  meetsRemovalThreshold,
  meetsAdditionThreshold,
  DEFAULT_SAMPLING_QUALITY,
  CONFIDENCE_CALIBRATION_CONSTANT,
  calcAgreementIndex,
  calcLikeMindedness,
  calcConfidenceIndex,
} from "./utils/consensusCalculation";

// Strategic Export (AI-ready report) models
export type {
  StrategicExportRequest,
  StrategicExportResponse,
  StrategicExportMetadata,
  StrategicExportSchema,
  EvaluationAggregate,
  AggregateMember,
  DemographicSlice,
  AggregatedSuggestion,
  TopicGroup,
  DemographicAnswerCount,
  DemographicQuestionSummary,
} from "./models/strategicExport/strategicExportModel";

// Topic-Grouped Results Export
export type {
  AgreementShape,
  AgreementHistogram,
  SolutionEvaluationStats,
  SynthesisProvenance,
  RegenerationStatus,
  SynthesizedSolutionEntry,
  StandaloneSolutionEntry,
  SolutionEntry,
  TopicAgreement,
  TopicBlock,
  CoalitionEntry,
  QuestionAgreement,
  ExportThresholds,
  ExportSummary,
  FilteredOutBlock,
  ResultsExportMeta,
  ResultsExport,
} from "./models/results-export/ResultsExport";

export { RESULTS_EXPORT_SCHEMA_VERSION } from "./models/results-export/ResultsExport";

// Topic-cluster pipeline cache models
export type {
  TaxonomyCategory,
  ClusteringTaxonomyCache,
  NormalizationAction,
  ClusteringNormalizationCache,
} from "./models/clustering/clusteringCacheModel";

export {
  TaxonomyCategorySchema,
  ClusteringTaxonomyCacheSchema,
  NormalizationActionSchema,
  ClusteringNormalizationCacheSchema,
} from "./models/clustering/clusteringCacheModel";

// Embedding models
export type {
  StatementEmbedding,
  SimilarityResult,
  EmbeddingBatchRequest,
  EmbeddingBatchResult,
  EmbeddingStatusReport,
  FindSimilarResponse,
  EmbeddingStatus,
} from "./models/embedding/embeddingModel";

export {
  StatementEmbeddingSchema,
  SimilarityResultSchema,
  EmbeddingBatchRequestSchema,
  EmbeddingBatchResultSchema,
  EmbeddingStatusReportSchema,
  FindSimilarResponseSchema,
  EmbeddingStatusSchema,
  SimilaritySearchMethodSchema,
  SimilaritySearchMethod,
  EMBEDDING_CONFIG,
  hasValidEmbedding,
  validateEmbeddingDimensions,
} from "./models/embedding/embeddingModel";

// Version models
export type {
  DocumentVersion,
  VersionChange,
  ChangeSource,
  VersionGenerationSettings,
  DocumentVersioningSettings,
  DocumentFeedbackSummary,
} from "./models/version/versionModel";

export {
  DocumentVersionSchema,
  VersionChangeSchema,
  ChangeSourceSchema,
  VersionGenerationSettingsSchema,
  DocumentVersioningSettingsSchema,
  DocumentFeedbackSummarySchema,
  VersionStatus,
  ChangeDecision,
  ChangeType,
  ChangeSourceType,
  RevisionStrategy,
  DEFAULT_VERSION_GENERATION_SETTINGS,
  DEFAULT_VERSIONING_SETTINGS,
  getVersionId,
  getChangeId,
  calculateImpact,
  hasSignificantImpact,
  sortChangesByImpact,
  filterSignificantChanges,
} from "./models/version/versionModel";

// Evidence models
export { EvidenceType } from "./models/evidence/evidenceModel";

// Popper Hebbian models
export type { PopperHebbianScore } from "./models/popper/popperTypes";
export { PopperHebbianScoreSchema } from "./models/popper/popperTypes";

// Replacement Queue models (paragraph version control MVP)
export type {
  PendingReplacement,
  VersionControlAudit,
  VersionArchive,
  DocumentActionHistory,
} from "./models/version/replacementQueueModel";

export {
  PendingReplacementSchema,
  VersionControlAuditSchema,
  VersionArchiveSchema,
  DocumentActionHistorySchema,
  ReplacementQueueStatus,
  AuditAction,
  DocumentActionType,
} from "./models/version/replacementQueueModel";

// Coherence models (document coherence engine)
export type {
  IncoherenceRecord,
  ParagraphReasoningPath,
  FeedbackAddressed,
  CoherenceAnalysisResult,
} from "./models/version/coherenceModel";

export {
  IncoherenceRecordSchema,
  ParagraphReasoningPathSchema,
  FeedbackAddressedSchema,
  IncoherenceType,
  IncoherenceSeverity,
  ParagraphAction,
  getCoherenceRecordId,
} from "./models/version/coherenceModel";

// Engagement models
export {
  // Enums
  NotificationChannel,
  NotificationFrequency,
  NotificationTriggerType,
  SourceApp,
  CreditAction,
  HookPhase,
  ActionLevel,
  NotificationQueueStatus,
  EngagementLevel,
  LEVEL_THRESHOLDS,
  LEVEL_NAMES,

  // Schemas
  NotificationQueueItemSchema,
  CreditRuleSchema,
  CreditTransactionSchema,
  UserEngagementSchema,
  BadgeSchema,
  DigestPreferencesSchema,
  StreakDataSchema,
  BranchPreferenceSchema,
  DigestItemSchema,
  DigestContentSchema,

  // Pure functions
  canPerformAction,
  getRequiredLevel,
  ACTION_LEVEL_REQUIREMENTS,
  APP_DEEP_LINKS,
  buildDeepLink,
} from "./models/engagement";

export type {
  NotificationQueueItem,
  CreditRule,
  CreditTransaction,
  UserEngagement,
  Badge,
  DigestPreferences,
  StreakData,
  BranchPreference,
  DigestItem,
  DigestContent,
} from "./models/engagement";

// Analytics models (admin stats)
export type { AdminStatDoc, StatsPeriodType } from "./models/analytics";
export { getAdminStatDocId } from "./models/analytics";

// Content moderation
export type { ModerationLog } from "./models/moderation/moderationModel";
export { ModerationLogSchema, ModerationCategory } from "./models/moderation/moderationModel";

// Research logging
export type { ResearchLog, ResearchCategory, ResearchConsent } from "./models/researchLog";
export {
  ResearchLogSchema,
  ResearchAction,
  ResearchActionSchema,
  getResearchLogId,
  ResearchConsentSchema,
  getResearchConsentId,
  bucketLoginCount,
  normalizeScreenPath,
  RESEARCH_ACTION_CATEGORY,
  RESEARCH_ACTION_LABELS,
  RESEARCH_CATEGORY_COLORS,
  RESEARCH_GLOBAL_ACTIONS,
  getResearchCategory,
  getResearchActionLabel,
} from "./models/researchLog";