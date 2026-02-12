import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Toggle } from '@/view/components/atomic/atoms/Toggle';
import {
	UserDemographicQuestion,
	UserDemographicQuestionType,
} from '@freedi/shared-types';

// Icons - using SVG react components
import ArrowDownIcon from '@/assets/icons/arrow-down.svg?react';
import GroupIcon from '@/assets/icons/group.svg?react';

/**
 * InheritedDemographics Molecule - Atomic Design System
 *
 * Displays demographic survey questions inherited from parent statements,
 * with the ability to toggle each inherited question on/off.
 *
 * All styling is handled by SCSS in src/view/style/molecules/_inherited-demographics.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export interface InheritedQuestion extends UserDemographicQuestion {
	/** ID of the source statement */
	sourceStatementId: string;
	/** Title/name of the source statement */
	sourceStatementTitle: string;
	/** Whether this is a group-level or statement-level source */
	sourceType: 'group' | 'discussion';
	/** Whether this inherited question is enabled for the current statement */
	isEnabled: boolean;
}

export interface InheritedDemographicsProps {
	/** List of inherited questions grouped by source */
	inheritedQuestions: InheritedQuestion[];

	/** Callback when a question's enabled status changes */
	onToggleQuestion: (questionId: string, enabled: boolean) => void;

	/** Initial expanded state */
	defaultExpanded?: boolean;

	/** Compact mode for smaller spaces */
	compact?: boolean;

	/** Additional CSS classes */
	className?: string;

	/** Loading state */
	loading?: boolean;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface QuestionTypeDisplayProps {
	type: UserDemographicQuestionType;
	optionsCount?: number;
}

const QuestionTypeDisplay: React.FC<QuestionTypeDisplayProps> = ({
	type,
	optionsCount,
}) => {
	const { t } = useTranslation();

	const typeLabels: Record<UserDemographicQuestionType, string> = {
		[UserDemographicQuestionType.text]: t('Text Input'),
		[UserDemographicQuestionType.textarea]: t('Text Area'),
		[UserDemographicQuestionType.radio]: t('Single Choice'),
		[UserDemographicQuestionType.checkbox]: t('Multiple Choice'),
		[UserDemographicQuestionType.dropdown]: t('Dropdown'),
		[UserDemographicQuestionType.range]: t('Range'),
		[UserDemographicQuestionType.number]: t('Number'),
	};

	return (
		<span className="inherited-demographics__question-type">
			{typeLabels[type]}
			{optionsCount !== undefined && optionsCount > 0 && (
				<span className="inherited-demographics__question-options-count">
					{' '}
					| {optionsCount} {t('options')}
				</span>
			)}
		</span>
	);
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const InheritedDemographics: React.FC<InheritedDemographicsProps> = ({
	inheritedQuestions,
	onToggleQuestion,
	defaultExpanded = false,
	compact = false,
	className,
	loading = false,
}) => {
	const { t } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	// Group questions by source statement
	const groupedQuestions = useMemo(() => {
		const groups: Record<
			string,
			{
				sourceStatementId: string;
				sourceStatementTitle: string;
				sourceType: 'group' | 'discussion';
				questions: InheritedQuestion[];
			}
		> = {};

		inheritedQuestions.forEach((question) => {
			const key = question.sourceStatementId;
			if (!groups[key]) {
				groups[key] = {
					sourceStatementId: question.sourceStatementId,
					sourceStatementTitle: question.sourceStatementTitle,
					sourceType: question.sourceType,
					questions: [],
				};
			}
			groups[key].questions.push(question);
		});

		return Object.values(groups);
	}, [inheritedQuestions]);

	const totalCount = inheritedQuestions.length;
	const enabledCount = inheritedQuestions.filter((q) => q.isEnabled).length;

	// Build BEM classes
	const containerClasses = clsx(
		'inherited-demographics',
		isExpanded && 'inherited-demographics--expanded',
		compact && 'inherited-demographics--compact',
		loading && 'inherited-demographics--loading',
		className
	);

	if (totalCount === 0) {
		return null;
	}

	return (
		<div className={containerClasses}>
			{/* Header */}
			<button
				type="button"
				className="inherited-demographics__header"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
				aria-controls="inherited-demographics-content"
			>
				<GroupIcon className="inherited-demographics__icon" />
				<div>
					<h4 className="inherited-demographics__title">
						{t('Inherited Surveys')}
					</h4>
					<p className="inherited-demographics__subtitle">
						{t('Surveys from parent discussions that apply here')}
					</p>
				</div>
				<span className="inherited-demographics__count">
					{enabledCount}/{totalCount}
				</span>
				<ArrowDownIcon className="inherited-demographics__expand-icon" />
			</button>

			{/* Content */}
			<div
				className="inherited-demographics__content"
				id="inherited-demographics-content"
			>
				<div className="inherited-demographics__inner">
					{loading ? (
						<div className="inherited-demographics__loading">
							<span>{t('Loading inherited surveys...')}</span>
						</div>
					) : (
						groupedQuestions.map((group) => (
							<div
								key={group.sourceStatementId}
								className="inherited-demographics__source-group"
							>
								{/* Source Header */}
								<div className="inherited-demographics__source-header">
									<span className="inherited-demographics__source-label">
										{t('From')}:
									</span>
									<span className="inherited-demographics__source-name">
										{group.sourceStatementTitle}
									</span>
									<span
										className={clsx(
											'inherited-demographics__source-badge',
											`inherited-demographics__source-badge--${group.sourceType}`
										)}
									>
										{group.sourceType === 'group'
											? t('Group')
											: t('Discussion')}
									</span>
								</div>

								{/* Questions List */}
								<div className="inherited-demographics__questions-list">
									{group.questions.map((question) => (
										<div
											key={question.userQuestionId}
											className={clsx(
												'inherited-demographics__question-item',
												!question.isEnabled &&
													'inherited-demographics__question-item--excluded'
											)}
										>
											<div className="inherited-demographics__question-toggle">
												<Toggle
													checked={question.isEnabled}
													onChange={(checked) =>
														onToggleQuestion(
															question.userQuestionId || '',
															checked
														)
													}
													size="small"
													ariaLabel={`${t('Toggle')} ${question.question}`}
												/>
											</div>
											<div className="inherited-demographics__question-content">
												<p className="inherited-demographics__question-text">
													{question.question}
												</p>
												<div className="inherited-demographics__question-meta">
													<QuestionTypeDisplay
														type={question.type}
														optionsCount={question.options?.length}
													/>
													{!question.isEnabled && (
														<span className="inherited-demographics__excluded-badge">
															{t('Excluded')}
														</span>
													)}
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
};

export default InheritedDemographics;
