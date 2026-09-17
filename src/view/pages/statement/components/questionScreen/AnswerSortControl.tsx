import { FC, ReactNode, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useSelector } from 'react-redux';
import clsx from 'clsx';
import {
	ArrowUpDown,
	Check,
	ChevronDown,
	Eye,
	EyeOff,
	Handshake,
	RefreshCw,
	Shuffle,
	Sparkles,
	Users,
} from 'lucide-react';
import { SortType, Statement } from '@freedi/shared-types';
import Sheet from '@/view/components/atomic/molecules/Sheet/Sheet';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useShowHiddenCards } from '@/controllers/hooks/useShowHiddenCards';
import {
	statementOptionsSelector,
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import {
	buildAnswerSortPath,
	getAnswerSortOptions,
	hasEnoughAnswersToSort,
	resolveCurrentSort,
} from './answerSorting';
import styles from './QuestionScreen.module.scss';

const ICON_SIZE = 18;

const SORT_ICONS: Readonly<Partial<Record<SortType, ReactNode>>> = {
	[SortType.newest]: <Sparkles size={ICON_SIZE} aria-hidden="true" />,
	[SortType.mostUpdated]: <RefreshCw size={ICON_SIZE} aria-hidden="true" />,
	[SortType.mostJoined]: <Users size={ICON_SIZE} aria-hidden="true" />,
	[SortType.random]: <Shuffle size={ICON_SIZE} aria-hidden="true" />,
	[SortType.accepted]: <Handshake size={ICON_SIZE} aria-hidden="true" />,
};

interface AnswerSortControlProps {
	statement: Statement;
	/** Hosts also get the "show hidden answers" switch. */
	isHost: boolean;
}

/**
 * The answers list's one sort affordance: a chip in the list header that
 * names the current order and opens a sheet of orderings (a bottom sheet on
 * phones, a dialog on desktop). Nothing floats over the cards, so the shell's
 * bottom nav stays the only floating control. Renders nothing while there is
 * only one answer, when order means nothing.
 */
const AnswerSortControl: FC<AnswerSortControlProps> = ({ statement, isHost }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const { sort: paramSort } = useParams<{ sort?: string }>();
	const [searchParams] = useSearchParams();
	const [open, setOpen] = useState(false);
	const { showHiddenCards, toggleShowHiddenCards } = useShowHiddenCards();

	const { statementId } = statement;
	const optionsSelect = useMemo(() => statementOptionsSelector(statementId), [statementId]);
	const subsSelect = useMemo(() => statementSubsSelector(statementId), [statementId]);
	const options = useSelector(optionsSelect);
	const children = useSelector(subsSelect);

	const settings = statement.statementSettings;
	const sortOptions = useMemo(
		() =>
			getAnswerSortOptions({
				showEvaluation: settings?.showEvaluation ?? true,
				joiningEnabled: settings?.joiningEnabled ?? false,
			}),
		[settings?.showEvaluation, settings?.joiningEnabled],
	);

	if (!hasEnoughAnswersToSort(options.length, children.length)) return null;

	const current = resolveCurrentSort({
		paramSort,
		defaultSort: settings?.defaultSortType,
		hasManualOrder: (settings?.manualOptionOrder?.length ?? 0) > 0,
	});
	const currentOption =
		current.kind === 'sort' ? sortOptions.find((o) => o.id === current.sort) : undefined;
	const currentLabel =
		current.kind === 'manual'
			? t("Host's order")
			: currentOption
				? t(currentOption.labelKey)
				: t('Sort');

	function choose(sort: SortType) {
		setOpen(false);
		navigate(buildAnswerSortPath({ pathname, statementId, sort, tab: searchParams.get('tab') }));
	}

	return (
		<>
			<button
				type="button"
				className={styles.sortChip}
				onClick={() => setOpen(true)}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label={`${t('Sort answers')}: ${currentLabel}`}
				data-testid="answer-sort-chip"
			>
				<ArrowUpDown size={16} aria-hidden="true" />
				<span className={styles.sortChip__label}>{currentLabel}</span>
				<ChevronDown size={14} aria-hidden="true" className={styles.sortChip__chevron} />
			</button>
			{open && (
				<Sheet
					isOpen
					onClose={() => setOpen(false)}
					title={t('Sort answers')}
					id="answer-sort-sheet"
				>
					<div className={styles.sortList} role="radiogroup" aria-label={t('Sort answers')}>
						{sortOptions.map((option) => {
							const selected = current.kind === 'sort' && current.sort === option.id;

							return (
								<button
									key={option.id}
									type="button"
									role="radio"
									aria-checked={selected}
									className={clsx(styles.sortOption, selected && styles['sortOption--selected'])}
									onClick={() => choose(option.id)}
									data-testid={`answer-sort-${option.id}`}
								>
									<span className={styles.sortOption__icon}>{SORT_ICONS[option.id]}</span>
									<span className={styles.sortOption__label}>{t(option.labelKey)}</span>
									{selected && <Check size={ICON_SIZE} aria-hidden="true" />}
								</button>
							);
						})}
					</div>
					{isHost && (
						<button
							type="button"
							role="switch"
							aria-checked={showHiddenCards}
							className={styles.sortToggle}
							onClick={toggleShowHiddenCards}
							data-testid="answer-sort-hidden-toggle"
						>
							<span className={styles.sortOption__icon}>
								{showHiddenCards ? (
									<Eye size={ICON_SIZE} aria-hidden="true" />
								) : (
									<EyeOff size={ICON_SIZE} aria-hidden="true" />
								)}
							</span>
							<span className={styles.sortOption__label}>{t('Show hidden answers')}</span>
							<span className={styles.sortToggle__track} aria-hidden="true">
								<span className={styles.sortToggle__knob} />
							</span>
						</button>
					)}
				</Sheet>
			)}
		</>
	);
};

export default AnswerSortControl;
