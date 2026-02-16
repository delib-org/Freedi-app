import React, { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import SuggestionEditCard, { SplitSuggestion } from '../SuggestionEditCard/SuggestionEditCard';
import { Scissors, X } from 'lucide-react';

export interface MultiSuggestionPreviewModalProps {
	originalText: string;
	suggestions: SplitSuggestion[];
	onConfirm: (suggestions: SplitSuggestion[]) => void;
	onDismiss: () => void;
	onCancel: () => void;
	isSubmitting: boolean;
}

const MultiSuggestionPreviewModal: FC<MultiSuggestionPreviewModalProps> = ({
	originalText,
	suggestions: initialSuggestions,
	onConfirm,
	onDismiss,
	onCancel,
	isSubmitting,
}) => {
	const { t } = useTranslation();
	const [suggestions, setSuggestions] = useState<SplitSuggestion[]>(initialSuggestions);

	const handleUpdateSuggestion = (id: string, updates: Partial<SplitSuggestion>) => {
		setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
	};

	const handleToggleRemove = (id: string) => {
		setSuggestions((prev) =>
			prev.map((s) => (s.id === id ? { ...s, isRemoved: !s.isRemoved } : s)),
		);
	};

	const activeSuggestions = suggestions.filter((s) => !s.isRemoved);
	const activeSuggestionsCount = activeSuggestions.length;

	return (
		<>
			<div className="multi-suggestion-modal__overlay" onClick={onCancel} role="presentation" />
			<div className="multi-suggestion-modal" role="dialog" aria-modal="true">
				<div className="multi-suggestion-modal__header">
					<h2 className="multi-suggestion-modal__title">
						<Scissors size={24} />
						{t('Multiple Suggestions Detected')}
					</h2>
					<button
						type="button"
						className="multi-suggestion-modal__close-btn"
						onClick={onCancel}
						aria-label={t('Close')}
					>
						<X size={20} />
					</button>
				</div>

				<p className="multi-suggestion-modal__description">
					{t(
						'We detected multiple ideas in your submission. You can submit them separately for better visibility and voting.',
					)}
				</p>

				<div className="multi-suggestion-modal__original">
					<div className="multi-suggestion-modal__original-label">{t('Your original text:')}</div>
					<div className="multi-suggestion-modal__original-text">{originalText}</div>
				</div>

				<div className="multi-suggestion-modal__suggestions-list">
					{suggestions.map((suggestion, index) => (
						<SuggestionEditCard
							key={suggestion.id}
							number={index + 1}
							suggestion={suggestion}
							onUpdate={(updates) => handleUpdateSuggestion(suggestion.id, updates)}
							onToggleRemove={() => handleToggleRemove(suggestion.id)}
						/>
					))}
				</div>

				<div className="multi-suggestion-modal__footer">
					<div className="multi-suggestion-modal__footer-left">
						<Button
							text={t('Submit Original As-Is')}
							buttonType={ButtonType.SECONDARY}
							onClick={onDismiss}
							disabled={isSubmitting}
						/>
					</div>
					<div className="multi-suggestion-modal__footer-right">
						<Button
							text={t('Cancel')}
							buttonType={ButtonType.SECONDARY}
							onClick={onCancel}
							disabled={isSubmitting}
						/>
						<Button
							text={`${t('Submit')} ${activeSuggestionsCount} ${t('Suggestions')}`}
							buttonType={ButtonType.PRIMARY}
							onClick={() => onConfirm(activeSuggestions)}
							disabled={isSubmitting || activeSuggestionsCount === 0}
						/>
					</div>
				</div>
			</div>
		</>
	);
};

export default MultiSuggestionPreviewModal;
