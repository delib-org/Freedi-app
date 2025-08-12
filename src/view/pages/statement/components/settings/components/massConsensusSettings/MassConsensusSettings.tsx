import React from 'react';
import MCMultiQuestionSettings from './MCMultiQuestionSettings';
import LimitOptionsSetting from './massConsensusProcessSettings/LimitOptionsSetting/LimitOptionsSetting';

const MassConsensusSettings = () => {
	return (
		<>
			<LimitOptionsSetting />
			<MCMultiQuestionSettings />
		</>
	);
};

export default MassConsensusSettings;
