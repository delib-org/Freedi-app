import type {
	AttitudeGlyphKey,
	SceneKey,
	SeaDistances,
	StageCommand,
	StageIsland,
	StageParty,
	VoyageIslandInfo,
} from '../lib/stageBus';

/**
 * Latest-known snapshot of everything React has told the stage. Scenes read
 * it on create() (so deep links / scene switches start fully hydrated) and
 * receive live commands afterwards.
 */
export interface StageStateSnapshot {
	scene: SceneKey;
	islands: StageIsland[];
	selection: string[];
	parties: StageParty[];
	distances: SeaDistances;
	pennants: number;
	compassLit: boolean[];
	voyage: VoyageIslandInfo | null;
	/** stanceIndex → glyph key for the current voyage island */
	voyageAttitudes: Record<number, AttitudeGlyphKey>;
	sailors: number[];
	stampedIslandIds: string[];
	/** taps on the sea are live only while it is reacting, never mid-question */
	seaTappable: boolean;
	/** the ship the player is currently asking about */
	markedPartyId: string | null;
}

export const stageState: StageStateSnapshot = {
	scene: 'harbor',
	islands: [],
	selection: [],
	parties: [],
	distances: {},
	pennants: 0,
	compassLit: [false, false, false, false],
	voyage: null,
	voyageAttitudes: {},
	sailors: [],
	stampedIslandIds: [],
	seaTappable: false,
	markedPartyId: null,
};

/** Fold a command into the snapshot (before the active scene reacts to it). */
export function applyToStageState(command: StageCommand): void {
	switch (command.type) {
		case 'goTo':
			stageState.scene = command.scene;
			break;
		case 'setIslands':
			stageState.islands = command.islands;
			break;
		case 'setSelection':
			stageState.selection = command.islandIds;
			break;
		case 'setParties':
			stageState.parties = command.parties;
			break;
		case 'updateDistances':
			stageState.distances = command.distances;
			break;
		case 'compassWind':
			stageState.compassLit[command.index] = command.lit;
			break;
		case 'setPennants':
			stageState.pennants = command.count;
			break;
		case 'voyageIsland':
			stageState.voyage = command.island;
			stageState.voyageAttitudes = {};
			break;
		case 'attitudeMarked':
			stageState.voyageAttitudes[command.stanceIndex] = command.attitude;
			break;
		case 'islandCompleted':
			if (!stageState.stampedIslandIds.includes(command.islandId)) {
				stageState.stampedIslandIds.push(command.islandId);
			}
			break;
		case 'setSailors':
			stageState.sailors = command.distances;
			break;
		case 'setSeaTappable':
			stageState.seaTappable = command.enabled;
			break;
		case 'markShip':
			stageState.markedPartyId = command.partyId;
			break;
		case 'compassComplete':
		case 'celebrateArrival':
		case 'sailToLighthouse':
			break;
	}
}
