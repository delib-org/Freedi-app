/**
 * Which cheers the end-of-lesson board owes, decided away from the board:
 * the component imports the looks module, which imports Firebase, and a rule
 * this small should be testable in node without dragging a database along.
 */

/** The least a point has to be for the finale to decide whether to cheer it */
export interface CheerablePoint {
	isMine: boolean;
	isLead: boolean;
	/** Standing in the goal — see inBridgeZone in boardGeometry.ts */
	scored: boolean;
	rank: number;
	/** Absent = never rated, so never on the podium and never in the goal */
	consensus?: object;
}

export interface FinaleCheer<P extends CheerablePoint> {
	kind: 'goal' | 'podium';
	point: P;
}

/** Top three: the ranks the finale cheers a student's own proposal for */
export const PODIUM_SIZE = 3;

/**
 * Which cheers the finale owes, in the order they should play.
 *
 * A GOAL is the class's: the winning proposal standing in the net means the
 * room found something both camps back, and everyone sees the ball go in —
 * the author hears "yours", the rest hear "we scored". The PODIUM is
 * personal: your own proposal in the top three. When the goal is yours the
 * podium cheer is dropped — rank 1 is implied by the net, and two popups for
 * one moment is one popup too many.
 */
export function finaleCheers<P extends CheerablePoint>(points: readonly P[]): FinaleCheer<P>[] {
	const out: FinaleCheer<P>[] = [];
	const lead = points.find((point) => point.isLead && point.consensus !== undefined);
	if (lead?.scored) out.push({ kind: 'goal', point: lead });

	const mine = points.find((point) => point.isMine && point.consensus !== undefined);
	const goalIsMine = lead?.scored === true && lead.isMine;
	if (mine && mine.rank <= PODIUM_SIZE && !goalIsMine) out.push({ kind: 'podium', point: mine });

	return out;
}
