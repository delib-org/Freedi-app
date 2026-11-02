import React, { useEffect } from 'react';
import clsx from 'clsx';
import { useCollapseState } from './useCollapseState';

/**
 * Collapse Molecule - Atomic Design System
 *
 * Animated open/close for a section body. Children mount when it opens and
 * unmount only after the closing move ends. The wrapper is always rendered so
 * a header's aria-controls always points at something.
 * Styling lives in src/view/style/molecules/_collapse.scss.
 */
export interface CollapseProps {
	isOpen: boolean;
	/** Id of the wrapper; the header's aria-controls target. */
	id?: string;
	className?: string;
	children: React.ReactNode;
}

const Collapse: React.FC<CollapseProps> = ({ isOpen, id, className, children }) => {
	const { isMounted, isExpanded, isMoving, isInert, ref, onTransitionEnd } =
		useCollapseState(isOpen);

	// React 18 has no `inert` prop; the attribute is set by hand.
	useEffect(() => {
		ref.current?.toggleAttribute('inert', isInert);
	}, [isInert, ref]);

	return (
		<div
			ref={ref}
			id={id}
			className={clsx(
				'collapse',
				isExpanded && 'collapse--open',
				isMoving && 'collapse--moving',
				className,
			)}
			hidden={!isMounted}
			onTransitionEnd={onTransitionEnd}
		>
			<div className="collapse__inner">{isMounted && children}</div>
		</div>
	);
};

export default Collapse;
