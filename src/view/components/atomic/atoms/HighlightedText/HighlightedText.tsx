import React, { Fragment, useMemo } from 'react';
import clsx from 'clsx';
import type { SearchRange } from '@freedi/shared-types';

/**
 * HighlightedText Atom - Atomic Design System
 *
 * Renders text with search matches wrapped in <mark>. Ranges index the text as
 * given (see scoreMatch in shared-types). Styling lives in
 * src/view/style/atoms/_highlighted-text.scss.
 */

export interface HighlightedTextProps {
	text: string;
	ranges?: SearchRange[];
	className?: string;
}

export interface TextPart {
	text: string;
	match: boolean;
}

/**
 * Split text into plain and matched parts. Out-of-bounds ranges are clamped;
 * overlapping and touching ranges merge, so one match is one <mark>.
 */
export function splitByRanges(text: string, ranges: readonly SearchRange[] = []): TextPart[] {
	const merged: SearchRange[] = [];
	ranges
		.map(({ start, end }) => ({
			start: Math.max(0, Math.min(start, text.length)),
			end: Math.max(0, Math.min(end, text.length)),
		}))
		.filter(({ start, end }) => end > start)
		.sort((a, b) => a.start - b.start)
		.forEach((range) => {
			const last = merged[merged.length - 1];
			if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
			else merged.push(range);
		});

	const parts: TextPart[] = [];
	let cursor = 0;
	for (const { start, end } of merged) {
		if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
		parts.push({ text: text.slice(start, end), match: true });
		cursor = end;
	}
	if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });

	return parts;
}

const HighlightedText: React.FC<HighlightedTextProps> = ({ text, ranges, className }) => {
	const parts = useMemo(() => splitByRanges(text, ranges), [text, ranges]);

	return (
		<span className={clsx('highlighted-text', className)}>
			{parts.map((part, index) =>
				part.match ? (
					<mark key={index} className="highlighted-text__mark">
						{part.text}
					</mark>
				) : (
					<Fragment key={index}>{part.text}</Fragment>
				),
			)}
		</span>
	);
};

export default HighlightedText;
