'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import type { SurveyDemographicPage, UserDemographicQuestion } from '@freedi/shared-types';
import { UserDemographicQuestionType } from '@freedi/shared-types';
import { getDemographicPositionOptions } from '@/types/surveyFlow';
import DemographicQuestionEditor from './DemographicQuestionEditor';
import styles from './Admin.module.scss';

interface DemographicPagesEditorProps {
  pages: SurveyDemographicPage[];
  onPagesChange: (pages: SurveyDemographicPage[]) => void;
  /** Custom demographic questions for this survey */
  customQuestions: UserDemographicQuestion[];
  onCustomQuestionsChange: (questions: UserDemographicQuestion[]) => void;
  /** Number of questions in the survey (for position options) */
  questionCount: number;
}

/**
 * Editor for managing demographic page configurations in a survey
 */
export default function DemographicPagesEditor({
  pages,
  onPagesChange,
  customQuestions,
  onCustomQuestionsChange,
  questionCount,
}: DemographicPagesEditorProps) {
  const { t, tWithParams } = useTranslation();
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);

  const positionOptions = getDemographicPositionOptions(questionCount);

  // Translate position options
  const translatedPositionOptions = useMemo(() => {
    return positionOptions.map((option) => ({
      value: option.value,
      label: option.labelParams
        ? tWithParams(option.labelKey, option.labelParams) || option.labelKey
        : t(option.labelKey) || option.labelKey,
    }));
  }, [positionOptions, t, tWithParams]);

  const generatePageId = () => `demo-page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const generateQuestionId = () => `demo-q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddPage = () => {
    const newPage: SurveyDemographicPage = {
      demographicPageId: generatePageId(),
      title: t('aboutYou') || 'About You',
      description: '',
      position: -1, // Default: after all questions
      required: false,
      customQuestionIds: [],
      includeInheritedQuestions: false,
      excludedInheritedQuestionIds: [],
    };
    onPagesChange([...pages, newPage]);
    setExpandedPageId(newPage.demographicPageId);
  };

  const handleRemovePage = (pageId: string) => {
    onPagesChange(pages.filter((p) => p.demographicPageId !== pageId));
    // Also remove any custom questions associated with this page
    const page = pages.find((p) => p.demographicPageId === pageId);
    if (page) {
      onCustomQuestionsChange(
        customQuestions.filter((q) => !page.customQuestionIds.includes(q.userQuestionId || ''))
      );
    }
  };

  const handleUpdatePage = (pageId: string, updates: Partial<SurveyDemographicPage>) => {
    onPagesChange(
      pages.map((p) => (p.demographicPageId === pageId ? { ...p, ...updates } : p))
    );
  };

  const handleAddQuestion = (pageId: string) => {
    const questionId = generateQuestionId();
    const newQuestion: UserDemographicQuestion = {
      userQuestionId: questionId,
      statementId: '', // Will be set when saving to Firestore
      question: '',
      type: UserDemographicQuestionType.text,
      options: [],
      order: customQuestions.filter((q) =>
        pages.find((p) => p.demographicPageId === pageId)?.customQuestionIds.includes(q.userQuestionId || '')
      ).length,
    };

    onCustomQuestionsChange([...customQuestions, newQuestion]);

    // Add the question ID to the page
    handleUpdatePage(pageId, {
      customQuestionIds: [
        ...(pages.find((p) => p.demographicPageId === pageId)?.customQuestionIds || []),
        questionId,
      ],
    });
  };

  const handleUpdateQuestion = (
    questionId: string,
    updates: Partial<UserDemographicQuestion>
  ) => {
    onCustomQuestionsChange(
      customQuestions.map((q) =>
        q.userQuestionId === questionId ? { ...q, ...updates } : q
      )
    );
  };

  const handleRemoveQuestion = (pageId: string, questionId: string) => {
    onCustomQuestionsChange(customQuestions.filter((q) => q.userQuestionId !== questionId));
    handleUpdatePage(pageId, {
      customQuestionIds: pages
        .find((p) => p.demographicPageId === pageId)
        ?.customQuestionIds.filter((id) => id !== questionId) || [],
    });
  };

  const getPageQuestions = (pageId: string): UserDemographicQuestion[] => {
    const page = pages.find((p) => p.demographicPageId === pageId);
    if (!page) return [];

    return page.customQuestionIds
      .map((id) => customQuestions.find((q) => q.userQuestionId === id))
      .filter((q): q is UserDemographicQuestion => q !== undefined)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  const getPositionLabel = (position: number): string => {
    const option = translatedPositionOptions.find((o) => o.value === position);

    return option?.label || `Position ${position}`;
  };

  return (
    <div className={styles.demographicPagesEditor}>
      {pages.length === 0 ? (
        <div className={styles.emptyDemographics}>
          <p>{t('noDemographicPages') || 'No demographic sections added yet'}</p>
          <p className={styles.hint}>
            {t('demographicPagesHint') ||
              'Add demographic sections to collect information about participants'}
          </p>
        </div>
      ) : (
        <div className={styles.demographicPagesList}>
          {pages.map((page, index) => {
            const isExpanded = expandedPageId === page.demographicPageId;
            const pageQuestions = getPageQuestions(page.demographicPageId);

            return (
              <div
                key={page.demographicPageId}
                className={`${styles.demographicPageCard} ${isExpanded ? styles.expanded : ''}`}
              >
                <div
                  className={styles.demographicPageHeader}
                  onClick={() =>
                    setExpandedPageId(isExpanded ? null : page.demographicPageId)
                  }
                >
                  <div className={styles.pageNumber}>{index + 1}</div>
                  <div className={styles.pageInfo}>
                    <span className={styles.pageTitle}>
                      {page.title || t('untitledPage') || 'Untitled Page'}
                    </span>
                    <span className={styles.pageMeta}>
                      {getPositionLabel(page.position)} &bull;{' '}
                      {pageQuestions.length} {t('questions') || 'questions'} &bull;{' '}
                      {page.required
                        ? t('required') || 'Required'
                        : t('optional') || 'Optional'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.expandToggle}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                  <button
                    type="button"
                    className={styles.removePageButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePage(page.demographicPageId);
                    }}
                    aria-label={t('removePage') || 'Remove page'}
                  >
                    ×
                  </button>
                </div>

                {isExpanded && (
                  <div className={styles.demographicPageContent}>
                    {/* Page Title */}
                    <div className={styles.formGroup}>
                      <label>{t('pageTitle') || 'Section Title'}</label>
                      <input
                        type="text"
                        className={styles.textInput}
                        value={page.title}
                        onChange={(e) =>
                          handleUpdatePage(page.demographicPageId, {
                            title: e.target.value,
                          })
                        }
                        placeholder={t('pageTitlePlaceholder') || 'e.g., About You'}
                      />
                    </div>

                    {/* Page Description */}
                    <div className={styles.formGroup}>
                      <label>{t('pageDescription') || 'Description (optional)'}</label>
                      <textarea
                        className={styles.textArea}
                        value={page.description || ''}
                        onChange={(e) =>
                          handleUpdatePage(page.demographicPageId, {
                            description: e.target.value,
                          })
                        }
                        placeholder={
                          t('pageDescriptionPlaceholder') ||
                          'Help us understand the diversity of participants'
                        }
                        rows={2}
                      />
                    </div>

                    {/* Position */}
                    <div className={styles.formGroup}>
                      <label>{t('position') || 'Position in Survey'}</label>
                      <select
                        className={styles.selectInput}
                        value={page.position}
                        onChange={(e) =>
                          handleUpdatePage(page.demographicPageId, {
                            position: parseInt(e.target.value),
                          })
                        }
                      >
                        {translatedPositionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Required toggle */}
                    <div className={styles.formGroup}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={page.required}
                          onChange={(e) =>
                            handleUpdatePage(page.demographicPageId, {
                              required: e.target.checked,
                            })
                          }
                        />
                        <span>{t('requiredSection') || 'Required section'}</span>
                      </label>
                      <p className={styles.hint}>
                        {t('requiredSectionHint') ||
                          'When enabled, participants must complete this section to continue'}
                      </p>
                    </div>

                    {/* Questions */}
                    <div className={styles.questionsSection}>
                      <h4>{t('demographicQuestions') || 'Questions'}</h4>

                      {pageQuestions.length === 0 ? (
                        <p className={styles.noQuestions}>
                          {t('noQuestionsYet') || 'No questions added yet'}
                        </p>
                      ) : (
                        <div className={styles.questionsList}>
                          {pageQuestions.map((question, qIndex) => (
                            <DemographicQuestionEditor
                              key={question.userQuestionId}
                              question={question}
                              index={qIndex}
                              onUpdate={(updates) =>
                                handleUpdateQuestion(question.userQuestionId || '', updates)
                              }
                              onRemove={() =>
                                handleRemoveQuestion(
                                  page.demographicPageId,
                                  question.userQuestionId || ''
                                )
                              }
                            />
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        className={styles.addQuestionButton}
                        onClick={() => handleAddQuestion(page.demographicPageId)}
                      >
                        + {t('addQuestion') || 'Add Question'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className={styles.addPageButton} onClick={handleAddPage}>
        + {t('addDemographicSection') || 'Add Demographic Section'}
      </button>
    </div>
  );
}
