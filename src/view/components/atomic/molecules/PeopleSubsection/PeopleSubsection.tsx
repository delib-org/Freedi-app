import React, { Ref } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import Collapse from '../Collapse/Collapse';

/**
 * PeopleSubsection Molecule - Atomic Design System
 *
 * One accordion row of the People card. Controlled: the People organism owns
 * which rows are open, so `#anchor` deep links can open one. The section's
 * `id` is the anchor (`waiting`, `members`, …).
 * Styling lives in src/view/style/molecules/_people-subsection.scss.
 */
export interface PeopleSubsectionProps {
	/** Anchor id, without '#'. */
	id: string;
	title: string;
	/** Live summary after the title ("Open to all · same as the group"). */
	summary?: string;
	/** Count of things waiting for the host; the badge shows only above 0. */
	count?: number;
	/** Spoken with the badge, e.g. "3 waiting to join". Required with count. */
	countLabel?: string;
	isOpen: boolean;
	onToggle: (id: string) => void;
	/** Lets the organism move focus to the header after a deep link. */
	toggleRef?: Ref<HTMLButtonElement>;
	children: React.ReactNode;
	className?: string;
}

const MAX_BADGE_COUNT = 99;

/**
 * One clean name for the header button: title, then summary, then the
 * badge's spoken label unless the summary already says it ("Entry check,
 * 3 to review" — not "Entry check · 3 to review 3 3 to review").
 */
export function subsectionHeaderName(title: string, summary?: string, countLabel?: string): string {
	const parts = [title, summary, countLabel].filter(
		(part): part is string => typeof part === 'string' && part.trim() !== '',
	);

	return [...new Set(parts)].join(', ');
}

const PeopleSubsection: React.FC<PeopleSubsectionProps> = ({
	id,
	title,
	summary,
	count = 0,
	countLabel,
	isOpen,
	onToggle,
	toggleRef,
	children,
	className,
}) => {
	const bodyId = `${id}-body`;
	const hasAttention = count > 0;

	return (
		<section
			id={id}
			className={clsx(
				'people-subsection',
				isOpen && 'people-subsection--open',
				hasAttention && 'people-subsection--attention',
				className,
			)}
		>
			<h3 className="people-subsection__heading">
				<button
					ref={toggleRef}
					type="button"
					className="people-subsection__header"
					aria-label={subsectionHeaderName(title, summary, hasAttention ? countLabel : undefined)}
					aria-expanded={isOpen}
					aria-controls={bodyId}
					onClick={() => onToggle(id)}
				>
					<span className="people-subsection__title">{title}</span>
					{summary && (
						<>
							<span className="people-subsection__separator" aria-hidden="true">
								·
							</span>
							<span className="people-subsection__summary">{summary}</span>
						</>
					)}
					{hasAttention && (
						<span className="badge badge--unread people-subsection__count" aria-hidden="true">
							{count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : count}
						</span>
					)}
					<ChevronDown className="people-subsection__chevron" aria-hidden="true" />
				</button>
			</h3>
			<Collapse id={bodyId} isOpen={isOpen}>
				<div className="people-subsection__body">{children}</div>
			</Collapse>
		</section>
	);
};

export default PeopleSubsection;
