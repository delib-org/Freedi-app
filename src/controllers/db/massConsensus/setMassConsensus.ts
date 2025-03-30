import { Collections, Creator, getStatementSubscriptionId, LoginType, MassConsensusMember, MassConsensusPageUrls, MassConsensusProcessSchema, User } from "delib-npm";
import { DB } from "../config";
import { arrayRemove, deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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
	steps: MassConsensusPageUrls[];
	loginType?: LoginType;
	statementId: string;
	processName?: string;
}

export async function reorderMassConsensusProcessToDB({ steps, loginType, statementId, processName }: MassConsensusProcessProps) {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);

		// Prepare the update data based on loginType
		let updateData = {
			statementId,
			loginTypes: {}
		}; // Use 'any' type to handle dynamic key assignment

		const type = loginType ?? "default";

		updateData.loginTypes[type] = {
			steps
		};

		if (processName) {
			updateData[type].steps = processName;
		}

		const PartialMassConsensusProcessSchema = partial(MassConsensusProcessSchema);
		parse(PartialMassConsensusProcessSchema, updateData);

		// Update the document in Firestore
		await setDoc(processRef, updateData, { merge: true });

	} catch (error) {
		console.error(error);

	}
}

export async function removeMassConsensusStep(statementId: string, loginType: LoginType, step: MassConsensusPageUrls): Promise<void> {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);
		await updateDoc(processRef, {
			[`loginTypes.${loginType}.steps`]: arrayRemove(step)
		});
	} catch (error) {
		console.error(error);

	}

}

export async function updateMassConsensusLoginTypeProcess(statementId: string, loginType: LoginType, processName?: string): Promise<void> {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);

		const processDB = await getDoc(processRef);
		if (!processDB.exists()) throw new Error("No process was found");

		const processData = processDB.data();
		if (!processData) throw new Error("No process data was found");

		if (!processData.loginTypes) throw new Error("No process data was found");
		const processList = processData.loginTypes[loginType];
		if (!processList) {
			await updateDoc(processRef, {
				[`loginTypes.${loginType}`]: {
					steps: defaultMassConsensusProcess,
					processName: processName || "Default Process for all users"
				}
			});
		} else {
			await updateDoc(processRef, {
				[`loginTypes.${loginType}`]: deleteField()
			});
		}

	} catch (error) {
		console.error(error);

	}
}