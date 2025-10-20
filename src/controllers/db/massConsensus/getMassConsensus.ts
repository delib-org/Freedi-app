import { Collections, MassConsensusProcess, MassConsensusProcessSchema } from "delib-npm";
import { doc, getDoc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { DB } from "../config";
import { store } from "@/redux/store";
import { setMassConsensusProcess } from "@/redux/massConsensus/massConsensusSlice";
import { defaultMassConsensusProcess } from "@/model/massConsensus/massConsensusModel";
import { parse } from "valibot";

export function listenToMassConsensusProcess(statementId: string): Unsubscribe {
    const dispatch = store.dispatch;
    const mcProcessSettingRef = doc(DB, Collections.massConsensusProcesses, statementId);

    return onSnapshot(mcProcessSettingRef, (stgDB) => {
        if (stgDB.exists()) {
            try {
                const processes = parse(MassConsensusProcessSchema, stgDB.data());
                dispatch(setMassConsensusProcess(processes));
            } catch (error) {
                throw new Error('Validation error in listenToMassConsensusProcess');
            }
        }
    });
}

export async function getMassConsensusProcess(statementId: string): Promise<MassConsensusProcess> {
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

    try {
        return parse(MassConsensusProcessSchema, stgDB.data());
    } catch (error) {
        throw new Error('Validation error in getMassConsensusProcess');
    }
}