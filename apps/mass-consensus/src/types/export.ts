import { Statement, UserDemographicQuestion } from '@freedi/shared-types';
import {
  Survey,
  SurveyProgress,
} from './survey';

/**
 * Export data for a single question including all its options
 */
export interface QuestionExportData {
  /** The question statement */
  question: Statement;
  /** All options/solutions for this question, sorted by consensus */
  options: Statement[];
  /** Total number of options */
  optionCount: number;
}

/**
 * Statistics about the survey responses
 */
export interface ExportStats {
  /** Total number of users who started the survey */
  totalResponses: number;
  /** Number of users who completed the survey */
  completedResponses: number;
  /** Completion rate as percentage (0-100) */
  completionRate: number;
}

/**
 * Complete survey export data structure
 */
export interface SurveyExportData {
  /** Timestamp when the export was generated (milliseconds) */
  exportedAt: number;
  /** Whether test data is included in this export */
  includesTestData: boolean;
  /** The survey configuration */
  survey: Survey;
  /** All questions with their options */
  questions: QuestionExportData[];
  /** Custom demographic questions for this survey */
  demographicQuestions: UserDemographicQuestion[];
  /** User response data */
  responses: {
    /** Survey progress records for all users */
    progress: SurveyProgress[];
    /** Demographic answers from all users */
    demographicAnswers: UserDemographicQuestion[];
  };
  /** Aggregated statistics */
  stats: ExportStats;
}
