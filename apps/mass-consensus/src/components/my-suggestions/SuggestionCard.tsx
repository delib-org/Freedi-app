'use client';

import { SuggestionWithComments } from '@/types/mySuggestions';
import ResultCard from '@/components/q-results/ResultCard';
import FeedbackThread from './FeedbackThread';
import styles from './MySuggestionsPage.module.scss';

interface SuggestionCardProps {
  data: SuggestionWithComments;
  totalParticipants: number;
}

export default function SuggestionCard({ data, totalParticipants }: SuggestionCardProps) {
  return (
    <div className={styles.suggestionCard}>
      <ResultCard
        statement={data.suggestion}
        isUserStatement={true}
        totalParticipants={totalParticipants}
      />
      <FeedbackThread
        statementId={data.suggestion.statementId}
        initialComments={data.comments}
        totalComments={data.totalComments}
      />
    </div>
  );
}
