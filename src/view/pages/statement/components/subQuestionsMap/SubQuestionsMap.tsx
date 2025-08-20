import { Results, Statement, StatementType } from 'delib-npm';
import { type JSX, useState } from 'react';
import { useParams } from 'react-router';
import { useMindMap } from '../map/MindMapMV';
import SubQuestionNode from './subQuestionNode/SubQuestionNode';
import styles from './SubQuestionsMap.module.scss';


interface SubQuestionsMapProps {
  readonly statement: Statement;
}

const SubQuestionsMap = ({ statement }: SubQuestionsMapProps) => {
	const { results } = useMindMap(statement.topParentId);
	const [isOpen, setIsOpen] = useState(true);

  const { screen } = useParams();
  const [nodeHeights, setNodeHeights] = useState(new Map<string, number>());
  if (
    screen === "mind-map" ||
    screen === "polarization-index" ||
    screen === "agreement-map"
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
            res.top.statementType !== StatementType.option || res.sub.length > 0
        ),
    };
  };
  const filteredResults = filterResults(results);

  const renderStatementTree = (
    tResults: Results,
    currentDepth: number
  ): JSX.Element[] => {
    currentDepth++;

    return tResults.sub.map((res, index) => (
      <div key={res.top.statement + index}>
        <SubQuestionNode
          statement={res.top}
          depth={currentDepth}
          childCount={res.sub.length}
          height={getLineLength(res)}
          heightMargin={getLineMargin(res)}
          setNodeHeights={setNodeHeights}
          isFirstChild={index === 0}
          heightToChild={getLineToChild(res)}
        />
        {renderStatementTree(filterResults(res), currentDepth)}
      </div>
    ));
  };

  const getLineMargin = (res: Results) => {
    if (res.sub.length < 1) return;
    const margin =
      nodeHeights.get(res.top.statementId) -
        nodeHeights.get(res.sub[0].top.statementId) || 0;

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
      nodeHeights.get(res.sub.length > 0 ? res.sub[0].top.statementId : "") -
        nodeHeights.get(res.top.statementId) || 0;

	return (
		<div className={`${styles.subQuestionsMapContainer} ${isOpen ? styles.open : styles.closed}`}>
			<button 
				className={styles.toggleButton}
				onClick={() => setIsOpen(!isOpen)}
				aria-label={isOpen ? 'Close statement map' : 'Open statement map'}
			>
				<span className={styles.toggleIcon}>
					{isOpen ? '›' : '‹'}
				</span>
			</button>
			<div className={styles.content}>
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
		</div>
	);
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
        childCount={results.sub.length}
        height={getLineLength(results)}
        setNodeHeights={setNodeHeights}
        isFirstChild={false}
        heightMargin={getLineMargin(results)}
        heightToChild={getLineToChild(results)}
      />
      {renderStatementTree(filteredResults, defaultDepth)}
    </div>
  );
};
export default SubQuestionsMap;
