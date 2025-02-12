import { Statement } from "@/types/statement";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

const useTopSuggestions = () => {

    const { statementId } = useParams<{ statementId: string }>();
    const [ suggestions, setSuggestions ] = useState<Statement[]>([])

    useEffect(() => {
        fetch(`http://localhost:5001/delib-v3-dev/us-central1/getQuestionOptions?statementId=${statementId}`)
            .then((response) => response.json())
            .then((data) => {
                setSuggestions(data.options)
            })
            .catch((error) => console.error('Error:', error));

    }, [statementId]);

    return ( { suggestions, statementId })
}

export default useTopSuggestions;