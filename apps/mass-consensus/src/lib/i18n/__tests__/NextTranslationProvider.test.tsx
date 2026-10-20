/**
 * @jest-environment jsdom
 */

import { render, screen, act } from '@testing-library/react';
import { LanguagesEnum } from '../../../../../../packages/shared-i18n/src/core/constants';
import { NextTranslationProvider } from '../../../../../../packages/shared-i18n/src/next/TranslationProvider';
import { useTranslation } from '../../../../../../packages/shared-i18n/src/next/useTranslation';
import { loadLanguageData } from '../../../../../../packages/shared-i18n/src/languages/loader';

jest.mock('../../../../../../packages/shared-i18n/src/languages/loader', () => ({
  loadLanguageData: jest.fn(),
}));

const mockLoad = loadLanguageData as jest.MockedFunction<typeof loadLanguageData>;

const FULL: Partial<Record<LanguagesEnum, Record<string, string>>> & {
  en: Record<string, string>;
} = {
  [LanguagesEnum.en]: { Hello: 'Hello', Rare: 'Rare', Greet: 'Hi {{name}}' },
  [LanguagesEnum.he]: { Hello: 'שלום', Rare: 'נדיר', Greet: 'היי {{name}}' },
};

function Probe({ keyName }: { keyName: string }) {
  const { t, tWithParams, currentLanguage, changeLanguage } = useTranslation();

  return (
    <div>
      <span data-testid="text">{t(keyName)}</span>
      <span data-testid="params">{tWithParams('Greet', { name: 'Dana' })}</span>
      <span data-testid="lang">{currentLanguage}</span>
      <button onClick={() => changeLanguage(LanguagesEnum.he)}>he</button>
    </div>
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('NextTranslationProvider', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockLoad.mockImplementation((language) => Promise.resolve(FULL[language] ?? FULL.en));
  });

  it('renders from the initial dictionary without loading anything', () => {
    render(
      <NextTranslationProvider initialLanguage={LanguagesEnum.en} initialDictionary={FULL.en}>
        <Probe keyName="Hello" />
      </NextTranslationProvider>
    );

    expect(screen.getByTestId('text').textContent).toBe('Hello');
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('shows a key missing from a partial dictionary as its own text, without loading', async () => {
    render(
      <NextTranslationProvider
        initialLanguage={LanguagesEnum.he}
        initialDictionary={{ Hello: 'שלום', Greet: 'היי {{name}}' }}
      >
        <Probe keyName="Rare" />
      </NextTranslationProvider>
    );
    await flush();

    expect(screen.getByTestId('text').textContent).toBe('Rare');
    expect(screen.getByTestId('params').textContent).toBe('היי Dana');
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('applies only the latest of two quick language changes', async () => {
    let resolveFirst: (d: Record<string, string>) => void = () => undefined;
    mockLoad
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => Promise.resolve(FULL.en));
    function TwoSwitches() {
      const { t, changeLanguage } = useTranslation();

      return (
        <button
          onClick={() => {
            changeLanguage(LanguagesEnum.he);
            changeLanguage(LanguagesEnum.en);
          }}
        >
          {t('Hello')}
        </button>
      );
    }
    render(
      <NextTranslationProvider initialLanguage={LanguagesEnum.en} initialDictionary={FULL.en}>
        <TwoSwitches />
      </NextTranslationProvider>
    );

    act(() => {
      screen.getByRole('button').click();
    });
    await flush();
    resolveFirst(FULL.he ?? {});
    await flush();

    expect(screen.getByRole('button').textContent).toBe('Hello');
  });

  it('switches language, direction and cookie after the new dictionary loads', async () => {
    render(
      <NextTranslationProvider initialLanguage={LanguagesEnum.en} initialDictionary={FULL.en}>
        <Probe keyName="Hello" />
      </NextTranslationProvider>
    );

    act(() => {
      screen.getByText('he').click();
    });
    expect(document.cookie).toContain('freedi-lang=he');
    await flush();

    expect(screen.getByTestId('text').textContent).toBe('שלום');
    expect(screen.getByTestId('lang').textContent).toBe(LanguagesEnum.he);
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('keeps the current language when the new dictionary fails to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLoad.mockRejectedValueOnce(new Error('offline'));
    render(
      <NextTranslationProvider initialLanguage={LanguagesEnum.en} initialDictionary={FULL.en}>
        <Probe keyName="Hello" />
      </NextTranslationProvider>
    );

    act(() => {
      screen.getByText('he').click();
    });
    await flush();

    expect(screen.getByTestId('lang').textContent).toBe(LanguagesEnum.en);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
