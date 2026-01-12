/**
 * Demographics types for Sign app
 * Re-exports from delib-npm and adds Sign-specific types
 */

import {
  UserDemographicQuestion,
  DemographicOption,
  UserDemographicQuestionType,
} from '@freedi/shared-types';

// Re-export from delib-npm
export type {
  UserDemographicQuestion,
  DemographicOption,
};

export {
  UserDemographicQuestionType,
};

// Define scope type locally since delib-npm exports schema but not the type
export type DemographicQuestionScope = 'group' | 'statement';

// Sign-specific demographic mode
export type DemographicMode = 'disabled' | 'inherit' | 'custom';

// Survey trigger mode - when should the survey be shown
export type SurveyTriggerMode = 'on_interaction' | 'before_viewing';

// Extended scope that includes 'sign' for Sign app specific questions
// Note: 'sign' is not in delib-npm's DemographicQuestionScope enum yet
export type SignDemographicScope = DemographicQuestionScope | 'sign';

// Display type for single-choice questions (radio can be shown as dropdown)
export type SingleChoiceDisplayType = 'radio' | 'dropdown';

// Survey completion status
export interface SurveyCompletionStatus {
  isComplete: boolean;
  totalQuestions: number;
  answeredQuestions: number;
  isRequired: boolean;
  missingQuestionIds: string[];
  surveyTrigger?: SurveyTriggerMode; // Optional - added at API level
}

// Demographic answer for submission
export interface DemographicAnswer {
  userQuestionId: string;
  answer?: string;
  answerOptions?: string[];
}

// Extended question type with Sign-specific fields
export interface SignDemographicQuestion extends Omit<UserDemographicQuestion, 'scope'> {
  scope?: SignDemographicScope;
  documentId?: string;
  isInherited?: boolean;
  displayType?: SingleChoiceDisplayType; // For radio questions: show as radio buttons or dropdown
}

// Question with user's answer for display
export interface QuestionWithAnswer extends SignDemographicQuestion {
  userAnswer?: string;
  userAnswerOptions?: string[];
}

// Demographics settings stored in document
export interface DemographicSettings {
  mode: DemographicMode;
  required: boolean;
  surveyTrigger: SurveyTriggerMode;
}

// API request types
export interface CreateQuestionRequest {
  question: string;
  type: UserDemographicQuestionType;
  options?: DemographicOption[];
  required?: boolean;
  order?: number;
  displayType?: SingleChoiceDisplayType; // For radio questions: show as radio buttons or dropdown
}

export interface SaveAnswersRequest {
  answers: DemographicAnswer[];
}

// API response types
export interface DemographicQuestionsResponse {
  questions: SignDemographicQuestion[];
  mode: DemographicMode;
  required: boolean;
}

export interface DemographicStatusResponse {
  status: SurveyCompletionStatus;
  mode: DemographicMode;
}

export interface DemographicAnswersResponse {
  answers: QuestionWithAnswer[];
}
