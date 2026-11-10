import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationFrequency, type NotificationSettings } from '@freedi/shared-types';
import GlobalNotificationSettings from '../GlobalNotificationSettings';
import {
	getNotificationSettings,
	updateNotificationSettings,
} from '@/controllers/db/notificationSettings/db_notificationSettings';

jest.mock('react-redux', () => ({
	useSelector: () => ({ uid: 'u1' }),
}));
jest.mock('@/redux/creator/creatorSlice', () => ({
	creatorSelector: jest.fn(),
}));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/controllers/db/notificationSettings/db_notificationSettings', () => ({
	getNotificationSettings: jest.fn(),
	updateNotificationSettings: jest.fn(),
}));

const LABEL = 'Updates about my answers';

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
	return {
		userId: 'u1',
		muted: false,
		defaultChannels: { push: true, inApp: true, email: false },
		defaultFrequency: NotificationFrequency.INSTANT,
		createdAt: 1,
		lastUpdate: 1,
		...overrides,
	};
}

async function renderWith(loaded: NotificationSettings): Promise<HTMLInputElement> {
	jest.mocked(getNotificationSettings).mockResolvedValue(loaded);
	jest.mocked(updateNotificationSettings).mockResolvedValue(null);
	render(<GlobalNotificationSettings />);

	return (await screen.findByRole('checkbox', { name: LABEL })) as HTMLInputElement;
}

describe('GlobalNotificationSettings: Updates about my answers', () => {
	it('is on for someone who never set it', async () => {
		expect(await renderWith(settings())).toBeChecked();
	});

	it('shows off when it was turned off', async () => {
		expect(await renderWith(settings({ answerUpdates: false }))).not.toBeChecked();
	});

	it('saves the choice', async () => {
		const toggle = await renderWith(settings());

		fireEvent.click(toggle);

		await waitFor(() =>
			expect(updateNotificationSettings).toHaveBeenCalledWith('u1', { answerUpdates: false }),
		);
	});

	it('cannot be changed while all notifications are paused', async () => {
		expect(await renderWith(settings({ muted: true }))).toBeDisabled();
	});
});
