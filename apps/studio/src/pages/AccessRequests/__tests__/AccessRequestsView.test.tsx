import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { AccessRequestRow } from '@freedi/shared-types';

vi.mock('react-router-dom', () => ({
	Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
		<a href={to}>{children}</a>
	),
}));

const listAccessRequests = vi.fn();
const approveAccessRequest = vi.fn();
const declineAccessRequest = vi.fn();
const countAccessRequests = vi.fn();

vi.mock('@/db/agoraAccess', () => ({
	listAccessRequests: (...args: unknown[]) => listAccessRequests(...args),
	approveAccessRequest: (...args: unknown[]) => approveAccessRequest(...args),
	declineAccessRequest: (...args: unknown[]) => declineAccessRequest(...args),
	countAccessRequests: (...args: unknown[]) => countAccessRequests(...args),
	removeAccess: vi.fn(),
	getAccessRequest: vi.fn(),
}));

import AccessRequestsView from '../AccessRequestsView';

const SCHOOL = { schoolId: 's1', name: 'Alpha School' };

function request(over: Partial<AccessRequestRow>): AccessRequestRow {
	return {
		requestId: 'r1',
		uid: 'applicant1',
		role: 'teacher',
		fullName: 'Dana Levi',
		schoolId: 's1',
		schoolName: 'Alpha School',
		applicantEmail: 'dana@school.org',
		note: 'I teach grade 8',
		source: 'link',
		status: 'pending',
		createdAt: 1_700_000_000_000,
		lastUpdate: 1_700_000_000_000,
		...over,
	};
}

function renderView(uid = 'me') {
	return render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<AccessRequestsView base="/agora" uid={uid} />
		</TranslationProvider>,
	);
}

