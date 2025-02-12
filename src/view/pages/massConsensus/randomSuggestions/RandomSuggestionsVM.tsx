import { Statement } from "@/types/statement/statementTypes";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

export function useRandomSuggestions() {
	const { statementId } = useParams<{ statementId: string }>()
	const [randomSuggestions, setRandomSuggestions] = useState<Statement[]>([])

	useEffect(() => {
		fetch(`http://localhost:5001/delib-v3-dev/us-central1/getRandomStatements?parentId=${statementId}&limit=2`)
			.then(res => res.json())
			.then(data => {
				setRandomSuggestions(data.randomSuggestions)
			})
			.catch(err => console.error(err))
	}, [])

	return { randomSuggestions }

}