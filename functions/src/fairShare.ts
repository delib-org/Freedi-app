// Type definitions
type Person = number;  // Person identifier
type Event = number;   // Event identifier
type Rating = number;  // Rating (1-5)

// Interface describing the problem data
interface Problem {
	numPeople: number;                          // Number of people
	eventBudget: number;                        // Maximum number of events that can be held
	ratings: Map<Person, Map<Event, Rating>>;   // People's ratings for events
	eventCosts: Map<Event, number>;             // Cost of each event
	totalBudget: number;                        // Total budget in currency
	minAttendees: number;                       // Minimum number of attendees per event
	eventCapacity: Map<Event, number>;          // Maximum capacity for each event
}

// Interface describing the solution
interface Solution {
	selectedEvents: Event[];                    // Selected events
	personToEvent: Map<Person, Event | null>;   // Assignment of people to events
	eventToPersons: Map<Event, Person[]>;       // Assignment of events to people
	satisfactionRate: number;                   // Overall satisfaction rate
	totalCost: number;                          // Total cost
	attendeesPerEvent: Map<Event, number>;      // Number of attendees per event
}

/**
 * Main function for optimal event selection
 */
function selectOptimalEvents(problem: Problem): Solution {
	const {
		numPeople,
		eventBudget,
		ratings,
		eventCosts,
		totalBudget,
		minAttendees,
		eventCapacity
	} = problem;

	// List of all possible events
	const availableEvents = new Set<Event>();
	for (const personRatings of ratings.values()) {
		for (const event of personRatings.keys()) {
			availableEvents.add(event);
		}
	}

	// Initialize solution
	const selectedEvents: Event[] = [];
	const personToEvent = new Map<Person, Event | null>();
	const eventToPersons = new Map<Event, Person[]>();
	const attendeesPerEvent = new Map<Event, number>();
	let satisfiedPeople = new Set<Person>();
	let totalCost = 0;

	// Initialize all people as unsatisfied
	for (let i = 0; i < numPeople; i++) {
		personToEvent.set(i, null);
	}

	// Event selection algorithm
	while (
		selectedEvents.length < eventBudget &&
		satisfiedPeople.size < numPeople &&
		availableEvents.size > 0 &&
		totalCost < totalBudget
	) {
		// Preliminary check: how many people are likely to attend each event
		const potentialAttendees = findPotentialAttendeesPerEvent(
			availableEvents,
			ratings,
			satisfiedPeople
		);

		// Filter out events that don't meet the minimum attendee threshold
		filterEventsBelowAttendanceThreshold(
			availableEvents,
			potentialAttendees,
			minAttendees
		);

		// If no possible events remain, exit
		if (availableEvents.size === 0) {
			break;
		}

		// Calculate score for each event
		const eventScores = calculateEventScores(
			availableEvents,
			ratings,
			satisfiedPeople,
			potentialAttendees,
			eventCosts,
			totalCost,
			totalBudget
		);

		// Select the event with the highest score
		const bestEvent = findBestScoringEvent(eventScores);

		// If no suitable event was found, exit
		if (bestEvent === null) {
			break;
		}

		// Add the selected event
		selectedEvents.push(bestEvent);
		availableEvents.delete(bestEvent);
		eventToPersons.set(bestEvent, []);
		totalCost += eventCosts.get(bestEvent) || 0;

		// Assign people to this event (considering capacity constraints)
		assignPeopleToEvent(
			bestEvent,
			potentialAttendees.get(bestEvent) || [],
			ratings,
			eventCapacity.get(bestEvent) || Number.MAX_SAFE_INTEGER,
			personToEvent,
			eventToPersons,
			satisfiedPeople,
			attendeesPerEvent
		);

		// If all people are satisfied, reset satisfiedPeople for another round
		if (satisfiedPeople.size === numPeople) {
			satisfiedPeople = new Set<Person>();
		}
	}

	// Calculate overall satisfaction rate
	const satisfactionRate = calculateSatisfactionRate(
		numPeople,
		personToEvent,
		ratings
	);

	return {
		selectedEvents,
		personToEvent,
		eventToPersons,
		satisfactionRate,
		totalCost,
		attendeesPerEvent
	};
}

