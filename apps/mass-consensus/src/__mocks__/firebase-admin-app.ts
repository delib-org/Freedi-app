/**
 * Mock for firebase-admin/app module
 */

export const mockApp = {
  name: 'mock-app',
  options: {},
};

export const initializeApp = jest.fn().mockReturnValue(mockApp);
export const getApps = jest.fn().mockReturnValue([]);
export const cert = jest.fn().mockReturnValue({});

export type App = typeof mockApp;
