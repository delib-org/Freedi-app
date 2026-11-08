import { useCallback, useEffect, useState } from 'react';
import {
	ODYSSEY_TRANSLATION_LANGS,
	type OdysseyTranslateGameResponse,
	type OdysseyTranslationLang,
} from '@freedi/shared-types';
import { LANGUAGE_NAMES } from '../../i18n/i18n';
import { useT } from '../../i18n/useT';
import { countStaleTranslations, translateGame } from '../../lib/callables';
import type { Flash } from './types';

type Status = Partial<Record<OdysseyTranslationLang, OdysseyTranslateGameResponse | 'error'>>;

/**
 * Hebrew is the source; English and Arabic are AI translations kept in
 * odysseyGames/{gameId}/translations/{lang}. Each press translates only the
 * fields whose Hebrew changed since the last run, so the status line is "how
 * far behind the Hebrew is this language".
 */
export default function TranslationsTab({
	gameId,
	flash,
	onTranslated,
}: {
	gameId: string;
	flash: Flash;
	onTranslated: () => Promise<void>;
}) {
	const { t } = useT();
	const [status, setStatus] = useState<Status>({});
	const [working, setWorking] = useState<OdysseyTranslationLang | null>(null);

	const refresh = useCallback(async () => {
		const entries = await Promise.all(
			ODYSSEY_TRANSLATION_LANGS.map(async (lang) => {
				try {
					return [lang, await countStaleTranslations(gameId, lang)] as const;
				} catch (error) {
					console.error('[Odyssey admin] stale count failed', lang, error);

					return [lang, 'error'] as const;
				}
			}),
		);
		setStatus(Object.fromEntries(entries));
	}, [gameId]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	async function translate(lang: OdysseyTranslationLang, force: boolean): Promise<void> {
		setWorking(lang);
		try {
			const result = await translateGame(gameId, lang, force);
			flash(
				t('admin.translations.done', {
					language: LANGUAGE_NAMES[lang],
					translated: result.translated,
					failed: result.failed,
				}),
			);
			await onTranslated();
			await refresh();
		} catch (error) {
			console.error('[Odyssey admin] translate failed', lang, error);
			flash(t('admin.translations.failed'));
		} finally {
			setWorking(null);
		}
	}

	function describe(lang: OdysseyTranslationLang): string {
		const entry = status[lang];
		if (entry === undefined) return t('admin.translations.checking');
		if (entry === 'error') return t('admin.translations.checkFailed');
		if (entry.translated === 0) return t('admin.translations.upToDate');

		return t('admin.translations.stale', { stale: entry.translated, total: entry.total });
	}

	return (
		<section className="panel flex flex-col gap-3">
			<p className="text-[13px] opacity-75 m-0">{t('admin.translations.intro')}</p>
			{ODYSSEY_TRANSLATION_LANGS.map((lang) => (
				<div key={lang} className="flex flex-wrap items-center gap-2">
					<strong className="min-w-24">{LANGUAGE_NAMES[lang]}</strong>
					<span className="text-[13px] opacity-85" role="status">
						{working === lang ? t('admin.translations.working') : describe(lang)}
					</span>
					<span className="ms-auto flex gap-2">
						<button
							type="button"
							className="btn"
							disabled={working !== null}
							onClick={() => void translate(lang, false)}
						>
							{t('admin.translations.translate', { language: LANGUAGE_NAMES[lang] })}
						</button>
						<button
							type="button"
							className="btn-outline"
							disabled={working !== null}
							title={t('admin.translations.forceHint')}
							onClick={() => void translate(lang, true)}
						>
							{t('admin.translations.force')}
						</button>
					</span>
				</div>
			))}
		</section>
	);
}
