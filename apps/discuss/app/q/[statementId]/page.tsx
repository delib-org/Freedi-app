import { Suspense } from 'react';
import { Metadata } from 'next';
import { Statement, StatementType } from 'delib-npm';
import { getQuestionFromFirebase, getRandomOptions } from '@/lib/firebase/queries';
import QuestionHeader from '@/components/question/QuestionHeader';
import SolutionFeed from '@/components/question/SolutionFeed';
import SkeletonLoader from '@/components/shared/SkeletonLoader';
import { notFound } from 'next/navigation';

interface PageProps {
  params: { statementId: string };
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const question = await getQuestionFromFirebase(params.statementId);

    return {
      title: `${question.statement} | Freedi Discussion`,
      description: question.description || `Participate in this discussion: ${question.statement}`,
      openGraph: {
        title: question.statement,
        description: question.description || 'Join the discussion',
        type: 'website',
      },
    };
  } catch (error) {
    return {
      title: 'Question Not Found | Freedi Discussion',
    };
  }
}

/**
 * Main question page - Server-side rendered
 * Inspired by StatementMain.tsx architecture
 */
export default async function QuestionPage({ params }: PageProps) {
  try {
    // Parallel data fetching on server
    const [question, initialBatch] = await Promise.all([
      getQuestionFromFirebase(params.statementId),
      getRandomOptions(params.statementId, { size: 10 }),
    ]);

    // Works with any question type - mass consensus UI is universal
    return (
      <div className="page">
        {/* Server Component - Static header */}
        <QuestionHeader question={question} />

        {/* Suspense boundary for streaming */}
        <Suspense fallback={<SkeletonLoader count={3} />}>
          <SolutionFeed
            question={question}
            initialSolutions={initialBatch}
          />
        </Suspense>
      </div>
    );
  } catch (error) {
    console.error('Failed to load question:', error);
    notFound();
  }
}

/**
 * Incremental Static Regeneration
 * Regenerate page every 60 seconds
 */
export const revalidate = 60;

/**
 * Generate static params for popular questions (optional)
 * Can be populated with featured questions
 */
export async function generateStaticParams() {
  // TODO: Fetch popular/featured question IDs
  // For now, return empty to generate on-demand
  return [];
}
