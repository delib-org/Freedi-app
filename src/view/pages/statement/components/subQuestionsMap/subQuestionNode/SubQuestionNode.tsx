import { useNavigate, useParams } from "react-router";
import styles from "./subQuestionNode.module.scss";
import ArrowLeft from "@/assets/icons/backToMenuArrow.svg?react";
import React, { FC, useEffect, useRef, useState } from "react";
import { Statement } from "delib-npm";

interface SubQuestionNodeProps {
  statement: Statement;
  depth: number;
  childCount: number;
  height?: number;
  setNodeHeights?: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  isLast?: boolean;
}

const SubQuestionNode: FC<SubQuestionNodeProps> = ({
  statement,
  childCount,
  setNodeHeights,
  isLast = false,
  depth = -1,
  height = 0,
}) => {

  const hasChildren = childCount > 0;
  const topStatement = depth <= 1;

  const navigate = useNavigate();

  const { statementId } = useParams();
  const [clicked, setClicked] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const heightMargin = 72;
  const topMargin = 96;
  
  const updateMap = (key: string, height: number) => {
    setNodeHeights((prev) => new Map(prev).set(key, height));
  };
  useEffect(() => {
    if (!isLast || (!ref.current && childCount < 1)) return;
    const top = ref.current.offsetTop;

    updateMap(statement.statementId, top - heightMargin);
  }, [isLast]);

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => {
      setClicked(false);
      navigate(`/statement/${statement.statementId}/chat`, {
        state: { from: window.location.pathname },
      });
    }, 302);
  };

  const isInStatement = statement.statementId === statementId;
  const marginLeft = `${depth}rem`;

  const graphStyle = `${styles.borderDefault} ${hasChildren ? styles.borderRight : ""} ${hasChildren ? styles.borderBottom : ""}`;

  return (
    <div className={styles.SubQuestionNodeContainer} ref={ref}>
      <div
        className={`${styles.node} ${isInStatement ? styles.green : ""} ${depth <= 1 && !isInStatement ? styles.group : ""}`}
      >
        <h3>{statement.statement}</h3>
        {!isInStatement && (
          <button
            className={clicked ? styles.animate : ""}
            onClick={handleClick}
          >
            <ArrowLeft></ArrowLeft>
          </button>
        )}
      </div>

      {
        <div className={graphStyle} style={{ marginLeft: marginLeft }}>
          {(topStatement || height > 0) && childCount > 1 && (
            <div
              className={styles.borderRightTop}
              style={{
                marginLeft: `${depth}rem`,
                height: `${height}px`,
                top: topMargin,
              }}
            ></div>
          )}
          <div className={styles.blueDot}>●</div>
        </div>
      }
    </div>
  );
};

export default SubQuestionNode;
