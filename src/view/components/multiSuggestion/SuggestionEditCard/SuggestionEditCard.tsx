import React, { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import clsx from 'clsx';

export interface SplitSuggestion {
	id: string;
	title: string;
	description: string;
	originalText: string;
	isRemoved: boolean;
}

interface SuggestionEditCardProps {
	number: number;
	suggestion: SplitSuggestion;
	onUpdate: (updates: Partial<SplitSuggestion>) => void;
	onToggleRemove: () => void;
}

const SuggestionEditCard: FC<SuggestionEditCardProps> = ({
	number,
	suggestion,
	onUpdate,
	onToggleRemove,
}) => {
	const { t } = useTranslation();

	return (
		<div
			className={clsx(
				'suggestion-edit-card',
				suggestion.isRemoved && 'suggestion-edit-card--removed',
			)}
		>
			<div className="suggestion-edit-card__header">
				<span className="suggestion-edit-card__number">{number}</span>
				<div className="suggestion-edit-card__actions">
					{suggestion.isRemoved ? (
						<button
							type="button"
							className="suggestion-edit-card__action-btn suggestion-edit-card__action-btn--restore"
							onClick={onToggleRemove}
						>
							{t('Restore')}
						</button>
					) : (
						<button
							type="button"
							className="suggestion-edit-card__action-btn suggestion-edit-card__action-btn--remove"
							onClick={onToggleRemove}
						>
							{t('Remove')}
						</button>
					)}
				</div>
			</div>

			<input
				type="text"
				className="suggestion-edit-card__title-input"
				value={suggestion.title}
				onChange={(e) => onUpdate({ title: e.target.value })}
				placeholder={t('Title')}
				disabled={suggestion.isRemoved}
			/>

			<textarea
				className="suggestion-edit-card__description-input"
				value={suggestion.description}
				onChange={(e) => onUpdate({ description: e.target.value })}
				placeholder={t('Description')}
				disabled={suggestion.isRemoved}
				rows={2}
			/>

			{suggestion.originalText && (
				<div className="suggestion-edit-card__original-text">
					{t('From')}: &quot;{suggestion.originalText}&quot;
				</div>
			)}
		</div>
	);
};

export default SuggestionEditCard;
