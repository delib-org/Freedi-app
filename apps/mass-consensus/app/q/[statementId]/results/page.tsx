import { Suspense } from 'react';
import { Metadata } from 'next';
import { cookies } from 'next/headers';
import {
  getQuestionFromFirebase,
  getAllSolutionsSorted,
  getUserSolutions,
} from '@/lib/firebase/queries';
import ResultsList from '@/components/results/ResultsList';
import { getUserIdFromCookie } from '@/lib/utils/user';
import SkeletonLoader from '@/components/shared/SkeletonLoader';
import styles from './results.module.css';

interface PageProps {
  params: { statementId: string };
  searchParams: { tab?: 'all' | 'mine' };
}

/**
 * Generate metadata for results page
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const question = await getQuestionFromFirebase(params.statementId);

    return {
      title: `Results: ${question.statement} | Freedi Mass Consensus`,
      description: `View all solutions and their consensus rankings for: ${question.statement}`,
    };
  } catch (error) {
    return {
      title: 'Results | Freedi Mass Consensus',
    };
  }
}

/**
 * Results page - Server-side rendered
 * Shows all solutions sorted by consensus or user's own solutions
 */
export default async function ResultsPage({ params, searchParams }: PageProps) {
  try {
    const cookieStore = await cookies();
    const userId = getUserIdFromCookie(cookieStore.get('userId')?.value || null);
    const tab = searchParams.tab || 'all';

    // Parallel fetch
    const [question, solutions] = await Promise.all([
      getQuestionFromFirebase(params.statementId),
      tab === 'mine' && userId
        ? getUserSolutions(params.statementId, userId)
        : getAllSolutionsSorted(params.statementId),
    ]);

    return (
      <div className="page">
        <header className={styles.header}>
          <h1>Results</h1>
          <p className={styles.questionTitle}>{question.statement}</p>
        </header>

        {/* Tabs */}
        <div className={styles.tabs}>
          <a
            href={`/q/${params.statementId}/results?tab=all`}
            className={`${styles.tab} ${tab === 'all' ? styles.active : ''}`}
          >
            All Solutions ({question.suggestions || 0})
          </a>
          <a
            href={`/q/${params.statementId}/results?tab=mine`}
            className={`${styles.tab} ${tab === 'mine' ? styles.active : ''}`}
          >
            My Solutions
          </a>
        </div>

        <Suspense fallback={<SkeletonLoader count={5} />}>
          <ResultsList
            solutions={solutions}
            tab={tab}
            userId={userId || undefined}
            questionId={params.statementId}
          />
        </Suspense>

        {/* Back to question */}
        <div className={styles.backButton}>
          <a href={`/q/${params.statementId}`}>
            ← Back to question
          </a>
        </div>
      </div>
    );
  } catch (error) {
    console.error('Failed to load results:', error);
    return (
      <div className="page">
        <h1>Error Loading Results</h1>
        <p>Failed to load results. Please try again later.</p>
        <a href={`/q/${params.statementId}`}>← Back to question</a>
      </div>
    );
  }
}

/**
 * Shorter revalidation for results page
 */
export const revalidate = 30;
