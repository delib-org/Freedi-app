import { Collections, MassConsensusProcess } from "delib-npm";
import { doc, getDoc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { DB } from "../config";
import { store } from "@/redux/store";
import { setMassConsensusProcess } from "@/redux/massConsensus/massConsensusSlice";
import { defaultMassConsensusProcess } from "@/model/massConsensus/massConsensusModel";

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

        if (!stgDB.exists()) {
            // Return default process when no process exists
            console.info("No mass consensus process found for statement, using default process");
            
            return {
                statementId,
                stages: defaultMassConsensusProcess,
                version: '1.0',
                createdAt: new Date().getTime(),
                createdBy: 'system',
            } as MassConsensusProcess;
        }

        return stgDB.data() as MassConsensusProcess;

    } catch (error) {
        console.error(error);

        return undefined;
    }
}