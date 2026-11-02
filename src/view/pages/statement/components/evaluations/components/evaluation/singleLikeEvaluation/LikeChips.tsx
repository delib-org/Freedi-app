import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface LikeChipsProps {
	likesCount: number;
	/** Share of the evaluators who liked, 0-100. */
	likePercentage: number;
	showPercentage: boolean;
}

/** Single-like results in Join's chips row (the shared results-strip look). */
const LikeChips: FC<LikeChipsProps> = ({ likesCount, likePercentage, showPercentage }) => {
	const { t } = useTranslation();

	return (
		<div className="results-strip results-strip--chips">
			<div className="results-strip__items" role="group" aria-label={t('Results')}>
				{showPercentage && (
					<div className="results-strip__item results-strip__item--primary">
						<span className="results-strip__value" dir="ltr">
							{likePercentage}%
						</span>
						<span className="results-strip__label">{t('Agreement')}</span>
					</div>
				)}
				<div className="results-strip__item">
					<span className="results-strip__value" dir="ltr">
						{likesCount}
					</span>
					<span className="results-strip__label">{t('Likes')}</span>
				</div>
			</div>
		</div>
	);
};

export default LikeChips;
