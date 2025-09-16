import { Statement, Role, StatementType, Screen } from "delib-npm";
import { ReactNode } from "react";
import GroupPage from "../statementTypes/group/GroupPage";
import QuestionPage from "../statementTypes/question/QuestionPage";
import { useParams } from "react-router";
import Triangle from "@/view/components/maps/triangle/Triangle";
import MindMap from "../map/MindMap";
import Chat from "../chat/Chat";
import StatementSettings from "../settings/StatementSettings";
import SuggestionChat from "@/view/pages/suggestionChat/SuggestionChat";
import PolarizationIndexComp from "@/view/components/maps/polarizationIndex/PolarizationIndex";

interface SwitchScreenProps {
	statement: Statement | undefined;
	role: Role | undefined;
}

function SwitchScreen({
	statement,
	role,
}: Readonly<SwitchScreenProps>): ReactNode {
	let { screen } = useParams();
	const { hasChat } = statement?.statementSettings || { hasChat: false };

	//allowed screens
	const hasPermission = role === Role.admin;
	if (!hasPermission && screen === 'settings') {
		screen = 'main';
	}
	if (!hasChat && screen === 'chat') {
		screen = 'main';
	}

	switch (screen) {
		case Screen.polarizationIndex:
			return <PolarizationIndexComp />
		case Screen.agreementMap:
			return <Triangle />;
		case Screen.mindMap:
			return <MindMap />;
		case Screen.chat:
			return <Chat />;
		case Screen.settings:
			return <StatementSettings />;
		case "main":
			return <SwitchStatementType statement={statement} />;
		default:
			return <SwitchStatementType statement={statement} />;
	}
}

function SwitchStatementType({
	statement,
}: Readonly<{
	statement: Statement | undefined;
}>): ReactNode {
	const statementType = statement?.statementType;

	switch (statementType) {
		case StatementType.group:
			return <GroupPage />;
		case StatementType.question:
			return <QuestionPage />;
		case StatementType.option:
			return <SuggestionChat />;
		default:
			return null;
	}
}

export default SwitchScreen;