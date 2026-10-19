import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { AgoraTeacherInvite } from '@freedi/shared-types';

const manageAgoraSchool = vi.fn();

vi.mock('@/db/agoraAdminFunctions', () => ({
	manageAgoraSchool: (...args: unknown[]) => manageAgoraSchool(...args),
}));

import PendingInvites from '../PendingInvites';

function invite(
	email: string,
	status: AgoraTeacherInvite['status'] = 'pending',
): AgoraTeacherInvite {
	return {
		inviteId: `s1--${email}`,
		schoolId: 's1',
		email,
		status,
		invitedBy: 'admin',
		lastSentAt: 1,
		sendCount: 1,
		createdAt: 1,
		lastUpdate: 1,
	};
}

function renderInvites(invites: AgoraTeacherInvite[]) {
	return render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<PendingInvites schoolId="s1" invites={invites} />
		</TranslationProvider>,
	);
}

describe('PendingInvites', () => {
	beforeEach(() => {
		manageAgoraSchool.mockReset();
		manageAgoraSchool.mockResolvedValue({ schoolId: 's1', emailSent: true, inviteCancelled: true });
	});
	afterEach(cleanup);

	it('lists only pending invites, marked as not signed in yet', () => {
		renderInvites([invite('dana@school.org'), invite('done@school.org', 'accepted')]);
		expect(screen.getByText('dana@school.org')).toBeTruthy();
		expect(screen.queryByText('done@school.org')).toBeNull();
		expect(screen.getByText('Invited – not signed in yet')).toBeTruthy();
	});

	it('renders nothing when there is no pending invite', () => {
		const { container } = renderInvites([invite('done@school.org', 'accepted')]);
		expect(container.textContent).toBe('');
	});

	it('Resend re-sends that invite', async () => {
		renderInvites([invite('dana@school.org')]);
		fireEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));
		await waitFor(() => expect(screen.getByText('Invitation sent again.')).toBeTruthy());
		expect(manageAgoraSchool).toHaveBeenCalledWith({
			action: 'resendTeacherInvite',
			schoolId: 's1',
			teacherEmail: 'dana@school.org',
		});
	});

	it('says so when the resent email could not go out', async () => {
		manageAgoraSchool.mockResolvedValueOnce({ schoolId: 's1', emailSent: false });
		renderInvites([invite('dana@school.org')]);
		fireEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));
		await waitFor(() => expect(screen.getByText(/the email could not be sent/)).toBeTruthy());
	});

	it('Cancel cancels that invite', async () => {
		renderInvites([invite('dana@school.org')]);
		fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation' }));
		await waitFor(() => expect(screen.getByText('Invitation cancelled.')).toBeTruthy());
		expect(manageAgoraSchool).toHaveBeenCalledWith({
			action: 'cancelTeacherInvite',
			schoolId: 's1',
			teacherEmail: 'dana@school.org',
		});
	});

	it('shows an error when cancelling fails', async () => {
		manageAgoraSchool.mockRejectedValueOnce(new Error('boom'));
		renderInvites([invite('dana@school.org')]);
		fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation' }));
		await waitFor(() => expect(screen.getByText('Could not cancel the invitation.')).toBeTruthy());
	});
});
