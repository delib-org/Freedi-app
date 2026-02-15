/**
 * @jest-environment jsdom
 */

/**
 * QuestionIntro Component Tests
 */

import { render, fireEvent, screen } from '@testing-library/react';
import QuestionIntro from '../QuestionIntro';
import { Statement, StatementType } from '@freedi/shared-types';

// Mock i18n
jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Statement with optional description (component casts to this type internally)
type StatementWithDescription = Statement & { description?: string };

const mockCreator = {
  uid: 'user1',
  displayName: 'Test User',
  email: '',
  photoURL: '',
  isAnonymous: false,
};

describe('QuestionIntro', () => {
  const mockQuestion = {
    statementId: 'q1',
    statement: 'How can we improve our city?',
    description: 'Share your ideas for making our city better',
    creatorId: 'user1',
    creator: mockCreator,
    statementType: StatementType.question,
    parentId: 'root',
    topParentId: 'root',
    consensus: 0,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
  } as unknown as StatementWithDescription;

  it('should render question title', () => {
    render(<QuestionIntro question={mockQuestion} onStart={jest.fn()} />);

    expect(screen.getByText(mockQuestion.statement)).toBeInTheDocument();
  });

  it('should render question description when provided', () => {
    render(<QuestionIntro question={mockQuestion} onStart={jest.fn()} />);

    expect(screen.getByText(mockQuestion.description!)).toBeInTheDocument();
  });

  it('should not render description when not provided', () => {
    const questionWithoutDesc = { ...mockQuestion, description: undefined } as unknown as Statement;
    const { container } = render(
      <QuestionIntro question={questionWithoutDesc} onStart={jest.fn()} />
    );

    expect(container.querySelector('.question-intro__description')).not.toBeInTheDocument();
  });

  it('should render time estimate and reassurance', () => {
    render(<QuestionIntro question={mockQuestion} onStart={jest.fn()} />);

    expect(screen.getByText(/Takes about 2-3 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/You can stop anytime/)).toBeInTheDocument();
  });

  it('should call onStart when button clicked', () => {
    const onStart = jest.fn();
    render(<QuestionIntro question={mockQuestion} onStart={onStart} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('should apply custom className', () => {
    const { container } = render(
      <QuestionIntro
        question={mockQuestion}
        onStart={jest.fn()}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('question-intro');
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should render start button with correct text', () => {
    render(<QuestionIntro question={mockQuestion} onStart={jest.fn()} />);

    expect(screen.getByText("Let's Go")).toBeInTheDocument();
  });
});
