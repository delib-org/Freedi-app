import { getQuestionNumber } from '../questionNumber';

describe('getQuestionNumber', () => {
  it('numbers questions from 1 when the survey has several', () => {
    expect(getQuestionNumber(0, 3)).toBe(1);
    expect(getQuestionNumber(2, 3)).toBe(3);
  });

  it('shows no number for a single-question survey', () => {
    expect(getQuestionNumber(0, 1)).toBeUndefined();
  });

  it('shows no number for an index outside the survey', () => {
    expect(getQuestionNumber(-1, 3)).toBeUndefined();
    expect(getQuestionNumber(3, 3)).toBeUndefined();
  });
});
