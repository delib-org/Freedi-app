import { useEffect, useState } from "react"
import { useHeader } from "../headerMassConsensus/HeaderContext";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";

const useMassConsensusQuestion = () => {
    const { setHeader } = useHeader();
    const { t } = useUserConfig();

    const [ stage, updateStage ] = useState<"question" | "loading" | "suggestions" | "submitting">("question");
    const [ ifButtonEnabled, setIfButtonEnabled ] = useState<boolean>(true);
    
    useEffect(() => {
        setHeader({
            title: t('offer a suggestion'),
            backToApp: false,
            isIntro: false,
            setHeader,
        });
    }, []);

    const handleNext = () => {
        (stage === "question")? updateStage("loading"): updateStage("submitting");
    }

    useEffect(() => {
        setIfButtonEnabled(!(stage === "loading" || stage === "submitting"));
    }, [stage])

    return { stage, updateStage, handleNext, ifButtonEnabled, setIfButtonEnabled }
}

export default useMassConsensusQuestion