/**
 * Helper function to find potential attendees for each event
 */
function findPotentialAttendeesPerEvent(
	availableEvents: Set<Event>,
	ratings: Map<Person, Map<Event, Rating>>,
	satisfiedPeople: Set<Person>
): Map<Event, Person[]> {
	const potentialAttendees = new Map<Event, Person[]>();

	for (const event of availableEvents) {
		potentialAttendees.set(event, []);
	}

	// Collect potential attendees for each event
	for (let personId = 0; personId < ratings.size; personId++) {
		if (satisfiedPeople.has(personId)) continue;

		const personRatings = ratings.get(personId);
		if (!personRatings) continue;

		for (const [event, rating] of personRatings.entries()) {
			// If the person is interested in the event (rating 3 or above) and the event is still available
			if (rating >= 3 && availableEvents.has(event)) {
				potentialAttendees.get(event)?.push(personId);
			}
		}
	}

	return potentialAttendees;
}

/**
 * Helper function to filter out events below the attendance threshold
 */
function filterEventsBelowAttendanceThreshold(
	availableEvents: Set<Event>,
	potentialAttendees: Map<Event, Person[]>,
	minAttendees: number
): void {
	for (const [event, attendees] of potentialAttendees.entries()) {
		if (attendees.length < minAttendees) {
			availableEvents.delete(event);
		}
	}
}

/**
 * Helper function to calculate event scores
 */
function calculateEventScores(
	availableEvents: Set<Event>,
	ratings: Map<Person, Map<Event, Rating>>,
	satisfiedPeople: Set<Person>,
	potentialAttendees: Map<Event, Person[]>,
	eventCosts: Map<Event, number>,
	currentTotalCost: number,
	totalBudget: number
): Map<Event, number> {
	const eventScores = new Map<Event, number>();

	for (const event of availableEvents) {
		// Check that the event won't exceed the budget
		const cost = eventCosts.get(event) || 0;
		if (currentTotalCost + cost > totalBudget) {
			continue; // Skip events that would exceed the budget
		}

		const score = calculateEventScore(
			event,
			ratings,
			satisfiedPeople,
			potentialAttendees.get(event)?.length || 0,
			cost
		);

		eventScores.set(event, score);
	}

	return eventScores;
}

/**
 * Helper function to calculate an event's score based on multiple parameters
 */
function calculateEventScore(
	event: Event,
	ratings: Map<Person, Map<Event, Rating>>,
	satisfiedPeople: Set<Person>,
	potentialAttendees: number,
	cost: number,
	popularityWeight: number = 0.7,    // Popularity weight
	fairnessWeight: number = 0.25,     // Fairness weight
	costEfficiencyWeight: number = 0.05 // Cost-efficiency weight
): number {
	// Calculate popularity score
	let popularityScore = 0;
	let fairnessScore = 0;
	let unsatisfiedCount = 0;

	for (const [personId, personRatings] of ratings.entries()) {
		const rating = personRatings.get(event) || 0;

		// Add to overall popularity score
		popularityScore += rating;

		// Calculate fairness score - only considers people who haven't been satisfied yet
		if (!satisfiedPeople.has(personId) && rating > 0) {
			fairnessScore += rating;
			unsatisfiedCount++;
		}
	}

	// Normalize popularity score with enhancement for large number of attendees
	const normalizedPopularityScore = Math.pow(popularityScore / ratings.size, 1.2);

	// Normalize fairness score
	const normalizedFairnessScore = unsatisfiedCount > 0
		? fairnessScore / unsatisfiedCount
		: 0;

	// Calculate cost-efficiency ratio
	const costEfficiency = potentialAttendees > 0
		? (potentialAttendees / (cost + 1))
		: 0;

	// Normalize cost-efficiency ratio
	const normalizedCostEfficiency = Math.min(costEfficiency, 1);

	// Additional bonus for high attendance
	const largeAudienceBonus = Math.min(0.2, potentialAttendees / (ratings.size * 2));

	// Calculate final score with clearer names
	return (
		(popularityWeight * normalizedPopularityScore) +
		(fairnessWeight * normalizedFairnessScore * Math.sqrt(unsatisfiedCount)) +
		(costEfficiencyWeight * normalizedCostEfficiency) +
		largeAudienceBonus  // Bonus for high attendance
	);
}

