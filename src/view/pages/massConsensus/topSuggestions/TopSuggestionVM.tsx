import { setStatements } from "@/redux/statements/statementsSlice";
import { userSelector } from "@/redux/users/userSlice";
import { MassConsensusPageUrls } from "@/types/enums";
import { Statement } from "@/types/statement";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router";

import { SelectionFunction } from "@/types/evaluation";

const useTopSuggestions = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const user = useSelector(userSelector);
    const { statementId } = useParams<{ statementId: string }>();
    const [suggestions, setSuggestions] = useState<Statement[]>([])

    useEffect(() => {
        fetch(`http://localhost:5001/delib-v3-dev/us-central1/getTopStatements?parentId=${statementId}&limit=2`)
            .then((response) => response.json())
            .then((data) => {

                const options = data.statements.map((st: Statement) => ({
                    ...st,
                    evaluation: {
                        ...st.evaluation,
                        selectionFunction: SelectionFunction.top,
                    }
                }))
                setSuggestions(options)
                dispatch(setStatements(options))
            })
            .catch((error) => console.error('Error:', error));

    }, [statementId]);

    useEffect(() => {
        if (!user) navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`)
    }, [user]);

    return ({ suggestions, statementId })
}

export default useTopSuggestions;