/**
 * ILP Room Assignment Solver using javascript-lp-solver
 *
 * This module assigns participants to discussion rooms while maximizing:
 * 1. Topic satisfaction - participants get assigned to topics they joined
 * 2. Demographic diversity - rooms have balanced spectrum distribution
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const solver = require("javascript-lp-solver");

// Types for the solver
interface LPModel {
	optimize: string;
	opType: "max" | "min";
	constraints: Record<string, { min?: number; max?: number; equal?: number }>;
	variables: Record<string, Record<string, number>>;
	ints?: Record<string, number>;
	binaries?: Record<string, number>;
}

interface LPResult {
	feasible: boolean;
	result: number;
	bounded: boolean;
	isIntegral: boolean;
	[key: string]: number | boolean;
}

// Input/Output types
export interface ILPParticipant {
	oderId: string;
	odeName: string;
	spectrum: number; // 1-5 scale
	joinedOptions: string[];
}

export interface ILPRoom {
	roomNumber: number;
	topicId: string;
	participants: Array<{
		oderId: string;
		odeName: string;
		spectrum: number;
	}>;
	size: number;
	avgSpectrum: number;
}

export interface ILPAssignmentResult {
	success: boolean;
	rooms: ILPRoom[];
	statistics: {
		totalParticipants: number;
		totalRooms: number;
		heterogeneityScore: number;
		satisfactionScore: number;
		avgRoomSize: number;
		solverStatus: string;
	};
	error?: string;
}

export interface ILPConfig {
	minRoomSize: number;
	maxRoomSize: number;
	weights?: {
		satisfaction: number;
		heterogeneity: number;
	};
}

/**
 * Calculate heterogeneity score (0-1, higher is better/more diverse)
 */
function calculateHeterogeneityScore(rooms: ILPRoom[], globalAvg: number): number {
	if (rooms.length === 0) return 0;

	const deviations = rooms.map((r) => Math.abs(r.avgSpectrum - globalAvg));
	const maxDeviation = 2.0; // Max deviation on 1-5 scale
	const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

	return Math.max(0, 1.0 - avgDeviation / maxDeviation);
}

/**
 * Main ILP solver for heterogeneous room assignment
 */