/**
 * Helper function to find the event with the highest score
 */
function findBestScoringEvent(eventScores: Map<Event, number>): Event | null {
	let bestEvent: Event | null = null;
	let bestScore = -1;

	for (const [event, score] of eventScores.entries()) {
		if (score > bestScore) {
			bestScore = score;
			bestEvent = event;
		}
	}

	return bestEvent;
}

/**
 * Helper function to assign people to a selected event
 */
function assignPeopleToEvent(
	event: Event,
	potentialAttendeesList: Person[],
	ratings: Map<Person, Map<Event, Rating>>,
	maxCapacity: number,
	personToEvent: Map<Person, Event | null>,
	eventToPersons: Map<Event, Person[]>,
	satisfiedPeople: Set<Person>,
	attendeesPerEvent: Map<Event, number>
): void {
	// Sort attendees by rating (highest to lowest)
	potentialAttendeesList.sort((a, b) => {
		const ratingA = ratings.get(a)?.get(event) || 0;
		const ratingB = ratings.get(b)?.get(event) || 0;

		return ratingB - ratingA;
	});

	// Limit the number of attendees based on capacity
	const actualAttendees = potentialAttendeesList.slice(0, maxCapacity);
	attendeesPerEvent.set(event, actualAttendees.length);

	// Assign people to the event
	for (const personId of actualAttendees) {
		personToEvent.set(personId, event);
		eventToPersons.get(event)?.push(personId);
		satisfiedPeople.add(personId);
	}
}

/**
 * Helper function to calculate the overall satisfaction rate
 */
function calculateSatisfactionRate(
	numPeople: number,
	personToEvent: Map<Person, Event | null>,
	ratings: Map<Person, Map<Event, Rating>>
): number {
	let totalSatisfaction = 0;
	let maxPossibleSatisfaction = 0;

	for (let personId = 0; personId < numPeople; personId++) {
		const assignedEvent = personToEvent.get(personId);
		const personRatings = ratings.get(personId);

		if (!personRatings) {
			continue;
		}

		// Calculate maximum possible satisfaction
		let maxRating = 0;
		for (const rating of personRatings.values()) {
			maxRating = Math.max(maxRating, rating);
		}
		maxPossibleSatisfaction += maxRating;

		// Calculate actual satisfaction
		if (assignedEvent !== null) {
			totalSatisfaction += personRatings.get(assignedEvent) || 0;
		}
	}

	return maxPossibleSatisfaction > 0
		? totalSatisfaction / maxPossibleSatisfaction
		: 0;
}

/**
 * Function to analyze the solution and suggest recommendations
 */
function analyzeSolution(problem: Problem, solution: Solution): {
	overallSatisfaction: number;
	averageCostPerPerson: number;
	budgetUtilization: number;
	eventEfficiency: Map<Event, number>;  // Efficiency of each event (attendees relative to cost)
	recommendations: string[];
} {
	const {
		selectedEvents,
		eventToPersons,
		satisfactionRate,
		totalCost,
		attendeesPerEvent
	} = solution;

	const { eventCosts, totalBudget } = problem;

	// Calculate budget utilization
	const budgetUtilization = totalCost / totalBudget;

	// Calculate total participants
	let totalParticipants = 0;
	for (const count of attendeesPerEvent.values()) {
		totalParticipants += count;
	}

	// Calculate average cost per person
	const averageCostPerPerson = totalParticipants > 0
		? totalCost / totalParticipants
		: 0;

	// Calculate efficiency of each event
	const eventEfficiency = new Map<Event, number>();
	for (const event of selectedEvents) {
		const attendees = attendeesPerEvent.get(event) || 0;
		const cost = eventCosts.get(event) || 0;

		// Efficiency = number of attendees relative to cost
		const efficiency = cost > 0 ? attendees / cost : 0;
		eventEfficiency.set(event, efficiency);
	}

	// Recommendations for improvement
	const recommendations: string[] = [];

	// Are there events with low efficiency?
	const lowEfficiencyEvents = selectedEvents.filter(event =>
		(eventEfficiency.get(event) || 0) < 0.01  // Efficiency threshold for recommendation
	);

	if (lowEfficiencyEvents.length > 0) {
		recommendations.push(
			`Consider canceling or replacing ${lowEfficiencyEvents.length} events with low efficiency`
		);
	}

	// Is there low budget utilization?
	if (budgetUtilization < 0.8) {
		recommendations.push(
			`Low budget utilization (${(budgetUtilization * 100).toFixed(1)}%). Consider adding more events`
		);
	}

	// Is there low satisfaction?
	if (satisfactionRate < 0.6) {
		recommendations.push(
			`Below average satisfaction rate (${(satisfactionRate * 100).toFixed(1)}%). Consider conducting a new preference survey`
		);
	}

	return {
		overallSatisfaction: satisfactionRate,
		averageCostPerPerson,
		budgetUtilization,
		eventEfficiency,
		recommendations
	};
}

