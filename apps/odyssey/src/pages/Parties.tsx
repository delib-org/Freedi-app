import { Link } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import NoGameYet from '../components/NoGameYet';
import { useGame } from '../state/GameContext';
import { useT } from '../i18n/useT';

/**
 * Where the ships' courses come from.
 *
 * The map tells a player how near each party sails to them, which is a strong
 * claim to make silently. It is also the claim that is hardest to make about
 * this particular election: half the field is new. ביחד did not exist to have
 * a platform; ישר! has a leader's record and no party record at all. Saying so
 * is not a disclaimer — it is the difference between a reading a player can
 * argue with and a number they have to take on faith.
 */
export default function Parties() {
	const { content } = useGame();
	const { t } = useT();

	if (!content) return <NoGameYet />;

	const parties = content.game.parties
		.filter((party) => party.enabled)
		.sort((a, b) => a.sortOrder - b.sortOrder);

	return (
		<>
			<GameChrome stage={t('parties.stage')} />
			<div className="page">
				<div className="w-full max-w-3xl flex flex-col gap-4 pb-8">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">{t('parties.title')}</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">{t('parties.intro')}</p>
					</header>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('parties.methodTitle')}
						</h2>
						<p className="text-[15px] m-0 mb-2">
							{t('parties.method1a')} <strong>{t('parties.method1strong')}</strong>{' '}
							{t('parties.method1b')}
						</p>
						<p className="text-[15px] m-0">{t('parties.method2')}</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('parties.newTitle')}
						</h2>
						<p className="text-[15px] m-0 mb-2">{t('parties.newIntro')}</p>
						<ul className="text-[15px] m-0 ps-5 flex flex-col gap-1.5">
							<li>
								<strong>{t('parties.rule1strong')}</strong> {t('parties.rule1')}
							</li>
							<li>
								<strong>{t('parties.rule2strong')}</strong> {t('parties.rule2')}
							</li>
							<li>
								<strong>{t('parties.rule3strong')}</strong> {t('parties.rule3')}
							</li>
						</ul>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-3">
							{t('parties.shipsTitle')}
						</h2>
						<div className="flex flex-col gap-3">
							{parties.map((party) => (
								<div key={party.partyId} className="flex items-start gap-3">
									<span
										className="inline-block w-3.5 h-3.5 rounded-full shrink-0 mt-1"
										style={{ background: party.color }}
										aria-hidden="true"
									/>
									<span>
										<strong className="text-[var(--cream)] text-[15px]">{party.name}</strong>
										<span className="block text-[13px] opacity-80 mt-0.5">{party.description}</span>
									</span>
								</div>
							))}
						</div>
						<p className="text-[13px] opacity-70 mt-4 mb-0">{t('parties.footnote')}</p>
					</section>

					<div className="flex justify-center gap-3">
						<Link className="btn" to="/summary">
							{t('parties.back')}
						</Link>
					</div>
				</div>
			</div>
		</>
	);
}
