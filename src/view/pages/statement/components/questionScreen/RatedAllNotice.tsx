import { FC, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ActionToast from '@/view/components/atomic/molecules/ActionToast';
import { shouldAnnounceRatedAll } from './ratedAllLogic';
import type { QuestionScreenData } from './useQuestionScreenData';

interface RatedAllNoticeProps {
	data: QuestionScreenData;
}

/** A plain line when the person finishes rating. Mount with a key per question. */
const RatedAllNotice: FC<RatedAllNoticeProps> = ({ data }) => {
	const { t } = useTranslation();
	const [toastId, setToastId] = useState(0);
	const openedAtRef = useRef(Date.now());
	const previousRef = useRef(data);
	const ratedAtLastNoticeRef = useRef<number | undefined>(undefined);

	useEffect(() => {
		const previous = previousRef.current;
		previousRef.current = data;
		const announce = shouldAnnounceRatedAll({
			previous,
			current: data,
			openedAt: openedAtRef.current,
			ratedAtLastNotice: ratedAtLastNoticeRef.current,
		});
		if (!announce) return;
		ratedAtLastNoticeRef.current = data.ratedCount;
		setToastId((current) => current + 1);
	}, [data]);

	if (toastId === 0) return null;

	return (
		<ActionToast
			key={toastId}
			message={t('question.ratedAllNotice')}
			variant="success"
			onDismiss={() => setToastId(0)}
		/>
	);
};

export default RatedAllNotice;
