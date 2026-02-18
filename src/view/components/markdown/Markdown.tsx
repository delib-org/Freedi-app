import { FC } from 'react';

interface MarkdownProps {
	children: string;
}

/**
 * Simple markdown component - renders text with basic formatting
 * TODO: Install react-markdown for full markdown support
 */
const Markdown: FC<MarkdownProps> = ({ children }) => {
	// For now, just render as pre-formatted text
	// This maintains line breaks and formatting
	return <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>{children}</div>;
};

export default Markdown;