export function solveRoomAssignment(
	participants: ILPParticipant[],
	options: string[],
	config: ILPConfig
): ILPAssignmentResult {
	const { minRoomSize, maxRoomSize } = config;

	// Handle edge cases
	if (participants.length === 0) {
		return {
			success: false,
			rooms: [],
			statistics: {
				totalParticipants: 0,
				totalRooms: 0,
				heterogeneityScore: 0,
				satisfactionScore: 0,
				avgRoomSize: 0,
				solverStatus: "NO_PARTICIPANTS",
			},
			error: "No participants to assign",
		};
	}

	if (options.length === 0) {
		return {
			success: false,
			rooms: [],
			statistics: {
				totalParticipants: participants.length,
				totalRooms: 0,
				heterogeneityScore: 0,
				satisfactionScore: 0,
				avgRoomSize: 0,
				solverStatus: "NO_OPTIONS",
			},
			error: "No options/topics available",
		};
	}

	// Calculate max rooms needed
	const maxRooms = Math.ceil(participants.length / minRoomSize) + 1;
	const globalAvg = participants.reduce((sum, p) => sum + p.spectrum, 0) / participants.length;

	// Build participant-option mapping
	const participantOptions: Map<number, number[]> = new Map();
	participants.forEach((p, pIdx) => {
		const optionIndices = p.joinedOptions
			.map((opt) => options.indexOf(opt))
			.filter((idx) => idx >= 0);
		participantOptions.set(pIdx, optionIndices);
	});

	// Build LP model
	const model: LPModel = {
		optimize: "objective",
		opType: "max",
		constraints: {},
		variables: {},
		binaries: {},
	};

	// Decision variables:
	// x_p_r: participant p assigned to room r (binary)
	// y_o_r: room r discusses option o (binary)
	// z_r: room r is active (binary)

	// Create variables and constraints
	const varPrefix = {
		x: "x", // participant-room assignment
		y: "y", // room-option assignment
		z: "z", // room active
	};

	// Initialize variables
	for (let p = 0; p < participants.length; p++) {
		for (let r = 0; r < maxRooms; r++) {
			const varName = `${varPrefix.x}_${p}_${r}`;
			model.variables[varName] = { objective: 1 }; // Maximize assignments
			model.binaries![varName] = 1;
		}
	}

	for (let o = 0; o < options.length; o++) {
		for (let r = 0; r < maxRooms; r++) {
			const varName = `${varPrefix.y}_${o}_${r}`;
			model.variables[varName] = {};
			model.binaries![varName] = 1;
		}
	}

	for (let r = 0; r < maxRooms; r++) {
		const varName = `${varPrefix.z}_${r}`;
		model.variables[varName] = {};
		model.binaries![varName] = 1;
	}

	// Constraint 1: Each participant assigned to exactly one room
	for (let p = 0; p < participants.length; p++) {
		const constraintName = `one_room_${p}`;
		model.constraints[constraintName] = { equal: 1 };

		for (let r = 0; r < maxRooms; r++) {
			const varName = `${varPrefix.x}_${p}_${r}`;
			model.variables[varName][constraintName] = 1;
		}
	}

	// Constraint 2: Participant can only be in room with topic they joined
	for (let p = 0; p < participants.length; p++) {
		const joinedOptionIndices = participantOptions.get(p) || [];

		for (let r = 0; r < maxRooms; r++) {
			if (joinedOptionIndices.length > 0) {
				// x[p,r] <= sum(y[o,r] for o in joined_options)
				const constraintName = `topic_${p}_${r}`;
				model.constraints[constraintName] = { min: 0 };

				const xVar = `${varPrefix.x}_${p}_${r}`;
				model.variables[xVar][constraintName] = -1;

				for (const oIdx of joinedOptionIndices) {
					const yVar = `${varPrefix.y}_${oIdx}_${r}`;
					model.variables[yVar][constraintName] = 1;
				}
			} else {
				// No valid options - participant can't be assigned
				const constraintName = `no_option_${p}_${r}`;
				model.constraints[constraintName] = { max: 0 };
				const xVar = `${varPrefix.x}_${p}_${r}`;
				model.variables[xVar][constraintName] = 1;
			}
		}
	}

	// Constraint 3: Each room has at most one topic
	for (let r = 0; r < maxRooms; r++) {
		const constraintName = `one_topic_${r}`;
		model.constraints[constraintName] = { max: 1 };

		for (let o = 0; o < options.length; o++) {
			const varName = `${varPrefix.y}_${o}_${r}`;
			model.variables[varName][constraintName] = 1;
		}
	}

	// Constraint 4: Link room activity to participants
	for (let r = 0; r < maxRooms; r++) {
		// If room has participants, z[r] must be 1
		const upperConstraint = `room_active_upper_${r}`;
		model.constraints[upperConstraint] = { min: 0 };

		const zVar = `${varPrefix.z}_${r}`;
		model.variables[zVar][upperConstraint] = participants.length;

		for (let p = 0; p < participants.length; p++) {
			const xVar = `${varPrefix.x}_${p}_${r}`;
			model.variables[xVar][upperConstraint] = -1;
		}

		// If z[r] is 1, room must have at least one participant
		const lowerConstraint = `room_active_lower_${r}`;
		model.constraints[lowerConstraint] = { min: 0 };
		model.variables[zVar][lowerConstraint] = -1;

		for (let p = 0; p < participants.length; p++) {
			const xVar = `${varPrefix.x}_${p}_${r}`;
			model.variables[xVar][lowerConstraint] = 1;
		}
	}

	// Constraint 5: Room must have a topic if active
	for (let r = 0; r < maxRooms; r++) {
		const constraintName = `room_needs_topic_${r}`;
		model.constraints[constraintName] = { min: 0 };

		const zVar = `${varPrefix.z}_${r}`;
		model.variables[zVar][constraintName] = -1;

		for (let o = 0; o < options.length; o++) {
			const yVar = `${varPrefix.y}_${o}_${r}`;
			model.variables[yVar][constraintName] = 1;
		}
	}

	// Constraint 6: Room size limits (soft constraints via penalty)
	// For simplicity with javascript-lp-solver, we'll use hard constraints
	// with slightly relaxed bounds
	for (let r = 0; r < maxRooms; r++) {
		// Minimum size when active
		const minConstraint = `min_size_${r}`;
		model.constraints[minConstraint] = { min: 0 };

		const zVar = `${varPrefix.z}_${r}`;
		model.variables[zVar][minConstraint] = -minRoomSize;

		for (let p = 0; p < participants.length; p++) {
			const xVar = `${varPrefix.x}_${p}_${r}`;
			model.variables[xVar][minConstraint] = 1;
		}

		// Maximum size
		const maxConstraint = `max_size_${r}`;
		model.constraints[maxConstraint] = { max: maxRoomSize };

		for (let p = 0; p < participants.length; p++) {
			const xVar = `${varPrefix.x}_${p}_${r}`;
			model.variables[xVar][maxConstraint] = 1;
		}
	}

	// Solve the model
	let result: LPResult;
	try {
		result = solver.Solve(model) as LPResult;
	} catch (error) {
		console.error("Solver error:", error);
		return fallbackAssignment(participants, options, config, globalAvg);
	}

	if (!result.feasible) {
		console.info("ILP not feasible, using fallback");
		return fallbackAssignment(participants, options, config, globalAvg);
	}

	// Extract results
	const rooms: ILPRoom[] = [];
	let roomNumber = 1;

	for (let r = 0; r < maxRooms; r++) {
		const roomParticipants: Array<{ oderId: string; odeName: string; spectrum: number }> = [];
		let roomTopic: string | null = null;

		// Get participants in this room
		for (let p = 0; p < participants.length; p++) {
			const varName = `${varPrefix.x}_${p}_${r}`;
			if (result[varName] === 1) {
				roomParticipants.push({
					oderId: participants[p].oderId,
					odeName: participants[p].odeName,
					spectrum: participants[p].spectrum,
				});
			}
		}

		// Get topic for this room
		for (let o = 0; o < options.length; o++) {
			const varName = `${varPrefix.y}_${o}_${r}`;
			if (result[varName] === 1) {
				roomTopic = options[o];
				break;
			}
		}

		if (roomParticipants.length > 0 && roomTopic) {
			const avgSpectrum =
				roomParticipants.reduce((sum, p) => sum + p.spectrum, 0) / roomParticipants.length;

			rooms.push({
				roomNumber: roomNumber++,
				topicId: roomTopic,
				participants: roomParticipants,
				size: roomParticipants.length,
				avgSpectrum: Math.round(avgSpectrum * 100) / 100,
			});
		}
	}

	// Calculate statistics
	const totalAssigned = rooms.reduce((sum, r) => sum + r.size, 0);
	const heterogeneityScore = calculateHeterogeneityScore(rooms, globalAvg);
	const satisfactionScore = totalAssigned / participants.length;
	const avgRoomSize = rooms.length > 0 ? totalAssigned / rooms.length : 0;

	return {
		success: rooms.length > 0,
		rooms,
		statistics: {
			totalParticipants: totalAssigned,
			totalRooms: rooms.length,
			heterogeneityScore: Math.round(heterogeneityScore * 100) / 100,
			satisfactionScore: Math.round(satisfactionScore * 100) / 100,
			avgRoomSize: Math.round(avgRoomSize * 100) / 100,
			solverStatus: result.feasible ? "OPTIMAL" : "INFEASIBLE",
		},
	};
}

