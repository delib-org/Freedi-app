'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import type {
  Statement,
  SurveyDemographicPage,
  UserDemographicQuestion,
  SurveyExplanationPage,
  SurveySettings,
  QuestionOverrideSettings,
} from '@freedi/shared-types';
import { UserDemographicQuestionType } from '@freedi/shared-types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DemographicQuestionEditor from './DemographicQuestionEditor';
import ExplanationEditor from './ExplanationEditor';
import QuestionTextEditor from './QuestionTextEditor';
import QuestionOptionsBlock from './QuestionOptionsBlock';
import QuestionSettingsPanel from './QuestionSettingsPanel';
import SynthesisStatusBadge, { resolveSynthesisBadgeState } from './SynthesisStatusBadge';
import styles from './Admin.module.scss';
import { buildUnifiedFlow, recalculatePositions } from './flowEditorOrder';
import type { FlowItemData } from './flowEditorOrder';
import { readLiveSynthFromSettings } from './liveSynthSettings';

const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL || 'https://app.wizcol.com';

interface UnifiedFlowEditorProps {
  questions: Statement[];
  demographicPages: SurveyDemographicPage[];
  explanationPages: SurveyExplanationPage[];
  customDemographicQuestions: UserDemographicQuestion[];
  surveySettings: SurveySettings;
  questionSettings: Record<string, QuestionOverrideSettings>;
  onQuestionsChange: (questions: Statement[]) => void;
  onDemographicPagesChange: (pages: SurveyDemographicPage[]) => void;
  onExplanationPagesChange: (pages: SurveyExplanationPage[]) => void;
  onCustomDemographicQuestionsChange: (questions: UserDemographicQuestion[]) => void;
  onQuestionSettingsChange: (questionId: string, settings: QuestionOverrideSettings) => void;
  onQuestionTextChange: (questionId: string, newText: string) => void;
  onRemoveQuestion: (questionId: string) => void;
  /** Lets survey editors manage the cards of questions they did not create. */
  surveyId?: string;
}

interface SortableFlowItemProps {
  item: FlowItemData;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
  // For questions
  surveyId?: string;
  /** Header shortcut to the question's cards and their pictures. */
  onOpenPictures?: () => void;
  /** Bumped each time the shortcut is used, so the panel opens and scrolls into view. */
  cardsFocusRequest?: number;
  /** The question's page in the live survey, for the preview's link. */
  liveUrl?: string;
  surveySettings?: SurveySettings;
  questionSetting?: QuestionOverrideSettings;
  onQuestionSettingsChange?: (settings: QuestionOverrideSettings) => void;
  onQuestionTextChange?: (newText: string) => void;
  // For demographics
  customQuestions?: UserDemographicQuestion[];
  onDemographicUpdate?: (updates: Partial<SurveyDemographicPage>) => void;
  onAddDemographicQuestion?: () => void;
  onUpdateDemographicQuestion?: (questionId: string, updates: Partial<UserDemographicQuestion>) => void;
  onRemoveDemographicQuestion?: (questionId: string) => void;
  // For explanations
  onExplanationUpdate?: (updates: Partial<SurveyExplanationPage>) => void;
}

