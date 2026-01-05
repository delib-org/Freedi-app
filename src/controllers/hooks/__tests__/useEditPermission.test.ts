/**
 * Tests for useEditPermission hook
 */

import { renderHook } from '@testing-library/react';
import { Role, Statement } from '@freedi/shared-types';
import { useEditPermission } from '../useEditPermission';

// Mock the dependencies
jest.mock('../useAuthorization', () => ({
	useAuthorization: jest.fn(),
}));

jest.mock('../reduxHooks', () => ({
	useAppSelector: jest.fn(),
}));

import { useAuthorization } from '../useAuthorization';
import { useAppSelector } from '../reduxHooks';

const mockUseAuthorization = useAuthorization as jest.MockedFunction<typeof useAuthorization>;
const mockUseAppSelector = useAppSelector as jest.MockedFunction<typeof useAppSelector>;

describe('useEditPermission', () => {
	const mockStatement: Partial<Statement> = {
		statementId: 'stmt-123',
		statement: 'Test statement',
		creator: {
			uid: 'creator-123',
			displayName: 'Creator',
			email: 'creator@example.com',
		},
	};

	const mockCreator = {
		uid: 'user-123',
		displayName: 'User',
		email: 'user@example.com',
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockUseAuthorization.mockReturnValue({
			isAuthorized: false,
			role: Role.member,
			isAdmin: false,
			loading: false,
			error: false,
			errorMessage: '',
			isWaitingForApproval: false,
		});
		mockUseAppSelector.mockReturnValue(mockCreator);
	});

	describe('canEdit determination', () => {
		it('should return canEdit true when user is admin', () => {
			mockUseAuthorization.mockReturnValue({
				isAuthorized: true,
				role: Role.admin,
				isAdmin: true,
				loading: false,
				error: false,
				errorMessage: '',
				isWaitingForApproval: false,
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.canEdit).toBe(true);
		});

		it('should return canEdit true when user is the creator', () => {
			mockUseAppSelector.mockReturnValue({
				uid: 'creator-123', // Same as statement creator
				displayName: 'Creator',
				email: 'creator@example.com',
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.canEdit).toBe(true);
			expect(result.current.isCreator).toBe(true);
		});

		it('should return canEdit true when user is both admin and creator', () => {
			mockUseAuthorization.mockReturnValue({
				isAuthorized: true,
				role: Role.admin,
				isAdmin: true,
				loading: false,
				error: false,
				errorMessage: '',
				isWaitingForApproval: false,
			});
			mockUseAppSelector.mockReturnValue({
				uid: 'creator-123',
				displayName: 'Creator',
				email: 'creator@example.com',
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.canEdit).toBe(true);
			expect(result.current.isAdmin).toBe(true);
			expect(result.current.isCreator).toBe(true);
		});

		it('should return canEdit false when user is neither admin nor creator', () => {
			mockUseAuthorization.mockReturnValue({
				isAuthorized: true,
				role: Role.member,
				isAdmin: false,
				loading: false,
				error: false,
				errorMessage: '',
				isWaitingForApproval: false,
			});
			mockUseAppSelector.mockReturnValue({
				uid: 'other-user-456',
				displayName: 'Other',
				email: 'other@example.com',
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.canEdit).toBe(false);
			expect(result.current.isAdmin).toBe(false);
			expect(result.current.isCreator).toBe(false);
		});
	});

	describe('isAdmin property', () => {
		it('should return isAdmin true when useAuthorization returns isAdmin true', () => {
			mockUseAuthorization.mockReturnValue({
				isAuthorized: true,
				role: Role.admin,
				isAdmin: true,
				loading: false,
				error: false,
				errorMessage: '',
				isWaitingForApproval: false,
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.isAdmin).toBe(true);
		});

		it('should return isAdmin false when useAuthorization returns isAdmin false', () => {
			mockUseAuthorization.mockReturnValue({
				isAuthorized: true,
				role: Role.member,
				isAdmin: false,
				loading: false,
				error: false,
				errorMessage: '',
				isWaitingForApproval: false,
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.isAdmin).toBe(false);
		});
	});

	describe('isCreator property', () => {
		it('should return isCreator true when user uid matches statement creator uid', () => {
			mockUseAppSelector.mockReturnValue({
				uid: 'creator-123',
				displayName: 'Creator',
				email: 'creator@example.com',
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.isCreator).toBe(true);
		});

		it('should return isCreator false when user uid does not match', () => {
			mockUseAppSelector.mockReturnValue({
				uid: 'different-user-456',
				displayName: 'Different',
				email: 'different@example.com',
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.isCreator).toBe(false);
		});

		it('should return isCreator false when statement creator uid is undefined', () => {
			const statementWithoutCreator: Partial<Statement> = {
				statementId: 'stmt-123',
				statement: 'Test statement',
				creator: undefined,
			};

			const { result } = renderHook(() => useEditPermission(statementWithoutCreator as Statement));

			expect(result.current.isCreator).toBe(false);
		});

		it('should return isCreator false when user uid is undefined', () => {
			mockUseAppSelector.mockReturnValue(undefined);

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.isCreator).toBe(false);
		});
	});

	describe('role property', () => {
		it('should return the role from useAuthorization', () => {
			mockUseAuthorization.mockReturnValue({
				isAuthorized: true,
				role: Role.creator,
				isAdmin: true,
				loading: false,
				error: false,
				errorMessage: '',
				isWaitingForApproval: false,
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.role).toBe(Role.creator);
		});

		it('should return member role by default', () => {
			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.role).toBe(Role.member);
		});
	});

	describe('undefined statement', () => {
		it('should handle undefined statement gracefully', () => {
			const { result } = renderHook(() => useEditPermission(undefined));

			expect(result.current.canEdit).toBe(false);
			expect(result.current.isCreator).toBe(false);
		});

		it('should call useAuthorization with undefined statementId', () => {
			renderHook(() => useEditPermission(undefined));

			expect(mockUseAuthorization).toHaveBeenCalledWith(undefined);
		});
	});

	describe('role-based scenarios', () => {
		it.each([
			[Role.admin, true],
			[Role.creator, true],
			[Role.member, false],
			[Role.waiting, false],
			[Role.banned, false],
			[Role.unsubscribed, false],
		])('should handle role %s correctly for non-creator', (role, expectedIsAdmin) => {
			mockUseAuthorization.mockReturnValue({
				isAuthorized: true,
				role,
				isAdmin: role === Role.admin || role === Role.creator,
				loading: false,
				error: false,
				errorMessage: '',
				isWaitingForApproval: false,
			});

			const { result } = renderHook(() => useEditPermission(mockStatement as Statement));

			expect(result.current.isAdmin).toBe(expectedIsAdmin);
			expect(result.current.role).toBe(role);
		});
	});
});
