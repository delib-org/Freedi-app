import { Collections } from "@/types/TypeEnums";
import { FireStore } from "../config";
import { MassConsensusTextTypes } from "@/types/massConsensus/massConsensusTypes";
import { doc, setDoc } from "firebase/firestore";

export async function setMassConsensusTextsToDB({ textType, text, statementId }: { textType: MassConsensusTextTypes, text: string, statementId: string }) {
	// Update the mass consensus texts
	try {
		const massConsensusRef = doc(FireStore, Collections.massConsensus, statementId);
		await setDoc(massConsensusRef, {
			statementId,
			texts: {
				[textType]: text,
			}
		}, { merge: true });
	} catch (error) {
		console.error(error);
	}

}