/**
 * Tests for creatorSlice Redux store
 */

import { Creator } from '@freedi/shared-types';
import creatorReducer, {
	setCreator,
	removeCreator,
	setUserAdvanceUser,
	creatorSelector,
} from '../creatorSlice';

describe('creatorSlice', () => {
	const mockCreator: Creator = {
		uid: 'user-123',
		displayName: 'Test User',
		email: 'test@example.com',
		photoURL: 'https://example.com/photo.jpg',
	};

	const initialState = {
		creator: null,
	};

	describe('reducers', () => {
		describe('setCreator', () => {
			it('should set creator from null state', () => {
				const newState = creatorReducer(initialState, setCreator(mockCreator));

				expect(newState.creator).toEqual(mockCreator);
			});

			it('should replace existing creator', () => {
				const stateWithCreator = {
					creator: mockCreator,
				};
				const newCreator: Creator = {
					uid: 'user-456',
					displayName: 'New User',
					email: 'new@example.com',
				};

				const newState = creatorReducer(stateWithCreator, setCreator(newCreator));

				expect(newState.creator).toEqual(newCreator);
				expect(newState.creator?.uid).toBe('user-456');
			});

			it('should preserve all creator properties', () => {
				const fullCreator: Creator = {
					uid: 'user-789',
					displayName: 'Full User',
					email: 'full@example.com',
					photoURL: 'https://example.com/photo.jpg',
					advanceUser: true,
				};

				const newState = creatorReducer(initialState, setCreator(fullCreator));

				expect(newState.creator?.uid).toBe('user-789');
				expect(newState.creator?.displayName).toBe('Full User');
				expect(newState.creator?.email).toBe('full@example.com');
				expect(newState.creator?.photoURL).toBe('https://example.com/photo.jpg');
				expect(newState.creator?.advanceUser).toBe(true);
			});
		});

		describe('removeCreator', () => {
			it('should remove existing creator', () => {
				const stateWithCreator = {
					creator: mockCreator,
				};

				const newState = creatorReducer(stateWithCreator, removeCreator());

				expect(newState.creator).toBeNull();
			});

			it('should do nothing when creator is already null', () => {
				const newState = creatorReducer(initialState, removeCreator());

				expect(newState.creator).toBeNull();
			});
		});

		describe('setUserAdvanceUser', () => {
			it('should set advanceUser to true', () => {
				const stateWithCreator = {
					creator: mockCreator,
				};

				const newState = creatorReducer(stateWithCreator, setUserAdvanceUser(true));

				expect(newState.creator?.advanceUser).toBe(true);
			});

			it('should set advanceUser to false', () => {
				const stateWithCreator = {
					creator: { ...mockCreator, advanceUser: true },
				};

				const newState = creatorReducer(stateWithCreator, setUserAdvanceUser(false));

				expect(newState.creator?.advanceUser).toBe(false);
			});

			it('should not throw when creator is null', () => {
				expect(() => {
					creatorReducer(initialState, setUserAdvanceUser(true));
				}).not.toThrow();
			});

			it('should not modify state when creator is null', () => {
				const newState = creatorReducer(initialState, setUserAdvanceUser(true));

				expect(newState.creator).toBeNull();
			});

			it('should preserve other creator properties', () => {
				const stateWithCreator = {
					creator: mockCreator,
				};

				const newState = creatorReducer(stateWithCreator, setUserAdvanceUser(true));

				expect(newState.creator?.uid).toBe(mockCreator.uid);
				expect(newState.creator?.displayName).toBe(mockCreator.displayName);
				expect(newState.creator?.email).toBe(mockCreator.email);
			});
		});
	});

	describe('selectors', () => {
		describe('creatorSelector', () => {
			it('should return creator from state', () => {
				const state = {
					creator: { creator: mockCreator },
				};

				const result = creatorSelector(state);

				expect(result).toEqual(mockCreator);
			});

			it('should return null when no creator', () => {
				const state = {
					creator: { creator: null },
				};

				const result = creatorSelector(state);

				expect(result).toBeNull();
			});
		});
	});

	describe('action creators', () => {
		it('setCreator should create correct action', () => {
			const action = setCreator(mockCreator);

			expect(action.type).toBe('creator/setCreator');
			expect(action.payload).toEqual(mockCreator);
		});

		it('removeCreator should create correct action', () => {
			const action = removeCreator();

			expect(action.type).toBe('creator/removeCreator');
		});

		it('setUserAdvanceUser should create correct action', () => {
			const action = setUserAdvanceUser(true);

			expect(action.type).toBe('creator/setUserAdvanceUser');
			expect(action.payload).toBe(true);
		});
	});

	describe('initial state', () => {
		it('should have null creator', () => {
			const state = creatorReducer(undefined, { type: 'unknown' });

			expect(state.creator).toBeNull();
		});
	});
});
