import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Search, X } from 'lucide-react';
import SegmentedControl from '@/view/components/atomic/atoms/SegmentedControl/SegmentedControl';
import ConversationWelcome from '@/view/components/atomic/organisms/ThinkingSpace/ConversationWelcome';
import {
	filterHomeQuestions,
	filterHomeSpaces,
	HomeQuestion,
	HomeSpace,
	Translate,
} from '../homeModel';
import { QuestionRow, SpaceCard } from './HomeLists';
import styles from './HomeOverview.module.scss';

export type HomeView = 'spaces' | 'questions';

interface HomeOverviewProps {
	firstName: string;
	spaces: HomeSpace[];
	questions: HomeQuestion[];
	loading: boolean;
	locale: string;
	onOpenQuestion: (id: string) => void;
	onCreateQuestion: () => void;
	onCreateGroup: () => void;
	onOpenPin: () => void;
	/** Tells the lazy loader which list is on screen. */
	onVisibleViewChange: (view: HomeView) => void;
	more?: ReactNode;
	t: Translate;
}

/** Home (WizCol slice 6): greeting → search → מרחבים / שאלות אחרונות → PIN. */
export default function HomeOverview({
	firstName,
	spaces,
	questions,
	loading,
	locale,
	onOpenQuestion,
	onCreateQuestion,
	onCreateGroup,
	onOpenPin,
	onVisibleViewChange,
	more,
	t,
}: HomeOverviewProps) {
	const [view, setView] = useState<HomeView>('questions');
	const [search, setSearch] = useState('');
	const [spaceId, setSpaceId] = useState<string | null>(null);
	const [hostOnly, setHostOnly] = useState(false);
	const term = search.trim();
	const visibleView: HomeView = term ? 'questions' : view;
	const activeSpace = spaces.find((space) => space.id === spaceId);
	const now = Date.now();

	useEffect(() => onVisibleViewChange(visibleView), [visibleView, onVisibleViewChange]);

	const shownQuestions = useMemo(
		() => filterHomeQuestions(questions, { term, spaceId, hostOnly }),
		[questions, term, spaceId, hostOnly],
	);
	const shownSpaces = useMemo(() => filterHomeSpaces(spaces, term), [spaces, term]);
	const hostsAny = questions.some((question) => question.hosting);
	const isEmpty = !loading && spaces.length === 0 && questions.length === 0;
	const noResults = !!term && shownQuestions.length === 0;

	function openSpace(space: HomeSpace) {
		setSpaceId(space.id);
		setView('questions');
	}

	function changeView(next: string) {
		setView(next === 'spaces' ? 'spaces' : 'questions');
		setSpaceId(null);
	}

	return (
		<main className={styles.home} data-testid="home-overview">
			<div className={styles.home__inner}>
				<h1 className={styles.home__greeting}>
					{firstName
						? t("What's waiting for you, {name}").replace('{name}', firstName)
						: t("What's waiting for you?")}
				</h1>

				<div className={styles.search}>
					<Search size={18} className={styles.search__icon} aria-hidden="true" />
					<input
						type="search"
						className={styles.search__input}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={t('Search questions and spaces')}
						aria-label={t('Search questions and spaces')}
						data-testid="home-search"
					/>
					{search && (
						<button
							type="button"
							className={styles.search__clear}
							onClick={() => setSearch('')}
							data-testid="home-search-clear"
						>
							{t('Clear')}
						</button>
					)}
				</div>

				{noResults && (
					<p className={styles.home__notice} role="status">
						{t('Nothing found for "{q}".').replace('{q}', term)}
					</p>
				)}

				{loading ? (
					<p className={styles.home__notice} role="status">
						{t('Gathering your conversations…')}
					</p>
				) : isEmpty ? (
					<div className={styles.home__empty}>
						<ConversationWelcome t={t} compact />
						<h2>{t('Something good can start here.')}</h2>
						<p>{t('Bring a question and a few people. You can figure out the rest together.')}</p>
						<div className={styles.home__emptyActions}>
							<button
								type="button"
								className={styles.primaryButton}
								onClick={onCreateQuestion}
								data-cy="add-statement"
							>
								{t('Start a conversation')}
							</button>
							<button type="button" className={styles.dashedButton} onClick={onCreateGroup}>
								+ {t('New space')}
							</button>
						</div>
					</div>
				) : (
					<section className={styles.home__lists} aria-label={t('Your conversations')}>
						<SegmentedControl
							variant="track"
							ariaLabel={t('Your conversations')}
							activeId={visibleView}
							onChange={changeView}
							segments={[
								{ id: 'spaces', label: t('Spaces'), count: shownSpaces.length },
								{ id: 'questions', label: t('Recent questions'), count: shownQuestions.length },
							]}
						/>

						{visibleView === 'spaces' ? (
							<div className={styles.home__stack}>
								{shownSpaces.map((space) => (
									<SpaceCard key={space.id} space={space} onOpen={openSpace} t={t} />
								))}
								<button
									type="button"
									className={styles.dashedButton}
									onClick={onCreateGroup}
									data-testid="home-new-space"
								>
									+ {t('New space')}
								</button>
							</div>
						) : (
							<div className={styles.home__stack}>
								<div className={styles.home__toolbar}>
									{activeSpace && (
										<button
											type="button"
											className={styles.filterChip}
											onClick={() => setSpaceId(null)}
											aria-label={`${t('Remove filter')}: ${activeSpace.title}`}
											data-testid="home-space-filter"
										>
											{activeSpace.title}
											<X size={13} aria-hidden="true" />
										</button>
									)}
									<span className={styles.home__spacer} />
									{hostsAny && (
										<div
											className={styles.pills}
											role="group"
											aria-label={t('Filter conversations')}
										>
											<button
												type="button"
												aria-pressed={!hostOnly}
												className={styles.pill}
												onClick={() => setHostOnly(false)}
											>
												{t('All')}
											</button>
											<button
												type="button"
												aria-pressed={hostOnly}
												className={styles.pill}
												onClick={() => setHostOnly(true)}
												data-testid="home-host-filter"
											>
												{t("I'm hosting")}
											</button>
										</div>
									)}
									<button
										type="button"
										className={styles.newQuestion}
										onClick={onCreateQuestion}
										data-cy="add-statement"
									>
										<Plus size={16} aria-hidden="true" />
										{t('Start something')}
									</button>
								</div>
								{shownQuestions.length > 0 && (
									<ul className={styles.home__list}>
										{shownQuestions.map((question) => (
											<QuestionRow
												key={question.id}
												question={question}
												onOpen={onOpenQuestion}
												now={now}
												locale={locale}
												t={t}
											/>
										))}
									</ul>
								)}
								{!term && shownQuestions.length === 0 && (
									<p className={styles.home__notice}>{t('No conversations found')}</p>
								)}
							</div>
						)}
						{more}
					</section>
				)}

				<button
					type="button"
					className={styles.dashedButton}
					onClick={onOpenPin}
					data-testid="home-join-pin"
				>
					<KeyRound size={16} aria-hidden="true" />
					{t('Have a code? Join with PIN')}
				</button>
			</div>
		</main>
	);
}
