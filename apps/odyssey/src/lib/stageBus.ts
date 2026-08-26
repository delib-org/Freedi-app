/**
 * Typed command/event bus between React (the brain: Firestore, GameContext,
 * navigation) and the Phaser sea stage (pure presentation).
 * docs/phaser-game-design.md §6.
 *
 * Commands sent before the stage attaches are queued and flushed on attach,
 * so pages may mount before the canvas boots. The queue is capped — if no
 * stage ever attaches (direct mode), commands are simply dropped.
 */

export type SceneKey = 'harbor' | 'compass' | 'chart' | 'voyage' | 'homecoming';

export type AttitudeGlyphKey = 'support' | 'livewith' | 'oppose';

export interface StageParty {
	id: string;
	name: string;
	color: string;
}

export interface StageIsland {
	id: string;
	title: string;
	/** The civic issue, one line — the only thing that says what the island IS */
	issue: string;
	/** percent from the RIGHT edge (admin/DOM convention) */
	posX: number;
	posY: number;
	imageUrl: string | null;
	/** player already marked ≥1 attitude here (lantern glow) */
	visited: boolean;
}

export type SeaDistances = Record<string, number | null>;

export interface VoyageIslandInfo {
	islandId: string;
	title: string;
	index: number;
	count: number;
	stanceCount: number;
	imageUrl: string | null;
}

export type StageCommand =
	| { type: 'goTo'; scene: SceneKey }
	| { type: 'setIslands'; islands: StageIsland[] }
	| { type: 'setSelection'; islandIds: string[] }
	| { type: 'setParties'; parties: StageParty[] }
	| { type: 'updateDistances'; distances: SeaDistances; animate: boolean }
	| { type: 'compassWind'; index: number; lit: boolean }
	| { type: 'compassComplete' }
	| { type: 'setPennants'; count: number }
	| { type: 'voyageIsland'; island: VoyageIslandInfo }
	| { type: 'attitudeMarked'; stanceIndex: number; attitude: AttitudeGlyphKey }
	| { type: 'islandCompleted'; islandId: string }
	| { type: 'setSailors'; distances: number[] }
	| { type: 'celebrateArrival'; islandCount: number }
	| { type: 'sailToLighthouse' }
	| { type: 'setSeaTappable'; enabled: boolean }
	| { type: 'markShip'; partyId: string | null };

export type StageEvent =
	| { type: 'ready' }
	| { type: 'islandTapped'; islandId: string }
	/** a party ship was tapped — the page answers with its distance */
	| { type: 'shipTapped'; partyId: string }
	/** the player tapped their own boat — the page opens the full standing */
	| { type: 'myShipTapped' }
	/** open water: whatever a previous tap opened should close */
	| { type: 'waterTapped' };

type CommandHandler = (command: StageCommand) => void;
type EventHandler = (event: StageEvent) => void;

const MAX_QUEUE = 50;

class StageBus {
	private commandHandler: CommandHandler | null = null;
	private pending: StageCommand[] = [];
	private eventHandlers = new Set<EventHandler>();

	/** React → stage. Queued (capped) until a stage attaches. */
	send(command: StageCommand): void {
		if (this.commandHandler) {
			this.commandHandler(command);

			return;
		}
		this.pending.push(command);
		if (this.pending.length > MAX_QUEUE) this.pending.shift();
	}

	/** Called once by the stage on boot; flushes the queue in order. */
	attach(handler: CommandHandler): void {
		this.commandHandler = handler;
		const queued = this.pending;
		this.pending = [];
		for (const command of queued) handler(command);
	}

	/** Called when the stage is destroyed (mode toggle / leaving player routes). */
	detach(): void {
		this.commandHandler = null;
		this.pending = [];
	}

	/** Stage → React. Returns an unsubscribe function. */
	onEvent(handler: EventHandler): () => void {
		this.eventHandlers.add(handler);

		return () => {
			this.eventHandlers.delete(handler);
		};
	}

	emit(event: StageEvent): void {
		for (const handler of [...this.eventHandlers]) handler(event);
	}
}

export const stageBus = new StageBus();
