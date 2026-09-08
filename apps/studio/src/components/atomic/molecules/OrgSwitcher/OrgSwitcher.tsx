import {
	Fragment,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactElement,
	type FC,
} from 'react';
import clsx from 'clsx';
import type { OrganizationRole } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { RoleBadge } from '@/components/atomic/atoms/RoleBadge';

/**
 * OrgSwitcher Molecule — the first crumb of the trail: the workspace you are
 * in, and the way to leave it.
 * Styles: styles/organisms/_org-switcher.scss (.org-switcher)
 *
 * It lists every workspace the console holds — the organizations, your own
 * events, and the system-admin screens — because they are siblings, not
 * settings. Choosing the one you are already in navigates to its home, which
 * is what a person clicking their own workspace name expects.
 *
 * Trigger + `role="listbox"` popover. Keyboard: Enter/Space/↓ open,
 * ↑↓ Home End move, letters typeahead, Enter/Space select, Esc closes and
 * returns focus to the trigger. With one workspace and nothing to create it
 * renders as static text (`--single`).
 */
export type SwitcherEntryKind = 'org' | 'personal' | 'system';

export interface SwitcherEntry {
	id: string;
	kind: SwitcherEntryKind;
	label: string;
	/** Where choosing it goes. */
	to: string;
	/** The caller's role, shown as a badge. Organizations only. */
	role?: OrganizationRole;
}

export interface OrgSwitcherProps {
	entries: SwitcherEntry[];
	/** The entry you are in, by id. */
	currentId: string | null;
	/** What the trigger says — the scope's own label, which may still be loading. */
	currentLabel: string;
	currentKind: SwitcherEntryKind;
	onSelect: (entry: SwitcherEntry) => void;
	/** System admins get a "New organization" footer link. */
	canCreate?: boolean;
	onCreate?: () => void;
	className?: string;
}

/** A person glyph for "Personal", a grid for the system-admin screens. */
const GLYPHS: Partial<Record<SwitcherEntryKind, ReactElement>> = {
	personal: (
		<svg
			className="org-switcher__glyph"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			aria-hidden="true"
		>
			<circle cx="12" cy="8" r="3.5" />
			<path d="M5 20a7 7 0 0 1 14 0" />
		</svg>
	),
	system: (
		<svg
			className="org-switcher__glyph"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			aria-hidden="true"
		>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M3 10h18M9 4v16" />
		</svg>
	),
};

/** The marker before a name: an accent dot for an org, a glyph otherwise. */
function Marker({ kind }: { kind: SwitcherEntryKind }) {
	if (kind === 'org') return <span className="org-switcher__dot" aria-hidden="true" />;

	return GLYPHS[kind] ?? null;
}

const TYPEAHEAD_RESET_MS = 500;

