import { Collections, Creator, getStatementSubscriptionId, LoginType, MassConsensusMember, MassConsensusStep, MassConsensusProcess, MassConsensusProcessSchema, User } from "delib-npm";
import { DB } from "../config";
import { deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { convertFirebaseUserToCreator } from "@/types/user/userUtils";
import { parse, partial } from "valibot";
import { defaultMassConsensusProcess } from "@/model/massConsensus/massConsensusModel";

export async function setMassConsensusMemberToDB(creator: Creator | User, statementId: string) {
	try {
		const newMember: MassConsensusMember = {
			statementId,
			lastUpdate: new Date().getTime(),
			creator: convertFirebaseUserToCreator(creator)
		};
		const memberId = getStatementSubscriptionId(statementId, creator);
		if (!memberId) throw new Error('Error getting member id');
		const memberRef = doc(DB, Collections.massConsensusMembers, memberId);
		await setDoc(memberRef, newMember, { merge: true });

		return { message: 'Member added successfully', ok: true };
	} catch (error) {
		console.error(error);

		return { message: 'Error adding member', ok: false };
	}
}

interface MassConsensusProcessProps {
	steps: MassConsensusStep[];
	loginType?: LoginType;
	statementId: string;
	processName?: string;
}

export async function reorderMassConsensusProcessToDB({ steps, loginType, statementId, processName }: MassConsensusProcessProps) {
	try {
		if (!statementId) {
			console.error('No statementId provided for reorderMassConsensusProcessToDB');

			return;
		}

		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);
		const type = loginType ?? "default";

		// Get the current document first to preserve other loginTypes
		const processDoc = await getDoc(processRef);
		let existingData = processDoc.exists() ? processDoc.data() : { statementId, loginTypes: {} };

		// Update only the specific loginType
		if (!existingData.loginTypes) {
			existingData.loginTypes = {};
		}

		// Create the update for this specific loginType
		existingData.loginTypes[type] = {
			steps: steps,
			processName: processName || existingData.loginTypes[type]?.processName || "Default Process"
		};


		// Validate the data
		const PartialMassConsensusProcessSchema = partial(MassConsensusProcessSchema);
		parse(PartialMassConsensusProcessSchema, existingData);

		// Update the document in Firestore
		await setDoc(processRef, existingData, { merge: false }); // Use merge: false for complete replacement

	} catch (error) {
		console.error('=== DATABASE UPDATE ERROR ===');
		console.error('Error details:', error);
		console.error('Error updating mass consensus process:', error);
	}
}

export async function removeMassConsensusStep(statementId: string, loginType: LoginType, step: MassConsensusStep): Promise<void> {
	try {
		if (!statementId) {
			console.error('No statementId provided for removeMassConsensusStep');

			return;
		}

		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);
		
		// Get current document to manually filter steps
		const processDoc = await getDoc(processRef);
		if (!processDoc.exists()) {
			console.error('Process document does not exist');

			return;
		}

		const processData = processDoc.data();
		const currentSteps = processData?.loginTypes?.[loginType]?.steps || [];
		
		// Filter out the step to remove (comparing only screen since statementId is removed)
		const updatedSteps = currentSteps.filter((s: MassConsensusStep) => 
			s.screen !== step.screen
		);

		// Update with filtered steps
		await updateDoc(processRef, {
			[`loginTypes.${loginType}.steps`]: updatedSteps
		});

	} catch (error) {
		console.error('Error removing step:', error);
	}
}

export async function updateMassConsensusLoginTypeProcess(statementId: string, loginType: LoginType, processName?: string): Promise<void> {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);

		const processDB = await getDoc(processRef);
		if (processDB.exists()) {

			const processData = processDB.data();
			if (!processData) throw new Error("No process data was found");

			if (!processData.loginTypes) throw new Error("No process data was found");
			const processList = processData.loginTypes[loginType];
			if (!processList) {
				const stepsWithStatementId = defaultMassConsensusProcess.map(step => ({
					...step,
					statementId
				}));
				await updateDoc(processRef, {
					[`loginTypes.${loginType}`]: {
						steps: stepsWithStatementId,
						processName: processName || "Default Process for all users"
					}
				});
			} else {
				await updateDoc(processRef, {
					[`loginTypes.${loginType}`]: deleteField()
				});
			}
		} else {

			await setNewProcessToDB(statementId, loginType);
		}

	} catch (error) {
		console.error(error);

	}
}

export async function setNewProcessToDB(statementId: string, loginType?: LoginType): Promise<MassConsensusProcess | undefined> {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);

		const stepsWithStatementId = defaultMassConsensusProcess.map(step => ({
			...step,
			statementId
		}));

		const process = {
			statementId,
			loginTypes: {
				default: {
					steps: stepsWithStatementId,
					processName: "Default Process for all users"
				}
			}
		}

		if (loginType) {
			process.loginTypes[loginType] = {
				steps: stepsWithStatementId,
				processName: "Default Process for all users"
			}
		}

		setDoc(processRef, process, { merge: true });
	} catch (error) {
		console.error(error);

		return undefined;
	}
}