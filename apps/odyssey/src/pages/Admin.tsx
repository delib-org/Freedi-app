import { useState } from 'react';
import GameChrome from '../components/GameChrome';
import { extendDictionaries } from '../i18n/i18n';
import { useT } from '../i18n/useT';
import { useGame } from '../state/GameContext';
import { toFreediUser, useUser } from '../lib/user';
import { isGameAdmin } from '../lib/game';
import { seedGame } from '../lib/seed';
import { currentGameId } from '../state/GameContext';
import { saveGamePatch } from '../lib/admin';
import adminHe from './admin/i18n/he';
import adminEn from './admin/i18n/en';
import adminAr from './admin/i18n/ar';
import TextsTab from './admin/TextsTab';
import CompassTab from './admin/CompassTab';
import ValuesTab from './admin/ValuesTab';
import IslandsTab from './admin/IslandsTab';
import PartiesTab from './admin/PartiesTab';
import AgoraTab from './admin/AgoraTab';
import TranslationsTab from './admin/TranslationsTab';

// Admin is its own chunk, so its strings ride with it instead of with every
// player. Registered once, when the chunk loads.
extendDictionaries({ he: adminHe, en: adminEn, ar: adminAr });

const TAB_KEYS = [
	'texts',
	'compass',
	'values',
	'islands',
	'parties',
	'agora',
	'translations',
] as const;

type TabKey = (typeof TAB_KEYS)[number];

/**
 * Admin console. Game config edits go to the odysseyGames doc; island and
 * stance texts are Statement edits (they are real Freedi statements, so the
 * whole ecosystem — consensus pipeline, other apps — sees the same content).
 */
export default function Admin() {
	const { t } = useT();
	const { user } = useUser();
	const { content, loading, reload } = useGame();
	const [tab, setTab] = useState<TabKey>('texts');
	const [status, setStatus] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	function flash(message: string): void {
		setStatus(message);
		setTimeout(() => setStatus(null), 3000);
	}

	async function run(action: () => Promise<void>): Promise<void> {
		setBusy(true);
		try {
			await action();
			flash(t('admin.status.saved'));
			await reload();
		} catch (error) {
			console.error('[Odyssey admin]', error);
			flash(t('admin.status.saveFailed'));
		} finally {
			setBusy(false);
		}
	}

	if (loading) {
		return (
			<>
				<GameChrome stage={t('admin.stage.manage')} />
				<div className="page justify-center">
					<p className="panel">{t('admin.loading')}</p>
				</div>
			</>
		);
	}

	if (!content) {
		return (
			<>
				<GameChrome stage={t('admin.stage.manage')} />
				<div className="page justify-center">
					<section className="panel text-center max-w-md flex flex-col items-center gap-3">
						<h2 className="text-xl font-bold text-[var(--cream)] m-0">{t('admin.setup.title')}</h2>
						<p className="text-[15px] opacity-85 m-0">{t('admin.setup.body')}</p>
						{status ? <p className="text-[var(--gold-strong)] m-0">{status}</p> : null}
						<button
							type="button"
							className="btn"
							disabled={busy || !user}
							onClick={() =>
								void run(async () => {
									// Seeds the game this URL is pointing at, not always the
									// default one — otherwise "?game=<event>" on an empty
									// event would silently create the shared default instead.
									await seedGame(toFreediUser(user!), currentGameId());
								})
							}
						>
							{busy ? t('admin.setup.creating') : t('admin.setup.create')}
						</button>
					</section>
				</div>
			</>
		);
	}

	if (!isGameAdmin(content.game, user?.uid)) {
		return (
			<>
				<GameChrome stage={t('admin.stage.manage')} />
				<div className="page justify-center">
					<p className="panel">{t('admin.noPermission')}</p>
				</div>
			</>
		);
	}

	const gameId = content.game.gameId;

	return (
		<>
			<GameChrome stage={t('admin.stage.edit')} />
			<div className="page">
				<div className="w-full max-w-4xl flex flex-col gap-4">
					<div className="flex flex-wrap gap-2 justify-center">
						{TAB_KEYS.map((key) => (
							<button
								key={key}
								type="button"
								className={`btn-outline ${tab === key ? '!bg-[rgba(216,170,75,0.25)] !border-[var(--gold-strong)]' : ''}`}
								onClick={() => setTab(key)}
							>
								{t(`admin.tab.${key}`)}
							</button>
						))}
					</div>

					{status ? (
						<p className="text-center text-[var(--gold-strong)] m-0" role="status">
							{status}
						</p>
					) : null}

					{tab === 'texts' ? (
						<TextsTab
							texts={content.game.texts}
							busy={busy}
							onSave={(texts) => void run(() => saveGamePatch(gameId, { texts }))}
						/>
					) : null}
					{tab === 'compass' ? (
						<CompassTab
							questions={content.game.compassQuestions}
							busy={busy}
							onSave={(compassQuestions) =>
								void run(() => saveGamePatch(gameId, { compassQuestions }))
							}
						/>
					) : null}
					{tab === 'values' ? (
						<ValuesTab
							values={content.game.values}
							busy={busy}
							onSave={(values) => void run(() => saveGamePatch(gameId, { values }))}
						/>
					) : null}
					{tab === 'islands' ? (
						<IslandsTab
							islands={content.islands}
							busy={busy}
							flash={flash}
							gameId={gameId}
							rootStatementId={content.game.rootStatementId}
							islandsMeta={content.game.islands}
							run={run}
						/>
					) : null}
					{tab === 'parties' ? (
						<PartiesTab
							parties={content.game.parties}
							islands={content.islands}
							busy={busy}
							flash={flash}
							gameId={gameId}
							run={run}
						/>
					) : null}
					{tab === 'agora' ? (
						<AgoraTab
							islands={content.islands}
							islandsMeta={content.game.islands}
							agoraSessions={content.game.agoraSessions ?? {}}
							agoraOrigin={content.game.texts.agoraOrigin ?? ''}
							script={content.game.script}
							busy={busy}
							flash={flash}
							gameId={gameId}
							run={run}
						/>
					) : null}
					{tab === 'translations' ? (
						<TranslationsTab gameId={gameId} flash={flash} onTranslated={reload} />
					) : null}
				</div>
			</div>
		</>
	);
}
