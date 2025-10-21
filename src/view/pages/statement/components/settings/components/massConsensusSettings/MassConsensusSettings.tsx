import React from 'react';
import MassConsensusProcessSettings from './massConsensusProcessSettings/MassConsensusProcessSettings';
import LimitOptionsSetting from './massConsensusProcessSettings/LimitOptionsSetting/LimitOptionsSetting';
import ExplanationsAdmin from './explanationsAdmin/ExplanationsAdmin';

const MassConsensusSettings = () => {
	return (
		<>
			<LimitOptionsSetting />
			<MassConsensusProcessSettings />
			<ExplanationsAdmin />
		</>
	);
};

export default MassConsensusSettings;