/**
 * Sample function to create random problem data
 */
function createSampleProblem(
	numPeople: number = 3500,
	numPossibleEvents: number = 100,
	maxEvents: number = 25,
	totalBudget: number = 500000,
	minAttendees: number = 20
): Problem {
	const ratings = new Map<Person, Map<Event, Rating>>();
	const eventCosts = new Map<Event, number>();
	const eventCapacity = new Map<Event, number>();

	// Create random event costs
	for (let eventId = 0; eventId < numPossibleEvents; eventId++) {
		// Cost between 5,000 and 100,000
		const cost = 5000 + Math.floor(Math.random() * 95000);
		eventCosts.set(eventId, cost);

		// Capacity between 50 and 1000 people
		const capacity = 50 + Math.floor(Math.random() * 950);
		eventCapacity.set(eventId, capacity);
	}

	// Create random ratings
	for (let personId = 0; personId < numPeople; personId++) {
		const personRatings = new Map<Event, Rating>();

		// Each person rates between 5 and 15 events
		const numRatings = 5 + Math.floor(Math.random() * 11);
		const ratedEvents = new Set<Event>();

		while (ratedEvents.size < numRatings) {
			const eventId = Math.floor(Math.random() * numPossibleEvents);
			if (!ratedEvents.has(eventId)) {
				ratedEvents.add(eventId);

				// Rating between 1 and 5
				const rating = 1 + Math.floor(Math.random() * 5);
				personRatings.set(eventId, rating);
			}
		}

		ratings.set(personId, personRatings);
	}

	return {
		numPeople,
		eventBudget: maxEvents,
		ratings,
		eventCosts,
		totalBudget,
		minAttendees,
		eventCapacity
	};
}

/**
 * Example function to run the algorithm and display results
 */
function runExample(): void {
	console.log("Creating sample problem...");
	const problem = createSampleProblem();

	console.log("Solving event selection problem...");
	const solution = selectOptimalEvents(problem);

	console.log("Analyzing results...");
	const analysis = analyzeSolution(problem, solution);

	console.log(`Selected ${solution.selectedEvents.length} events out of ${problem.eventBudget} possible`);
	console.log(`Total cost: ${solution.totalCost.toLocaleString()} (${(analysis.budgetUtilization * 100).toFixed(1)}% of budget)`);
	console.log(`Overall satisfaction rate: ${(solution.satisfactionRate * 100).toFixed(1)}%`);
	console.log(`Average cost per person: ${analysis.averageCostPerPerson.toFixed(1)}`);

	// Display selected events
	console.log("\nSelected events:");
	solution.selectedEvents.forEach(event => {
		const attendees = solution.attendeesPerEvent.get(event) || 0;
		const cost = problem.eventCosts.get(event) || 0;
		const efficiency = analysis.eventEfficiency.get(event) || 0;

		console.log(`- Event ${event}: ${attendees} attendees, cost ${cost.toLocaleString()}, efficiency: ${efficiency.toFixed(4)}`);
	});

	// Display recommendations
	if (analysis.recommendations.length > 0) {
		console.log("\nRecommendations:");
		analysis.recommendations.forEach(rec => {
			console.log(`- ${rec}`);
		});
	}
}

// Run the example - can be activated like this:
// runExample();