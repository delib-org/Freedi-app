import { isUserCancelledAuthError, isPopupBlockedAuthError } from '../authErrors';

describe('authErrors', () => {
  describe('isUserCancelledAuthError', () => {
    it('treats popup-closed-by-user as a cancellation', () => {
      expect(isUserCancelledAuthError({ code: 'auth/popup-closed-by-user' })).toBe(true);
    });

    it('treats cancelled-popup-request as a cancellation', () => {
      expect(isUserCancelledAuthError({ code: 'auth/cancelled-popup-request' })).toBe(true);
    });

    it('does not treat other auth errors as cancellations', () => {
      expect(isUserCancelledAuthError({ code: 'auth/network-request-failed' })).toBe(false);
      expect(isUserCancelledAuthError({ code: 'auth/popup-blocked' })).toBe(false);
    });

    it('handles non-error values', () => {
      expect(isUserCancelledAuthError(null)).toBe(false);
      expect(isUserCancelledAuthError('auth/popup-closed-by-user')).toBe(false);
      expect(isUserCancelledAuthError({ code: 42 })).toBe(false);
    });
  });

  describe('isPopupBlockedAuthError', () => {
    it('detects popup-blocked', () => {
      expect(isPopupBlockedAuthError({ code: 'auth/popup-blocked' })).toBe(true);
    });

    it('ignores other errors', () => {
      expect(isPopupBlockedAuthError({ code: 'auth/popup-closed-by-user' })).toBe(false);
      expect(isPopupBlockedAuthError(undefined)).toBe(false);
    });
  });
});
