import { describe, it, expect } from 'vitest';
import {
	callableMessage,
	classifyInviteError,
	getErrorCode,
	getErrorMessage,
} from '../callableErrors';

describe('callableErrors', () => {
	it('reads the code from FunctionsError-like objects', () => {
		expect(getErrorCode({ code: 'functions/permission-denied' })).toBe(
			'functions/permission-denied',
		);
		expect(getErrorCode(new Error('x'))).toBeUndefined();
		expect(getErrorCode(null)).toBeUndefined();
		expect(getErrorCode({ code: 42 })).toBeUndefined();
	});

	it('extracts a message from errors and strings', () => {
		expect(getErrorMessage(new Error('boom'))).toBe('boom');
		expect(getErrorMessage('plain')).toBe('plain');
		expect(getErrorMessage({})).toBe('');
	});

	it('classifies expired invitations', () => {
		expect(classifyInviteError({ code: 'functions/failed-precondition' })).toBe('expired');
		expect(classifyInviteError({ code: 'functions/deadline-exceeded' })).toBe('expired');
		expect(classifyInviteError(new Error('Invitation has expired'))).toBe('expired');
	});

	it('classifies a wrong-account invitation', () => {
		expect(classifyInviteError({ code: 'functions/permission-denied' })).toBe('wrongEmail');
	});

	it('falls back to generic', () => {
		expect(classifyInviteError({ code: 'functions/internal' })).toBe('generic');
		expect(classifyInviteError(undefined)).toBe('generic');
	});
});

describe('callableMessage', () => {
	const fallback = 'Something went wrong.';

	it('passes through a message the callable wrote for the user', () => {
		const error = Object.assign(new Error('That question is already on this board'), {
			code: 'functions/already-exists',
		});

		expect(callableMessage(error, fallback)).toBe('That question is already on this board');
	});

	it('hides an internal failure behind the fallback', () => {
		const error = Object.assign(new Error('Cannot read property x of undefined'), {
			code: 'functions/internal',
		});

		expect(callableMessage(error, fallback)).toBe(fallback);
	});

	it('falls back when there is no message at all', () => {
		const error = Object.assign(new Error('  '), { code: 'functions/not-found' });

		expect(callableMessage(error, fallback)).toBe(fallback);
	});

	it('falls back for a thrown value that is not an error', () => {
		expect(callableMessage(undefined, fallback)).toBe(fallback);
	});
});
