import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import type { AgoraAccessActor, AgoraAccessRole } from '@freedi/shared-types';

const removeAccess = vi.fn();

vi.mock('@/db/agoraAccess', () => ({
	removeAccess: (...args: unknown[]) => removeAccess(...args),
}));

import RemoveAccess from '../RemoveAccess';

const ADMIN: AgoraAccessActor = { uid: 'admin', isAdmin: true, supervisedSchoolIds: new Set() };
const COORDINATOR: AgoraAccessActor = {
	uid: 'coord',
	isAdmin: false,
	supervisedSchoolIds: new Set(['s1']),
};

function renderRemove(
	actor: AgoraAccessActor,
	role: AgoraAccessRole = 'teacher',
	schoolId = 's1',
	onRemoved = vi.fn(),
) {
	render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<RemoveAccess
				actor={actor}
				target={{ uid: 'person1', role, schoolId }}
				personName="Dana Levi"
				schoolName="Alpha School"
				onRemoved={onRemoved}
			/>
		</TranslationProvider>,
	);

	return onRemoved;
}

describe('RemoveAccess', () => {
	beforeEach(() => {
		removeAccess.mockReset();
		removeAccess.mockResolvedValue({ removedFromSchoolIds: ['s1'], stillApproved: false });
	});
	afterEach(cleanup);

	it('shows for an admin on a teacher and on a coordinator', () => {
		renderRemove(ADMIN, 'teacher');
		expect(screen.getByRole('button', { name: 'Remove access' })).toBeTruthy();
		cleanup();
		renderRemove(ADMIN, 'supervisor');
		expect(screen.getByRole('button', { name: 'Remove access' })).toBeTruthy();
	});

	it('shows for a coordinator on a teacher of their school only', () => {
		renderRemove(COORDINATOR, 'teacher', 's1');
		expect(screen.getByRole('button', { name: 'Remove access' })).toBeTruthy();
		cleanup();
		renderRemove(COORDINATOR, 'teacher', 's2');
		expect(screen.queryByRole('button', { name: 'Remove access' })).toBeNull();
		cleanup();
		renderRemove(COORDINATOR, 'supervisor', 's1');
		expect(screen.queryByRole('button', { name: 'Remove access' })).toBeNull();
	});

	it('asks to confirm, naming the person and the school, before removing', async () => {
		const onRemoved = renderRemove(ADMIN, 'teacher');
		fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
		const dialog = await screen.findByRole('dialog');
		expect(dialog.textContent).toContain('Dana Levi');
		expect(dialog.textContent).toContain('Alpha School');
		expect(removeAccess).not.toHaveBeenCalled();

		fireEvent.click(within(dialog).getAllByRole('button', { name: 'Remove access' })[0]);
		await waitFor(() =>
			expect(removeAccess).toHaveBeenCalledWith({
				uid: 'person1',
				role: 'teacher',
				schoolId: 's1',
			}),
		);
		await waitFor(() => expect(onRemoved).toHaveBeenCalled());
	});

	it('cancel removes nothing', async () => {
		const onRemoved = renderRemove(ADMIN, 'teacher');
		fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
		const dialog = await screen.findByRole('dialog');
		fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		expect(removeAccess).not.toHaveBeenCalled();
		expect(onRemoved).not.toHaveBeenCalled();
	});

	it('keeps the dialog open and shows the reason when the server refuses', async () => {
		removeAccess.mockRejectedValue(
			Object.assign(new Error('Out of your scope'), { code: 'functions/permission-denied' }),
		);
		const onRemoved = renderRemove(COORDINATOR, 'teacher');
		fireEvent.click(screen.getByRole('button', { name: 'Remove access' }));
		const dialog = await screen.findByRole('dialog');
		fireEvent.click(within(dialog).getAllByRole('button', { name: 'Remove access' })[0]);
		expect((await within(dialog).findByRole('alert')).textContent).toBe('Out of your scope');
		expect(onRemoved).not.toHaveBeenCalled();
	});
});
