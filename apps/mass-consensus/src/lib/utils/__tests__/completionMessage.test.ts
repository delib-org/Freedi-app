import {
  COMPLETION_MESSAGE_ID,
  createCompletionMessage,
  getVisibleCompletionMessage,
} from '../completionMessage';

describe('completionMessage', () => {
  describe('createCompletionMessage', () => {
    it('creates an empty message with the fixed id', () => {
      const message = createCompletionMessage('Thank you');

      expect(message).toEqual({
        explanationPageId: COMPLETION_MESSAGE_ID,
        title: 'Thank you',
        content: '',
        position: -1,
      });
    });
  });

  describe('getVisibleCompletionMessage', () => {
    it('returns undefined when the survey has no message', () => {
      expect(getVisibleCompletionMessage({})).toBeUndefined();
    });

    it('returns undefined for a message with no text and no picture', () => {
      const message = { ...createCompletionMessage('Title only'), content: '   \n ' };

      expect(getVisibleCompletionMessage({ completionMessage: message })).toBeUndefined();
    });

    it('returns a message that has text', () => {
      const message = { ...createCompletionMessage('t'), content: '## Thanks!' };

      expect(getVisibleCompletionMessage({ completionMessage: message })).toBe(message);
    });

    it('returns a message that only has a picture', () => {
      const message = { ...createCompletionMessage('t'), heroImageUrl: 'https://example.com/a.png' };

      expect(getVisibleCompletionMessage({ completionMessage: message })).toBe(message);
    });

    it('ignores a blank picture url', () => {
      const message = { ...createCompletionMessage('t'), heroImageUrl: ' ' };

      expect(getVisibleCompletionMessage({ completionMessage: message })).toBeUndefined();
    });
  });
});
