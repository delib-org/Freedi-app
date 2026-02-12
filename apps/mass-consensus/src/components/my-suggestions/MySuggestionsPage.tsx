'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from '@freedi/shared-i18n/next';
import { MySuggestionsPageData } from '@/types/mySuggestions';
import SummaryBanner from './SummaryBanner';
import QuestionSection from './QuestionSection';
import styles from './MySuggestionsPage.module.scss';

interface MySuggestionsPageProps {
  data: MySuggestionsPageData;
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12h6M12 9v6" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

export default function MySuggestionsPage({ data }: MySuggestionsPageProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const handleBack = () => {
    if (data.mode === 'survey' && data.surveyId) {
      router.push(`/s/${data.surveyId}/complete`);
    } else {
      router.back();
    }
  };

  const isSurveyMode = data.mode === 'survey';
  const hasSuggestions = data.questionSections.length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={handleBack} aria-label={t('back')}>
          <BackArrowIcon />
        </button>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t('mySuggestions')}</h1>
          {isSurveyMode && data.surveyTitle && (
            <p className={styles.subtitle}>{data.surveyTitle}</p>
          )}
        </div>
      </header>

      {hasSuggestions ? (
        <>
          <SummaryBanner stats={data.stats} />

          <div className={styles.sections}>
            {data.questionSections.map((section, index) => (
              <QuestionSection
                key={section.question.statementId}
                data={section}
                collapsible={isSurveyMode && data.questionSections.length > 1}
                defaultExpanded={index === 0}
              />
            ))}
          </div>
        </>
      ) : (
        <div className={styles.emptyState}>
          <EmptyIcon />
          <h2 className={styles.emptyTitle}>{t('noSuggestionsYet')}</h2>
          <p className={styles.emptyDescription}>{t('noSuggestionsDescription')}</p>
        </div>
      )}
    </div>
  );
}
