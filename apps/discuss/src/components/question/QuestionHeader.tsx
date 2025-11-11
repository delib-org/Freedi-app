import { Statement } from 'delib-npm';
import styles from './QuestionHeader.module.css';

interface QuestionHeaderProps {
  question: Statement;
}

/**
 * Server Component - Question header
 * Displays question title and description
 */
export default function QuestionHeader({ question }: QuestionHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{question.statement}</h1>
      {question.description && (
        <p className={styles.description}>{question.description}</p>
      )}
      <div className={styles.meta}>
        <span className={styles.metaItem}>
          {question.suggestions || 0} solutions
        </span>
        <span className={styles.metaItem}>
          Created {new Date(question.createdAt).toLocaleDateString()}
        </span>
      </div>
    </header>
  );
}
