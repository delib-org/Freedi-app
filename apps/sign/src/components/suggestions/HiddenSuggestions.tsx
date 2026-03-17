'use client';

import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { Suggestion as SuggestionType } from '@freedi/shared-types';
import Suggestion from './Suggestion';
import styles from './HiddenSuggestions.module.scss';

interface HiddenSuggestionsProps {
	suggestions: SuggestionType[];
	userId: string | null;
	userDisplayName: string | null;
	paragraphId: string;
	documentId: string;
	onDelete: (suggestionId: string) => void;
	onEdit: (suggestion: SuggestionType) => void;
	hideUserIdentity?: boolean;
}

export default function HiddenSuggestions({
	suggestions,
	userId,
	userDisplayName,
	paragraphId,
	documentId,
	onDelete,
	onEdit,
	hideUserIdentity = false,
}: HiddenSuggestionsProps) {
	const { tWithParams } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(false);

	if (suggestions.length === 0) return null;

	return (
		<div className={styles.container}>
			<button
				type="button"
				className={styles.toggleButton}
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className={`${styles.chevron} ${isExpanded ? styles['chevron--expanded'] : ''}`}
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
				{tWithParams('hidden suggestions', { count: suggestions.length })}
			</button>

			{isExpanded && (
				<div className={styles.list}>
					{suggestions.map(suggestion => (
						<div key={suggestion.suggestionId} className={styles.hiddenItem}>
							<Suggestion
								suggestion={suggestion}
								userId={userId}
								userDisplayName={userDisplayName}
								paragraphId={paragraphId}
								documentId={documentId}
								onDelete={onDelete}
								onEdit={onEdit}
								isCurrent={false}
								hideUserIdentity={hideUserIdentity}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
