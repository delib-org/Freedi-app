// Questionnaire Feature Data Models
// This file contains TypeScript interfaces for the questionnaire feature

import { Timestamp } from 'firebase/firestore';

// ==================== CORE MODELS ====================

/**
 * Main questionnaire entity
 * Stored in: statements collection (with statementType: 'questionnaire')
 */
export interface QuestionnaireStatement {
  // Inherits all Statement fields plus:
  statementType: 'questionnaire';
  questionnaireSettings: {
    questions: QuestionReference[];
    allowBackNavigation: boolean;
    showProgress: boolean;
    randomizeQuestions: boolean;
    timeLimit?: number; // in minutes
    requiredAll: boolean; // all questions required by default
    allowAnonymous: boolean;
    showResultsTo: 'none' | 'creator' | 'participants' | 'all';
    resultsAvailableAt?: 'immediate' | 'after-submission' | 'after-close';
  };
}

/**
 * Reference to a question within a questionnaire
 */
export interface QuestionReference {
  questionId: string;
  order: number;
  required?: boolean; // override questionnaire default
}

// ==================== QUESTION MODELS ====================

/**
 * Individual question entity
 * Stored in: statements collection (with statementType: 'question' and subType)
 */
export interface QuestionStatement {
  // Inherits all Statement fields plus:
  statementType: 'question';
  subType: QuestionType;
  parentId: string; // ID of parent questionnaire
  questionConfig: QuestionConfig;
}

export type QuestionType = 
  | 'multiple-choice'
  | 'text'
  | 'rating'
  | 'scale'
  | 'yes-no'
  | 'ranking'
  | 'matrix';

/**
 * Base question configuration
 */
export interface BaseQuestionConfig {
  helpText?: string;
  validation?: ValidationRule[];
}

/**
 * Multiple choice question configuration
 */
export interface MultipleChoiceConfig extends BaseQuestionConfig {
  options: ChoiceOption[];
  allowMultiple: boolean;
  maxSelections?: number;
  minSelections?: number;
  allowOther: boolean;
}

/**
 * Text question configuration
 */
export interface TextQuestionConfig extends BaseQuestionConfig {
  inputType: 'short' | 'long' | 'email' | 'number' | 'url';
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}

/**
 * Rating question configuration
 */
export interface RatingQuestionConfig extends BaseQuestionConfig {
  ratingType: 'stars' | 'hearts' | 'thumbs' | 'numeric';
  maxRating: number; // e.g., 5 for 5-star rating
  labels?: {
    low?: string;
    high?: string;
  };
}

/**
 * Scale question configuration
 */
export interface ScaleQuestionConfig extends BaseQuestionConfig {
  minValue: number;
  maxValue: number;
  step: number;
  labels?: {
    min?: string;
    max?: string;
    mid?: string;
  };
  showValue: boolean;
}

/**
 * Ranking question configuration
 */
export interface RankingQuestionConfig extends BaseQuestionConfig {
  items: RankingItem[];
  allowTies: boolean;
}

/**
 * Matrix question configuration (multiple questions in table format)
 */
export interface MatrixQuestionConfig extends BaseQuestionConfig {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  allowMultiplePerRow: boolean;
}

// ==================== SUPPORTING TYPES ====================

export interface ChoiceOption {
  id: string;
  text: string;
  value: string | number;
  order: number;
}

export interface RankingItem {
  id: string;
  text: string;
  order: number;
}

export interface MatrixRow {
  id: string;
  text: string;
  required?: boolean;
}

export interface MatrixColumn {
  id: string;
  text: string;
  value: string | number;
}

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message?: string;
}

// Union type for all question configs
export type QuestionConfig = 
  | MultipleChoiceConfig
  | TextQuestionConfig
  | RatingQuestionConfig
  | ScaleQuestionConfig
  | RankingQuestionConfig
  | MatrixQuestionConfig
  | BaseQuestionConfig; // for yes-no

// ==================== RESPONSE MODELS ====================

/**
 * User's response to a questionnaire
 * Stored in: evaluations collection
 */
export interface QuestionnaireResponse {
  evaluationId: string;
  statementId: string; // questionnaire ID
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'in-progress' | 'completed' | 'abandoned';
  startedAt: Timestamp;
  completedAt?: Timestamp;
  responses: QuestionResponse[];
  metadata: {
    timeSpent?: number; // in seconds
    deviceType?: string;
    location?: string;
  };
}

/**
 * Individual question response
 */
export interface QuestionResponse {
  questionId: string;
  answer: QuestionAnswer;
  answeredAt: Timestamp;
  timeSpent?: number; // seconds on this question
}

/**
 * Answer types for different question types
 */
export type QuestionAnswer = 
  | { type: 'multiple-choice'; value: string | string[] }
  | { type: 'text'; value: string }
  | { type: 'rating'; value: number }
  | { type: 'scale'; value: number }
  | { type: 'yes-no'; value: boolean }
  | { type: 'ranking'; value: { itemId: string; rank: number }[] }
  | { type: 'matrix'; value: { rowId: string; columnIds: string[] }[] };

// ==================== ANALYTICS MODELS ====================

/**
 * Aggregated results for a questionnaire
 * Stored in: Could be computed or cached
 */
export interface QuestionnaireResults {
  questionnaireId: string;
  totalResponses: number;
  completionRate: number;
  averageTimeSpent: number;
  questionResults: Map<string, QuestionResults>;
  lastUpdated: Timestamp;
}

/**
 * Aggregated results for a single question
 */
export interface QuestionResults {
  questionId: string;
  responseCount: number;
  results: QuestionResultData;
}

export type QuestionResultData =
  | MultipleChoiceResults
  | TextResults
  | RatingResults
  | ScaleResults
  | YesNoResults
  | RankingResults
  | MatrixResults;

export interface MultipleChoiceResults {
  type: 'multiple-choice';
  optionCounts: Map<string, number>;
  otherResponses?: string[];
}

export interface TextResults {
  type: 'text';
  responses: string[];
  wordCloud?: Map<string, number>;
}

export interface RatingResults {
  type: 'rating';
  average: number;
  distribution: Map<number, number>;
}

export interface ScaleResults {
  type: 'scale';
  average: number;
  median: number;
  distribution: Map<number, number>;
}

export interface YesNoResults {
  type: 'yes-no';
  yesCount: number;
  noCount: number;
}

export interface RankingResults {
  type: 'ranking';
  averageRanks: Map<string, number>;
  rankDistribution: Map<string, Map<number, number>>;
}

export interface MatrixResults {
  type: 'matrix';
  rowResults: Map<string, Map<string, number>>;
}