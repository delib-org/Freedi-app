import { Statement, StatementType } from '@freedi/shared-types';
import { getSuggestionParentIds, selectSuggestedQuestions } from '../suggestedQuestions';

const make = (
  id: string,
  parentId: string,
  statementType: StatementType = StatementType.question,
  createdAt = 0
): Statement => ({ statementId: id, parentId, statementType, createdAt, statement: id } as Statement);

describe('getSuggestionParentIds', () => {
  it('returns distinct real parent ids', () => {
    const selected = [make('a', 'p1'), make('b', 'p1'), make('c', 'p2'), make('d', 'top')];

    expect(getSuggestionParentIds(selected)).toEqual(['p1', 'p2']);
  });

  it('returns nothing when no questions are selected', () => {
    expect(getSuggestionParentIds([])).toEqual([]);
  });
});

describe('selectSuggestedQuestions', () => {
  const selected = [make('a', 'p1')];

  it('suggests siblings and the parent question, excluding the selected ones', () => {
    const parent = make('p1', 'top', StatementType.question, 1);
    const sibling = make('b', 'p1', StatementType.question, 5);
    const result = selectSuggestedQuestions(selected, [make('a', 'p1'), sibling, parent]);

    expect(result.map((q) => q.statementId)).toEqual(['b', 'p1']);
  });

  it('drops non-question candidates and duplicates', () => {
    const sibling = make('b', 'p1');
    const result = selectSuggestedQuestions(selected, [
      sibling,
      sibling,
      make('c', 'p1', StatementType.option),
    ]);

    expect(result.map((q) => q.statementId)).toEqual(['b']);
  });

  it('is empty when everything is already selected', () => {
    expect(selectSuggestedQuestions(selected, [make('a', 'p1')])).toEqual([]);
  });

  it('puts a just-removed question back among the suggestions', () => {
    const removedSibling = make('b', 'p1');

    expect(selectSuggestedQuestions([make('a', 'p1')], [removedSibling])).toEqual([removedSibling]);
  });
});
