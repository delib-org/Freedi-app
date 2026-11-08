/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import type { SurveyExplanationPage } from '@freedi/shared-types';
import CompletionMessageEditor from '../CompletionMessageEditor';
import { COMPLETION_MESSAGE_ID } from '@/lib/utils/completionMessage';

jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    dir: 'ltr',
  }),
}));

// The explanation editor has its own uploads and markdown; stub it to the
// props the last page hands it.
jest.mock('../ExplanationEditor', () => ({
  __esModule: true,
  default: ({
    page,
    onUpdate,
    onRemove,
    removeLabel,
  }: {
    page: SurveyExplanationPage;
    onUpdate: (updates: Partial<SurveyExplanationPage>) => void;
    onRemove: () => void;
    removeLabel?: string;
  }) => (
    <div data-testid="explanation-editor">
      <span>{page.content}</span>
      <button type="button" onClick={() => onUpdate({ content: 'Edited' })}>
        stub-edit
      </button>
      <button type="button" onClick={onRemove}>
        {removeLabel}
      </button>
    </div>
  ),
}));

const MESSAGE: SurveyExplanationPage = {
  explanationPageId: COMPLETION_MESSAGE_ID,
  title: 'Thanks',
  content: 'See you',
  position: -1,
};

describe('CompletionMessageEditor', () => {
  it('offers to add a message when there is none', () => {
    const onChange = jest.fn();
    render(<CompletionMessageEditor onChange={onChange} />);

    expect(screen.queryByTestId('explanation-editor')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add a message on the last page/ }));

    expect(onChange).toHaveBeenCalledWith({
      explanationPageId: COMPLETION_MESSAGE_ID,
      title: 'Message on the last page',
      content: '',
      position: -1,
    });
  });

  it('opens the editor right after a message is added', () => {
    const { rerender } = render(<CompletionMessageEditor onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add a message on the last page/ }));
    rerender(<CompletionMessageEditor message={MESSAGE} onChange={jest.fn()} />);

    expect(screen.getByTestId('explanation-editor')).toBeInTheDocument();
  });

  it('shows an existing message as a collapsed card that expands into the editor', () => {
    render(<CompletionMessageEditor message={MESSAGE} onChange={jest.fn()} />);

    expect(screen.getByText('Thanks')).toBeInTheDocument();
    expect(screen.queryByTestId('explanation-editor')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Message on the last page' }));
    expect(screen.getByTestId('explanation-editor')).toBeInTheDocument();
  });

  it('merges edits into the message', () => {
    const onChange = jest.fn();
    render(<CompletionMessageEditor message={MESSAGE} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Message on the last page' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub-edit' }));

    expect(onChange).toHaveBeenCalledWith({ ...MESSAGE, content: 'Edited' });
  });

  it('removes the message from the card header and from inside the editor', () => {
    const onChange = jest.fn();
    render(<CompletionMessageEditor message={MESSAGE} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'remove' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Message on the last page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove message' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
