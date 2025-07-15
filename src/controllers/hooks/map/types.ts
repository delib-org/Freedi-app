import { Dispatch, SetStateAction } from 'react';
import { Statement } from 'delib-npm';
import { Position } from 'reactflow';

export interface MapProviderState {
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

export interface MapProps {
	mapContext: MapProviderState;
	setMapContext: Dispatch<SetStateAction<MapProviderState>>;
}
