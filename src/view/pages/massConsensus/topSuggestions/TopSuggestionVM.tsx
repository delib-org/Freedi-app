import { userSelector } from "@/redux/users/userSlice";
import { MassConsensusPageUrls } from "@/types/enums";
import { Statement } from "@/types/statement";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router";

const useTopSuggestions = () => {
    const navigate = useNavigate();
    const user = useSelector(userSelector);
    const { statementId } = useParams<{ statementId: string }>();
    const [suggestions, setSuggestions] = useState<Statement[]>([])

    useEffect(() => {
        fetch(`http://localhost:5001/delib-v3-dev/us-central1/getQuestionOptions?statementId=${statementId}`)
            .then((response) => response.json())
            .then((data) => {
                setSuggestions(data.options)
            })
            .catch((error) => console.error('Error:', error));

    }, [statementId]);

    useEffect(() => {
        if (!user) navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`)
    }, [user]);

    return ({ suggestions, statementId })
}

export default useTopSuggestions;