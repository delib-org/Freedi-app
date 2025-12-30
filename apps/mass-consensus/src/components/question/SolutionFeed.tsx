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
 * Always renders client component to enable add solution functionality
 */
export default function SolutionFeed({
  question,
  initialSolutions,
  mergedSettings
}: SolutionFeedProps) {
  // Always pass to client component for interactivity
  // Client component handles empty state with add solution capability
  return (
    <SolutionFeedClient
      question={question}
      initialSolutions={initialSolutions || []}
      mergedSettings={mergedSettings}
    />
  );
}
