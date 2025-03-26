import { Collections, MassConsensusProcess } from "delib-npm";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";
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