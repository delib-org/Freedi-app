import { Results, Statement, StatementType } from 'delib-npm';
import styles from './SubQuestionsMap.module.scss';
import SubQuestionNode from './subQuestionNode/SubQuestionNode';
import { useMindMap } from '../map/MindMapMV';
import { type JSX } from 'react';
import { useParams } from 'react-router';

interface SubQuestionsMapProps {
	readonly statement: Statement;
}

const SubQuestionsMap = ({ statement }: SubQuestionsMapProps) => {
	const { results } = useMindMap(statement.topParentId);
	const { screen } = useParams();

	if (
		screen === 'mind-map' ||
		screen === 'polarization-index' ||
		screen === 'agreement-map'
	)
		return null;

	if (!results) return null;
	const defaultDepth = 1;
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

	const parseTree = (
		tResults: Results,
		currentDepth: number
	): JSX.Element[] => {
		currentDepth++;

		return tResults.sub.map((res, index) => (
			<div key={res.top.statement + index}>
				<SubQuestionNode
					statement={res.top}
					depth={currentDepth}
					last={index === tResults.sub.length - 1}
					hasChildren={res.sub.length !== 0}
				/>
				{parseTree(filterResults(res), currentDepth)}
			</div>
		));
	};

	const calculateTopParentHeight = (cResults: Results, height = 0) => {
		cResults.sub.forEach((res, index) => {
			height++;
			if (index === filteredResults.sub.length - 1) return height;

			height = calculateTopParentHeight(res, height);
		});

		return height;
	};

	return (
		<div className={styles.subQuestionsMapContainer}>
			<div className={styles.title}>
				<h3>Statement Map</h3>
			</div>
			<SubQuestionNode
				statement={results.top}
				depth={defaultDepth}
				hasChildren={results.sub.length > 0}
				height={calculateTopParentHeight(filteredResults)}
			/>
			{parseTree(filteredResults, defaultDepth)}
		</div>
	);
};
export default SubQuestionsMap;
