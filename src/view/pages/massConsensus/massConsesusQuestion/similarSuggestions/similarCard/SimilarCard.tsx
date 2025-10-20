import React from 'react';
import { Statement } from 'delib-npm';
import styles from './SimilarCard.module.scss';

interface SimilarCardProps {
    statement: Statement;
    isUserStatement: boolean;
    selected: boolean;
    handleSelect: (id: string) => void;
}

const SimilarCard: React.FC<SimilarCardProps> = ({ statement, isUserStatement, selected, handleSelect }) => {
    const { statement: text, statementId } = statement;

    const handleClick = () => {
        if (isUserStatement) {
            handleSelect(text);
        }
        else {
            handleSelect(statementId!);
        }
    };

    return (
        <div
            className={`${styles["similar-card"]} ${selected ? styles.selected : ''}`}
            onClick={handleClick}
        >
            <p>{text}</p>
        </div>
    );
};

export default SimilarCard;
