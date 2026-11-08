import { Link } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import { useGame } from '../state/GameContext';
import { useT } from '../i18n/useT';

/**
 * What we know about you, and who can see it.
 *
 * A political questionnaire that asks for a Google account and says nothing
 * about what happens next is a questionnaire people close. Every claim on this
 * page is a claim about code in this repository — the journey rules in
 * firestore.rules, `voyageIdentity()` in lib/evaluations.ts, the first-name
 * split in lib/distance.ts — so if one of them stops being true, this page has
 * to change with it (in all three dictionaries).
 */
export default function Privacy() {
	const { text } = useGame();
	const { t } = useT();
	const contact = text('privacyContact');
	const controller = text('privacyController');

	return (
		<>
			<GameChrome stage={t('privacy.stage')} />
			<div className="page">
				<div className="w-full max-w-3xl flex flex-col gap-4 pb-8">
					<header className="text-center fade-in">
						<h1 className="text-3xl font-bold text-[var(--cream)] m-0">{t('privacy.title')}</h1>
						<p className="text-[15px] text-[#cfe6f5] mt-2 mb-0">{t('privacy.intro')}</p>
					</header>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('privacy.whySignInTitle')}
						</h2>
						<p className="text-[15px] m-0 mb-2">{t('privacy.whySignIn1')}</p>
						<p className="text-[15px] m-0">{t('privacy.whySignIn2')}</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('privacy.storedTitle')}
						</h2>
						<ul className="text-[15px] m-0 ps-5 flex flex-col gap-1.5">
							<li>{t('privacy.stored1')}</li>
							<li>{t('privacy.stored2')}</li>
							<li>{t('privacy.stored3')}</li>
							<li>{t('privacy.stored4')}</li>
						</ul>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('privacy.whoSeesTitle')}
						</h2>
						<p className="text-[15px] m-0 mb-2">
							<strong className="text-[var(--gold-strong)]">{t('privacy.privateLabel')}</strong>{' '}
							{t('privacy.privateBody')}
						</p>
						<p className="text-[15px] m-0 mb-2">
							<strong className="text-[var(--gold-strong)]">{t('privacy.visibleLabel')}</strong>{' '}
							{t('privacy.visibleA')} <strong>{t('privacy.visibleStrong')}</strong>
							{t('privacy.visibleB')}
						</p>
						<p className="text-[15px] m-0">
							<strong className="text-[var(--gold-strong)]">{t('privacy.hiddenLabel')}</strong>{' '}
							{t('privacy.hiddenBody')}
						</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('privacy.useTitle')}
						</h2>
						<p className="text-[15px] m-0">{t('privacy.useBody')}</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('privacy.controlTitle')}
						</h2>
						<p className="text-[15px] m-0">{t('privacy.controlBody')}</p>
					</section>

					<section className="panel fade-in">
						<h2 className="text-xl font-bold text-[var(--cream)] mt-0 mb-2">
							{t('privacy.contactTitle')}
						</h2>
						{controller ? <p className="text-[15px] m-0 mb-2">{controller}</p> : null}
						<p className="text-[15px] m-0">
							{contact ? (
								<>
									{t('privacy.contactLead')}{' '}
									<a className="underline" href={`mailto:${contact}`}>
										{contact}
									</a>
								</>
							) : (
								t('privacy.contactFallback')
							)}
						</p>
					</section>

					<div className="flex justify-center">
						<Link className="btn" to="/">
							{t('privacy.back')}
						</Link>
					</div>
				</div>
			</div>
		</>
	);
}
