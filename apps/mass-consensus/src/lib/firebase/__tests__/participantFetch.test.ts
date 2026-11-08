import { ensureSignedInUser, getCurrentToken } from '../client';
import { participantFetch } from '../participantFetch';

jest.mock('../client', () => ({
  ensureSignedInUser: jest.fn(),
  getCurrentToken: jest.fn(),
}));

const mockToken = getCurrentToken as jest.Mock;
const mockFetch = jest.fn();

function authorizationOf(callIndex: number): string | null {
  return new Headers(mockFetch.mock.calls[callIndex][1].headers).get('Authorization');
}

describe('participantFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    mockToken.mockResolvedValue('cached-token');
    mockFetch.mockResolvedValue({ status: 200 });
  });

  it('signs the visitor in before sending, so no signup is needed', async () => {
    await participantFetch('/api/x');

    expect(ensureSignedInUser).toHaveBeenCalledTimes(1);
  });

  it('attaches the token and keeps the caller headers', async () => {
    await participantFetch('/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

    const headers = new Headers(mockFetch.mock.calls[0][1].headers);
    expect(headers.get('Authorization')).toBe('Bearer cached-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('asks for no fresh token on a normal request', async () => {
    await participantFetch('/api/x');

    expect(mockToken).toHaveBeenCalledTimes(1);
    expect(mockToken).toHaveBeenCalledWith();
  });

  it('replaces a rejected token once', async () => {
    mockFetch.mockResolvedValueOnce({ status: 401 }).mockResolvedValueOnce({ status: 200 });
    mockToken.mockResolvedValueOnce('stale-token').mockResolvedValueOnce('fresh-token');

    const response = await participantFetch('/api/x');

    expect(mockToken).toHaveBeenLastCalledWith({ force: true });
    expect(authorizationOf(1)).toBe('Bearer fresh-token');
    expect(response.status).toBe(200);
  });

  it('returns the 401 when no fresh token can be had', async () => {
    mockFetch.mockResolvedValue({ status: 401 });
    mockToken.mockResolvedValueOnce('stale-token').mockResolvedValueOnce(null);

    const response = await participantFetch('/api/x');

    expect(response.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
