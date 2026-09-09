import React, { useState } from 'react';
import { ArrowUpRight, MessageCircle, Plus, Search, Users } from 'lucide-react';
import ConversationWelcome from './ConversationWelcome';
import { Translate } from './ThinkingSpace';
import styles from './ConversationHome.module.scss';

export interface ConversationSummary {
	id: string;
	title: string;
	description?: string;
	isGroup: boolean;
	recentText?: string;
	recentAuthor?: string;
}
interface ConversationHomeProps {
	conversations: ConversationSummary[];
	userName: string;
	onOpen: (id: string) => void;
	onCreate: () => void;
	onCreateGroup?: () => void;
	onFilterChange?: (filter: 'all' | 'groups') => void;
	loading?: boolean;
	more?: React.ReactNode;
	t: Translate;
}
export default function ConversationHome({
	conversations,
	userName,
	onOpen,
	onCreate,
	onCreateGroup,
	onFilterChange,
	loading,
	more,
	t,
}: ConversationHomeProps) {
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState<'all' | 'groups'>('all');
	const visible = conversations.filter(
		(item) =>
			(filter === 'all' || item.isGroup) &&
			`${item.title} ${item.description ?? ''}`
				.toLocaleLowerCase()
				.includes(query.toLocaleLowerCase()),
	);

	return (
		<main className={styles.home}>
			<div className={styles.home__greeting}>
				<span>{t('YOUR EVERYDAY SPACE FOR COLLECTIVE THINKING')}</span>
				<span>
					{t('Welcome')}
					{userName ? `, ${userName.split(' ')[0]}` : ''} <span aria-hidden="true">☀</span>
				</span>
			</div>
			<ConversationWelcome t={t} />
			<div className={styles.home__heading}>
				<div>
					<h1>{t('Your conversations')}</h1>
					<p>{t('Pick up a thread. See what grows.')}</p>
				</div>
				<button className={styles.home__new} onClick={onCreate} data-cy="add-statement">
					<Plus size={17} />
					{t('Start something')}
				</button>
			</div>
			<div className={styles.home__toolbar}>
				<div className={styles.home__filters} role="group" aria-label={t('Filter conversations')}>
					<button
						aria-pressed={filter === 'all'}
						onClick={() => {
							setFilter('all');
							onFilterChange?.('all');
						}}
					>
						{t('All conversations')}
					</button>
					<button
						aria-pressed={filter === 'groups'}
						onClick={() => {
							setFilter('groups');
							onFilterChange?.('groups');
						}}
					>
						{t('Groups')}
					</button>
				</div>
				<label className={styles.home__search}>
					<Search size={17} />
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						aria-label={t('Find a conversation')}
						placeholder={t('Find a conversation')}
					/>
				</label>
			</div>
			{filter === 'groups' && onCreateGroup && (
				<div className={styles.home__heading}>
					<button className={styles.home__new} onClick={onCreateGroup}>
						<Plus size={17} aria-hidden="true" />
						{t('Open a new group')}
					</button>
				</div>
			)}
			{loading ? (
				<div className={styles.home__empty} role="status">
					{t('Gathering your conversations…')}
				</div>
			) : visible.length > 0 ? (
				<div className={styles.home__grid}>
					{visible.map((item, index) => (
						<button className={styles.home__card} key={item.id} onClick={() => onOpen(item.id)}>
							<div className={styles.home__cardTop}>
								<span className={styles.home__icon} data-tone={index % 3}>
									{item.isGroup ? <Users size={24} /> : <MessageCircle size={24} />}
								</span>
								<span className={styles.home__kind}>
									{item.isGroup ? t('SHARED SPACE') : t('CONVERSATION')}
								</span>
								<ArrowUpRight size={18} />
							</div>
							<h2>{item.title}</h2>
							<p className={styles.home__description}>
								{item.description || t('A space to share ideas and find a way forward together.')}
							</p>
							<div className={styles.home__last}>
								{item.recentText ? (
									<>
										<span className={styles.home__initial}>
											{(item.recentAuthor || '?').charAt(0).toUpperCase()}
										</span>
										<span>
											<strong>{item.recentAuthor}</strong>
											<span>{item.recentText}</span>
										</span>
									</>
								) : (
									<span className={styles.home__first}>
										{t('There is room for your perspective.')} <ArrowUpRight size={14} />
									</span>
								)}
							</div>
						</button>
					))}
				</div>
			) : (
				<div className={styles.home__empty}>
					<MessageCircle size={32} />
					<h2>
						{query || filter === 'groups'
							? t('No conversations found')
							: t('Something good can start here.')}
					</h2>
					<p>
						{query
							? t('Try another word, or clear your search.')
							: t('Bring a question and a few people. You can figure out the rest together.')}
					</p>
					<button
						onClick={
							query
								? () => setQuery('')
								: filter === 'groups' && onCreateGroup
									? onCreateGroup
									: onCreate
						}
					>
						{query
							? t('Clear search')
							: filter === 'groups' && onCreateGroup
								? t('Open a new group')
								: t('Start a conversation')}
					</button>
				</div>
			)}
			{more}
			<div className={styles.home__footnote}>
				<span aria-hidden="true">✳</span>
				{t('Every voice adds a possibility.')}
			</div>
		</main>
	);
}
