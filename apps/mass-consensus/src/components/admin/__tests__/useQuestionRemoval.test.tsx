/**
 * @jest-environment jsdom
 */

import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import type { Statement, QuestionOverrideSettings } from '@freedi/shared-types';
import { useQuestionRemoval } from '../useQuestionRemoval';
import {
  removeQuestionFromSurvey,
  restoreQuestionList,
  restoreQuestionSettings,
  QuestionSettingsMap,
} from '../questionRemoval';
import { UI } from '@/constants/common';
import type { Toast } from '@/components/shared/Toast';

const mockShowToast = jest.fn<void, [Omit<Toast, 'id'>]>();

jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const makeQuestion = (id: string): Statement => ({ statementId: id, statement: id } as Statement);
const settingsFor = (id: string): QuestionOverrideSettings =>
  ({ minEvaluationsPerQuestion: id.length } as unknown as QuestionOverrideSettings);

const A = makeQuestion('a');
const B = makeQuestion('b');
const C = makeQuestion('c');

describe('questionRemoval helpers', () => {
  it('removes a question with its settings and reports its position', () => {
    const settings: QuestionSettingsMap = { b: settingsFor('b'), c: settingsFor('c') };
    const result = removeQuestionFromSurvey([A, B, C], settings, 'b');

    expect(result.questions).toEqual([A, C]);
    expect(result.settings).toEqual({ c: settingsFor('c') });
    expect(result.removed).toEqual({ question: B, index: 1, settings: settingsFor('b') });
  });

  it('does nothing for an unknown question', () => {
    const result = removeQuestionFromSurvey([A], {}, 'zzz');

    expect(result.removed).toBeNull();
    expect(result.questions).toEqual([A]);
  });

  it('restores position and settings, and is idempotent', () => {
    const removed = removeQuestionFromSurvey([A, B, C], { b: settingsFor('b') }, 'b').removed;
    if (!removed) throw new Error('expected removal');

    const list = restoreQuestionList([A, C], removed);
    expect(list).toEqual([A, B, C]);
    expect(restoreQuestionList(list, removed)).toBe(list);
    expect(restoreQuestionSettings({}, removed)).toEqual({ b: settingsFor('b') });
  });

  it('clamps the position when the list got shorter', () => {
    const removed = removeQuestionFromSurvey([A, B, C], {}, 'c').removed;
    if (!removed) throw new Error('expected removal');

    expect(restoreQuestionList([A], removed)).toEqual([A, C]);
  });
});

describe('useQuestionRemoval', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
  });

  const setup = () =>
    renderHook(() => {
      const [selectedQuestions, setSelectedQuestions] = useState<Statement[]>([A, B, C]);
      const [questionSettings, setQuestionSettings] = useState<QuestionSettingsMap>({
        b: settingsFor('b'),
      });
      const removal = useQuestionRemoval({
        selectedQuestions,
        questionSettings,
        setSelectedQuestions,
        setQuestionSettings,
      });

      return { selectedQuestions, questionSettings, ...removal };
    });

  it('asks first and keeps the question when the admin cancels', () => {
    const { result } = setup();

    act(() => result.current.requestRemoval('b'));
    expect(result.current.pendingQuestion).toEqual(B);
    expect(result.current.selectedQuestions).toHaveLength(3);

    act(() => result.current.cancelRemoval());
    expect(result.current.pendingQuestion).toBeNull();
    expect(result.current.selectedQuestions).toEqual([A, B, C]);
    expect(result.current.questionSettings).toEqual({ b: settingsFor('b') });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('removes on confirm, then Undo restores position and settings', () => {
    const { result } = setup();

    act(() => result.current.requestRemoval('b'));
    act(() => result.current.confirmRemoval());

    expect(result.current.selectedQuestions).toEqual([A, C]);
    expect(result.current.questionSettings).toEqual({});
    expect(mockShowToast).toHaveBeenCalledTimes(1);

    const toast = mockShowToast.mock.calls[0][0];
    expect(toast.duration).toBe(UI.UNDO_REMOVE_TOAST_MS);
    expect(toast.action?.label).toBe('undo');

    act(() => toast.action?.onClick());
    expect(result.current.selectedQuestions).toEqual([A, B, C]);
    expect(result.current.questionSettings).toEqual({ b: settingsFor('b') });
  });
});
