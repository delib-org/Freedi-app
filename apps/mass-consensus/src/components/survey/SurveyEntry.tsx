'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OpeningSlide } from './OpeningSlide';
import SurveyWelcome from './SurveyWelcome';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { SurveyWithQuestions } from '@/types/survey';

interface SurveyEntryProps {
  survey: SurveyWithQuestions;
}

/**
 * Survey entry component that handles opening slide flow
 *
 * Flow:
 * 1. If showOpeningSlide is false/undefined -> redirect to /s/[surveyId]/q/0
 * 2. If showOpeningSlide is true:
 *    a. Check if user has viewed opening slide
 *    b. If not viewed -> show OpeningSlide
 *    c. If viewed -> show SurveyWelcome
 */
export default function SurveyEntry({ survey }: SurveyEntryProps) {
  const router = useRouter();
  const [hasViewedOpeningSlide, setHasViewedOpeningSlide] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkOpeningSlideStatus = async (): Promise<void> => {
      // If opening slide is disabled, redirect directly to first question
      if (!survey.showOpeningSlide) {
        router.push(`/s/${survey.surveyId}/q/0`);
        return;
      }

      // Check if user has viewed opening slide
      try {
        const userId = getUserIdFromCookie(document.cookie);
        if (!userId) {
          // Anonymous user, hasn't viewed yet
          setHasViewedOpeningSlide(false);
          setLoading(false);
          return;
        }

        // Fetch progress to check if opening slide was viewed
        const response = await fetch(`/api/surveys/${survey.surveyId}/progress`, {
          credentials: 'include',
        });

        if (response.ok) {
          const progress = await response.json();
          setHasViewedOpeningSlide(progress.hasViewedOpeningSlide || false);
        } else {
          // No progress yet, user hasn't viewed
          setHasViewedOpeningSlide(false);
        }
      } catch (error) {
        console.error('[SurveyEntry] Error checking opening slide status:', error);
        setHasViewedOpeningSlide(false);
      } finally {
        setLoading(false);
      }
    };

    checkOpeningSlideStatus();
  }, [survey.surveyId, survey.showOpeningSlide, router]);

  const handleContinue = async (): Promise<void> => {
    // Mark opening slide as viewed
    try {
      await fetch(`/api/surveys/${survey.surveyId}/opening-slide/mark-viewed`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('[SurveyEntry] Error marking opening slide as viewed:', error);
    }

    // Navigate to first question
    router.push(`/s/${survey.surveyId}/q/0`);
  };

  if (loading) {
    return (
      <div className="opening-slide__loading">
        Loading...
      </div>
    );
  }

  // Show opening slide if enabled and not viewed
  if (survey.showOpeningSlide && !hasViewedOpeningSlide) {
    return <OpeningSlide survey={survey} onContinue={handleContinue} />;
  }

  // Show survey welcome if opening slide was viewed or disabled
  return <SurveyWelcome survey={survey} />;
}
