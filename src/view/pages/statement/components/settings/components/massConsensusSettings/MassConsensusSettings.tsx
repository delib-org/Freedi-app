import React from 'react';
import MassConsensusProcessSettings from './massConsensusProcessSettings/MassConsensusProcessSettings';
import LimitOptionsSetting from './massConsensusProcessSettings/LimitOptionsSetting/LimitOptionsSetting';

const MassConsensusSettings = () => {
	return (
		<>
			<LimitOptionsSetting />
			<MassConsensusProcessSettings />
		</>
	);
};

export default MassConsensusSettings;