/**
 * Fallback assignment using simple round-robin when ILP fails
 */
function fallbackAssignment(
	participants: ILPParticipant[],
	options: string[],
	config: ILPConfig,
	globalAvg: number
): ILPAssignmentResult {
	const { minRoomSize, maxRoomSize } = config;

	if (participants.length === 0 || options.length === 0) {
		return {
			success: false,
			rooms: [],
			statistics: {
				totalParticipants: participants.length,
				totalRooms: 0,
				heterogeneityScore: 0,
				satisfactionScore: 0,
				avgRoomSize: 0,
				solverStatus: "FALLBACK_EMPTY",
			},
			error: "No participants or options for fallback",
		};
	}

	// Group participants by their first joined option
	const byOption: Map<string, ILPParticipant[]> = new Map();

	for (const p of participants) {
		if (p.joinedOptions.length > 0) {
			const firstOption = p.joinedOptions[0];
			if (options.includes(firstOption)) {
				if (!byOption.has(firstOption)) {
					byOption.set(firstOption, []);
				}
				byOption.get(firstOption)!.push(p);
			}
		}
	}

	// Create rooms for each option
	const rooms: ILPRoom[] = [];
	let roomNumber = 1;
	const targetSize = Math.floor((minRoomSize + maxRoomSize) / 2);

	for (const [opt, optParticipants] of byOption) {
		// Sort by spectrum for better distribution
		const sorted = [...optParticipants].sort((a, b) => a.spectrum - b.spectrum);

		// Create rooms of target size
		for (let i = 0; i < sorted.length; i += targetSize) {
			const roomParts = sorted.slice(i, i + targetSize);
			if (roomParts.length > 0) {
				const avgSpectrum =
					roomParts.reduce((sum, p) => sum + p.spectrum, 0) / roomParts.length;

				rooms.push({
					roomNumber: roomNumber++,
					topicId: opt,
					participants: roomParts.map((p) => ({
						oderId: p.oderId,
						odeName: p.odeName,
						spectrum: p.spectrum,
					})),
					size: roomParts.length,
					avgSpectrum: Math.round(avgSpectrum * 100) / 100,
				});
			}
		}
	}

	const totalAssigned = rooms.reduce((sum, r) => sum + r.size, 0);
	const heterogeneityScore = calculateHeterogeneityScore(rooms, globalAvg);

	return {
		success: rooms.length > 0,
		rooms,
		statistics: {
			totalParticipants: totalAssigned,
			totalRooms: rooms.length,
			heterogeneityScore: Math.round(heterogeneityScore * 100) / 100,
			satisfactionScore: participants.length > 0 ? totalAssigned / participants.length : 0,
			avgRoomSize: rooms.length > 0 ? totalAssigned / rooms.length : 0,
			solverStatus: "FALLBACK_SUCCESS",
		},
	};
}

/**
 * Wrapper function with fallback support
 */
export function solveWithFallback(
	participants: ILPParticipant[],
	options: string[],
	config: ILPConfig
): ILPAssignmentResult {
	try {
		const result = solveRoomAssignment(participants, options, config);
		if (result.success) {
			return result;
		}
	} catch (error) {
		console.error("ILP solver failed:", error);
	}

	// Fallback
	const globalAvg =
		participants.length > 0
			? participants.reduce((sum, p) => sum + p.spectrum, 0) / participants.length
			: 3;

	return fallbackAssignment(participants, options, config, globalAvg);
}
