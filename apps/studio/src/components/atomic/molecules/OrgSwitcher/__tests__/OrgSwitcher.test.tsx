import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { OrganizationRole } from '@freedi/shared-types';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { TranslationProvider } from '@freedi/shared-i18n/react';
import OrgSwitcher, { type SwitcherEntry } from '../OrgSwitcher';

const ENTRIES: SwitcherEntry[] = [
	{ id: 'o1', kind: 'org', label: 'Metzudot', to: '/orgs/o1', role: OrganizationRole.owner },
	{ id: 'o2', kind: 'org', label: 'Kfar Vitkin', to: '/orgs/o2', role: OrganizationRole.admin },
	{ id: 'personal', kind: 'personal', label: 'Personal', to: '/personal' },
	{ id: 'system', kind: 'system', label: 'System admin', to: '/admin/orgs' },
];

const onSelect = vi.fn();

function renderSwitcher(entries = ENTRIES, currentId: string | null = 'o1') {
	const current = entries.find((e) => e.id === currentId);

	return render(
		<TranslationProvider initialLanguage={LanguagesEnum.en} storageKey="test-language">
			<OrgSwitcher
				entries={entries}
				currentId={currentId}
				currentLabel={current?.label ?? ''}
				currentKind={current?.kind ?? 'org'}
				onSelect={onSelect}
			/>
		</TranslationProvider>,
	);
}

const trigger = () => screen.getByRole('button');

describe('OrgSwitcher', () => {
	beforeEach(() => onSelect.mockReset());
	afterEach(cleanup);

	it('keeps the workspace name in its accessible name', () => {
		renderSwitcher();

		// The name must lead: "Metzudot — Switch organization", never just the verb.
		expect(trigger().textContent).toMatch(/^Metzudot/);
		expect(trigger().textContent).toMatch(/Switch organization/);
	});

	it('reports that it opens a listbox, and whether it is open', () => {
		renderSwitcher();

		expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
		expect(trigger().getAttribute('aria-expanded')).toBe('false');
		fireEvent.click(trigger());
		expect(trigger().getAttribute('aria-expanded')).toBe('true');
	});

	it('opens on ArrowDown and marks the workspace you are in', () => {
		renderSwitcher();

		fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

		const options = screen.getAllByRole('option');
		expect(options).toHaveLength(4);
		expect(options[0].getAttribute('aria-selected')).toBe('true');
	});

	it('lists every workspace, not only the organizations', () => {
		renderSwitcher();
		fireEvent.click(trigger());

		expect(screen.getByRole('option', { name: /Personal/ })).toBeTruthy();
		expect(screen.getByRole('option', { name: /System admin/ })).toBeTruthy();
	});

	it('separates the kinds with a rule that is not an option', () => {
		const { container } = renderSwitcher();
		fireEvent.click(trigger());

		const dividers = container.querySelectorAll('.org-switcher__divider');
		// organizations | personal | system
		expect(dividers).toHaveLength(2);
		expect(dividers[0].getAttribute('role')).toBe('presentation');
	});

	it('moves through the list with the arrow keys', () => {
		renderSwitcher();
		fireEvent.click(trigger());

		const list = screen.getByRole('listbox');
		fireEvent.keyDown(list, { key: 'ArrowDown' });
		fireEvent.keyDown(list, { key: 'Enter' });

		expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'o2' }));
	});

	it('jumps by first letter', () => {
		renderSwitcher();
		fireEvent.click(trigger());

		const list = screen.getByRole('listbox');
		fireEvent.keyDown(list, { key: 'p' });
		fireEvent.keyDown(list, { key: 'Enter' });

		expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'personal' }));
	});

	it('navigates even when you pick the workspace you are already in', () => {
		renderSwitcher();
		fireEvent.click(trigger());

		fireEvent.click(screen.getByRole('option', { name: /Metzudot/ }));

		// The first crumb is the only way back to a workspace's home.
		expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
	});

	it('closes on Escape and hands focus back', () => {
		renderSwitcher();
		fireEvent.click(trigger());

		fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

		expect(screen.queryByRole('listbox')).toBeNull();
		expect(document.activeElement).toBe(trigger());
	});

	it('renders as plain text when there is nowhere else to go', () => {
		renderSwitcher([ENTRIES[2]], 'personal');

		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText('Personal')).toBeTruthy();
	});
});
