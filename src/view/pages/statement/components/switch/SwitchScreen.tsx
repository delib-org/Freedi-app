import { Statement, Role, StatementType, Screen, QuestionType } from '@freedi/shared-types';
import { ReactNode, useEffect, Suspense } from 'react';
import { useParams } from 'react-router';
import { useSelector, useDispatch } from 'react-redux';
import { statementSelectorById, setStatement } from '@/redux/statements/statementsSlice';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { logError } from '@/utils/errorHandling';
import lazyWithRetry from '@/routes/lazyWithRetry';
import LoadingPage from '@/view/pages/loadingPage/LoadingPage';
import Chat from '../chat/Chat';
import StagePage from '../statementTypes/stage/StagePage';
import QuestionsView from '../questionsView/QuestionsView';
import GroupPage from '../statementTypes/group/GroupPage';
import PopperHebbianDiscussion from '../popperHebbian/PopperHebbianDiscussion';
import TreeView from '../treeView/TreeView';
import { CompoundQuestion } from '../statementTypes/question/compound';

// Lazy load heavy screen components
const Triangle = lazyWithRetry(
	() => import('@/view/components/maps/triangle/Triangle'),
	'Triangle',
);
const MindMap = lazyWithRetry(() => import('../map/MindMap'), 'MindMap');
const StatementSettings = lazyWithRetry(
	() => import('../settings/StatementSettings'),
	'StatementSettings',
);
const PolarizationIndexComp = lazyWithRetry(
	() => import('@/view/components/maps/polarizationIndex/PolarizationIndex'),
	'PolarizationIndex',
);
const SubQuestionsMap = lazyWithRetry(
	() => import('../subQuestionsMap/SubQuestionsMap'),
	'SubQuestionsMap',
);
const ResearchDashboard = lazyWithRetry(
	() => import('../researchDashboard/ResearchDashboard'),
	'ResearchDashboard',
);

interface SwitchScreenProps {
	statement: Statement | undefined;
	role: Role | undefined;
	activeView: string;
}

function SwitchScreen({ statement, role, activeView }: Readonly<SwitchScreenProps>): ReactNode {
	let { screen } = useParams();
	const dispatch = useDispatch();

	// Check if Popper-Hebbian discussion is enabled (check parent statement for options)
	const parentStatement = useSelector(statementSelectorById(statement?.parentId || ''));

	// Fetch parent statement from DB if not in Redux store
	useEffect(() => {
		const fetchParentStatement = async () => {
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
						},
					});
				}
			}
		};

		fetchParentStatement();
	}, [statement?.parentId, parentStatement, dispatch, statement?.statementId]);

	const isPopperHebbianEnabled =
		statement?.statementType === StatementType.option &&
		parentStatement?.statementSettings?.popperianDiscussionEnabled === true;

	// Permission check for settings
	const hasPermission = role === Role.admin || role === Role.creator;
	if (!hasPermission && (screen === 'settings' || screen === 'research')) {
		screen = 'main';
	}

	// Map/settings/polarization screens remain as-is
	switch (screen) {
		case Screen.polarizationIndex:
			return (
				<Suspense fallback={<LoadingPage />}>
					<PolarizationIndexComp />
				</Suspense>
			);
		case Screen.agreementMap:
			return (
				<Suspense fallback={<LoadingPage />}>
					<Triangle />
				</Suspense>
			);
		case Screen.mindMap:
			return (
				<Suspense fallback={<LoadingPage />}>
					<MindMap />
				</Suspense>
			);
		case Screen.subQuestionsMap:
			return (
				<Suspense fallback={<LoadingPage />}>
					<SubQuestionsMap />
				</Suspense>
			);
		case Screen.settings:
			return (
				<Suspense fallback={<LoadingPage />}>
					<StatementSettings />
				</Suspense>
			);
		case Screen.research:
			return (
				<Suspense fallback={<LoadingPage />}>
					<ResearchDashboard />
				</Suspense>
			);
		default:
			// Main content area controlled by the segmented control
			return (
				<ViewByActiveTab
					activeView={activeView}
					statement={statement}
					isPopperHebbianEnabled={isPopperHebbianEnabled}
				/>
			);
	}
}

const QA_TYPE_FILTER = [StatementType.option] as const;
const QUESTIONS_ONLY_FILTER = [StatementType.question] as const;

interface ViewByActiveTabProps {
	activeView: string;
	statement: Statement | undefined;
	isPopperHebbianEnabled: boolean;
}

function ViewByActiveTab({
	activeView,
	statement,
	isPopperHebbianEnabled,
}: Readonly<ViewByActiveTabProps>): ReactNode {
	const isCompound =
		statement?.statementType === StatementType.question &&
		statement?.questionSettings?.questionType === QuestionType.compound;

	if (isCompound) {
		return <CompoundQuestion />;
	}

	const isTreeView = statement?.statementSettings?.enableTreeView !== false;

	switch (activeView) {
		case 'chat':
			if (isTreeView) {
				return <TreeView />;
			}
			if (isPopperHebbianEnabled && statement) {
				return (
					<>
						<PopperHebbianDiscussion
							statement={statement}
							onCreateImprovedVersion={() => {
								// Could trigger a new refinement session
							}}
						/>
						<Chat />
					</>
				);
			}

			return <Chat />;
		case 'options':
			if (isTreeView) {
				return <TreeView typeFilter={QA_TYPE_FILTER} showSortNav defaultCollapsed />;
			}

			return <StagePage />;
		case 'questions':
			if (isTreeView) {
				return <TreeView typeFilter={QUESTIONS_ONLY_FILTER} showSortNav />;
			}

			return <QuestionsView />;
		default:
			// Fallback for group-type statements
			return <GroupPage />;
	}
}

export default SwitchScreen;
