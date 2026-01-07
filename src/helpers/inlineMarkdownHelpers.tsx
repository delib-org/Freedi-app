import { ReactNode } from 'react';

/**
 * Token types for inline markdown parsing
 */
type TokenType = 'text' | 'bold' | 'italic' | 'bolditalic';

interface Token {
	type: TokenType;
	content: string;
}

/**
 * Parses inline markdown text and returns an array of tokens
 * Supports:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - ***bolditalic*** or ___bolditalic___
 */
function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	let remaining = text;

	// Regex patterns for markdown (order matters - check longer patterns first)
	const patterns = [
		{ regex: /^\*\*\*(.+?)\*\*\*/, type: 'bolditalic' as TokenType },
		{ regex: /^___(.+?)___/, type: 'bolditalic' as TokenType },
		{ regex: /^\*\*(.+?)\*\*/, type: 'bold' as TokenType },
		{ regex: /^__(.+?)__/, type: 'bold' as TokenType },
		{ regex: /^\*([^*]+?)\*/, type: 'italic' as TokenType },
		{ regex: /^_([^_]+?)_/, type: 'italic' as TokenType },
	];

	while (remaining.length > 0) {
		let matched = false;

		// Try each pattern
		for (const { regex, type } of patterns) {
			const match = remaining.match(regex);
			if (match) {
				tokens.push({ type, content: match[1] });
				remaining = remaining.slice(match[0].length);
				matched = true;
				break;
			}
		}

		// If no pattern matched, consume one character as text
		if (!matched) {
			const lastToken = tokens[tokens.length - 1];
			if (lastToken && lastToken.type === 'text') {
				// Append to existing text token
				lastToken.content += remaining[0];
			} else {
				// Create new text token
				tokens.push({ type: 'text', content: remaining[0] });
			}
			remaining = remaining.slice(1);
		}
	}

	return tokens;
}

/**
 * Renders inline markdown as React elements
 * Useful for titles and headings that need basic formatting
 *
 * @example
 * // Returns: <><strong>Bold</strong> text</>
 * renderInlineMarkdown("**Bold** text")
 */
export function renderInlineMarkdown(text: string | undefined | null): ReactNode {
	if (!text) return null;

	const tokens = tokenize(text);

	return tokens.map((token, index) => {
		const key = `md-${index}`;

		switch (token.type) {
			case 'bold':
				return <strong key={key}>{token.content}</strong>;
			case 'italic':
				return <em key={key}>{token.content}</em>;
			case 'bolditalic':
				return (
					<strong key={key}>
						<em>{token.content}</em>
					</strong>
				);
			case 'text':
			default:
				return <span key={key}>{token.content}</span>;
		}
	});
}

/**
 * Checks if text contains inline markdown formatting
 */
export function hasInlineMarkdown(text: string | undefined | null): boolean {
	if (!text) return false;

	return /\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*]+\*(?!\*)|(?<!_)_[^_]+_(?!_)/.test(text);
}
