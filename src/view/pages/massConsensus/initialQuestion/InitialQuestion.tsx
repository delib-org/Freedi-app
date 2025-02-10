import { useNavigate, useParams } from "react-router";
import HeaderMassConsensus from "../headerMassConsensus/HeaderMassConsensus"
import { useParamsLanguage } from "../useParamsLang/UseParamsLanguge"
import { useSelector } from "react-redux";
import { statementSelector } from "@/redux/statements/statementsSlice";
import { useEffect } from "react";
import { useInitialQuestion } from "./InitialQuestionVM";
import { MassConsensusPageUrls } from "@/types/enums";
import Loader from "@/view/components/loaders/Loader";

const InitialQuestion = () => {
	const navigate = useNavigate();
	const { dir } = useParamsLanguage();
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const { handleSetInitialSuggestion, ready, loading } = useInitialQuestion();

	useEffect(() => {
		if (!statement) navigate(`/mass-consensus/${statementId}/introduction`)
	}, [statementId, navigate])

	useEffect(() => {
		if (ready) navigate(`/mass-consensus/${statementId}/${MassConsensusPageUrls.similarSuggestions}`)
	}, [ready])

	return (
		<div style={{ direction: dir }}>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.introduction} />
			<h3>Please suggest an option for the question: {statement?.statement} </h3>
			<form onSubmit={handleSetInitialSuggestion}>
				<div>
					<label htmlFor="option">Option</label>
					<input type="text" name="userInput" />
				</div>
				<button className="btn" type="submit">Submit</button>
			</form>
			{loading && <Loader />}
		</div>
	)
}

export default InitialQuestion