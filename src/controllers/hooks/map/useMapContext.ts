import { useContext } from 'react';
import { MapModelContext } from './context';
import { MapProps } from './types';

export const useMapContext = (): MapProps => {
	const context = useContext(MapModelContext);
	if (!context) {
		throw new Error(
			'useMapContext must be used within a MyContextProvider'
		);
	}

	return context;
};
