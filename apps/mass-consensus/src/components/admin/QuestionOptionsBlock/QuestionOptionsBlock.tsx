'use client';

/**
 * QuestionOptionsBlock — the "Options" block at the top of a question row in
 * the survey editor: the "Admin options only" mode and its two switches, the
 * options editor (text, pictures, add, delete) and a live participant preview.
 */

import React, { useEffect, useRef } from 'react';
import { QuestionOverrideSettings, SurveySettings } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import CardList from '@/components/admin/CardList';
import { useQuestionCards } from '@/hooks/useQuestionCards';
import { getMergedSettings } from '@/lib/utils/settingsUtils';
import OptionsModeControls, { OptionsMode } from './OptionsModeControls';
import ParticipantPreview from './ParticipantPreview';

export interface QuestionOptionsBlockProps {
  questionId: string;
  surveyId?: string;
  questionSetting?: QuestionOverrideSettings;
  surveySettings: SurveySettings;
  onSettingsChange: (settings: QuestionOverrideSettings) => void;
  /** The real page of this question, when the survey exists. */
  liveUrl?: string;
  /** Each new value opens the editor and brings it into view ("Pictures" in the row header). */
  focusRequest?: number;
}

export default function QuestionOptionsBlock({
  questionId,
  surveyId,
  questionSetting,
  surveySettings,
  onSettingsChange,
  liveUrl,
  focusRequest,
}: QuestionOptionsBlockProps) {
  const { t, tWithParams } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const mode: OptionsMode = {
    adminProvidesOptions: questionSetting?.adminProvidesOptions ?? false,
    blockParticipantOptions: questionSetting?.blockParticipantOptions ?? false,
  };
  const cards = useQuestionCards({ questionId, surveyId, enabled: true });

  const setMode = (next: OptionsMode) => onSettingsChange({ ...questionSetting, ...next });

  useEffect(() => {
    if (!focusRequest) return;
    if (!mode.adminProvidesOptions) setMode({ ...mode, adminProvidesOptions: true });
    const timer = setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    return () => clearTimeout(timer);
    // Only a new request should open the editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const merged = getMergedSettings(surveySettings, questionSetting);
  const canAdd = !mode.blockParticipantOptions && merged.allowParticipantsToAddSuggestions;
  const showEmptyWarning = mode.blockParticipantOptions && cards.isLoaded && cards.savedCount === 0;

  const summary =
    cards.savedCount === 0
      ? t('No options yet')
      : `${tWithParams('{{count}} options', { count: cards.savedCount })} · ${tWithParams('{{count}} with pictures', { count: cards.pictureCount })}`;

  return (
    <section className="question-options" ref={sectionRef} aria-labelledby={`question-options-${questionId}`}>
      <div className="question-options__header">
        <h3 id={`question-options-${questionId}`} className="question-options__title">
          {t('Options')}
        </h3>
        {cards.isLoaded && <span className="question-options__summary">{summary}</span>}
      </div>

      <OptionsModeControls mode={mode} onChange={setMode} />

      {showEmptyWarning && (
        <p className="question-options__warning" role="alert">
          <span aria-hidden="true">⚠️</span> {t('Participants will have nothing to rate. Add at least one option.')}
        </p>
      )}

      {mode.adminProvidesOptions ? (
        <div className="question-options__workspace">
          <div className="question-options__editor">
            {cards.isLoading && <p className="question-options__loading">{t('Loading...')}</p>}

            {cards.loadError && (
              <p className="question-options__error" role="alert">
                {t("Couldn't load the cards")}
                <button type="button" className="card-list__link-button" onClick={() => void cards.load()}>
                  {t('Retry')}
                </button>
              </p>
            )}

            {cards.isLoaded && (
              <CardList
                mode="saved"
                editableText
                rows={cards.rows}
                onAttach={(key, file) => void cards.upload(key, file)}
                onAltChange={cards.setAlt}
                onAltCommit={(key) => void cards.commitAlt(key)}
                onRemovePicture={(key) => void cards.removePicture(key)}
                onRetry={cards.retry}
                onTextChange={cards.setText}
                onTextCommit={(key) => void cards.commitText(key)}
                onInsertAfter={cards.insertAfter}
                onDeleteCard={cards.requestDelete}
                confirmingDeleteKey={cards.confirmingDeleteKey}
                onConfirmDelete={(confirmed) => void cards.confirmDelete(confirmed)}
                onAddCard={() => cards.addCard()}
                addLabel={t('+ Add option')}
              />
            )}
          </div>

          <ParticipantPreview
            cards={cards.previewCards}
            canAdd={canAdd}
            ratingMode={questionSetting?.ratingMode}
            liveUrl={liveUrl}
          />
        </div>
      ) : (
        cards.isLoaded && (
          <p className="question-options__folded">
            {cards.savedCount > 0
              ? tWithParams('{{count}} options, {{pictures}} with pictures — participants still see them.', {
                  count: cards.savedCount,
                  pictures: cards.pictureCount,
                })
              : t('No options yet.')}{' '}
            <button
              type="button"
              className="card-list__link-button"
              onClick={() => setMode({ ...mode, adminProvidesOptions: true })}
            >
              {t('Edit the options')}
            </button>
          </p>
        )
      )}
    </section>
  );
}
