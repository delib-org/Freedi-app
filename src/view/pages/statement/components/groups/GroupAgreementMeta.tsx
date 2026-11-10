import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface GroupAgreementMetaProps {
	/** The group's agreement, on the stored -1..1 scale. */
	agreement: number | undefined;
	/** The question's results are off for everyone, so the number stays hidden. */
	resultsOff: boolean;
}

/** The agreement part of a group card's meta line. Evaluator counts live beside it. */
const GroupAgreementMeta: FC<GroupAgreementMetaProps> = ({ agreement, resultsOff }) => {
	const { t } = useTranslation();

	if (resultsOff) return null;

	return (
		<>
			<span aria-hidden>·</span>
			<span>{t('{pct}% agree').replace('{pct}', String(Math.round((agreement ?? 0) * 100)))}</span>
		</>
	);
};

export default GroupAgreementMeta;
