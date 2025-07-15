import { useState, FC, ReactNode } from 'react';
import { Position } from 'reactflow';
import { MapProviderState } from './map/types';
import { MapModelContext } from './map/context';

// Create a provider component
interface MapProviderProps {
	children: ReactNode;
}

export const MapProvider: FC<MapProviderProps> = ({ children }) => {
	const [mapContext, setMapContext] = useState<MapProviderState>({
		showModal: false,
		moveStatementModal: false,
		parentStatement: 'top',
		isOption: false,
		isQuestion: false,
		targetPosition: Position.Top,
		sourcePosition: Position.Bottom,
		nodeWidth: 50,
		nodeHeight: 50,
		direction: 'TB',
		selectedId: null,
	});

	const contextValue = {
		mapContext,
		setMapContext,
	};

	return (
		<MapModelContext.Provider value={contextValue}>
			{children}
		</MapModelContext.Provider>
	);
};
