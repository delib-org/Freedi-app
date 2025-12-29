/**
 * Script to call the fixClusterIntegration function
 * Run with: cd functions && npx tsx scripts/call-fix-cluster.ts
 */
import * as admin from "firebase-admin";

// Initialize Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
	const clusterId = "Prdiw8iZeL3z7xV69eTw";

	// Dog enforcement source IDs (excluding dog park statements)
	const sourceIds = [
		"506TXDMLbTeelXQJ3Tj3",  // כלבים משוטטים - stray dogs
		"Cd01Rcz7GwVESp9pQEzG",  // טיפול בכלבים משוטטים - treatment of stray dogs
		"lIRoox57FPXwAdGd8v91",  // לטפל בכלבים המשוטטים - handle stray dogs + enforcement
		"FYwOCK5BR3HKHv5cfAz1",  // לתגבר אכיפה - dog poop enforcement
		"Xug6gVVHaPydTDT4HNFU",  // כל מה שקשור לנושא הכלבים - dogs threatening
		"qSTbcxNqtPix7KBMUSEs",  // איסוף קקי של הכלבים - dog poop collection
		"layP2ip8NpDiCrYOSQNR",  // אכיפה של נושא הכלבים - dog enforcement
		"uGCBCAiwPFudn7JL9JAe",  // אכיפת בעלי כלבים - dog poop enforcement
		"E5YWInsaWe4AUhFZrkKG",  // כלבים לא קשורים - dogs not tied
		"AF0pZ2m4dry4kGktQZWR",  // כלבים לא קשורים כולל הקקי - dogs not tied + poop
		"2qcSw3rR7nrPHrIrmErT",  // כלבים משוטטים או ללא רצועה לאכוף - stray dogs + enforcement
	];

	// Excluded: JkokMOhPJfpic3h8UeDx (dog park) and FnV0walLzOXtjmEh6qa3 (dog park)

	console.log("=== Fix Cluster Integration ===");
	console.log("Cluster ID:", clusterId);
	console.log("Source IDs:", sourceIds);
	console.log("Source count:", sourceIds.length);
	console.log("");

	// First, let's do a dry run manually to see what would happen
	console.log("=== DRY RUN - Checking current state ===");

	// Get cluster
	const clusterDoc = await db.collection("statements").doc(clusterId).get();
	if (!clusterDoc.exists) {
		console.error("Cluster not found!");
		process.exit(1);
	}

	const cluster = clusterDoc.data()!;
	console.log("\nCurrent cluster state:");
	console.log("  Statement:", cluster.statement);
	console.log("  Consensus:", cluster.consensus?.toFixed(3));
	console.log("  Evaluators:", cluster.evaluation?.numberOfEvaluators);
	console.log("  Pro:", cluster.evaluation?.numberOfProEvaluators);
	console.log("  Con:", cluster.evaluation?.numberOfConEvaluators);
	console.log("  isCluster:", cluster.isCluster);
	console.log("  integratedOptions:", cluster.integratedOptions);

	// Get source details
	console.log("\nSource statements:");
	for (const sourceId of sourceIds) {
		const sourceDoc = await db.collection("statements").doc(sourceId).get();
		if (sourceDoc.exists) {
			const source = sourceDoc.data()!;
			console.log(`  ${sourceId}: ${source.statement?.substring(0, 50)}...`);
			console.log(`    Consensus: ${source.consensus?.toFixed(3)}, Evals: ${source.evaluation?.numberOfEvaluators}`);
		} else {
			console.log(`  ${sourceId}: NOT FOUND`);
		}
	}

	// Collect all evaluations from sources
	console.log("\n=== Collecting evaluations from sources ===");
	const userEvaluations = new Map<string, {
		evaluation: number;
		isDirect: boolean;
		sourceEvaluations: number[];
	}>();

	for (const sourceId of sourceIds) {
		const sourceEvals = await db
			.collection("evaluations")
			.where("statementId", "==", sourceId)
			.get();

		console.log(`Source ${sourceId}: ${sourceEvals.size} evaluations`);

		for (const doc of sourceEvals.docs) {
			const evaluation = doc.data();
			const userId = evaluation.evaluator?.uid;
			if (!userId) continue;

			const existing = userEvaluations.get(userId);
			if (existing && !existing.isDirect) {
				// Average multiple source evaluations from the same user
				existing.sourceEvaluations.push(evaluation.evaluation);
				existing.evaluation =
					existing.sourceEvaluations.reduce((a: number, b: number) => a + b, 0) / existing.sourceEvaluations.length;
			} else if (!existing) {
				userEvaluations.set(userId, {
					evaluation: evaluation.evaluation,
					isDirect: false,
					sourceEvaluations: [evaluation.evaluation],
				});
			}
		}
	}

	console.log(`\nTotal unique users from sources: ${userEvaluations.size}`);

	// Get direct evaluations on cluster (without migratedAt)
	console.log("\n=== Getting direct evaluations on cluster ===");
	const clusterEvals = await db
		.collection("evaluations")
		.where("statementId", "==", clusterId)
		.get();

	let directCount = 0;
	let migratedCount = 0;
	for (const doc of clusterEvals.docs) {
		const evaluation = doc.data();
		if (evaluation.migratedAt) {
			migratedCount++;
			continue;
		}
		directCount++;
		const userId = evaluation.evaluator?.uid;
		if (!userId) continue;
		// Direct evaluation overwrites source evaluation
		userEvaluations.set(userId, {
			evaluation: evaluation.evaluation,
			isDirect: true,
			sourceEvaluations: [],
		});
	}

	console.log(`Total evaluations on cluster: ${clusterEvals.size}`);
	console.log(`  Direct (no migratedAt): ${directCount}`);
	console.log(`  Migrated: ${migratedCount}`);

	// Calculate new metrics
	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let proCount = 0;
	let conCount = 0;

	for (const [, data] of userEvaluations) {
		const evalValue = data.evaluation;
		sumEvaluations += evalValue;
		sumSquaredEvaluations += evalValue * evalValue;

		if (evalValue > 0) {
			proCount++;
		} else if (evalValue < 0) {
			conCount++;
		}
	}

	const totalEvaluators = proCount + conCount;
	const FLOOR_STD_DEV = 0.5;

	// Calculate agreement
	let agreement = 0;
	if (totalEvaluators > 0) {
		const mean = sumEvaluations / totalEvaluators;
		let sem = FLOOR_STD_DEV;

		if (totalEvaluators > 1) {
			const variance = sumSquaredEvaluations / totalEvaluators - mean * mean;
			const observedStdDev = Math.sqrt(Math.max(0, variance));
			const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);
			sem = adjustedStdDev / Math.sqrt(totalEvaluators);
		}

		const availableRange = mean + 1;
		const penalty = Math.min(sem, availableRange);
		agreement = mean - penalty;
	}

	console.log("\n=== CALCULATED NEW VALUES ===");
	console.log(`Total evaluators: ${totalEvaluators} (${proCount} pro, ${conCount} con)`);
	console.log(`New consensus: ${agreement.toFixed(3)}`);
	console.log(`\nCurrent consensus: ${cluster.consensus?.toFixed(3)}`);
	console.log(`Current evaluators: ${cluster.evaluation?.numberOfEvaluators} (${cluster.evaluation?.numberOfProEvaluators} pro, ${cluster.evaluation?.numberOfConEvaluators} con)`);

	// Ask for confirmation
	console.log("\n=== WOULD YOU LIKE TO APPLY THESE CHANGES? ===");
	console.log("To apply, run with --apply flag");

	if (process.argv.includes("--apply")) {
		console.log("\n=== APPLYING CHANGES ===");

		const now = Date.now();
		const batch = db.batch();

		// Update cluster
		const updatedEvaluation = {
			...(cluster.evaluation || {}),
			numberOfEvaluators: totalEvaluators,
			numberOfProEvaluators: proCount,
			numberOfConEvaluators: conCount,
			sumEvaluations,
			sumSquaredEvaluations,
			agreement,
		};

		batch.update(db.collection("statements").doc(clusterId), {
			isCluster: true,
			integratedOptions: sourceIds,
			evaluation: updatedEvaluation,
			totalEvaluators,
			consensus: agreement,
			lastUpdate: now,
		});

		// Update source statements
		for (const sourceId of sourceIds) {
			batch.update(db.collection("statements").doc(sourceId), {
				integratedInto: clusterId,
				lastUpdate: now,
			});
		}

		await batch.commit();
		console.log("Changes applied successfully!");

		// Verify
		const updatedCluster = await db.collection("statements").doc(clusterId).get();
		const updated = updatedCluster.data()!;
		console.log("\nVerification - Updated cluster:");
		console.log("  Consensus:", updated.consensus?.toFixed(3));
		console.log("  Evaluators:", updated.evaluation?.numberOfEvaluators);
		console.log("  Pro:", updated.evaluation?.numberOfProEvaluators);
		console.log("  Con:", updated.evaluation?.numberOfConEvaluators);
		console.log("  isCluster:", updated.isCluster);
		console.log("  integratedOptions:", updated.integratedOptions?.length, "sources");
	}

	process.exit(0);
}

main().catch(console.error);
