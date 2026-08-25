import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type KeyboardEvent,
	type FC,
} from 'react';
import clsx from 'clsx';
import type { Organization, OrganizationRole } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { RoleBadge } from '@/components/atomic/atoms/RoleBadge';

/**
 * OrgSwitcher Molecule — the tenant picker in the top bar.
 * Styles: styles/organisms/_org-switcher.scss (.org-switcher)
 *
 * Trigger + `role="listbox"` popover. Keyboard: Enter/Space/↓ open,
 * ↑↓ Home End move, letters typeahead, Enter/Space select, Esc closes and
 * returns focus to the trigger. With one org and nothing to create it
 * renders as static text (`--single`).
 */
export interface OrgSwitcherProps {
	orgs: Organization[];
	currentOrgId: string | null;
	onChange: (organizationId: string) => void;
	/** The caller's role per org, shown as a badge in the list. */
	roles?: Partial<Record<string, OrganizationRole>>;
	/** System admins get a "New organization" footer link. */
	canCreate?: boolean;
	onCreate?: () => void;
	className?: string;
}

const TYPEAHEAD_RESET_MS = 500;

const OrgSwitcher: FC<OrgSwitcherProps> = ({
	orgs,
	currentOrgId,
	onChange,
	roles,
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
		orgs.findIndex((o) => o.organizationId === currentOrgId),
	);
	const [activeIndex, setActiveIndex] = useState(currentIndex);

	const current = orgs.find((o) => o.organizationId === currentOrgId) ?? orgs[0];
	const isSingle = orgs.length <= 1 && !canCreate;

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
		const org = orgs[index];
		if (org && org.organizationId !== currentOrgId) onChange(org.organizationId);
		close();
	};

	const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
			event.preventDefault();
			openList();
		}
	};

	const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
		const last = orgs.length - 1;
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
			for (let step = 0; step < orgs.length; step += 1) {
				const index = (start + step) % orgs.length;
				if (orgs[index].name.toLowerCase().startsWith(buffer)) {
					setActiveIndex(index);

					return;
				}
			}
		}
	};

	if (!current && !canCreate) return null;

	if (isSingle) {
		return (
			<div className={clsx('org-switcher', 'org-switcher--single', className)}>
				<span className="org-switcher__dot" aria-hidden="true" />
				<span className="org-switcher__name">{current?.name}</span>
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
				aria-label={t('Switch organization')}
				onClick={() => (open ? close() : openList())}
				onKeyDown={handleTriggerKeyDown}
			>
				<span className="org-switcher__dot" aria-hidden="true" />
				<span className="org-switcher__name">{current?.name ?? t('Choose an organization')}</span>
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
						{orgs.map((org, index) => {
							const isCurrent = org.organizationId === currentOrgId;
							const role = roles?.[org.organizationId];

							return (
								<li
									key={org.organizationId}
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
									<span className="org-switcher__dot" aria-hidden="true" />
									<span className="org-switcher__name">{org.name}</span>
									{role && <RoleBadge role={role} />}
								</li>
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
