import { Statement } from '@freedi/shared-types';
import { CommentData } from './api';

/**
 * A suggestion with its associated comments
 */
export interface SuggestionWithComments {
  suggestion: Statement;
  comments: CommentData[];
  totalComments: number;
}

/**
 * Suggestions grouped under a question
 */
export interface QuestionSuggestionsData {
  question: Statement;
  questionIndex: number;
  suggestions: SuggestionWithComments[];
}

/**
 * Summary stats for the My Suggestions page
 */
export interface MySuggestionsStats {
  totalSuggestions: number;
  totalComments: number;
  averageScore: number;
}

/**
 * Complete data for the My Suggestions page
 */
export interface MySuggestionsPageData {
  mode: 'survey' | 'question';
  surveyTitle?: string;
  surveyId?: string;
  questionSections: QuestionSuggestionsData[];
  stats: MySuggestionsStats;
  adminLanguage?: string;
  forceLanguage?: boolean;
}
