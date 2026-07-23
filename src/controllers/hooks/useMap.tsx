import { Statement } from '@freedi/shared-types';
import {
	Dispatch,
	createContext,
	useContext,
	useState,
	FC,
	useMemo,
	SetStateAction,
	ReactNode,
} from 'react';
// Type-only import: a value import of the Position enum would pull the whole
// reactflow module into the eager Statement bundle (the MindMap itself is lazy)
import type { Position } from 'reactflow';

// reactflow's Position enum values, inlined (see import note above)
const POSITION_TOP = 'top' as Position;
const POSITION_BOTTOM = 'bottom' as Position;

// Define the context
interface MapProps {
	mapContext: MapProviderState;
	setMapContext: Dispatch<SetStateAction<MapProviderState>>;
}

const MapModelContext = createContext<MapProps | undefined>(undefined);

// Define a hook to use the context
export const useMapContext = (): MapProps => {
	const context = useContext(MapModelContext);
	if (!context) {
		throw new Error('useMapContext must be used within a MyContextProvider');
	}

	return context;
};

// Create a provider component
interface MapProviderProps {
	children: ReactNode;
}

interface MapProviderState {
	showModal: boolean;
	moveStatementModal: boolean;
	parentStatement: 'top' | Statement;
	isOption: boolean;
	isQuestion: boolean;
	targetPosition: Position;
	sourcePosition: Position;
	nodeWidth: number;
	nodeHeight: number;
	direction: 'TB' | 'LR';
	selectedId: string | null;
}

export const MapProvider: FC<MapProviderProps> = ({ children }) => {
	const [mapContext, setMapContext] = useState<MapProviderState>({
		showModal: false,
		moveStatementModal: false,
		parentStatement: 'top',
		isOption: false,
		isQuestion: false,
		targetPosition: POSITION_TOP,
		sourcePosition: POSITION_BOTTOM,
		nodeWidth: 50,
		nodeHeight: 50,
		direction: 'TB',
		selectedId: null,
	});

	const contextValue = useMemo(
		() => ({
			mapContext,
			setMapContext,
		}),
		[mapContext, setMapContext],
	);

	return <MapModelContext.Provider value={contextValue}>{children}</MapModelContext.Provider>;
};
