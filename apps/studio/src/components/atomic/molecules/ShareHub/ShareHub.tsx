import { useEffect, useState, type KeyboardEvent, type FC } from 'react';
import clsx from 'clsx';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { StatusPill } from '@/components/atomic/atoms/StatusPill';
import { QRCodePanel } from '@/components/atomic/molecules/QRCodePanel';

/**
 * ShareHub Molecule — pick a shareable activity and get its QR + link.
 * Styles: styles/organisms/_share-hub.scss (.share-hub)
 *
 * `embedded` drops the card chrome so it can sit inside the FacilitateDrawer;
 * with a single shareable activity the picker list is omitted entirely.
 */
export interface ShareHubProps {
	activities: DerivedActivity[];
	/** Pre-select this activity (defaults to the first shareable one). */
	initialSelectedId?: string;
	/** Render without card chrome (inside a drawer section). */
	embedded?: boolean;
	/** Override the heading; pass an empty string to hide it. */
	title?: string;
	className?: string;
}

const ShareHub: FC<ShareHubProps> = ({
	activities,
	initialSelectedId,
	embedded = false,
	title,
	className,
}) => {
	const { t } = useTranslation();
	const shareable = activities.filter((a) => a.participant);
	const [selectedId, setSelectedId] = useState<string>(
		initialSelectedId ?? shareable[0]?.statementId ?? '',
	);

	// Keep a valid selection when the activity list changes underneath us.
	useEffect(() => {
		if (shareable.length > 0 && !shareable.some((a) => a.statementId === selectedId)) {
			setSelectedId(shareable[0].statementId);
		}
	}, [shareable, selectedId]);

	const heading = title === undefined ? t('Share Hub') : title;
	const rootClasses = clsx('share-hub', embedded && 'share-hub--embedded', className);

	if (shareable.length === 0) {
		return (
			<section className={rootClasses} aria-label={heading || t('Share Hub')}>
				{heading && <h2 className="share-hub__title">{heading}</h2>}
				<p className="share-hub__empty">{t('No shareable activities yet.')}</p>
			</section>
		);
	}

	const selected = shareable.find((a) => a.statementId === selectedId) ?? shareable[0];
	const selectedIndex = shareable.indexOf(selected);

	const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
		let next: number | null = null;
		if (event.key === 'ArrowDown') next = (selectedIndex + 1) % shareable.length;
		if (event.key === 'ArrowUp') next = (selectedIndex - 1 + shareable.length) % shareable.length;
		if (event.key === 'Home') next = 0;
		if (event.key === 'End') next = shareable.length - 1;
		if (next === null) return;
		event.preventDefault();
		setSelectedId(shareable[next].statementId);
		const options = event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]');
		options[next]?.focus();
	};

	return (
		<section className={rootClasses} aria-label={heading || t('Share Hub')}>
			{heading && <h2 className="share-hub__title">{heading}</h2>}

			{shareable.length > 1 && (
				<ul
					className="share-hub__list"
					role="listbox"
					aria-label={t('Choose what to share')}
					onKeyDown={handleKeyDown}
				>
					{shareable.map((activity) => {
						const isSelected = activity.statementId === selected.statementId;

						return (
							<li
								key={activity.statementId}
								role="option"
								aria-selected={isSelected}
								tabIndex={isSelected ? 0 : -1}
								className={clsx('share-hub__item', isSelected && 'share-hub__item--selected')}
								onClick={() => setSelectedId(activity.statementId)}
							>
								<span className="share-hub__item-icon" aria-hidden="true">
									{activity.def.icon}
								</span>
								<span className="share-hub__item-title">{activity.title || t('Untitled')}</span>
								<StatusPill status={activity.runState} />
							</li>
						);
					})}
				</ul>
			)}

			{selected.participant && (
				<div className="share-hub__qr">
					<QRCodePanel url={selected.participant.href} title={selected.title} />
				</div>
			)}
		</section>
	);
};

export default ShareHub;
