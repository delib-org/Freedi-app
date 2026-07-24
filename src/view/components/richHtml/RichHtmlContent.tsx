import { FC, useMemo } from 'react';

import { containsRichHtml, sanitizeRichHtml } from '@/utils/richHtml';
import styles from './RichHtmlContent.module.scss';

interface RichHtmlContentProps {
	/** Statement text that may contain Sign-authored rich HTML. */
	content: string | undefined | null;
	className?: string;
}

/**
 * Renders statement content that may contain Sign-authored rich HTML
 * (colored spans, tables, entities). Plain text is returned untouched — no
 * wrapper element, no behavior change — so ordinary statements render exactly
 * as before. Rich content is ALWAYS sanitized (DOMPurify, shared allowlist in
 * `@/utils/richHtml`) before injection, with tables wrapped in a horizontal
 * scroll container so they don't overflow the card on mobile.
 */
const RichHtmlContent: FC<RichHtmlContentProps> = ({ content, className }) => {
	const isRich = useMemo(() => containsRichHtml(content), [content]);
	const sanitized = useMemo(
		() =>
			isRich && content
				? sanitizeRichHtml(content, { tableWrapperClass: styles.tableWrapper })
				: '',
		[isRich, content],
	);

	if (!content) return null;

	if (!isRich) return <>{content}</>;

	return (
		<div
			className={className ? `${styles.richHtml} ${className}` : styles.richHtml}
			// Safe: sanitized above with DOMPurify (shared allowlist in @/utils/richHtml)
			dangerouslySetInnerHTML={{ __html: sanitized }}
		/>
	);
};

export default RichHtmlContent;
