import { Results, Statement, StatementType } from "delib-npm";
import styles from "./SubQuestionsMap.module.scss";
import SubQuestionNode from "./subQuestionNode/SubQuestionNode";
import { useMindMap } from "../map/MindMapMV";
import { useState, type JSX } from "react";
import { useParams } from "react-router";

interface SubQuestionsMapProps {
  readonly statement: Statement;
}

const SubQuestionsMap = ({ statement }: SubQuestionsMapProps) => {
  const { results } = useMindMap(statement.topParentId);
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
          height={getHeight(res)}
          setNodeHeights={setNodeHeights}
          isLast={index === tResults.sub.length - 1}
        />
        {renderStatementTree(filterResults(res), currentDepth)}
      </div>
    ));
  };

  const getHeight = (res: Results) => {
    if (res.sub.length < 1) return;
    const height =
      nodeHeights.get(res.sub[res.sub.length - 1].top.statementId) -
        nodeHeights.get(res.top.statementId) || 0;

    return height;
  };
  const getRootHeight = (res: Results) => {
    if (res.sub.length < 1) return;
    const height =
      results.sub.length > 0
        ? nodeHeights.get(results.sub[results.sub.length - 1].top.statementId)
        : 0;

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
        height={getRootHeight(results)}
        setNodeHeights={setNodeHeights}
        isLast={false}
      />
      {renderStatementTree(filteredResults, defaultDepth)}
    </div>
  );
};
export default SubQuestionsMap;
