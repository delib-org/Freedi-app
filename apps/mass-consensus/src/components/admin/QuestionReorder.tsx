'use client';

import { useState } from 'react';
import { Statement, SurveySettings, QuestionOverrideSettings } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
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
import { isSurveyLevelOverride } from '@/lib/utils/settingsUtils';
import styles from './Admin.module.scss';

interface QuestionReorderProps {
  questions: Statement[];
  onReorder: (questions: Statement[]) => void;
  onRemove: (questionId: string) => void;
  surveySettings: SurveySettings;
  questionSettings: Record<string, QuestionOverrideSettings>;
  onQuestionSettingsChange: (questionId: string, settings: QuestionOverrideSettings) => void;
}

interface SortableItemProps {
  question: Statement;
  index: number;
  onRemove: (questionId: string) => void;
  surveySettings: SurveySettings;
  questionSetting: QuestionOverrideSettings | undefined;
  onSettingsChange: (settings: QuestionOverrideSettings) => void;
}

/**
 * Individual sortable question item with expandable settings
 */
function SortableItem({
  question,
  index,
  onRemove,
  surveySettings,
  questionSetting,
  onSettingsChange,
}: SortableItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.statementId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSettingToggle = (
    key: keyof QuestionOverrideSettings,
    value: boolean | undefined
  ) => {
    onSettingsChange({
      ...questionSetting,
      [key]: value,
    });
  };

  const handleNumberChange = (
    key: keyof QuestionOverrideSettings,
    value: number | undefined
  ) => {
    onSettingsChange({
      ...questionSetting,
      [key]: value,
    });
  };

  // Check which settings are overridden at survey level
  const suggestionsOverridden = isSurveyLevelOverride(surveySettings, 'allowParticipantsToAddSuggestions');
  const skippingOverridden = isSurveyLevelOverride(surveySettings, 'allowSkipping');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.reorderItem} ${isDragging ? styles.dragging : ''} ${expanded ? styles.expanded : ''}`}
      {...attributes}
    >
      <div className={styles.reorderItemHeader}>
        <div className={styles.dragHandle} {...listeners}>
          <GripIcon />
        </div>
        <div className={styles.reorderNumber}>{index + 1}</div>
        <span className={styles.reorderText}>{question.statement}</span>
        <button
          type="button"
          className={styles.settingsToggle}
          onClick={() => setExpanded(!expanded)}
          title={t('questionSettings') || 'Question Settings'}
        >
          <GearIcon />
        </button>
        <button
          type="button"
          className={styles.removeButton}
          onClick={() => onRemove(question.statementId)}
        >
          {t('remove')}
        </button>
      </div>

      {expanded && (
        <div className={styles.questionSettingsPanel}>
          {/* Allow suggestions */}
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              <input
                type="checkbox"
                checked={
                  suggestionsOverridden
                    ? true
                    : questionSetting?.allowParticipantsToAddSuggestions ?? true
                }
                disabled={suggestionsOverridden}
                onChange={(e) =>
                  handleSettingToggle('allowParticipantsToAddSuggestions', e.target.checked)
                }
              />
              <span>{t('allowParticipantsToAddSuggestionsQuestion') || 'Allow participants to add suggestions'}</span>
            </label>
            {suggestionsOverridden && (
              <span className={styles.overrideNote}>{t('surveySettingEnabled') || 'Survey setting enabled'}</span>
            )}
          </div>

          {/* Ask for suggestion before evaluation */}
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              <input
                type="checkbox"
                checked={questionSetting?.askUserForASolutionBeforeEvaluation ?? true}
                onChange={(e) =>
                  handleSettingToggle('askUserForASolutionBeforeEvaluation', e.target.checked)
                }
              />
              <span>{t('askForSuggestionBeforeEvaluation') || 'Ask for suggestion before showing options'}</span>
            </label>
          </div>

          {/* Allow skipping */}
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              <input
                type="checkbox"
                checked={
                  skippingOverridden
                    ? true
                    : questionSetting?.allowSkipping ?? false
                }
                disabled={skippingOverridden}
                onChange={(e) =>
                  handleSettingToggle('allowSkipping', e.target.checked)
                }
              />
              <span>{t('allowSkippingThisQuestion') || 'Allow skipping this question'}</span>
            </label>
            {skippingOverridden && (
              <span className={styles.overrideNote}>{t('surveySettingEnabled') || 'Survey setting enabled'}</span>
            )}
          </div>

          {/* Min evaluations */}
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
                  handleNumberChange(
                    'minEvaluationsPerQuestion',
                    val ? parseInt(val, 10) : undefined
                  );
                }}
              />
            </label>
            <span className={styles.settingHint}>
              {t('leaveEmptyForDefault') || 'Leave empty to use survey default'}
            </span>
          </div>

          {/* Randomize options */}
          <div className={styles.settingRow}>
            <label className={styles.settingLabel}>
              <input
                type="checkbox"
                checked={questionSetting?.randomizeOptions ?? false}
                onChange={(e) =>
                  handleSettingToggle('randomizeOptions', e.target.checked)
                }
              />
              <span>{t('randomizeOptionsOrder') || 'Randomize options order'}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Component for reordering questions using drag and drop
 * with expandable per-question settings
 */
export default function QuestionReorder({
  questions,
  onReorder,
  onRemove,
  surveySettings,
  questionSettings,
  onQuestionSettingsChange,
}: QuestionReorderProps) {
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = questions.findIndex((q) => q.statementId === active.id);
      const newIndex = questions.findIndex((q) => q.statementId === over.id);
      onReorder(arrayMove(questions, oldIndex, newIndex));
    }
  };

  if (questions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
        {t('noQuestionsToReorder')}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={questions.map((q) => q.statementId)}
        strategy={verticalListSortingStrategy}
      >
        <div className={styles.reorderList}>
          {questions.map((question, index) => (
            <SortableItem
              key={question.statementId}
              question={question}
              index={index}
              onRemove={onRemove}
              surveySettings={surveySettings}
              questionSetting={questionSettings[question.statementId]}
              onSettingsChange={(settings) =>
                onQuestionSettingsChange(question.statementId, settings)
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Grip icon for drag handle
 */
function GripIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

/**
 * Gear icon for settings toggle
 */
function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
