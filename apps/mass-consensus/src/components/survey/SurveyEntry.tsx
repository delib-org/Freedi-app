'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OpeningSlide } from './OpeningSlide';
import { SurveyWithQuestions } from '@/types/survey';
import { useAuth } from '@/components/auth/AuthProvider';
import { pingSurveyEntry } from '@/lib/utils/surveyEntryPing';

interface SurveyEntryProps {
  survey: SurveyWithQuestions;
}

/**
 * Survey entry component
 *
 * Flow:
 * - If admin enabled opening slide -> show OpeningSlide
 * - Otherwise -> redirect to first question
 */
export default function SurveyEntry({ survey }: SurveyEntryProps) {
  const router = useRouter();
  const { isLoading } = useAuth();

  // Record survey entry (fire-and-forget, idempotent per user+survey) so
  // admins can see how many people entered vs. bounced without acting.
  useEffect(() => {
    if (isLoading) return;
    pingSurveyEntry(survey.surveyId);
  }, [isLoading, survey.surveyId]);

  useEffect(() => {
    if (!survey.showOpeningSlide) {
      router.push(`/s/${survey.surveyId}/q/0`);
    }
  }, [survey.showOpeningSlide, survey.surveyId, router]);

  if (!survey.showOpeningSlide) {
    return <div className="opening-slide__loading" />;
  }

  const handleContinue = (): void => {
    router.push(`/s/${survey.surveyId}/q/0`);
  };

  return <OpeningSlide survey={survey} onContinue={handleContinue} />;
}
