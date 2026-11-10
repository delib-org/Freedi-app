import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { formatScore } from '@/helpers/scoreFormat';

interface AgreementStatusProps {
	agreed: boolean;
	cp: number;
	evaluators: number;
	/** False says nothing at all: "passed" tells the outcome as surely as the number. */
	showScores: boolean;
}

/** How a drafted agreement stands: passed or draft, its score and how many rated it. */
const AgreementStatus: FC<AgreementStatusProps> = ({ agreed, cp, evaluators, showScores }) => {
	const { t } = useTranslation();

	if (!showScores) return null;

	return (
		<span>
			{t(agreed ? 'Passed the agreement threshold' : 'Draft for review')} · {t('Agreement score')}{' '}
			<span dir="ltr">{formatScore(cp)}</span> · {t('People who rated')}: {evaluators}
		</span>
	);
};

export default AgreementStatus;
