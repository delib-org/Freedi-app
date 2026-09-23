import { FC } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { QuestionTabId } from './questionTabs';
import styles from './QuestionScreen.module.scss';

interface SubViewHeaderProps {
	/** The tab this sub-view belongs to, and returns to. */
	parent: QuestionTabId;
	parentLabelKey: string;
}

/** "‹ Results" / "‹ Maps" above a full-width sub-view (the covenant, themes). */
const SubViewHeader: FC<SubViewHeaderProps> = ({ parent, parentLabelKey }) => {
	const { t, dir } = useTranslation();
	const [, setSearchParams] = useSearchParams();
	const Chevron = dir === 'rtl' ? ChevronRight : ChevronLeft;

	return (
		<div className={styles.tab}>
			<button
				type="button"
				className={styles.textButton}
				onClick={() =>
					setSearchParams(
						(previous) => {
							const next = new URLSearchParams(previous);
							next.set('tab', parent);

							return next;
						},
						{ replace: true },
					)
				}
				data-testid={`subview-back-${parent}`}
			>
				<Chevron size={14} aria-hidden="true" /> {t(parentLabelKey)}
			</button>
		</div>
	);
};

export default SubViewHeader;
