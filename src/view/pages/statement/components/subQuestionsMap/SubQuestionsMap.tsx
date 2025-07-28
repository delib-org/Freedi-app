import { Results, Statement, StatementType } from 'delib-npm';
import styles from './SubQuestionsMap.module.scss';
import SubQuestionNode from './subQuestionNode/SubQuestionNode';
import { useMindMap } from '../map/MindMapMV';
import type { JSX } from 'react';

interface SubQuestionsMapProps {
	readonly statement: Statement;
}
const SubQuestionsMap = ({ statement }: SubQuestionsMapProps) => {
	const { results } = useMindMap(statement.topParentId);
	if (!results) return null;
	const runTimes = 0;

	const parseTree = (results: Results, runTimes: number): JSX.Element[] => {
		runTimes++;

		return results.sub
			.filter((res) => res.top.statementType !== StatementType.option)
			.map((res) => (
				<div key={res.top.statement}>
					<SubQuestionNode statement={res.top} runTimes={runTimes} />
					{parseTree(res, runTimes)}
				</div>
			));
	};

	return (
		<div className={styles.subQuestionsMapContainer}>
			<SubQuestionNode statement={results.top} runTimes={runTimes} />
			{parseTree(results, runTimes)}
		</div>
	);
};
export default SubQuestionsMap;
