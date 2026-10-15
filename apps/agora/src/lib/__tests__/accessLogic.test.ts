import { describe, expect, it } from 'vitest';
import type { AccessStatusRow } from '@freedi/shared-types';
import {
	accessStateOf,
	buildSubmitRequest,
	currentRequestOf,
	isNotApprovedError,
	submitOutcomeOf,
	validateAccessForm,
	type AccessFormValue,
} from '../accessLogic';

const row = (status: AccessStatusRow['status'], requestId: string = status): AccessStatusRow => ({
	requestId,
	role: 'teacher',
	status,
	createdAt: 1,
});

const typed = (patch: Partial<AccessFormValue> = {}): AccessFormValue => ({
	role: 'teacher',
	fullName: 'Dana Levi',
	schoolNameText: 'Ort Givatayim',
	city: 'Givatayim',
	note: '',
	...patch,
});

describe('validateAccessForm', () => {
	it('accepts a teacher who named the school', () => {
		expect(validateAccessForm(typed())).toEqual({});
	});

	it('needs a name', () => {
		expect(validateAccessForm(typed({ fullName: '   ' })).fullName).toBe('access.err_name');
	});

	it('needs school and city when there is no sign-up link', () => {
		const errors = validateAccessForm(typed({ schoolNameText: '', city: ' ' }));
		expect(errors.schoolNameText).toBe('access.err_school');
		expect(errors.city).toBe('access.err_city');
	});

	it('asks for no school text when the request came through a link', () => {
		expect(
			validateAccessForm(typed({ schoolId: 'school-1', schoolNameText: '', city: '' })),
		).toEqual({});
	});

	it('leaves school and city optional for a coordinator', () => {
		expect(validateAccessForm(typed({ role: 'supervisor', schoolNameText: '', city: '' }))).toEqual(
			{},
		);
	});

	it('refuses text past the server limits', () => {
		expect(validateAccessForm(typed({ fullName: 'x'.repeat(81) })).fullName).toBe(
			'access.err_too_long',
		);
		expect(validateAccessForm(typed({ note: 'x'.repeat(301) })).note).toBe('access.err_too_long');
	});
});

describe('buildSubmitRequest', () => {
	it('sends the link school and no typed school', () => {
		expect(
			buildSubmitRequest(
				typed({ schoolId: 'school-1', schoolNameText: 'ignored', city: 'ignored' }),
			),
		).toEqual({ action: 'submit', role: 'teacher', fullName: 'Dana Levi', schoolId: 'school-1' });
	});

	it('trims and drops empty optional fields', () => {
		expect(
			buildSubmitRequest(typed({ fullName: ' Dana ', schoolNameText: ' Ort ', city: ' X ' })),
		).toEqual({
			action: 'submit',
			role: 'teacher',
			fullName: 'Dana',
			schoolNameText: 'Ort',
			city: 'X',
		});
		expect(buildSubmitRequest(typed({ role: 'supervisor', schoolNameText: '', city: '' }))).toEqual(
			{ action: 'submit', role: 'supervisor', fullName: 'Dana Levi' },
		);
	});

	it('keeps a note when there is one', () => {
		expect(buildSubmitRequest(typed({ note: ' hello ' })).note).toBe('hello');
	});
});

describe('isNotApprovedError (the gated callables refuse unapproved teachers)', () => {
	it('recognises permission-denied with the agora-not-approved reason', () => {
		expect(
			isNotApprovedError({
				code: 'functions/permission-denied',
				details: { reason: 'agora-not-approved' },
			}),
		).toBe(true);
		expect(
			isNotApprovedError({ code: 'permission-denied', details: { reason: 'agora-not-approved' } }),
		).toBe(true);
	});

	it('leaves every other refusal alone', () => {
		expect(isNotApprovedError({ code: 'functions/permission-denied' })).toBe(false);
		expect(
			isNotApprovedError({ code: 'functions/permission-denied', details: { reason: 'other' } }),
		).toBe(false);
		expect(
			isNotApprovedError({
				code: 'functions/unavailable',
				details: { reason: 'agora-not-approved' },
			}),
		).toBe(false);
		expect(isNotApprovedError(new Error('agora-not-approved'))).toBe(false);
		expect(isNotApprovedError(null)).toBe(false);
	});
});

describe('submitOutcomeOf', () => {
	it('maps each server code to one sentence, never the raw message', () => {
		expect(submitOutcomeOf({ code: 'functions/not-found', message: 'raw' })).toEqual({
			kind: 'message',
			key: 'access.err_unknown_school',
		});
		expect(submitOutcomeOf({ code: 'functions/resource-exhausted' })).toEqual({
			kind: 'message',
			key: 'access.err_limit',
		});
		expect(submitOutcomeOf({ code: 'functions/internal', message: 'raw' })).toEqual({
			kind: 'message',
			key: 'access.err_generic',
		});
		expect(submitOutcomeOf(undefined)).toEqual({ kind: 'message', key: 'access.err_generic' });
	});

	it('sends already-exists and already-approved to the status', () => {
		expect(submitOutcomeOf({ code: 'functions/already-exists' })).toEqual({ kind: 'status' });
		expect(submitOutcomeOf({ code: 'functions/failed-precondition' })).toEqual({
			kind: 'status',
		});
	});
});

describe('accessStateOf', () => {
	it('approved teachers and admins see no gate', () => {
		expect(accessStateOf(true, false, [row('pending')])).toBe('approved');
		expect(accessStateOf(false, true, [])).toBe('approved');
	});

	it('a pending request is pending, even behind older answers', () => {
		expect(accessStateOf(false, false, [row('pending'), row('declined')])).toBe('pending');
	});

	it('the newest declined request is the answer', () => {
		expect(accessStateOf(false, false, [row('declined')])).toBe('declined');
	});

	it('a declined request already replaced by a newer one is not', () => {
		expect(accessStateOf(false, false, [row('withdrawn'), row('declined')])).toBe('none');
	});

	it('no requests at all means none', () => {
		expect(accessStateOf(false, false, [])).toBe('none');
	});
});

describe('currentRequestOf', () => {
	it('prefers the pending one, else the newest', () => {
		expect(currentRequestOf([row('declined', 'a'), row('pending', 'b')])?.requestId).toBe('b');
		expect(currentRequestOf([row('declined', 'a'), row('withdrawn', 'b')])?.requestId).toBe('a');
		expect(currentRequestOf([])).toBeNull();
	});
});
