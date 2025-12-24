import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { Statement } from '@freedi/shared-types';
import { getQuestionFromFirebase, getAllSolutionsSorted, getUserSolutions } from '@/lib/firebase/queries';
import { getUserIdFromCookies } from '@/lib/utils/user';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';
import ResultCard from '@/components/q-results/ResultCard';
import styles from './q-results.module.scss';

interface PageProps {
  params: Promise<{ statementId: string }>;
}

// Revalidate every 30 seconds
export const revalidate = 30;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { statementId } = await params;

  try {
    const question = await getQuestionFromFirebase(statementId);

    return {
      title: `Results: ${question.statement}`,
      description: `View the consensus results for: ${question.statement}`,
    };
  } catch {
    return {
      title: 'Results',
      description: 'View consensus results',
    };
  }
}

/**
 * Calculate total unique participants from all solutions
 */
function calculateTotalParticipants(solutions: Statement[]): number {
  const maxEvaluators = solutions.reduce((max, solution) => {
    const evaluators = solution.evaluation?.numberOfEvaluators ?? 0;

    return Math.max(max, evaluators);
  }, 0);

  return maxEvaluators;
}

export default async function QResultsPage({ params }: PageProps) {
  const { statementId } = await params;

  let question: Statement;
  let solutions: Statement[];
  let userSolutions: Statement[] = [];

  try {
    question = await getQuestionFromFirebase(statementId);
    solutions = await getAllSolutionsSorted(statementId, 100);

    // Try to get user's solutions if they have a cookie
    const cookieStore = await cookies();
    const userId = getUserIdFromCookies(cookieStore);
    if (userId) {
      userSolutions = await getUserSolutions(statementId, userId);
    }
  } catch (error) {
    console.error('[QResultsPage] Error fetching results:', {
      error: error instanceof Error ? error.message : error,
      statementId,
    });
    notFound();
  }

  const totalParticipants = calculateTotalParticipants(solutions);
  const userSolutionIds = new Set(userSolutions.map((s) => s.statementId));

  return (
    <LanguageOverrideProvider
      adminLanguage={question.defaultLanguage}
      forceLanguage={(question as { forceLanguage?: boolean }).forceLanguage ?? true}
    >
      <div className={styles.resultsPage}>
        <header className={styles.resultsPage__header}>
          <h1 className={styles.resultsPage__title}>Results</h1>
          {totalParticipants > 0 && (
            <div className={styles.resultsPage__participants}>
              <span className={styles.resultsPage__participantCount}>{totalParticipants}</span>
              <span className={styles.resultsPage__participantLabel}>Voters</span>
            </div>
          )}
        </header>

        <div className={styles.resultsPage__question}>
          <h2>{question.statement}</h2>
        </div>

        <main className={styles.resultsPage__content}>
          {solutions.length === 0 ? (
            <div className={styles.resultsPage__emptyState}>
              <p>No solutions to display yet</p>
            </div>
          ) : (
            <div className={styles.resultsList}>
              {solutions.map((solution) => (
                <ResultCard
                  key={solution.statementId}
                  statement={solution}
                  isUserStatement={userSolutionIds.has(solution.statementId)}
                  totalParticipants={totalParticipants}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </LanguageOverrideProvider>
  );
}
