import { useState } from 'react';
import { Link } from 'react-router-dom';
import GameChrome from '../components/GameChrome';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { logError } from '@freedi/shared-utils';
import { classifySignInError, getErrorCode, isInAppBrowser } from '../lib/signInError';
import { signInAnonymous, signInWithGoogle, useUser } from '../lib/user';
import { useGame } from '../state/GameContext';
import { useT } from '../i18n/useT';

/**
 * The door.
 *
 * It used to be one Google button with nothing beside it. On a pre-election
 * political questionnaire that reads as: give us your name, then answer where
 * you stand, and we will not say which of those we keep. The two things added
 * here are the two things a person needs before deciding — what the account is
 * for, and a way in without one.
 */
export default function Intro() {
	const { user, loading } = useUser();
	const { text } = useGame();
	const { t } = useT();
	const [boarding, setBoarding] = useState(false);
	const [signInFailed, setSignInFailed] = useState(false);

	async function board(method: 'google' | 'anonymous'): Promise<void> {
		setBoarding(true);
		setSignInFailed(false);
		try {
			await (method === 'google' ? signInWithGoogle() : signInAnonymous());
		} catch (error) {
			// Closing the popup is the player's own choice; anything else leaves
			// them on this screen with no account, so they are told what to do.
			if (classifySignInError(error) === 'failed') {
				setSignInFailed(true);
				logError(error, {
					operation: `odyssey.intro.signIn.${method}`,
					metadata: {
						code: getErrorCode(error),
						inAppBrowser: isInAppBrowser(navigator.userAgent),
					},
				});
			}
		} finally {
			setBoarding(false);
		}
	}

	return (
		<>
			<GameChrome stage={t('step.intro')} />
			<div className="page justify-center">
				<section className="panel fade-in w-full max-w-2xl text-center flex flex-col items-center gap-4 !py-10">
					<p className="eyebrow">{text('introMotto')}</p>
					<h1 className="text-4xl font-bold text-[var(--cream)] m-0">{text('gameTitle')}</h1>
					<p className="text-lg text-[#cfe6f5] m-0">{text('gameSubtitle')}</p>

					<p className="max-w-xl leading-relaxed text-[15px] text-[#e8f3fb] m-0">
						{text('introWelcome')} {text('introBody')}
					</p>

					<div className="text-[var(--gold-strong)] text-lg leading-relaxed">
						<div>{text('introLine1')}</div>
						<div>{text('introLine2')}</div>
					</div>

					{loading ? null : user ? (
						<>
							<Link className="btn mt-2" to="/compass">
								⚓ {text('startButton')}
							</Link>
							<p className="text-[13px] opacity-75 m-0">
								{/* An anonymous sailor has neither name nor email — the line read
								    "signed in as" and then stopped. */}
								{user.isAnonymous
									? t('intro.anonymousNote')
									: t('intro.signedInAs', { name: user.displayName ?? user.email ?? '' })}
							</p>
						</>
					) : (
						<div className="flex flex-col items-center gap-3 mt-2 w-full max-w-md">
							<button
								type="button"
								className="btn"
								disabled={boarding}
								onClick={() => void board('google')}
							>
								{t('intro.googleButton')}
							</button>
							<p className="text-[13px] opacity-80 m-0 text-center">{t('intro.googleNote')}</p>

							<div className="flex items-center gap-3 w-full opacity-40" aria-hidden="true">
								<span className="h-px flex-1 bg-[var(--cream)]" />
								<span className="text-[13px]">{t('intro.or')}</span>
								<span className="h-px flex-1 bg-[var(--cream)]" />
							</div>

							<button
								type="button"
								className="btn-outline"
								disabled={boarding}
								onClick={() => void board('anonymous')}
							>
								{t('intro.anonymousButton')}
							</button>
							<p className="text-[13px] opacity-80 m-0 text-center">{t('intro.anonymousHint')}</p>

							{signInFailed ? (
								<div
									role="alert"
									className="flex flex-col items-center gap-2 w-full rounded-lg border border-[var(--gold-strong)] p-3 text-[14px] text-center"
								>
									<p className="m-0 text-[var(--cream)]">{t('intro.signInFailed')}</p>
									{isInAppBrowser(navigator.userAgent) ? (
										<p className="m-0">{t('intro.signInInApp')}</p>
									) : null}
									<p className="m-0 opacity-85">{t('intro.signInOrAnonymous')}</p>
									<button
										type="button"
										className="btn-outline"
										disabled={boarding}
										onClick={() => void board('google')}
									>
										{t('intro.signInRetry')}
									</button>
								</div>
							) : null}

							<p className="text-[13px] opacity-85 m-0 text-center mt-1">
								{t('intro.privacyNote')}{' '}
								<Link className="underline" to="/privacy">
									{t('intro.privacyLink')}
								</Link>
							</p>
						</div>
					)}

					{/* The top bar has one too; this one is where a first-time visitor
					    is actually looking, before they have found the bar. */}
					<LanguageSwitcher className="mt-2" />
				</section>
			</div>
		</>
	);
}
