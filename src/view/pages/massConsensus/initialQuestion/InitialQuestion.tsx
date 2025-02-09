import { useNavigate, useParams } from "react-router";
import HeaderMassConsensus from "../headerMassConsensus/HeaderMassConsensus"
import { useParamsLanguage } from "../useParamsLang/UseParamsLanguge"
import { useSelector } from "react-redux";
import { statementSelector } from "@/model/statements/statementsSlice";
import { useEffect } from "react";
import { useInitialQuestion } from "./InitialQuestionVM";
import { MassConsensusPageUrls } from "@/types/enums";

const InitialQuestion = () => {
	const navigate = useNavigate();
	const { dir } = useParamsLanguage();
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const { handleSetInitialSuggestion } = useInitialQuestion();

	useEffect(() => {
		if (!statement) navigate(`/mass-consensus/${statementId}/introduction`)
	}, [statementId, navigate])

	return (
		<div style={{ direction: dir }}>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.Introduction} />
			<h3>Please suggest an option for the question: {statement?.statement} </h3>
			<form onSubmit={handleSetInitialSuggestion}>
				<div>
					<label htmlFor="option">Option</label>
					<input type="text" name="userInput" />
				</div>
				<button className="btn" type="submit">Submit</button>
			</form>
		</div>
	)
}

export default InitialQuestion