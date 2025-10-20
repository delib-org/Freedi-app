import { Collections, Creator, getStatementSubscriptionId, MassConsensusMember, MassConsensusPageUrls, MassConsensusProcess, MassConsensusProcessSchema, MassConsensusStage, User } from "delib-npm";
import { DB } from "../config";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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
	stages: MassConsensusStage[];
	statementId: string;
}

export async function reorderMassConsensusProcessToDB({ stages, statementId }: MassConsensusProcessProps) {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);

		const updateData = {
			statementId,
			stages
		};

		const PartialMassConsensusProcessSchema = partial(MassConsensusProcessSchema);
		parse(PartialMassConsensusProcessSchema, updateData);

		await setDoc(processRef, updateData, { merge: true });

	} catch (error) {
		console.error(error);
	}
}

export async function removeMassConsensusStage(statementId: string, stageUrl: MassConsensusPageUrls): Promise<void> {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);
		const processDoc = await getDoc(processRef);

		if (!processDoc.exists()) return;
		
		const processData = processDoc.data() as MassConsensusProcess;
		const currentStages = processData.stages || [];
		const updatedStages = currentStages.filter(s => s.url !== stageUrl);
		
		await updateDoc(processRef, {
			stages: updatedStages
		});
	} catch (error) {
		console.error(error);
	}
}

export async function setNewProcessToDB(statementId: string): Promise<MassConsensusProcess | undefined> {
	try {
		const processRef = doc(DB, Collections.massConsensusProcesses, statementId);

		const process: Partial<MassConsensusProcess> = {
			statementId,
			stages: defaultMassConsensusProcess,
			version: '1.0',
			createdAt: new Date().getTime(),
			createdBy: 'system'
		}

		await setDoc(processRef, process, { merge: true });

		return process as MassConsensusProcess;
	} catch (error) {
		console.error(error);

		return undefined;
	}
}