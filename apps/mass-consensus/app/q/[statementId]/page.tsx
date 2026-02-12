import { Suspense } from 'react';
import { Metadata } from 'next';
import { getQuestionFromFirebase, getRandomOptions } from '@/lib/firebase/queries';
import QuestionHeader from '@/components/question/QuestionHeader';
import SwipeInterfaceWrapper from '@/components/swipe/SwipeInterfaceWrapper';
import SkeletonLoader from '@/components/shared/SkeletonLoader';
import { LanguageOverrideProvider } from '@/components/providers/LanguageOverrideProvider';
import { notFound } from 'next/navigation';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';

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
      description: getParagraphsText(question.paragraphs) || `Participate in this discussion: ${question.statement}`,
      openGraph: {
        title: question.statement,
        description: getParagraphsText(question.paragraphs) || 'Join the discussion',
        type: 'website',
      },
    };
  } catch {
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
    console.info('[QuestionPage] Starting to fetch data for:', params.statementId);

    // Parallel data fetching on server
    const [question, initialBatch] = await Promise.all([
      getQuestionFromFirebase(params.statementId),
      getRandomOptions(params.statementId, { size: 6 }),
    ]);

    console.info('[QuestionPage] Data fetched successfully, question:', question.statement?.substring(0, 30));
    console.info('[QuestionPage] Initial batch size:', initialBatch.length);

    // Works with any question type - mass consensus UI is universal
    return (
      <LanguageOverrideProvider
        adminLanguage={question.defaultLanguage}
        forceLanguage={(question as { forceLanguage?: boolean }).forceLanguage ?? true}
      >
        <div className="page">
          {/* Server Component - Static header */}
          <QuestionHeader question={question} />

          {/* Suspense boundary for streaming */}
          <Suspense fallback={<SkeletonLoader count={3} />}>
            <SwipeInterfaceWrapper
              question={question}
              initialSolutions={initialBatch}
            />
          </Suspense>
        </div>
      </LanguageOverrideProvider>
    );
  } catch (error) {
    console.error('[QuestionPage] Error loading page:', error);
    notFound();
  }
}

/**
 * Force dynamic rendering - no caching
 * Each user gets fresh random solutions
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
