// Test file to verify shuffle function works correctly

// Helper function to shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
	// Create a deep copy to ensure we're not mutating the original
	const shuffled = [...array];

	// Fisher-Yates shuffle algorithm
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		// Swap elements
		const temp = shuffled[i];
		shuffled[i] = shuffled[j];
		shuffled[j] = temp;
	}

	return shuffled;
}

// Test the shuffle function
function testShuffle() {
	// Create test array with anchored and non-anchored items
	const testArray = [
		{ id: 1, anchored: true, text: 'Anchored 1' },
		{ id: 2, anchored: true, text: 'Anchored 2' },
		{ id: 3, anchored: true, text: 'Anchored 3' },
		{ id: 4, anchored: false, text: 'Non-anchored 1' },
		{ id: 5, anchored: false, text: 'Non-anchored 2' },
		{ id: 6, anchored: false, text: 'Non-anchored 3' },
	];

	console.log('Original array:');
	console.log(testArray.map(item => `${item.text} (anchored: ${item.anchored})`));

	// Run shuffle multiple times to verify randomness
	for (let run = 1; run <= 5; run++) {
		const shuffled = shuffleArray(testArray);
		console.log(`\nShuffled run ${run}:`);
		console.log(shuffled.map(item => `${item.text} (anchored: ${item.anchored})`));

		// Check if anchored items are at beginning
		const firstThreeAnchored = shuffled.slice(0, 3).filter(item => item.anchored).length;
		console.log(`First 3 items that are anchored: ${firstThreeAnchored}/3`);
	}
}

testShuffle();