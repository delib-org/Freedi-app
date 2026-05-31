import React, { forwardRef } from 'react';
import clsx from 'clsx';
import GlobeIcon from '@/assets/icons/globe.svg?react';
import { LANGUAGES } from '@/constants/Languages';

/**
 * LanguagePill Atom - Atomic Design System
 *
 * A persistent globe-icon button that opens the language popover.
 * A small badge on the icon shows the current language's 2-letter code
 * so users see at a glance which language is active.
 *
 * All styling lives in src/view/style/atoms/_language-pill.scss
 */

export interface LanguagePillProps {
	/** Current language code (e.g. 'en', 'he') */
	currentLanguage: string;
	/** Click handler — typically toggles the popover */
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
	/** True while the language popover is open */
	isOpen?: boolean;
	/** True to draw a one-time pulse + tooltip hint */
	showPulse?: boolean;
	/** Optional translated tooltip text to show next to the pulse */
	hintText?: string;
	/** Visual size variant. 'large' suits standalone contexts (splash). */
	size?: 'medium' | 'large';
	/** Additional CSS classes */
	className?: string;
	/** Optional id */
	id?: string;
}

const LanguagePill = forwardRef<HTMLButtonElement, LanguagePillProps>(
	(
		{
			currentLanguage,
			onClick,
			isOpen = false,
			showPulse = false,
			hintText,
			size = 'medium',
			className,
			id,
		},
		ref,
	) => {
		const language = LANGUAGES.find((lang) => lang.code === currentLanguage) ?? LANGUAGES[1];

		const classes = clsx(
			'language-pill',
			isOpen && 'language-pill--open',
			showPulse && 'language-pill--pulse',
			size === 'large' && 'language-pill--large',
			className,
		);

		return (
			<button
				id={id}
				ref={ref}
				type="button"
				className={classes}
				onClick={onClick}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-label={`Change language, current: ${language.label}`}
			>
				<span className="language-pill__icon" aria-hidden="true">
					<GlobeIcon />
				</span>
				<span className="language-pill__code" aria-hidden="true">
					{language.shortCode}
				</span>
				{showPulse && hintText && (
					<span className="language-pill__hint" role="tooltip">
						{hintText}
					</span>
				)}
			</button>
		);
	},
);

LanguagePill.displayName = 'LanguagePill';

export default LanguagePill;
