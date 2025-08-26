import { useNavigate, useParams, useLocation } from "react-router";
import styles from "./subQuestionNode.module.scss";
import React, { FC, useEffect, useRef, useState } from "react";
import { Statement } from "delib-npm";

// Add global keyframes for the animation
// Using --alert color which is #dd90b6 (pinkish)
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes followMeBlink {
    0%, 100% {
      background-color: #dd90b6;
      color: white;
    }
    50% {
      background-color: white;
      color: #dd90b6;
    }
  }
`;
document.head.appendChild(styleSheet);

interface SubQuestionNodeProps {
  statement: Statement;
  depth: number;
  childCount: number;
  height?: number;
  heightMargin?: number;
  numberOfElements:number;
  setNodeHeights?: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  isFirstChild?: boolean;
  heightToChild?: number;
  followMePath?: string;
  currentPath?: string;
}

const SubQuestionNode: FC<SubQuestionNodeProps> = ({
  statement,
  childCount,
  setNodeHeights,
  heightMargin,
  numberOfElements,
  isFirstChild = false,
  heightToChild = 0,
  depth = -1,
  height = 0,
  followMePath,
}) => {
  const topStatement = depth <= 1;

  const navigate = useNavigate();
  const { pathname } = useLocation();

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
  }, [statement.statementId, ref.current,numberOfElements]);

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
  
  // Check if this statement's path matches the followMe path
  // Don't show animation if user is already on the followed statement's page
  // Extract the statement ID from the followMe path (e.g., /statement/ID or /statement/ID/chat)
  const followMePathParts = followMePath?.split('/').filter(part => part); // Remove empty strings
  const followMeStatementId = followMePathParts?.[1]; // Get the ID after 'statement'
  
  const userIsOnFollowedPage = followMePath && pathname.startsWith(followMePath.split('/').slice(0, 3).join('/'));
  
  // The statement should be highlighted if its ID matches the followMe statement ID
  // AND the user is NOT currently on that page
  const isFollowedStatement = followMeStatementId && 
                              statement.statementId === followMeStatementId && 
                              !userIsOnFollowedPage;

  const graphStyle = `${styles.borderDefault}  ${isFirstChild ? styles.borderTop : ""}`;

  // Add inline styles for followMe effect
  // Using --alert color (#dd90b6) to match the toast
  const followMeStyles = isFollowedStatement ? {
    borderLeft: '5px solid #dd90b6',
    animation: 'followMeBlink 2s ease-in-out infinite',
    boxShadow: '0 0 15px rgba(221, 144, 182, 0.4)',
    backgroundColor: '#dd90b6',
    color: 'white',
    transition: 'background-color 0.5s ease, color 0.5s ease'
  } : {};

  return (
    <div className={styles.SubQuestionNodeContainer}>
      <button
        className={`${styles.node} ${isInStatement ? styles.green : ""} ${isFollowedStatement ? styles.followMe : ""} ${depth <= 1 && !isInStatement && !isFollowedStatement ? styles.group : ""} ${!isInStatement ? styles.clickable : ""} ${clicked ? styles.animate : ""}`}
        onClick={!isInStatement ? handleClick : undefined}
        style={followMeStyles}
      >
        <h3 style={isFollowedStatement ? { color: 'inherit' } : {}}>{statement.statement}</h3>
      </button>

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
