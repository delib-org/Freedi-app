import React, { FC } from 'react';
import { evaluationType } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './EvaluationTypeSelector.module.scss';

// Import the evaluation icons
import FrownIcon from '@/assets/icons/frownIcon.svg?react';
import SmileIcon from '@/assets/icons/smileIcon.svg?react';
import evaluation1 from '@/assets/icons/evaluation/evaluation1.svg';
import evaluation2 from '@/assets/icons/evaluation/evaluation2.svg';
import evaluation3 from '@/assets/icons/evaluation/evaluation3.svg';
import evaluation4 from '@/assets/icons/evaluation/evaluation4.svg';
import evaluation5 from '@/assets/icons/evaluation/evaluation5.svg';
import communityVoice1 from '@/assets/icons/evaluation/communityVoice1.svg';
import communityVoice2 from '@/assets/icons/evaluation/communityVoice2.svg';
import communityVoice3 from '@/assets/icons/evaluation/communityVoice3.svg';
import communityVoice4 from '@/assets/icons/evaluation/communityVoice4.svg';

interface EvaluationTypeSelectorProps {
	currentType: evaluationType;
	onChange: (type: evaluationType) => void;
}

interface EvaluationOption {
	type: evaluationType;
	title: string;
	description: string;
	preview: React.ReactNode;
}

const EvaluationTypeSelector: FC<EvaluationTypeSelectorProps> = ({ currentType, onChange }) => {
	const { t } = useTranslation();

	const evaluationOptions: EvaluationOption[] = [
		{
			type: evaluationType.likeDislike,
			title: t('Like / Dislike'),
			description: t('Simple thumbs up or down voting'),
			preview: (
				<div className={styles.previewIcons}>
					<div className={styles.thumbPreview}>
						<FrownIcon className={styles.thumbIcon} />
					</div>
					<div className={styles.thumbPreview}>
						<SmileIcon className={`${styles.thumbIcon} ${styles.active}`} />
					</div>
				</div>
			),
		},
		{
			type: evaluationType.range,
			title: t('5-Point Range'),
			description: t('Express nuanced opinions with 5 levels'),
			preview: (
				<div className={styles.previewEmojis}>
					<img src={evaluation5} alt="Very negative" className={styles.emojiPreview} />
					<img src={evaluation4} alt="Negative" className={styles.emojiPreview} />
					<img
						src={evaluation3}
						alt="Neutral"
						className={`${styles.emojiPreview} ${styles.active}`}
					/>
					<img src={evaluation2} alt="Positive" className={styles.emojiPreview} />
					<img src={evaluation1} alt="Very positive" className={styles.emojiPreview} />
				</div>
			),
		},
		{
			type: evaluationType.singleLike,
			title: t('Single Like'),
			description: t('Like only - no negative feedback'),
			preview: (
				<div className={styles.previewSingle}>
					<div className={`${styles.thumbPreview} ${styles.singleThumb}`}>
						<SmileIcon className={`${styles.thumbIcon} ${styles.active}`} />
					</div>
					<span className={styles.likeCount}>42</span>
				</div>
			),
		},
		{
			type: evaluationType.communityVoice,
			title: t('Community Voice'),
			description: t('Respectful 4-level resonance scale'),
			preview: (
				<div className={styles.previewEmojis}>
					<img
						src={communityVoice1}
						alt={t('I hear this perspective')}
						className={styles.emojiPreview}
					/>
					<img src={communityVoice2} alt={t('I partly relate')} className={styles.emojiPreview} />
					<img
						src={communityVoice3}
						alt={t('I closely relate to this')}
						className={styles.emojiPreview}
					/>
					<img
						src={communityVoice4}
						alt={t("This echoes my community's voice")}
						className={`${styles.emojiPreview} ${styles.active}`}
					/>
				</div>
			),
		},
	];

	return (
		<div className={styles.evaluationTypeSelector}>
			<div className={styles.selectorGrid}>
				{evaluationOptions.map((option) => (
					<button
						key={option.type}
						className={`${styles.optionCard} ${currentType === option.type ? styles.selected : ''}`}
						onClick={() => onChange(option.type)}
						type="button"
						aria-pressed={currentType === option.type}
					>
						<div className={styles.cardHeader}>
							<h4 className={styles.optionTitle}>{option.title}</h4>
							{currentType === option.type && (
								<span className={styles.selectedBadge}>{t('Active')}</span>
							)}
						</div>

						<p className={styles.optionDescription}>{option.description}</p>

						<div className={styles.previewContainer}>{option.preview}</div>

						{currentType === option.type && (
							<div className={styles.selectedIndicator} aria-hidden="true" />
						)}
					</button>
				))}
			</div>
		</div>
	);
};

export default EvaluationTypeSelector;