function SortableFlowItem({
  item,
  expanded,
  onToggleExpand,
  onRemove,
  surveyId,
  onOpenPictures,
  cardsFocusRequest,
  liveUrl,
  surveySettings,
  questionSetting,
  onQuestionSettingsChange,
  onQuestionTextChange,
  customQuestions,
  onDemographicUpdate,
  onAddDemographicQuestion,
  onUpdateDemographicQuestion,
  onRemoveDemographicQuestion,
  onExplanationUpdate,
}: SortableFlowItemProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getTitle = () => {
    if (item.type === 'question') return item.question.statement;
    if (item.type === 'demographic') return item.page.title;
    if (item.type === 'explanation') return item.page.title;
    return '';
  };

  const getBadgeClass = () => {
    if (item.type === 'question') return styles.question;
    if (item.type === 'demographic') return styles.demographic;
    if (item.type === 'explanation') return styles.explanation;
    return '';
  };

  const getBadgeLabel = () => {
    if (item.type === 'question') return t('question') || 'Question';
    if (item.type === 'demographic') return t('demographic') || 'Demographic';
    if (item.type === 'explanation') return t('explanation') || 'Explanation';
    return '';
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.flowItemCard} ${isDragging ? styles.dragging : ''} ${
        expanded ? styles.expanded : ''
      }`}
      {...attributes}
    >
      <div className={styles.flowItemHeader}>
        <div className={styles.flowDragHandle} {...listeners}>
          <GripIcon />
        </div>
        <span className={`${styles.flowItemBadge} ${getBadgeClass()}`}>
          {getBadgeLabel()}
        </span>
        <span className={styles.flowItemTitle}>{getTitle()}</span>
        {item.type === 'question' && surveySettings && (
          <SynthesisStatusBadge
            compact
            state={resolveSynthesisBadgeState({
              surveyLiveSynthEnabled: readLiveSynthFromSettings(surveySettings),
              questionLiveSynthEnabledOverride: readLiveSynthFromSettings(questionSetting),
            })}
          />
        )}
        {item.type === 'question' && onOpenPictures && (
          <button
            type="button"
            className={styles.flowPicturesButton}
            onClick={onOpenPictures}
            aria-label={t('Add pictures to the cards of this question')}
          >
            <span aria-hidden="true">🖼️</span> {t('Pictures')}
          </button>
        )}
        <button
          type="button"
          className={styles.flowExpandButton}
          onClick={onToggleExpand}
        >
          {expanded ? '▲' : '▼'}
        </button>
        <button
          type="button"
          className={styles.flowRemoveButton}
          onClick={onRemove}
        >
          {t('remove') || 'Remove'}
        </button>
      </div>

      {expanded && (
        <div className={styles.flowItemContent}>
          {item.type === 'question' && surveySettings && onQuestionSettingsChange && (
            <>
              <div className={styles.flowItemAdminInfo}>
                <span className={styles.flowItemAdminLabel}>ID:</span>
                <code className={styles.flowItemAdminId}>{item.question.statementId}</code>
                <a
                  href={`${MAIN_APP_URL}/statement/${item.question.statementId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.flowItemAdminLink}
                >
                  {t('viewInMainApp') || 'View in app'}
                </a>
              </div>
              {onQuestionTextChange && (
                <QuestionTextEditor
                  questionText={item.question.statement}
                  onChange={onQuestionTextChange}
                />
              )}
              <QuestionOptionsBlock
                questionId={item.question.statementId}
                surveyId={surveyId}
                questionSetting={questionSetting}
                surveySettings={surveySettings}
                onSettingsChange={onQuestionSettingsChange}
                liveUrl={liveUrl}
                focusRequest={cardsFocusRequest}
              />
              <QuestionSettingsPanel
                questionSetting={questionSetting}
                storedSettings={item.question.statementSettings}
                surveySettings={surveySettings}
                onChange={onQuestionSettingsChange}
              />
            </>
          )}

          {item.type === 'demographic' && onDemographicUpdate && (
            <DemographicPagePanel
              page={item.page}
              customQuestions={(customQuestions || []).filter((q) =>
                item.page.customQuestionIds.includes(q.userQuestionId || '')
              )}
              onUpdate={onDemographicUpdate}
              onAddQuestion={onAddDemographicQuestion || (() => {})}
              onUpdateQuestion={onUpdateDemographicQuestion || (() => {})}
              onRemoveQuestion={onRemoveDemographicQuestion || (() => {})}
            />
          )}

          {item.type === 'explanation' && onExplanationUpdate && (
            <ExplanationEditor
              page={item.page}
              surveyId={surveyId}
              onUpdate={onExplanationUpdate}
              onRemove={onRemove}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface DemographicPagePanelProps {
  page: SurveyDemographicPage;
  customQuestions: UserDemographicQuestion[];
  onUpdate: (updates: Partial<SurveyDemographicPage>) => void;
  onAddQuestion: () => void;
  onUpdateQuestion: (questionId: string, updates: Partial<UserDemographicQuestion>) => void;
  onRemoveQuestion: (questionId: string) => void;
}

function DemographicPagePanel({
  page,
  customQuestions,
  onUpdate,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
}: DemographicPagePanelProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.demographicPageContent}>
      <div className={styles.formGroup}>
        <label>{t('pageTitle') || 'Section Title'}</label>
        <input
          type="text"
          className={styles.textInput}
          value={page.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
      </div>

      <div className={styles.formGroup}>
        <label>{t('pageDescription') || 'Description (optional)'}</label>
        <textarea
          className={styles.textArea}
          value={page.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={2}
        />
      </div>

      <div className={styles.formGroup}>
        <div className={styles.testModeToggle}>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={page.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
            />
            <span className={styles.toggleSlider}></span>
          </label>
          <span className={styles.toggleLabel}>{t('requiredSection') || 'Required section'}</span>
        </div>
      </div>

      <div className={styles.questionsSection}>
        <h4>{t('demographicQuestions') || 'Questions'}</h4>
        {customQuestions.length === 0 ? (
          <p className={styles.noQuestions}>{t('noQuestionsYet') || 'No questions added yet'}</p>
        ) : (
          <div className={styles.questionsList}>
            {customQuestions.map((question, index) => (
              <DemographicQuestionEditor
                key={question.userQuestionId}
                question={question}
                index={index}
                onUpdate={(updates) => onUpdateQuestion(question.userQuestionId || '', updates)}
                onRemove={() => onRemoveQuestion(question.userQuestionId || '')}
              />
            ))}
          </div>
        )}
        <button type="button" className={styles.addQuestionButton} onClick={onAddQuestion}>
          + {t('addQuestion') || 'Add Question'}
        </button>
      </div>
    </div>
  );
}

/**
 * Unified flow editor that combines questions, demographic pages, and explanation pages
 * in a single drag-and-drop interface
 */
export default function UnifiedFlowEditor({
  questions,
  demographicPages,
  explanationPages,
  customDemographicQuestions,
  surveySettings,
  questionSettings,
  onQuestionsChange,
  onDemographicPagesChange,
  onExplanationPagesChange,
  onCustomDemographicQuestionsChange,
  onQuestionSettingsChange,
  onQuestionTextChange,
  onRemoveQuestion,
  surveyId,
}: UnifiedFlowEditorProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cardsFocus, setCardsFocus] = useState<{ id: string; request: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const flow = useMemo(
    () => buildUnifiedFlow(questions, demographicPages, explanationPages),
    [questions, demographicPages, explanationPages]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = flow.findIndex((item) => item.id === active.id);
      const newIndex = flow.findIndex((item) => item.id === over.id);
      const newFlow = arrayMove(flow, oldIndex, newIndex);

      // Recalculate positions and update state
      const { questionOrder, demographicPages: newDemos, explanationPages: newExplanations } =
        recalculatePositions(newFlow, questions);

      onQuestionsChange(questionOrder);
      onDemographicPagesChange(newDemos);
      onExplanationPagesChange(newExplanations);
    }
  };

  const handleAddExplanationPage = () => {
    const newPage: SurveyExplanationPage = {
      explanationPageId: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: t('newExplanationPage') || 'New Explanation',
      content: '',
      position: -1, // Default: after all questions
    };
    onExplanationPagesChange([...explanationPages, newPage]);
    setExpandedId(newPage.explanationPageId);
  };

  const handleAddDemographicPage = () => {
    const newPage: SurveyDemographicPage = {
      demographicPageId: `demo-page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: t('aboutYou') || 'About You',
      description: '',
      position: -1,
      required: false,
      customQuestionIds: [],
      includeInheritedQuestions: false,
      excludedInheritedQuestionIds: [],
    };
    onDemographicPagesChange([...demographicPages, newPage]);
    setExpandedId(newPage.demographicPageId);
  };

  const handleRemoveItem = (item: FlowItemData) => {
    if (item.type === 'question') {
      onRemoveQuestion(item.id);
    } else if (item.type === 'demographic') {
      onDemographicPagesChange(demographicPages.filter((p) => p.demographicPageId !== item.id));
      // Also remove associated questions
      const page = demographicPages.find((p) => p.demographicPageId === item.id);
      if (page) {
        onCustomDemographicQuestionsChange(
          customDemographicQuestions.filter((q) => !page.customQuestionIds.includes(q.userQuestionId || ''))
        );
      }
    } else if (item.type === 'explanation') {
      onExplanationPagesChange(explanationPages.filter((p) => p.explanationPageId !== item.id));
    }
    if (expandedId === item.id) {
      setExpandedId(null);
    }
  };

  const handleAddDemographicQuestion = (pageId: string) => {
    const questionId = `demo-q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newQuestion: UserDemographicQuestion = {
      userQuestionId: questionId,
      statementId: '', // Will be set when saving to Firestore
      question: '',
      type: UserDemographicQuestionType.text,
      options: [],
      order: customDemographicQuestions.filter((q) =>
        demographicPages.find((p) => p.demographicPageId === pageId)?.customQuestionIds.includes(q.userQuestionId || '')
      ).length,
    };
    onCustomDemographicQuestionsChange([...customDemographicQuestions, newQuestion]);
    onDemographicPagesChange(
      demographicPages.map((p) =>
        p.demographicPageId === pageId
          ? { ...p, customQuestionIds: [...p.customQuestionIds, questionId] }
          : p
      )
    );
  };

  const handleUpdateDemographicQuestion = (
    pageId: string,
    questionId: string,
    updates: Partial<UserDemographicQuestion>
  ) => {
    onCustomDemographicQuestionsChange(
      customDemographicQuestions.map((q) =>
        q.userQuestionId === questionId ? { ...q, ...updates } : q
      )
    );
  };

  const handleRemoveDemographicQuestion = (pageId: string, questionId: string) => {
    onCustomDemographicQuestionsChange(
      customDemographicQuestions.filter((q) => q.userQuestionId !== questionId)
    );
    onDemographicPagesChange(
      demographicPages.map((p) =>
        p.demographicPageId === pageId
          ? { ...p, customQuestionIds: p.customQuestionIds.filter((id) => id !== questionId) }
          : p
      )
    );
  };

  if (flow.length === 0) {
    return (
      <div className={styles.unifiedFlowEditor}>
        <div className={styles.emptyFlow}>
          <p>{t('noFlowItems') || 'No items in the survey flow yet'}</p>
          <p className={styles.hint}>
            {t('addQuestionsFirst') || 'Add questions above, then arrange the flow here'}
          </p>
        </div>
        <div className={styles.addFlowItemButtons}>
          <button
            type="button"
            className={styles.addPageButton}
            onClick={handleAddDemographicPage}
          >
            + {t('addDemographicSection') || 'Add Demographic Section'}
          </button>
          <button
            type="button"
            className={styles.addExplanationButton}
            onClick={handleAddExplanationPage}
          >
            + {t('addExplanationPage') || 'Add Explanation Page'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.unifiedFlowEditor}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={flow.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className={styles.flowItemsList}>
            {flow.map((item, flowIndex) => (
              <SortableFlowItem
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onRemove={() => handleRemoveItem(item)}
                surveyId={surveyId}
                // The live survey addresses pages by their index in this same flow
                liveUrl={surveyId && item.type === 'question' ? `/s/${surveyId}/q/${flowIndex}` : undefined}
                onOpenPictures={
                  item.type === 'question'
                    ? () => {
                        setExpandedId(item.id);
                        setCardsFocus((prev) => ({ id: item.id, request: (prev?.request ?? 0) + 1 }));
                      }
                    : undefined
                }
                cardsFocusRequest={cardsFocus?.id === item.id ? cardsFocus.request : undefined}
                surveySettings={surveySettings}
                questionSetting={item.type === 'question' ? questionSettings[item.id] : undefined}
                onQuestionSettingsChange={
                  item.type === 'question'
                    ? (settings) => onQuestionSettingsChange(item.id, settings)
                    : undefined
                }
                onQuestionTextChange={
                  item.type === 'question'
                    ? (newText) => onQuestionTextChange(item.id, newText)
                    : undefined
                }
                customQuestions={customDemographicQuestions}
                onDemographicUpdate={
                  item.type === 'demographic'
                    ? (updates) =>
                        onDemographicPagesChange(
                          demographicPages.map((p) =>
                            p.demographicPageId === item.id ? { ...p, ...updates } : p
                          )
                        )
                    : undefined
                }
                onAddDemographicQuestion={
                  item.type === 'demographic'
                    ? () => handleAddDemographicQuestion(item.id)
                    : undefined
                }
                onUpdateDemographicQuestion={
                  item.type === 'demographic'
                    ? (qId, updates) => handleUpdateDemographicQuestion(item.id, qId, updates)
                    : undefined
                }
                onRemoveDemographicQuestion={
                  item.type === 'demographic'
                    ? (qId) => handleRemoveDemographicQuestion(item.id, qId)
                    : undefined
                }
                onExplanationUpdate={
                  item.type === 'explanation'
                    ? (updates) =>
                        onExplanationPagesChange(
                          explanationPages.map((p) =>
                            p.explanationPageId === item.id ? { ...p, ...updates } : p
                          )
                        )
                    : undefined
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className={styles.addFlowItemButtons}>
        <button type="button" className={styles.addPageButton} onClick={handleAddDemographicPage}>
          + {t('addDemographicSection') || 'Add Demographic Section'}
        </button>
        <button
          type="button"
          className={styles.addExplanationButton}
          onClick={handleAddExplanationPage}
        >
          + {t('addExplanationPage') || 'Add Explanation Page'}
        </button>
      </div>
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
