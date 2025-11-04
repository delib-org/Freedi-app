/**
 * Simple demonstration of the new Popper-Hebbian weight calculation
 */

const EvidenceType = {
	data: 'data',
	testimony: 'testimony',
	argument: 'argument',
	anecdote: 'anecdote',
	fallacy: 'fallacy'
};

const EVIDENCE_WEIGHTS = {
	data: 1.0,
	testimony: 0.7,
	argument: 0.4,
	anecdote: 0.2,
	fallacy: 0.1
};

function calculatePostWeight(evidenceType, helpfulCount, notHelpfulCount) {
	if (!evidenceType) return 0.0;

	const baseWeight = EVIDENCE_WEIGHTS[evidenceType];
	const totalVotes = helpfulCount + notHelpfulCount;

	if (totalVotes === 0) {
		return baseWeight * 1.0;
	}

	const smoothing = 2;
	const smoothedHelpful = helpfulCount + (smoothing * 0.75);
	const smoothedNotHelpful = notHelpfulCount + (smoothing * 0.25);
	const smoothedTotal = smoothedHelpful + smoothedNotHelpful;

	const helpfulRatio = smoothedHelpful / smoothedTotal;
	const voteCredibility = (helpfulRatio * 2) - 1;
	const finalWeight = baseWeight * voteCredibility;

	return Math.max(-1.0, Math.min(1.0, finalWeight));
}

console.log('\n=== Popper-Hebbian Weight Calculation Demo ===\n');
console.log('Weight range: -1 (discredited) to +1 (fully credible)\n');

// Demo 1: New evidence (0 votes)
console.log('NEW EVIDENCE (0 votes) - Starts optimistically:');
console.log('─'.repeat(60));
Object.keys(EvidenceType).forEach(type => {
	const weight = calculatePostWeight(type, 0, 0);
	console.log(type.padEnd(12) + ' -> Weight: ' + weight.toFixed(2));
});

// Demo 2: Positive votes on Data
console.log('\nPOSITIVE VOTING - Data evidence:');
console.log('─'.repeat(60));
console.log('Helpful  |  Weight');
console.log('─'.repeat(60));
[0, 1, 3, 5, 10, 20].forEach(helpful => {
	const weight = calculatePostWeight('data', helpful, 0);
	console.log(helpful.toString().padEnd(8) + ' | ' + weight.toFixed(3));
});

// Demo 3: Negative votes on Data
console.log('\nNEGATIVE VOTING - Data evidence:');
console.log('─'.repeat(60));
console.log('Not Helpful  |  Weight');
console.log('─'.repeat(60));
[0, 1, 3, 5, 10, 20].forEach(notHelpful => {
	const weight = calculatePostWeight('data', 0, notHelpful);
	console.log(notHelpful.toString().padEnd(12) + ' | ' + weight.toFixed(3));
});

// Demo 4: Mixed votes
console.log('\nMIXED VOTING - Data evidence:');
console.log('─'.repeat(60));
console.log('Helpful  |  Not Helpful  |  Weight');
console.log('─'.repeat(60));
[
	[5, 5],
	[7, 3],
	[3, 7],
	[10, 2],
	[2, 10]
].forEach(([helpful, notHelpful]) => {
	const weight = calculatePostWeight('data', helpful, notHelpful);
	console.log(helpful.toString().padEnd(8) + ' | ' + notHelpful.toString().padEnd(13) + ' | ' + weight.toFixed(3));
});

// Demo 5: Bad evidence hurts
console.log('\nBAD "SUPPORTING" EVIDENCE - Hurts its own side:');
console.log('─'.repeat(60));
console.log('Support  |  Weight  |  Contribution');
console.log('─'.repeat(60));
[1.0, 0.8, 0.5].forEach(support => {
	const weight = calculatePostWeight('data', 0, 10);
	const contribution = support * weight;
	const effect = contribution < 0 ? ' (HURTS!)' : ' (Helps)';
	console.log(support.toFixed(1).padStart(7) + ' | ' + weight.toFixed(3).padStart(7) + ' | ' + contribution.toFixed(3).padStart(12) + effect);
});

// Demo 6: Evidence type scaling
console.log('\nEVIDENCE TYPE SCALING - Same votes (10 helpful, 0 not):');
console.log('─'.repeat(60));
console.log('Type         |  Base  |  Final Weight');
console.log('─'.repeat(60));
Object.keys(EvidenceType).forEach(type => {
	const weight = calculatePostWeight(type, 10, 0);
	const baseWeight = EVIDENCE_WEIGHTS[type];
	console.log(type.padEnd(12) + ' | ' + baseWeight.toFixed(1) + '    | ' + weight.toFixed(3));
});

console.log('\nKey Features:');
console.log('  ✓ New evidence starts at full base weight');
console.log('  ✓ Moves toward community consensus with votes');
console.log('  ✓ Bad evidence can hurt its own position');
console.log('  ✓ Evidence type scales maximum impact');
console.log('  ✓ Smoothing prevents wild swings\n');
