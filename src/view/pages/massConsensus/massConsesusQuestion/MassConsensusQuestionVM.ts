import { useEffect, useState } from 'react';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const useMassConsensusQuestion = () => {
	const { setHeader } = useHeader();
	const { t } = useUserConfig();

	const [stage, updateStage] = useState<
		'question' | 'loading' | 'suggestions' | 'submitting'
	>('question');
	const [ifButtonEnabled, setIfButtonEnabled] = useState<boolean>(true);
	const [reachedLimit, setReachedLimit] = useState(false);

	useEffect(() => {
		setHeader({
			title: t('offer a suggestion'),
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

	const handleNext = () => {
		if (stage === 'question') {
			updateStage('loading');
		} else {
			updateStage('submitting');
		}
	};

	useEffect(() => {
		if (stage === 'loading' || stage === 'submitting') {
			setIfButtonEnabled(false);
		}
	}, [stage]);

	return {
		stage,
		updateStage,
		handleNext,
		ifButtonEnabled,
		setIfButtonEnabled,
		reachedLimit,
		setReachedLimit,
	};
};

export default useMassConsensusQuestion;
