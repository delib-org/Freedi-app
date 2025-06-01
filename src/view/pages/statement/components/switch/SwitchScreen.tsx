import { Statement, Role, StatementType } from "delib-npm";
import { ReactNode } from "react";
import GroupPage from "../statementTypes/group/GroupPage";
import QuestionPage from "../statementTypes/question/QuestionPage";
import { useParams } from "react-router";
import Triangle from "@/view/components/triangle/Triangle";
import MindMap from "../map/MindMap";
import Chat from "../chat/Chat";
import StatementSettings from "../settings/StatementSettings";
import SuggestionChat from "@/view/pages/suggestionChat/SuggestionChat";
import PolarizationIndex from "@/view/components/polarizationIndex/PolarizationIndex";

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
		case 'polarization-map':
			return <PolarizationIndex />
		case 'agreement-map':
			return <Triangle />;
		case 'mind-map':
			return <MindMap />;
		case 'chat':
			return <Chat />;
		case 'settings':
			return <StatementSettings />;
		case 'main':
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