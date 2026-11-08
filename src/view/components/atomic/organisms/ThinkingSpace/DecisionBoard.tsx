import React from 'react';
import { DEFAULT_MIN_EVALUATORS } from '@freedi/shared-types';
import { ArrowRight, ArrowUpRight, Lightbulb, Layers, MessageCircle, Sprout } from 'lucide-react';
import { Translate } from './ThinkingSpace';
import styles from './DecisionBoard.module.scss';

export interface EmergingIdea {
	id: string;
	title: string;
	evaluators: number;
	mean?: number;
	synthesisSources?: number;
}
interface DecisionBoardProps {
	ideas: EmergingIdea[];
	onOpen: (id: string) => void;
	onExplore: () => void;
	onContribute?: () => void;
	onMap?: () => void;
	showResults: boolean;
	t: Translate;
}

export default function DecisionBoard({
	ideas,
	onOpen,
	onExplore,
	onContribute,
	onMap,
	showResults,
	t,
}: DecisionBoardProps) {
	return (
		<div className={styles.board}>
			<div className={styles.board__heading}>
				<span className={styles.board__spark} aria-hidden="true">
					✳
				</span>
				<div>
					<h2>{t('Taking shape')}</h2>
					<p>{t('Possibilities worth exploring')}</p>
				</div>
			</div>
			<div className={styles.board__label}>
				<span>{t('FROM THIS CONVERSATION')}</span>
				<Lightbulb size={15} />
			</div>
			{ideas.length === 0 ? (
				<div className={styles.board__empty}>
					<Sprout size={32} />
					<h3>{t('Room for a first idea')}</h3>
					<p>{t('A proposal gives everyone something to build on.')}</p>
				</div>
			) : (
				<div className={styles.board__ideas}>
					{ideas.slice(0, 3).map((idea, index) => (
						<button key={idea.id} className={styles.board__idea} onClick={() => onOpen(idea.id)}>
							<span className={styles.board__ideaNumber}>
								0{index + 1}
								<ArrowUpRight size={15} />
							</span>
							<h3>{idea.title}</h3>
							{idea.synthesisSources && idea.synthesisSources > 1 ? (
								<span className={styles.board__source}>
									<Layers size={13} />
									{idea.synthesisSources} {t('original contributions')}
								</span>
							) : (
								<span className={styles.board__source}>
									<MessageCircle size={13} />
									{t('An individual proposal')}
								</span>
							)}
							{showResults && (
								<div className={styles.board__evidence}>
									{idea.evaluators === 0 ? (
										<span>{t('Be among the first to weigh in')}</span>
									) : (
										<>
											<span>
												{idea.evaluators} {t('people evaluated')}
											</span>
											{idea.evaluators < DEFAULT_MIN_EVALUATORS && (
												<span className={styles.board__early}>{t('Early impressions')}</span>
											)}
											{idea.mean !== undefined && (
												<strong>
													{idea.mean > 0 ? '+' : ''}
													{Math.round(idea.mean * 100)}% {t('average')}
												</strong>
											)}
										</>
									)}
								</div>
							)}
						</button>
					))}
				</div>
			)}
			<button className={styles.board__all} onClick={onExplore}>
				{t('Explore proposals')}
				<ArrowRight size={16} />
			</button>
			<div className={styles.board__invitation}>
				<span className={styles.board__orbit} aria-hidden="true">
					✺
				</span>
				<h3>{t('Your perspective matters.')}</h3>
				<p>{t('What would make an idea work better for you?')}</p>
				{onContribute && (
					<button onClick={onContribute}>
						{t('Add a possibility')}
						<PlusMark />
					</button>
				)}
			</div>
			<details className={styles.board__explainer}>
				<summary>{t('How to read this space')}</summary>
				<p>
					{t(
						'Related ideas can share a theme. Only equivalent proposals are synthesized. A synthesis is not a group decision.',
					)}
				</p>
				<p>
					{t(
						'An average shows sentiment, not the percentage of people in favor. More evaluations help us understand a proposal; they do not erase disagreement.',
					)}
				</p>
			</details>
			{onMap && (
				<button className={styles.board__map} onClick={onMap}>
					<Layers size={16} />
					{t('Explore the idea map')}
					<ArrowUpRight size={14} />
				</button>
			)}
		</div>
	);
}
function PlusMark() {
	return <span aria-hidden="true">+</span>;
}
