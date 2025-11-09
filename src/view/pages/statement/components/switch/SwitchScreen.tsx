import { Statement, Role, StatementType, Screen } from "delib-npm";
import { ReactNode, useEffect } from "react";
import GroupPage from "../statementTypes/group/GroupPage";
import QuestionPage from "../statementTypes/question/QuestionPage";
import { useParams } from "react-router";
import Triangle from "@/view/components/maps/triangle/Triangle";
import MindMap from "../map/MindMap";
import Chat from "../chat/Chat";
import StatementSettings from "../settings/StatementSettings";
import PolarizationIndexComp from "@/view/components/maps/polarizationIndex/PolarizationIndex";
import PopperHebbianDiscussion from "../popperHebbian/PopperHebbianDiscussion";
import { useSelector, useDispatch } from "react-redux";
import { statementSelectorById, setStatement } from "@/redux/statements/statementsSlice";
import { getStatementFromDB } from "@/controllers/db/statements/getStatement";
import { logError } from "@/utils/errorHandling";

interface SwitchScreenProps {
	statement: Statement | undefined;
	role: Role | undefined;
}

function SwitchScreen({
	statement,
	role,
}: Readonly<SwitchScreenProps>): ReactNode {
	let { screen } = useParams();
	const dispatch = useDispatch();
	const { hasChat } = statement?.statementSettings || { hasChat: false };

	// Check if Popper-Hebbian discussion is enabled (check parent statement for options)
	const parentStatement = useSelector(statementSelectorById(statement?.parentId || ""));

	// Fetch parent statement from DB if not in Redux store
	useEffect(() => {
		const fetchParentStatement = async () => {
			// Only fetch if we have a parentId but no parent statement in Redux
			if (statement?.parentId && !parentStatement) {
				try {
					const parentFromDB = await getStatementFromDB(statement.parentId);
					if (parentFromDB) {
						dispatch(setStatement(parentFromDB));
					}
				} catch (error) {
					logError(error, {
						operation: 'SwitchScreen.fetchParentStatement',
						metadata: {
							parentId: statement.parentId,
							statementId: statement.statementId,
						}
					});
				}
			}
		};

		fetchParentStatement();
	}, [statement?.parentId, parentStatement, dispatch, statement?.statementId]);

	const isPopperHebbianEnabled = statement?.statementType === StatementType.option && parentStatement?.statementSettings?.popperianDiscussionEnabled === true;

	// Debug logging
	if (screen === 'chat') {
		console.info('Chat screen debug:', {
			statementId: statement?.statementId,
			statementType: statement?.statementType,
			isOption: statement?.statementType === StatementType.option,
			parentId: statement?.parentId,
			parentPopperianEnabled: parentStatement?.statementSettings?.popperianDiscussionEnabled,
			statementPopperianEnabled: statement?.statementSettings?.popperianDiscussionEnabled,
			isPopperHebbianEnabled
		});
	}

	//allowed screens
	const hasPermission = role === Role.admin || role === Role.creator;
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
			// For chat screen with Popperian-Hegelian enabled, show both components
			if (isPopperHebbianEnabled && statement) {
				return (
					<>
						<PopperHebbianDiscussion
							statement={statement}
							onCreateImprovedVersion={() => {
								// Could trigger a new refinement session based on collected evidence
							}}
						/>
						<Chat />
					</>
				);
			}

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
		case StatementType.option:
			return <QuestionPage />;
		default:
			return null;
	}
}

export default SwitchScreen;