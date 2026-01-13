'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import type {
  Statement,
  SurveyDemographicPage,
  SurveyDemographicQuestion,
  SurveyExplanationPage,
  SurveySettings,
  QuestionOverrideSettings,
} from '@freedi/shared-types';
import { UserDemographicQuestionType, SuggestionMode } from '@freedi/shared-types';
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
import styles from './Admin.module.scss';

interface UnifiedFlowEditorProps {
  questions: Statement[];
  demographicPages: SurveyDemographicPage[];
  explanationPages: SurveyExplanationPage[];
  customDemographicQuestions: SurveyDemographicQuestion[];
  surveySettings: SurveySettings;
  questionSettings: Record<string, QuestionOverrideSettings>;
  onQuestionsChange: (questions: Statement[]) => void;
  onDemographicPagesChange: (pages: SurveyDemographicPage[]) => void;
  onExplanationPagesChange: (pages: SurveyExplanationPage[]) => void;
  onCustomDemographicQuestionsChange: (questions: SurveyDemographicQuestion[]) => void;
  onQuestionSettingsChange: (questionId: string, settings: QuestionOverrideSettings) => void;
  onQuestionTextChange: (questionId: string, newText: string) => void;
  onRemoveQuestion: (questionId: string) => void;
}

type FlowItemData =
  | { type: 'question'; id: string; question: Statement }
  | { type: 'demographic'; id: string; page: SurveyDemographicPage }
  | { type: 'explanation'; id: string; page: SurveyExplanationPage };

/**
 * Builds a unified flow from questions, demographic pages, and explanation pages
 * based on their positions
 */
function buildUnifiedFlow(
  questions: Statement[],
  demographicPages: SurveyDemographicPage[],
  explanationPages: SurveyExplanationPage[]
): FlowItemData[] {
  const flow: FlowItemData[] = [];

  // Group pages by position
  const demosByPosition = new Map<number, SurveyDemographicPage[]>();
  demographicPages.forEach((page) => {
    const existing = demosByPosition.get(page.position) || [];
    existing.push(page);
    demosByPosition.set(page.position, existing);
  });

  const explanationsByPosition = new Map<number, SurveyExplanationPage[]>();
  explanationPages.forEach((page) => {
    const existing = explanationsByPosition.get(page.position) || [];
    existing.push(page);
    explanationsByPosition.set(page.position, existing);
  });

  // Helper to add pages at a position
  const addPagesAtPosition = (position: number) => {
    // Explanation pages first
    (explanationsByPosition.get(position) || []).forEach((page) => {
      flow.push({ type: 'explanation', id: page.explanationPageId, page });
    });
    // Then demographic pages
    (demosByPosition.get(position) || []).forEach((page) => {
      flow.push({ type: 'demographic', id: page.demographicPageId, page });
    });
  };

  // Position 0: before all questions
  addPagesAtPosition(0);

  // Interleave questions and pages
  questions.forEach((question, index) => {
    flow.push({ type: 'question', id: question.statementId, question });
    addPagesAtPosition(index + 1);
  });

  // Position -1: after all questions
  addPagesAtPosition(-1);

  return flow;
}

/**
 * Recalculates positions for pages based on new flow order
 */
function recalculatePositions(
  flow: FlowItemData[],
  _questions: Statement[]
): {
  demographicPages: SurveyDemographicPage[];
  explanationPages: SurveyExplanationPage[];
  questionOrder: Statement[];
} {
  const questionOrder: Statement[] = [];
  const demographicPages: SurveyDemographicPage[] = [];
  const explanationPages: SurveyExplanationPage[] = [];

  let lastQuestionIndex = -1;
  const totalQuestions = flow.filter((item) => item.type === 'question').length;

  flow.forEach((item) => {
    if (item.type === 'question') {
      questionOrder.push(item.question);
      lastQuestionIndex++;
    } else if (item.type === 'demographic') {
      const newPosition =
        lastQuestionIndex === totalQuestions - 1 && questionOrder.length === totalQuestions
          ? -1 // After all questions
          : lastQuestionIndex + 1; // After the last question we've seen
      demographicPages.push({ ...item.page, position: newPosition });
    } else if (item.type === 'explanation') {
      const newPosition =
        lastQuestionIndex === totalQuestions - 1 && questionOrder.length === totalQuestions
          ? -1
          : lastQuestionIndex + 1;
      explanationPages.push({ ...item.page, position: newPosition });
    }
  });

  return { questionOrder, demographicPages, explanationPages };
}

