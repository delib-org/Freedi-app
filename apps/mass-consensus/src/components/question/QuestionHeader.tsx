'use client';

import { Statement } from '@freedi/shared-types';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
import InlineMarkdown from '../shared/InlineMarkdown';
import styles from './QuestionHeader.module.css';

interface QuestionHeaderProps {
  question: Statement;
  /** Position in a multi-question survey; omitted = no number */
  questionNumber?: number;
}

/**
 * Client Component - Question header
 * Displays question title and description with translations
 */
export default function QuestionHeader({ question, questionNumber }: QuestionHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>
        {questionNumber !== undefined && (
          <span className={styles.questionNumber}>{questionNumber})</span>
        )}
        <InlineMarkdown text={question.statement} />
      </h1>
      {getParagraphsText(question.paragraphs) && (
        <p className={styles.description}>
          <InlineMarkdown text={getParagraphsText(question.paragraphs)} />
        </p>
      )}
    </header>
  );
}