describe('AccessRequestsView', () => {
	beforeEach(() => {
		listAccessRequests.mockReset();
		approveAccessRequest.mockReset();
		declineAccessRequest.mockReset();
		countAccessRequests.mockReset();
		countAccessRequests.mockResolvedValue(0);
		approveAccessRequest.mockResolvedValue({ status: 'approved' });
		declineAccessRequest.mockResolvedValue({ status: 'declined' });
	});
	afterEach(cleanup);

	it('shows a loading state, then the rows with the applicant details the callable returned', async () => {
		listAccessRequests.mockReturnValue(new Promise(() => undefined));
		renderView();
		expect(screen.getByRole('status').textContent).toContain('Loading');
		cleanup();

		listAccessRequests.mockResolvedValue({
			isAdmin: false,
			requests: [request({})],
			schools: [SCHOOL],
		});
		renderView();
		expect(await screen.findByText('Dana Levi')).toBeTruthy();
		expect(screen.getByText('dana@school.org')).toBeTruthy();
		expect(screen.getByText('I teach grade 8')).toBeTruthy();
		expect(listAccessRequests).toHaveBeenCalledWith('pending', undefined);
	});

	it('shows the empty state when nothing waits', async () => {
		listAccessRequests.mockResolvedValue({ isAdmin: false, requests: [], schools: [SCHOOL] });
		renderView();
		expect(await screen.findByText('No requests waiting')).toBeTruthy();
	});

	it('shows an error with a retry that asks again', async () => {
		listAccessRequests.mockRejectedValueOnce(new Error('boom'));
		listAccessRequests.mockResolvedValueOnce({
			isAdmin: false,
			requests: [request({})],
			schools: [SCHOOL],
		});
		renderView();
		const retry = await screen.findByRole('button', { name: 'Retry' });
		fireEvent.click(retry);
		expect(await screen.findByText('Dana Levi')).toBeTruthy();
		expect(listAccessRequests).toHaveBeenCalledTimes(2);
	});

	it('lists pending requests oldest first', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: false,
			requests: [
				request({ requestId: 'new', fullName: 'Newer Person', createdAt: 2000 }),
				request({ requestId: 'old', fullName: 'Older Person', createdAt: 1000 }),
			],
			schools: [SCHOOL],
		});
		renderView();
		await screen.findByText('Older Person');
		const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
		expect(names).toEqual(['Older Person', 'Newer Person']);
	});

	it('a coordinator sees Approve and Decline on a teacher request at their school', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: false,
			requests: [request({})],
			schools: [SCHOOL],
		});
		renderView();
		await screen.findByText('Dana Levi');
		expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Decline request' })).toBeTruthy();
	});

	it('a coordinator gets no buttons for a request outside their schools or for a coordinator', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: false,
			requests: [
				request({ requestId: 'other', fullName: 'Elsewhere', schoolId: 's9' }),
				request({ requestId: 'coord', fullName: 'Wants Coordinator', role: 'supervisor' }),
			],
			schools: [SCHOOL],
		});
		renderView();
		await screen.findByText('Elsewhere');
		expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Decline request' })).toBeNull();
	});

	it('an admin sees the buttons on a coordinator request too', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: true,
			requests: [request({ role: 'supervisor', schoolId: undefined, schoolName: undefined })],
			schools: [SCHOOL],
		});
		renderView();
		await screen.findByText('Dana Levi');
		expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
		expect(within(screen.getByRole('listitem')).getByText('Regional coordinator')).toBeTruthy();
	});

	it('no buttons once a request is decided', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: true,
			requests: [request({ status: 'approved', decidedAt: 5 })],
			schools: [SCHOOL],
		});
		renderView();
		await screen.findByText('Dana Levi');
		expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
	});

	it('approving a teacher at their school is one tap, then the list reloads', async () => {
		listAccessRequests.mockResolvedValueOnce({
			isAdmin: false,
			requests: [request({})],
			schools: [SCHOOL],
		});
		listAccessRequests.mockResolvedValueOnce({ isAdmin: false, requests: [], schools: [SCHOOL] });
		renderView();
		fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
		await waitFor(() => expect(approveAccessRequest).toHaveBeenCalledWith({ requestId: 'r1' }));
		expect(await screen.findByText('No requests waiting')).toBeTruthy();
		await waitFor(() => expect(countAccessRequests).toHaveBeenCalled());
	});

	it('shows the server explanation when approval fails', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: false,
			requests: [request({})],
			schools: [SCHOOL],
		});
		approveAccessRequest.mockRejectedValue(
			Object.assign(new Error('Not your school'), { code: 'functions/permission-denied' }),
		);
		renderView();
		fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
		expect((await screen.findByRole('alert')).textContent).toBe('Not your school');
	});

	it('declining asks first, then sends the reason', async () => {
		listAccessRequests.mockResolvedValueOnce({
			isAdmin: false,
			requests: [request({})],
			schools: [SCHOOL],
		});
		listAccessRequests.mockResolvedValueOnce({ isAdmin: false, requests: [], schools: [SCHOOL] });
		renderView();
		fireEvent.click(await screen.findByRole('button', { name: 'Decline request' }));
		expect(declineAccessRequest).not.toHaveBeenCalled();

		const dialog = await screen.findByRole('dialog');
		fireEvent.change(within(dialog).getByRole('textbox'), {
			target: { value: 'Not a teacher here' },
		});
		fireEvent.click(within(dialog).getAllByRole('button', { name: 'Decline request' })[0]);
		await waitFor(() =>
			expect(declineAccessRequest).toHaveBeenCalledWith('r1', 'Not a teacher here'),
		);
		expect(await screen.findByText('No requests waiting')).toBeTruthy();
	});

	it('cancelling the decline dialog sends nothing', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: false,
			requests: [request({})],
			schools: [SCHOOL],
		});
		renderView();
		fireEvent.click(await screen.findByRole('button', { name: 'Decline request' }));
		const dialog = await screen.findByRole('dialog');
		fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		expect(declineAccessRequest).not.toHaveBeenCalled();
	});

	it('an admin approving a coordinator picks schools; at least one is required', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: true,
			requests: [request({ role: 'supervisor', schoolId: undefined, schoolName: undefined })],
			schools: [SCHOOL, { schoolId: 's2', name: 'Beta School' }],
		});
		renderView();
		fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
		const dialog = await screen.findByRole('dialog');
		const confirm = within(dialog).getByRole('button', { name: 'Approve' });
		expect((confirm as HTMLButtonElement).disabled).toBe(true);

		fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Beta School' }));
		expect((confirm as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(confirm);
		await waitFor(() =>
			expect(approveAccessRequest).toHaveBeenCalledWith({ requestId: 'r1', schoolIds: ['s2'] }),
		);
	});

	it('an admin can filter to requests with no school', async () => {
		listAccessRequests.mockResolvedValue({ isAdmin: true, requests: [], schools: [SCHOOL] });
		renderView();
		const select = await screen.findByLabelText('School');
		fireEvent.change(select, { target: { value: 'none' } });
		await waitFor(() => expect(listAccessRequests).toHaveBeenLastCalledWith('pending', 'none'));
	});

	it('a coordinator has no "no school" filter and no role filter', async () => {
		listAccessRequests.mockResolvedValue({
			isAdmin: false,
			requests: [],
			schools: [SCHOOL, { schoolId: 's2', name: 'Beta School' }],
		});
		renderView();
		const select = await screen.findByLabelText('School');
		expect(within(select).queryByText('No school')).toBeNull();
		expect(screen.queryByRole('radio', { name: 'Regional coordinator' })).toBeNull();
	});
});