interface SortableFlowItemProps {
  item: FlowItemData;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
  // For questions
  surveySettings?: SurveySettings;
  questionSetting?: QuestionOverrideSettings;
  onQuestionSettingsChange?: (settings: QuestionOverrideSettings) => void;
  onQuestionTextChange?: (newText: string) => void;
  // For demographics
  customQuestions?: SurveyDemographicQuestion[];
  onDemographicUpdate?: (updates: Partial<SurveyDemographicPage>) => void;
  onAddDemographicQuestion?: () => void;
  onUpdateDemographicQuestion?: (questionId: string, updates: Partial<SurveyDemographicQuestion>) => void;
  onRemoveDemographicQuestion?: (questionId: string) => void;
  // For explanations
  onExplanationUpdate?: (updates: Partial<SurveyExplanationPage>) => void;
}

function SortableFlowItem({
  item,
  expanded,
  onToggleExpand,
  onRemove,
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
    if (item.type === 'question') return `${item.question.statement} [ID: ${item.question.statementId}]`;
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
              {onQuestionTextChange && (
                <QuestionTextEditor
                  questionText={item.question.statement}
                  onChange={onQuestionTextChange}
                />
              )}
              <QuestionSettingsPanel
                questionSetting={questionSetting}
                surveySettings={surveySettings}
                onChange={onQuestionSettingsChange}
              />
            </>
          )}

          {item.type === 'demographic' && onDemographicUpdate && (
            <DemographicPagePanel
              page={item.page}
              customQuestions={(customQuestions || []).filter((q) =>
                item.page.customQuestionIds.includes(q.questionId)
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
              onUpdate={onExplanationUpdate}
              onRemove={onRemove}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface QuestionSettingsPanelProps {
  questionSetting?: QuestionOverrideSettings;
  surveySettings: SurveySettings;
  onChange: (settings: QuestionOverrideSettings) => void;
}

function QuestionSettingsPanel({
  questionSetting,
  surveySettings,
  onChange,
}: QuestionSettingsPanelProps) {
  const { t } = useTranslation();

  const handleToggle = (key: keyof QuestionOverrideSettings, value: boolean) => {
    onChange({ ...questionSetting, [key]: value });
  };

  const handleNumber = (key: keyof QuestionOverrideSettings, value: number | undefined) => {
    onChange({ ...questionSetting, [key]: value });
  };

  const handleSuggestionMode = (value: string) => {
    if (value === 'default') {
      // Remove the override by creating new object without suggestionMode
      const newSetting = { ...questionSetting };
      delete newSetting.suggestionMode;
      onChange(newSetting);
    } else {
      onChange({ ...questionSetting, suggestionMode: value as SuggestionMode });
    }
  };

  // Get the survey default label for the dropdown
  const getSurveyDefaultLabel = () => {
    const defaultMode = surveySettings.suggestionMode || SuggestionMode.encourage;
    const labels: Record<string, string> = {
      [SuggestionMode.encourage]: t('suggestionModeEncourage') || 'Encourage New Ideas',
      [SuggestionMode.balanced]: t('suggestionModeBalanced') || 'Balanced',
      [SuggestionMode.restrict]: t('suggestionModeRestrict') || 'Encourage Merging',
    };
    return labels[defaultMode] || defaultMode;
  };

  return (
    <div className={styles.questionSettingsPanel}>
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <input
            type="checkbox"
            checked={questionSetting?.allowParticipantsToAddSuggestions ?? false}
            disabled={surveySettings.allowParticipantsToAddSuggestions}
            onChange={(e) => handleToggle('allowParticipantsToAddSuggestions', e.target.checked)}
          />
          <span>{t('allowParticipantsToAddSuggestionsQuestion') || 'Allow participants to add suggestions'}</span>
        </label>
      </div>

      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <input
            type="checkbox"
            checked={questionSetting?.askUserForASolutionBeforeEvaluation ?? true}
            onChange={(e) => handleToggle('askUserForASolutionBeforeEvaluation', e.target.checked)}
          />
          <span>{t('askForSuggestionBeforeEvaluation') || 'Ask for suggestion before showing options'}</span>
        </label>
      </div>

      {/* Suggestion Mode override */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <span>{t('suggestionModeOverride') || 'Suggestion Mode'}</span>
        </label>
        <select
          className={styles.selectInput}
          value={questionSetting?.suggestionMode || 'default'}
          onChange={(e) => handleSuggestionMode(e.target.value)}
          style={{ marginTop: '0.25rem' }}
        >
          <option value="default">
            {t('useSurveyDefault') || 'Use Survey Default'} ({getSurveyDefaultLabel()})
          </option>
          <option value={SuggestionMode.encourage}>
            {t('suggestionModeEncourage') || 'Encourage New Ideas'}
          </option>
          <option value={SuggestionMode.balanced}>
            {t('suggestionModeBalanced') || 'Balanced'}
          </option>
          <option value={SuggestionMode.restrict}>
            {t('suggestionModeRestrict') || 'Encourage Merging'}
          </option>
        </select>
        <span className={styles.settingHint}>
          {t('suggestionModeHint') || 'Controls how easy it is to add new vs. merge with existing'}
        </span>
      </div>

      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <input
            type="checkbox"
            checked={questionSetting?.allowSkipping ?? false}
            disabled={surveySettings.allowSkipping}
            onChange={(e) => handleToggle('allowSkipping', e.target.checked)}
          />
          <span>{t('allowSkippingThisQuestion') || 'Allow skipping this question'}</span>
        </label>
      </div>

      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>
          <span>{t('minEvaluationsThisQuestion') || 'Minimum evaluations for this question'}</span>
          <input
            type="number"
            className={styles.numberInput}
            value={questionSetting?.minEvaluationsPerQuestion ?? ''}
            placeholder={String(surveySettings.minEvaluationsPerQuestion)}
            min={0}
            max={100}
            onChange={(e) => {
              const val = e.target.value;
              handleNumber('minEvaluationsPerQuestion', val ? parseInt(val, 10) : undefined);
            }}
          />
        </label>
      </div>
    </div>
  );
}

interface DemographicPagePanelProps {
  page: SurveyDemographicPage;
  customQuestions: SurveyDemographicQuestion[];
  onUpdate: (updates: Partial<SurveyDemographicPage>) => void;
  onAddQuestion: () => void;
  onUpdateQuestion: (questionId: string, updates: Partial<SurveyDemographicQuestion>) => void;
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
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={page.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
          />
          <span>{t('requiredSection') || 'Required section'}</span>
        </label>
      </div>

      <div className={styles.questionsSection}>
        <h4>{t('demographicQuestions') || 'Questions'}</h4>
        {customQuestions.length === 0 ? (
          <p className={styles.noQuestions}>{t('noQuestionsYet') || 'No questions added yet'}</p>
        ) : (
          <div className={styles.questionsList}>
            {customQuestions.map((question, index) => (
              <DemographicQuestionEditor
                key={question.questionId}
                question={question}
                index={index}
                onUpdate={(updates) => onUpdateQuestion(question.questionId, updates)}
                onRemove={() => onRemoveQuestion(question.questionId)}
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
}: UnifiedFlowEditorProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          customDemographicQuestions.filter((q) => !page.customQuestionIds.includes(q.questionId))
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
    const newQuestion: SurveyDemographicQuestion = {
      questionId: `demo-q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      surveyId: '',
      question: '',
      type: UserDemographicQuestionType.text,
      options: [],
      order: customDemographicQuestions.filter((q) =>
        demographicPages.find((p) => p.demographicPageId === pageId)?.customQuestionIds.includes(q.questionId)
      ).length,
      required: true,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
    };
    onCustomDemographicQuestionsChange([...customDemographicQuestions, newQuestion]);
    onDemographicPagesChange(
      demographicPages.map((p) =>
        p.demographicPageId === pageId
          ? { ...p, customQuestionIds: [...p.customQuestionIds, newQuestion.questionId] }
          : p
      )
    );
  };

  const handleUpdateDemographicQuestion = (
    pageId: string,
    questionId: string,
    updates: Partial<SurveyDemographicQuestion>
  ) => {
    onCustomDemographicQuestionsChange(
      customDemographicQuestions.map((q) =>
        q.questionId === questionId ? { ...q, ...updates, lastUpdate: Date.now() } : q
      )
    );
  };

  const handleRemoveDemographicQuestion = (pageId: string, questionId: string) => {
    onCustomDemographicQuestionsChange(
      customDemographicQuestions.filter((q) => q.questionId !== questionId)
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
            {flow.map((item) => (
              <SortableFlowItem
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onRemove={() => handleRemoveItem(item)}
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
