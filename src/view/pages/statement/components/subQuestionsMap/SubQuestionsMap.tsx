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

	const filterResults = (results: Results): Results => {
		return {
			top: results.top,
			sub: results.sub
				.map(filterResults)
				.filter(
					(res) =>
						res.top.statementType !== StatementType.option ||
						res.sub.length > 0
				),
		};
	};
	const filteredResults = filterResults(results);

	const parseTree = (results: Results, runTimes: number): JSX.Element[] => {
		runTimes++;

		return results.sub.map((res, index) => (
			<div key={res.top.statement + index}>
				<SubQuestionNode
					statement={res.top}
					runTimes={runTimes}
					last={res.sub.length === index}
				/>
				{parseTree(filterResults(res), runTimes)}
			</div>
		));
	};

	return (
		<div className={styles.subQuestionsMapContainer}>
			<SubQuestionNode statement={results.top} runTimes={runTimes} />
			{parseTree(filteredResults, runTimes)}
		</div>
	);
};
export default SubQuestionsMap;
