import { setMassConsensusStatements } from "@/redux/statements/statementsSlice";
import { userSelector } from "@/redux/users/userSlice";
import { MassConsensusPageUrls } from "@/types/enums";
import { SelectionFunction } from "@/types/evaluation/evaluationTypes";

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router";

export function useRandomSuggestions() {
	const navigate = useNavigate();
	const user = useSelector(userSelector);
	const dispatch = useDispatch();
	const { statementId } = useParams<{ statementId: string }>()

	useEffect(() => {
		if (!user) {
			navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.introduction}`)
		}
	}, [user]);

	useEffect(() => {
		if (statementId) {
			fetch(`http://localhost:5001/delib-v3-dev/us-central1/getRandomStatements?parentId=${statementId}&limit=2`)
				.then((response) => {
					if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
					}

					return response.json();
				})
				.then((data) => {

					dispatch(setMassConsensusStatements({ statements: data.statements, selectionFunction: SelectionFunction.random }));

				})
				.catch((error) => {
					console.error('Error:', error);
				});
		}

	}, [statementId]);

}