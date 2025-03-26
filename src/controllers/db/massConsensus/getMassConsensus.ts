import { Collections } from "delib-npm";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { DB } from "../config";
import { useDispatch } from "react-redux";

export function listenToMassConsensusProcess(statementId: string): Unsubscribe {
	try {
		const dispatch = useDispatch();
		const mcProcessSettingRef = doc(DB, Collections.massConsensusProcesses, statementId);

		return onSnapshot(mcProcessSettingRef, (stgDB) => {
			if (stgDB.exists()) {
				dispatch({ type: "SET_MASS_CONSENSUS_PROCESS", payload: stgDB.data() });
			}
		});
	} catch (error) {
		console.error(error);

		return () => { return; };

	}
}