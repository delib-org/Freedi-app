import { summarizeUserSolutions } from '../userSolutionSummary';

describe('summarizeUserSolutions', () => {
  it('counts a participant who has written suggestions', () => {
    expect(summarizeUserSolutions('participant', 'admin', 2)).toEqual({
      hasSubmitted: true,
      solutionCount: 2,
    });
  });

  it('counts a participant who has written none', () => {
    expect(summarizeUserSolutions('participant', 'admin', 0)).toEqual({
      hasSubmitted: false,
      solutionCount: 0,
    });
  });

  it('ignores the options the question creator seeded', () => {
    expect(summarizeUserSolutions('admin', 'admin', 12)).toEqual({
      hasSubmitted: false,
      solutionCount: 0,
    });
  });

  it('still counts a participant when the creator is unknown', () => {
    expect(summarizeUserSolutions('participant', undefined, 1)).toEqual({
      hasSubmitted: true,
      solutionCount: 1,
    });
  });
});
