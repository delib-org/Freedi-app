import { Statement } from '@freedi/shared-types';
import { SurveySettings } from '@/types/survey';
import SolutionFeedClient from './SolutionFeedClient';

interface SolutionFeedProps {
  question: Statement;
  initialSolutions: Statement[];
  surveySettings?: SurveySettings;
}

/**
 * Server Component wrapper for solution feed
 * Passes server-fetched data to client component
 */
export default function SolutionFeed({
  question,
  initialSolutions,
  surveySettings
}: SolutionFeedProps) {
  // Check if we have solutions
  if (!initialSolutions || initialSolutions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h3>No solutions yet</h3>
        <p>Be the first to submit a solution!</p>
      </div>
    );
  }

  // Pass to client component for interactivity
  return (
    <SolutionFeedClient
      question={question}
      initialSolutions={initialSolutions}
      surveySettings={surveySettings}
    />
  );
}
