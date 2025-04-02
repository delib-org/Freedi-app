import { Collections, MassConsensusProcess } from "delib-npm";
import { doc, getDoc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { DB } from "../config";
import { store } from "@/redux/store";
import { setMassConsensusProcess } from "@/redux/massConsensus/massConsensusSlice";

export function listenToMassConsensusProcess(statementId: string): Unsubscribe {
	try {
		const dispatch = store.dispatch;
		const mcProcessSettingRef = doc(DB, Collections.massConsensusProcesses, statementId);

		return onSnapshot(mcProcessSettingRef, (stgDB) => {
			if (stgDB.exists()) {
				const processes = stgDB.data() as MassConsensusProcess;
				dispatch(setMassConsensusProcess(processes));
			}
		});
	} catch (error) {
		console.error(error);

		return () => { return; };

	}
}

export async function getMassConsensusProcess(statementId: string): Promise<MassConsensusProcess | undefined> {

	try {
		const mcProcessSettingRef = doc(DB, Collections.massConsensusProcesses, statementId);
		const stgDB = await getDoc(mcProcessSettingRef);
		if (!stgDB.exists()) throw new Error("Mass consensus process not found");

		return stgDB.data() as MassConsensusProcess;

	} catch (error) {
		console.error(error);

		return undefined;
	}
}