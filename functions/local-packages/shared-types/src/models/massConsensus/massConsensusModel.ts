import {
      array,
      object,
      string,
      enum_,
      optional,
      InferOutput,
      number,
      nullable,
      record,
      boolean,
      literal,
      union,
  } from 'valibot';

  import { CreatorSchema, LoginType } from '../user/User';

  // ============================================
  // Stage Types (can be reused multiple times)
  // ============================================
  export enum MassConsensusStageType {
      introduction = "introduction",
      userDemographics = "user-demographics",
      question = "question",
      randomSuggestions = "random-suggestions",
      topSuggestions = "top-suggestions",
      voting = "voting",
      leaveFeedback = "leave-feedback",
      thankYou = "thank-you",
      mySuggestions = "my-suggestions",
      results = "results",
      // Future stage types
      discussion = "discussion",
      prioritization = "prioritization",
      review = "review",
  }

  export const MassConsensusStageTypeSchema = enum_(MassConsensusStageType);

  // Keep for backward compatibility
  export enum MassConsensusPageUrls {
      introduction = "introduction",
      userDemographics = "user-demographics",
      initialQuestion = "initial-question",
      question = "question",
      randomSuggestions = "random-suggestions",
      topSuggestions = "top-suggestions",
      voting = "voting",
      leaveFeedback = "leave-feedback",
      thankYou = "thank-you",
      mySuggestions = "my-suggestions",
      results = "results",
  }

  export const MassConsensusPageUrlsSchema = enum_(MassConsensusPageUrls);

  // ============================================
  // Display modes for explanations
  // ============================================
  export const ExplanationDisplayModeSchema = union([
      literal('card'),
      literal('tooltip'),
      literal('modal'),
      literal('inline'),
      literal('toast'),
      literal('banner'),
      literal('drawer')
  ]);

  export type ExplanationDisplayMode = InferOutput<typeof ExplanationDisplayModeSchema>;

  // ============================================
  // Explanation Configuration
  // ============================================
  export const ExplanationConfigSchema = object({
      enabled: optional(boolean()),
      title: optional(string()),
      content: string(),
      displayMode: optional(ExplanationDisplayModeSchema),
      showOnlyFirstTime: optional(boolean()),
      dismissible: optional(boolean()),
      displayDuration: optional(number()), // milliseconds, 0 = manual dismiss
      icon: optional(string()), // icon identifier
      customClass: optional(string()), // for custom styling
  });

  export type ExplanationConfig = InferOutput<typeof ExplanationConfigSchema>;

  // ============================================
  // Post-action feedback configuration
  // ============================================
  export const PostActionConfigSchema = object({
      enabled: optional(boolean()),
      content: string(),
      successMessage: optional(string()),
      errorMessage: optional(string()),
      buttons: optional(array(object({
          label: string(),
          action: union([
              literal('continue'),           // Go to next stage
              literal('viewMySuggestions'),  // Navigate to my suggestions
              literal('addAnother'),          // Reset current stage
              literal('skip'),                // Skip to next
              literal('custom')               // Custom action
          ]),
          primary: optional(boolean()),
          customUrl: optional(string()), // For custom action
      }))),
      autoAdvance: optional(object({
          enabled: boolean(),
          delay: number(), // milliseconds
          target: optional(union([
              literal('next'),
              literal('specific'),
          ])),
          targetStageId: optional(string()), // If target is 'specific'
      })),
      displayMode: optional(ExplanationDisplayModeSchema),
  });

  export type PostActionConfig = InferOutput<typeof PostActionConfigSchema>;

  // ============================================
  // MAIN: Mass Consensus Stage (array element)
  // ============================================
  export const MassConsensusStageSchema = object({
      // Unique identifier for this stage instance
      id: string(), // e.g., "question-1", "question-2", "voting-final"

      // Stage type (can repeat)
      type: MassConsensusStageTypeSchema,

      // Display text for this specific instance
      title: optional(string()), // e.g., "First Question", "Follow-up Question"
      description: optional(string()),

      // Navigation
      url: optional(string()), // Custom URL if different from type default
      order: number(), // Position in the process

      // Conditionals
      skipable: optional(boolean()),
      required: optional(boolean()),
      condition: optional(string()), // Expression to evaluate if stage should show

      // Explanations
      beforeStage: optional(ExplanationConfigSchema),
      afterAction: optional(PostActionConfigSchema),

      // Stage-specific configuration
      config: optional(object({
          // For question stages
          questionText: optional(string()),
          maxSuggestions: optional(number()),
          minCharacters: optional(number()),
          maxCharacters: optional(number()),

          // For evaluation stages
          proposalsPerBatch: optional(number()),
          evaluationType: optional(union([
              literal('rating'),
              literal('ranking'),
              literal('comparison')
          ])),

          // For voting stages
          votingMethod: optional(union([
              literal('single'),
              literal('multiple'),
              literal('ranked')
          ])),
          maxVotes: optional(number()),

          // Generic
          timeLimit: optional(number()), // seconds
          customData: optional(record(string(), string())),
      })),

      // Tracking
      analytics: optional(object({
          trackEntry: optional(boolean()),
          trackExit: optional(boolean()),
          trackDuration: optional(boolean()),
          customEvents: optional(array(string())),
      })),
  });

  export type MassConsensusStage = InferOutput<typeof MassConsensusStageSchema>;

  // ============================================
  // Process Definition
  // ============================================
  export const MassConsensusProcessSchema = object({
      statementId: string(),
      version: string(), // Process version for migrations

      // Array of stages - the actual process flow
      stages: array(MassConsensusStageSchema),

      // Login-type specific overrides
      loginTypeOverrides: optional(record(
          enum_(LoginType),
          object({
              stageOverrides: optional(record(string(), MassConsensusStageSchema)), // stage.id -> override
              excludeStages: optional(array(string())), // stage ids to skip
              additionalStages: optional(array(MassConsensusStageSchema)), // extra stages for this login type
          })
      )),

      // Global settings
      settings: optional(object({
          explanationsEnabled: optional(boolean()),
          defaultExplanationMode: optional(ExplanationDisplayModeSchema),
          progressIndicator: optional(boolean()),
          allowBackNavigation: optional(boolean()),
          saveProgress: optional(boolean()),
          resumeFromLastStage: optional(boolean()),
          completionRedirectUrl: optional(string()),
      })),

      // Metadata
      createdAt: number(),
      updatedAt: optional(number()),
      createdBy: string(),
      updatedBy: optional(string()),
  });

  export type MassConsensusProcess = InferOutput<typeof MassConsensusProcessSchema>;

  // ============================================
  // Member tracking
  // ============================================
  export const MassConsensusMemberSchema = object({
      statementId: string(),
      lastUpdate: number(),
      email: optional(nullable(string())),
      creator: CreatorSchema,

      // Progress tracking
      progress: optional(object({
          currentStageId: string(),
          completedStages: array(object({
              stageId: string(),
              completedAt: number(),
              duration: optional(number()), // seconds spent
          })),
          seenExplanations: array(string()), // stage ids where explanation was shown
          skippedStages: optional(array(string())),
      })),

      // User preferences
      preferences: optional(object({
          dontShowExplanations: optional(boolean()),
          preferredExplanationMode: optional(ExplanationDisplayModeSchema),
      })),
  });

  export type MassConsensusMember = InferOutput<typeof MassConsensusMemberSchema>;

  // ============================================
  // Default stage templates
  // ============================================
  export const defaultStageTemplates: Record<MassConsensusStageType, Partial<MassConsensusStage>> = {
      [MassConsensusStageType.introduction]: {
          type: MassConsensusStageType.introduction,
          title: "Welcome",
          skipable: true,
          beforeStage: {
              enabled: true,
              title: "Welcome to Mass Consensus",
              content: "This process helps identify the best ideas through collective evaluation.",
              displayMode: 'card',
              showOnlyFirstTime: false,
          },
      },
      [MassConsensusStageType.userDemographics]: {
          type: MassConsensusStageType.userDemographics,
          title: "About You",
          skipable: true,
          beforeStage: {
              content: "Help us understand the diversity of participants (optional).",
              displayMode: 'inline',
              showOnlyFirstTime: true,
          },
      },
      [MassConsensusStageType.question]: {
          type: MassConsensusStageType.question,
          title: "Your Suggestion",
          required: false,
          skipable: true,
          beforeStage: {
              title: "Share Your Ideas",
              content: "Submit your suggestion. It will be randomly shown to others for evaluation.",
              displayMode: 'tooltip',
              showOnlyFirstTime: true,
          },
          afterAction: {
              enabled: true,
              content: "Your suggestion has been added!",
              successMessage: "It will be evaluated by other participants.",
              buttons: [
                  { label: "View My Suggestions", action: 'viewMySuggestions', primary: false },
                  { label: "Add Another", action: 'addAnother', primary: false },
                  { label: "Continue", action: 'continue', primary: true },
              ],
              displayMode: 'modal',
          },
          config: {
              minCharacters: 10,
              maxCharacters: 500,
              maxSuggestions: 3,
          },
      },
      [MassConsensusStageType.randomSuggestions]: {
          type: MassConsensusStageType.randomSuggestions,
          title: "Evaluate Suggestions",
          skipable: false,
          beforeStage: {
              title: "Random Evaluation",
              content: "Rate 6 random suggestions. Everyone sees different ones for fairness.",
              displayMode: 'card',
              showOnlyFirstTime: true,
          },
          afterAction: {
              content: "Great job! All suggestions evaluated.",
              displayMode: 'toast',
              autoAdvance: {
                  enabled: true,
                  delay: 2000,
                  target: 'next',
              },
          },
          config: {
              proposalsPerBatch: 6,
              evaluationType: 'rating',
          },
      },
      [MassConsensusStageType.topSuggestions]: {
          type: MassConsensusStageType.topSuggestions,
          title: "Top Suggestions",
          skipable: true,
          beforeStage: {
              content: "Review the highest-rated suggestions.",
              displayMode: 'inline',
          },
      },
      [MassConsensusStageType.voting]: {
          type: MassConsensusStageType.voting,
          title: "Final Vote",
          required: true,
          beforeStage: {
              content: "Cast your vote for the best suggestion.",
              displayMode: 'tooltip',
          },
          afterAction: {
              content: "Thank you for voting!",
              displayMode: 'toast',
              autoAdvance: {
                  enabled: true,
                  delay: 1500,
                  target: 'next',
              },
          },
          config: {
              votingMethod: 'single',
              maxVotes: 1,
          },
      },
      [MassConsensusStageType.results]: {
          type: MassConsensusStageType.results,
          title: "Results",
          skipable: false,
          beforeStage: {
              content: "See how everyone voted.",
              displayMode: 'inline',
          },
      },
      [MassConsensusStageType.leaveFeedback]: {
          type: MassConsensusStageType.leaveFeedback,
          title: "Feedback",
          skipable: true,
          beforeStage: {
              content: "Help us improve this process.",
              displayMode: 'inline',
          },
      },
      [MassConsensusStageType.thankYou]: {
          type: MassConsensusStageType.thankYou,
          title: "Thank You",
          skipable: false,
      },
      [MassConsensusStageType.mySuggestions]: {
          type: MassConsensusStageType.mySuggestions,
          title: "My Suggestions",
          skipable: true,
      },
      // Future types
      [MassConsensusStageType.discussion]: {
          type: MassConsensusStageType.discussion,
          title: "Discussion",
          skipable: true,
      },
      [MassConsensusStageType.prioritization]: {
          type: MassConsensusStageType.prioritization,
          title: "Prioritize",
          skipable: false,
      },
      [MassConsensusStageType.review]: {
          type: MassConsensusStageType.review,
          title: "Review",
          skipable: true,
      },
  };