const OrgSwitcher: FC<OrgSwitcherProps> = ({
	entries,
	currentId,
	currentLabel,
	currentKind,
	onSelect,
	canCreate = false,
	onCreate,
	className,
}) => {
	const { t } = useTranslation();
	const listboxId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const typeahead = useRef({ buffer: '', timer: 0 });

	const [open, setOpen] = useState(false);
	const currentIndex = Math.max(
		0,
		entries.findIndex((entry) => entry.id === currentId),
	);
	const [activeIndex, setActiveIndex] = useState(currentIndex);

	const isSingle = entries.length <= 1 && !canCreate;

	const close = useCallback((restoreFocus = true) => {
		setOpen(false);
		if (restoreFocus) triggerRef.current?.focus();
	}, []);

	const openList = useCallback(() => {
		setActiveIndex(currentIndex);
		setOpen(true);
	}, [currentIndex]);

	// Focus the active option once the popover is in the DOM; close on outside click.
	useEffect(() => {
		if (!open) return;
		const options = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
		options?.[activeIndex]?.focus();

		const handlePointerDown = (event: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('pointerdown', handlePointerDown);

		return () => document.removeEventListener('pointerdown', handlePointerDown);
	}, [open, activeIndex]);

	const select = (index: number) => {
		// Choosing the workspace you are already in goes to its home; the trail's
		// first crumb is the only way back there from a page inside it.
		const entry = entries[index];
		if (entry) onSelect(entry);
		close();
	};

	const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
			event.preventDefault();
			openList();
		}
	};

	const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
		const last = entries.length - 1;
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				setActiveIndex((i) => Math.min(last, i + 1));

				return;
			case 'ArrowUp':
				event.preventDefault();
				setActiveIndex((i) => Math.max(0, i - 1));

				return;
			case 'Home':
				event.preventDefault();
				setActiveIndex(0);

				return;
			case 'End':
				event.preventDefault();
				setActiveIndex(last);

				return;
			case 'Enter':
			case ' ':
				event.preventDefault();
				select(activeIndex);

				return;
			case 'Escape':
				event.preventDefault();
				event.stopPropagation();
				close();

				return;
			case 'Tab':
				// Let focus leave naturally (to the create link or out) but close after.
				setOpen(false);

				return;
			default:
				break;
		}

		// Typeahead: letters accumulate for half a second.
		if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
			window.clearTimeout(typeahead.current.timer);
			typeahead.current.buffer += event.key.toLowerCase();
			typeahead.current.timer = window.setTimeout(() => {
				typeahead.current.buffer = '';
			}, TYPEAHEAD_RESET_MS);
			const { buffer } = typeahead.current;
			const start = buffer.length === 1 ? activeIndex + 1 : activeIndex;
			for (let step = 0; step < entries.length; step += 1) {
				const index = (start + step) % entries.length;
				if (entries[index].label.toLowerCase().startsWith(buffer)) {
					setActiveIndex(index);

					return;
				}
			}
		}
	};

	// Nowhere to switch to: the workspace still names itself, as static text.
	if (isSingle) {
		return (
			<div className={clsx('org-switcher', 'org-switcher--single', className)}>
				<Marker kind={currentKind} />
				<span className="org-switcher__name" dir="auto">
					{currentLabel}
				</span>
			</div>
		);
	}

	return (
		<div ref={rootRef} className={clsx('org-switcher', open && 'org-switcher--open', className)}>
			<button
				type="button"
				ref={triggerRef}
				className="org-switcher__trigger"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				onClick={() => (open ? close() : openList())}
				onKeyDown={handleTriggerKeyDown}
			>
				<Marker kind={currentKind} />
				<span className="org-switcher__name" dir="auto">
					{currentLabel || t('Choose an organization')}
				</span>
				{/* Kept out of aria-label so the workspace name stays in the accessible name. */}
				<span className="org-switcher__sr"> — {t('Switch organization')}</span>
				<svg
					className="org-switcher__chevron"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>

			{open && (
				<div className="org-switcher__popover">
					<ul
						id={listboxId}
						ref={listRef}
						className="org-switcher__list"
						role="listbox"
						aria-label={t('Organizations')}
						aria-activedescendant={`${listboxId}-${activeIndex}`}
						onKeyDown={handleListKeyDown}
					>
						{entries.map((entry, index) => {
							const isCurrent = entry.id === currentId;
							// A rule between kinds: organizations, then your own events,
							// then the admin screens.
							const startsGroup = index > 0 && entries[index - 1].kind !== entry.kind;

							return (
								<Fragment key={entry.id}>
									{startsGroup && <li role="presentation" className="org-switcher__divider" />}
									<li
										id={`${listboxId}-${index}`}
										role="option"
										aria-selected={isCurrent}
										tabIndex={index === activeIndex ? 0 : -1}
										className={clsx(
											'org-switcher__option',
											isCurrent && 'org-switcher__option--active',
										)}
										onClick={() => select(index)}
										onMouseMove={() => setActiveIndex(index)}
									>
										<Marker kind={entry.kind} />
										<span className="org-switcher__name" dir="auto">
											{entry.label}
										</span>
										{entry.role && <RoleBadge role={entry.role} />}
									</li>
								</Fragment>
							);
						})}
					</ul>
					{canCreate && (
						<button
							type="button"
							className="org-switcher__create"
							onClick={() => {
								close(false);
								onCreate?.();
							}}
						>
							{t('New organization')}
						</button>
					)}
				</div>
			)}
		</div>
	);
};

export default OrgSwitcher;
