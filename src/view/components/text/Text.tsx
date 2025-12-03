import { FC } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import UrlParser from '../edit/URLParse';
import styles from './Text.module.scss';

interface Props {
	statement?: string;
	description?: string;
	fontSize?: string;
	enableMarkdown?: boolean;
}

/**
 * Pre-process text to convert legacy *bold* syntax to standard **bold**
 * Only converts if no standard markdown bold (**) is present
 */
function preprocessLegacyBold(text: string): string {
	// Skip if text already contains standard bold markers
	if (text.includes('**')) return text;

	// Protect URLs from conversion
	const urlPlaceholders: string[] = [];
	let processedText = text.replace(
		/https?:\/\/[^\s]+/g,
		(match) => {
			urlPlaceholders.push(match);

			return `__URL_PLACEHOLDER_${urlPlaceholders.length - 1}__`;
		}
	);

	// Convert *text* to **text** (only paired asterisks)
	processedText = processedText.replace(/\*([^*\n]+)\*/g, '**$1**');

	// Restore URLs
	urlPlaceholders.forEach((url, i) => {
		processedText = processedText.replace(`__URL_PLACEHOLDER_${i}__`, url);
	});

	return processedText;
}

/**
 * Custom renderers for react-markdown with BEM-styled classes
 */
const createMarkdownComponents = (fontSize: string): Components => ({
	h1: ({ children }) => (
		<h1 className={styles.h1} style={{ fontSize: fontSize !== 'inherent' ? `calc(${fontSize} * 1.5)` : undefined }}>
			{children}
		</h1>
	),
	h2: ({ children }) => (
		<h2 className={styles.h2} style={{ fontSize: fontSize !== 'inherent' ? `calc(${fontSize} * 1.25)` : undefined }}>
			{children}
		</h2>
	),
	h3: ({ children }) => (
		<h3 className={styles.h3} style={{ fontSize: fontSize !== 'inherent' ? `calc(${fontSize} * 1.1)` : undefined }}>
			{children}
		</h3>
	),
	p: ({ children }) => (
		<p className={styles.p} style={{ fontSize: fontSize !== 'inherent' ? fontSize : undefined }}>
			{children}
		</p>
	),
	strong: ({ children }) => <strong className={styles.bold}>{children}</strong>,
	em: ({ children }) => <em className={styles.italic}>{children}</em>,
	ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
	ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
	li: ({ children }) => <li className={styles.li}>{children}</li>,
	a: ({ href, children }) => (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={styles.link}
		>
			{children}
		</a>
	),
});

const Text: FC<Props> = ({ statement, description, fontSize = "inherent", enableMarkdown = true }) => {
	try {
		if (!statement && !description) return null;

		const markdownComponents = createMarkdownComponents(fontSize);

		// If markdown is enabled, use react-markdown
		if (enableMarkdown && description) {
			const processedDescription = preprocessLegacyBold(description);

			return (
				<>
					{statement && (
						<span className={styles.statement} style={{ fontSize: fontSize !== 'inherent' ? fontSize : undefined }}>
							<UrlParser text={statement} />
						</span>
					)}
					<div className={styles.markdown}>
						<ReactMarkdown components={markdownComponents}>
							{processedDescription}
						</ReactMarkdown>
					</div>
				</>
			);
		}

		// Fallback to legacy rendering for non-markdown content
		const textId = `${Math.random()}`.replace('.', '');

		const paragraphs = !description
			? ''
			: description
				.split('\n')
				.filter((p) => p)
				.map((paragraph: string, i: number) => {
					if (paragraph.includes('*')) {
						const boldedParagraph = paragraph
							.split('*')
							.map((p, idx) => {
								if (idx % 2 === 1)
									return (
										<b key={`${textId}--${idx}`}>
											<UrlParser text={p} />
										</b>
									);

								return p;
							});

						return (
							<p
								className={`${styles['p--bold']} ${styles.p}`}
								key={`${textId}--${i}`}
								style={{ fontSize: fontSize !== 'inherent' ? fontSize : undefined }}
							>
								{boldedParagraph}
							</p>
						);
					}

					return (
						<p className={styles.p} key={`${textId}--${i}`} style={{ fontSize: fontSize !== 'inherent' ? fontSize : undefined }}>
							<UrlParser text={paragraph} />
						</p>
					);
				});

		return (
			<>
				{statement && (
					<span className={styles.statement} style={{ fontSize: fontSize !== 'inherent' ? fontSize : undefined }}>
						<UrlParser text={statement} />
					</span>
				)}
				{description && paragraphs.length > 0 && (
					<div className={styles.description}>{paragraphs}</div>
				)}
			</>
		);
	} catch (error) {
		console.error(error);

		return null;
	}
};

export default Text;
