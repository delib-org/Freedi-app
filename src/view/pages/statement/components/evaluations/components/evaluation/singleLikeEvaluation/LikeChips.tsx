import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { ResultsStripItem } from '@/view/components/atomic/molecules/ResultsStrip';

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
					<ResultsStripItem
						value={`${likePercentage}%`}
						label={t('Liked by')}
						tip={t('scoreTip.liked')}
						isPrimary
					/>
				)}
				<ResultsStripItem value={String(likesCount)} label={t('Likes')} />
			</div>
		</div>
	);
};

export default LikeChips;
