import React, { FC } from 'react';
import DOMPurify from 'dompurify';
import { Statement, Paragraph, ParagraphType } from '@freedi/shared-types';
import { sortParagraphs } from '@/utils/paragraphUtils';
import styles from './ParagraphsDisplay.module.scss';

interface ParagraphsDisplayProps {
	statement: Statement;
	className?: string;
}

/**
 * Renders paragraphs with proper HTML formatting (h1-h6, p, ul, ol)
 */
const ParagraphsDisplay: FC<ParagraphsDisplayProps> = ({ statement, className }) => {
	const paragraphs = statement.paragraphs;

	// If no paragraphs, return null
	if (!paragraphs || paragraphs.length === 0) {
		return null;
	}

	const sorted = sortParagraphs(paragraphs);

	// Group consecutive list items
	const renderContent = () => {
		const elements: React.ReactNode[] = [];
		let currentListItems: Paragraph[] = [];
		let currentListType: 'ul' | 'ol' | undefined;

		const flushList = () => {
			if (currentListItems.length > 0) {
				const ListTag = currentListType === 'ol' ? 'ol' : 'ul';
				elements.push(
					<ListTag key={`list-${elements.length}`}>
						{currentListItems.map((item) => (
							<li key={item.paragraphId}>{item.content}</li>
						))}
					</ListTag>,
				);
				currentListItems = [];
				currentListType = undefined;
			}
		};

		for (const para of sorted) {
			if (para.type === ParagraphType.li) {
				// Check if we need to start a new list
				if (currentListType && currentListType !== para.listType) {
					flushList();
				}
				currentListType = para.listType || 'ul';
				currentListItems.push(para);
			} else {
				// Flush any pending list
				flushList();

				// Render the paragraph element
				elements.push(renderParagraph(para));
			}
		}

		// Flush any remaining list items
		flushList();

		return elements;
	};

	return <div className={`${styles.paragraphsDisplay} ${className || ''}`}>{renderContent()}</div>;
};

/**
 * Render a single paragraph with the appropriate HTML tag
 */
function renderParagraph(para: Paragraph): React.ReactNode {
	const key = para.paragraphId;
	const content = para.content;

	switch (para.type) {
		case ParagraphType.h1:
			return <h1 key={key}>{content}</h1>;
		case ParagraphType.h2:
			return <h2 key={key}>{content}</h2>;
		case ParagraphType.h3:
			return <h3 key={key}>{content}</h3>;
		case ParagraphType.h4:
			return <h4 key={key}>{content}</h4>;
		case ParagraphType.h5:
			return <h5 key={key}>{content}</h5>;
		case ParagraphType.h6:
			return <h6 key={key}>{content}</h6>;
		case ParagraphType.table:
			return (
				<div
					key={key}
					className={styles.table}
					dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
				/>
			);
		case ParagraphType.paragraph:
		default:
			return <p key={key}>{content}</p>;
	}
}

export default ParagraphsDisplay;
