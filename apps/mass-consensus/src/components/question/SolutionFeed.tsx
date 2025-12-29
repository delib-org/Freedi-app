import { Statement } from '@freedi/shared-types';
import { MergedQuestionSettings } from '@/lib/utils/settingsUtils';
import SolutionFeedClient from './SolutionFeedClient';

interface SolutionFeedProps {
  question: Statement;
  initialSolutions: Statement[];
  /** Merged settings for this question (survey + per-question overrides) */
  mergedSettings?: MergedQuestionSettings;
}

/**
 * Server Component wrapper for solution feed
 * Passes server-fetched data to client component
 */
export default function SolutionFeed({
  question,
  initialSolutions,
  mergedSettings
}: SolutionFeedProps) {
  const canAddSuggestions = mergedSettings?.allowParticipantsToAddSuggestions ?? false;

  // Check if we have solutions
  if (!initialSolutions || initialSolutions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h3>No solutions yet</h3>
        {canAddSuggestions ? (
          <p>Be the first to submit a solution!</p>
        ) : (
          <p>Solutions will appear here once they are added.</p>
        )}
      </div>
    );
  }

  // Pass to client component for interactivity
  return (
    <SolutionFeedClient
      question={question}
      initialSolutions={initialSolutions}
      mergedSettings={mergedSettings}
    />
  );
}
