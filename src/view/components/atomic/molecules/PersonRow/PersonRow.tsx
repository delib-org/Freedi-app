import React from 'react';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import ProfileAvatar from '../../atoms/ProfileAvatar/ProfileAvatar';

/**
 * PersonRow Molecule - Atomic Design System
 *
 * One person in a People list. The row itself is not interactive; only the
 * controls passed in `select` and `actions` are, so screen readers get a
 * clean list. Render it inside a `ul`.
 * Styling lives in src/view/style/molecules/_person-row.scss.
 */
export interface PersonRowProps {
	name: string;
	photoURL?: string | null;
	/** One line under the name ("asked 2 hours ago"). */
	meta?: string;
	/** Text badges after the name (Creator, Host, You). */
	badges?: React.ReactNode;
	/** A selection checkbox at inline-start. */
	select?: React.ReactNode;
	/** Buttons at inline-end. */
	actions?: React.ReactNode;
	/** The row's own message, e.g. an InlineNote with an error. */
	note?: React.ReactNode;
	/** Wrap the actions under the name on phones (Waiting rows). */
	stackActionsOnMobile?: boolean;
	/**
	 * Members rows: below 601 px the inline actions give way to a ⋯ button
	 * that opens the row's Sheet (UX 3.4). Its accessible name is `menuLabel`.
	 */
	onOpenMenu?: () => void;
	menuLabel?: string;
	/** Dimmed identity; the Blocked badge carries the state in words. */
	isBlocked?: boolean;
	isBusy?: boolean;
	className?: string;
	testId?: string;
}

const PersonRow: React.FC<PersonRowProps> = ({
	name,
	photoURL,
	meta,
	badges,
	select,
	actions,
	note,
	stackActionsOnMobile = false,
	onOpenMenu,
	menuLabel,
	isBlocked = false,
	isBusy = false,
	className,
	testId,
}) => {
	const hasMenu = Boolean(actions && onOpenMenu);

	return (
		<li
			className={clsx(
				'person-row',
				select !== undefined && 'person-row--with-select',
				stackActionsOnMobile && 'person-row--stacked-actions',
				hasMenu && 'person-row--menu-on-mobile',
				isBlocked && 'person-row--blocked',
				isBusy && 'person-row--busy',
				className,
			)}
			aria-busy={isBusy || undefined}
			data-testid={testId}
		>
			{select !== undefined && <span className="person-row__select">{select}</span>}
			<ProfileAvatar
				photoURL={photoURL}
				displayName={name}
				size="medium"
				className="person-row__avatar"
			/>
			<div className="person-row__identity">
				<span className="person-row__name" dir="auto">
					{name}
				</span>
				{badges}
				{meta && <span className="person-row__meta">{meta}</span>}
			</div>
			{actions && <div className="person-row__actions">{actions}</div>}
			{hasMenu && (
				<button
					type="button"
					className="person-row__more"
					onClick={onOpenMenu}
					aria-label={menuLabel}
					aria-haspopup="dialog"
					disabled={isBusy}
				>
					<MoreHorizontal aria-hidden="true" />
				</button>
			)}
			{note && <div className="person-row__note">{note}</div>}
		</li>
	);
};

export default PersonRow;
