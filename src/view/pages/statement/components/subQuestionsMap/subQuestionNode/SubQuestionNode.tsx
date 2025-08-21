import { useNavigate, useParams } from "react-router";
import styles from "./subQuestionNode.module.scss";
import React, { FC, useEffect, useRef, useState } from "react";
import { Statement } from "delib-npm";

interface SubQuestionNodeProps {
  statement: Statement;
  depth: number;
  childCount: number;
  height?: number;
  heightMargin?: number;

  setNodeHeights?: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  isFirstChild?: boolean;
  heightToChild?: number;
}

const SubQuestionNode: FC<SubQuestionNodeProps> = ({
  statement,
  childCount,
  setNodeHeights,
  heightMargin,
  isFirstChild = false,
  heightToChild = 0,
  depth = -1,
  height = 0,
}) => {
  const topStatement = depth <= 1;

  const navigate = useNavigate();

  const { statementId } = useParams();
  const [clicked, setClicked] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const updateMap = (key: string, height: number) => {
    setNodeHeights((prev) => new Map(prev).set(key, height));
  };
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const actualTop = rect.top;
    updateMap(statement.statementId, actualTop);
  }, [statement.statementId, ref.current, statement.statementId]);

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

  const graphStyle = `${styles.borderDefault}  ${isFirstChild ? styles.borderTop : ""}`;

  return (
    <div className={styles.SubQuestionNodeContainer}>
      <div
        className={`${styles.node} ${isInStatement ? styles.green : ""} ${depth <= 1 && !isInStatement ? styles.group : ""} ${!isInStatement ? styles.clickable : ""} ${clicked ? styles.animate : ""}`}
        onClick={!isInStatement ? handleClick : undefined}
      >
        <h3>{statement.statement}</h3>
      </div>

      {
        //this border reaches to the parents Last child
        <div className={graphStyle} style={{ marginLeft: marginLeft }}>
          {(topStatement || height > 0) && childCount > 0 && (
            <div
              className={styles.borderRightTop}
              style={{
                height: `${height}px`,
                right: `1.002rem`,
                top: `${-heightMargin}px`,
              }}
            ></div>
          )}
          {
            //this border reaches to the parents First child
            (topStatement || heightToChild > 0) && childCount > 0 && (
              <div
                className={styles.borderRightTop}
                style={{
                  height: `${heightToChild}px`,
                }}
              ></div>
            )
          }
          <div className={styles.blueDot} ref={ref}>
            ●
          </div>
        </div>
      }
    </div>
  );
};

export default SubQuestionNode;
