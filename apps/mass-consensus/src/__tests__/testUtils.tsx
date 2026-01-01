/**
 * Test utilities for React component testing
 * Provides helpers for rendering components with common providers
 */

import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Initialize a test i18n instance
const testI18n = i18n.createInstance();
testI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['translation'],
  defaultNS: 'translation',
  resources: {
    en: {
      translation: {
        // Add common translations used in tests
        welcome: 'Welcome',
        submit: 'Submit',
        cancel: 'Cancel',
        save: 'Save',
        delete: 'Delete',
        confirm: 'Confirm',
        loading: 'Loading...',
        error: 'Error',
        success: 'Success',
        next: 'Next',
        previous: 'Previous',
        back: 'Back',
        close: 'Close',
        agree: 'Agree',
        disagree: 'Disagree',
        neutral: 'Neutral',
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

interface WrapperProps {
  children: ReactNode;
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  routerProps?: MemoryRouterProps;
  translations?: Record<string, string>;
}

/**
 * Creates a wrapper component with all necessary providers
 */
function createWrapper(options: RenderWithProvidersOptions = {}): React.FC<WrapperProps> {
  const { routerProps = {} } = options;

  const Wrapper: React.FC<WrapperProps> = ({ children }) => {
    return (
      <I18nextProvider i18n={testI18n}>
        <MemoryRouter {...routerProps}>{children}</MemoryRouter>
      </I18nextProvider>
    );
  };

  return Wrapper;
}

/**
 * Render a component with all providers (Router, I18n, etc.)
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
): RenderResult {
  const { routerProps, translations, ...renderOptions } = options;

  // Add any custom translations for the test
  if (translations) {
    Object.entries(translations).forEach(([key, value]) => {
      testI18n.addResource('en', 'translation', key, value);
    });
  }

  return render(ui, {
    wrapper: createWrapper({ routerProps }),
    ...renderOptions,
  });
}

/**
 * Render a component with just the Router provider
 */
export function renderWithRouter(
  ui: ReactElement,
  options: MemoryRouterProps & Omit<RenderOptions, 'wrapper'> = {}
): RenderResult {
  const { initialEntries, initialIndex, ...renderOptions } = options;

  const Wrapper: React.FC<WrapperProps> = ({ children }) => (
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      {children}
    </MemoryRouter>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Create a mock function that can be awaited
 */
export function createAsyncMock<T>(resolveValue: T, delay = 0): jest.Mock<Promise<T>> {
  return jest.fn().mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve(resolveValue), delay))
  );
}

/**
 * Create a mock function that rejects
 */
export function createAsyncRejectMock(error: Error, delay = 0): jest.Mock<Promise<never>> {
  return jest.fn().mockImplementation(
    () => new Promise((_, reject) => setTimeout(() => reject(error), delay))
  );
}

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Get test i18n instance for adding custom translations
 */
export { testI18n };

// Re-export everything from testing-library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
