import { Results, StatementType } from '@freedi/shared-types';
import { type JSX, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router';
import { useMindMap } from '../map/MindMapMV';
import SubQuestionNode from './subQuestionNode/SubQuestionNode';
import styles from './SubQuestionsMap.module.scss';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { listenToStatement } from '@/controllers/db/statements/listenToStatements';
import { useTranslation } from '@/controllers/hooks/useTranslation';

const SubQuestionsMap = () => {
	const { t } = useTranslation();
	const { statementId } = useParams();
	const { pathname } = useLocation();
	const statement = useAppSelector(statementSelector(statementId));
	const { results } = useMindMap(statement?.topParentId);
	const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));
	const powerFollowMePath = topParentStatement?.powerFollowMe;
	const regularFollowMePath = topParentStatement?.followMe;
	const followMePath =
		powerFollowMePath && powerFollowMePath !== '' ? powerFollowMePath : regularFollowMePath;

	// Listen to topParentStatement for followMe updates
	useEffect(() => {
		if (!statement?.topParentId) return;

		// Only set up listener if topParentStatement doesn't exist yet
		if (!topParentStatement) {
			const unsubscribe = listenToStatement(statement.topParentId);

			return () => unsubscribe();
		}
	}, [statement?.topParentId, topParentStatement]);

	const [nodeHeights, setNodeHeights] = useState(new Map<string, number>());
	const numberOfElements = nodeHeights.size;

	if (!statement) return null;
	if (!results) return null;

	const defaultDepth = 1;
	const filterResults = (res: Results): Results => {
		return {
			top: res.top,
			sub: res.sub
				.map(filterResults)
				.filter((r) => r.top.statementType !== StatementType.option || r.sub.length > 0),
		};
	};
	const filteredResults = filterResults(results);

	const renderStatementTree = (tResults: Results, currentDepth: number): JSX.Element[] => {
		currentDepth++;

		return tResults.sub.map((res, index) => (
			<div key={res.top.statement + index}>
				<SubQuestionNode
					statement={res.top}
					depth={currentDepth}
					childCount={res.sub.length}
					height={getLineLength(res)}
					numberOfElements={numberOfElements | 0}
					heightMargin={getLineMargin(res)}
					setNodeHeights={setNodeHeights}
					isFirstChild={index === 0}
					heightToChild={getLineToChild(res)}
					followMePath={followMePath}
					currentPath={pathname}
				/>
				{renderStatementTree(filterResults(res), currentDepth)}
			</div>
		));
	};

	const getLineMargin = (res: Results) => {
		if (res.sub.length < 1) return;
		const margin =
			nodeHeights.get(res.top.statementId) - nodeHeights.get(res.sub[0].top.statementId) || 0;

		return margin;
	};
	const getLineLength = (res: Results) => {
		if (res.sub.length < 1) return;
		const height =
			nodeHeights.get(res.sub[res.sub.length - 1].top.statementId) -
				nodeHeights.get(res.sub[0].top.statementId) || 0;

		return height;
	};
	const getLineToChild = (res: Results) => {
		if (res.sub.length < 1) return;
		const height =
			nodeHeights.get(res.sub.length > 0 ? res.sub[0].top.statementId : '') -
				nodeHeights.get(res.top.statementId) || 0;

		return height;
	};

	return (
		<div className={styles.subQuestionsMap} dir="ltr">
			<div className={styles.content}>
				<div className={styles.title}>
					<h3>{t('Statement Map')}</h3>
				</div>
				<SubQuestionNode
					statement={results.top}
					depth={defaultDepth}
					childCount={results.sub.length}
					height={getLineLength(results)}
					setNodeHeights={setNodeHeights}
					numberOfElements={numberOfElements | 0}
					isFirstChild={false}
					heightMargin={getLineMargin(results)}
					heightToChild={getLineToChild(results)}
					followMePath={followMePath}
					currentPath={pathname}
				/>
				{renderStatementTree(filteredResults, defaultDepth)}
			</div>
		</div>
	);
};
export default SubQuestionsMap;
