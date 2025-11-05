import { useEffect, useState } from 'react';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useTranslation } from '@/controllers/hooks/useTranslation';

const useMassConsensusQuestion = () => {
	const { setHeader } = useHeader();
	const { t } = useTranslation();

	const [stage, setStage] = useState<
		'question' | 'loading' | 'suggestions' | 'submitting'
	>('question');
	const [ifButtonEnabled, setIfButtonEnabled] = useState<boolean>(true);
	const [reachedLimit, setReachedLimit] = useState(false);

	useEffect(() => {
		setHeader({
			title: t('offer a suggestion'),
			backToApp: false,
			isIntro: false,
		});
	}, []);

	const handleNext = () => {
		if (stage === 'question') {
			setStage('loading');
		} else {
			setStage('submitting');
		}
	};

	useEffect(() => {
		if (stage === 'loading' || stage === 'submitting') {
			setIfButtonEnabled(false);
		}
	}, [stage]);

	return {
		stage,
		setStage,
		handleNext,
		ifButtonEnabled,
		setIfButtonEnabled,
		reachedLimit,
		setReachedLimit,
	};
};

export default useMassConsensusQuestion;
