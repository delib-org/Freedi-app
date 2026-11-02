import React from 'react';
import clsx from 'clsx';

/**
 * InheritanceSwitch Molecule - Atomic Design System
 *
 * The one inheritance idiom of People (docs/ux/main-people-settings-ux.md §6.4):
 * "Same as the group | Change for this question", a caption with the group's
 * value, then the control it governs (`children`), which the caller renders
 * read-only while `isInherited`. Render it only on spaces that can inherit;
 * a top-level space shows its control without it.
 *
 * Two pressed-state buttons, not tabs: choosing a side saves, so it happens on
 * click or Enter only, never while arrowing past. Styling lives in
 * src/view/style/molecules/_inheritance-switch.scss and the
 * `segmented-control--stretch` atom modifier.
 */
export interface InheritanceSwitchProps {
	isInherited: boolean;
	onChange: (isInherited: boolean) => void;
	/** "Same as the group" */
	inheritLabel: string;
	/** "Change for this question" */
	overrideLabel: string;
	/** Accessible name of the pair, e.g. the subsection title. */
	groupLabel: string;
	/** What "Same as the group" gives, e.g. "Group is: Open to all". */
	caption?: React.ReactNode;
	/** While a switch is being saved both segments ignore taps. */
	isSaving?: boolean;
	className?: string;
	children?: React.ReactNode;
}

const InheritanceSwitch: React.FC<InheritanceSwitchProps> = ({
	isInherited,
	onChange,
	inheritLabel,
	overrideLabel,
	groupLabel,
	caption,
	isSaving = false,
	className,
	children,
}) => {
	const segments = [
		{ id: 'inherit', label: inheritLabel, isActive: isInherited, choose: true },
		{ id: 'override', label: overrideLabel, isActive: !isInherited, choose: false },
	];

	return (
		<div
			className={clsx(
				'inheritance-switch',
				isInherited && 'inheritance-switch--inherited',
				isSaving && 'inheritance-switch--saving',
				className,
			)}
		>
			<div
				role="group"
				aria-label={groupLabel}
				aria-busy={isSaving || undefined}
				className="segmented-control segmented-control--stretch inheritance-switch__choice"
			>
				{segments.map((segment) => (
					<button
						key={segment.id}
						type="button"
						aria-pressed={segment.isActive}
						className={clsx(
							'segmented-control__segment',
							segment.isActive && 'segmented-control__segment--active',
						)}
						onClick={() => {
							if (!segment.isActive) onChange(segment.choose);
						}}
					>
						{segment.label}
					</button>
				))}
			</div>
			{caption && <p className="inheritance-switch__caption">{caption}</p>}
			{children && <div className="inheritance-switch__body">{children}</div>}
		</div>
	);
};

export default InheritanceSwitch;
