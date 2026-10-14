import Image from 'next/image';
import type { SurveyExplanationPage } from '@freedi/shared-types';
import MarkdownRenderer from '../shared/MarkdownRenderer';
import styles from './Survey.module.scss';

interface ExplanationPageBodyProps {
  page: Pick<SurveyExplanationPage, 'content' | 'heroImageUrl'>;
}

/**
 * What an explanation page shows: its hero picture, then its markdown.
 * Shared by explanation pages in the flow and the message on the last page.
 */
export default function ExplanationPageBody({ page }: ExplanationPageBodyProps) {
  return (
    <>
      {page.heroImageUrl && (
        <div className={styles.explanationHeroFrame}>
          <Image
            src={page.heroImageUrl}
            alt=""
            fill
            className={styles.explanationHero}
            role="presentation"
            unoptimized
          />
        </div>
      )}

      <div className={styles.explanationBody}>
        <div className={styles.explanationText}>
          <MarkdownRenderer content={page.content} />
        </div>
      </div>
    </>
  );
}
