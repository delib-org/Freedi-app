import { authedFetch, NotAuthenticatedError } from '../authedFetch';
import { getCurrentToken } from '@/lib/firebase/client';

jest.mock('@/lib/firebase/client', () => ({
  getCurrentToken: jest.fn(),
}));

const mockGetCurrentToken = getCurrentToken as jest.MockedFunction<typeof getCurrentToken>;

function response(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

function authHeader(call: number): string | undefined {
  const init = (global.fetch as jest.Mock).mock.calls[call][1] as RequestInit;

  return (init.headers as Record<string, string>).Authorization;
}

describe('authedFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('attaches the current token and returns the response', async () => {
    mockGetCurrentToken.mockResolvedValue('token-1');
    (global.fetch as jest.Mock).mockResolvedValue(response(200));

    const res = await authedFetch('/api/surveys/s1/synthesis-status');

    expect(res.status).toBe(200);
    expect(authHeader(0)).toBe('Bearer token-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws NotAuthenticatedError when there is no signed-in user', async () => {
    mockGetCurrentToken.mockResolvedValue(null);

    await expect(authedFetch('/api/questions')).rejects.toThrow(NotAuthenticatedError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('force-refreshes and retries once on a 401', async () => {
    mockGetCurrentToken
      .mockResolvedValueOnce('expired-token')
      .mockResolvedValueOnce('fresh-token');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200));

    const res = await authedFetch('/api/surveys/s1/synthesis-status');

    expect(res.status).toBe(200);
    expect(mockGetCurrentToken).toHaveBeenNthCalledWith(2, { force: true });
    expect(authHeader(0)).toBe('Bearer expired-token');
    expect(authHeader(1)).toBe('Bearer fresh-token');
  });

  it('does not retry a second time when the fresh token is also refused', async () => {
    mockGetCurrentToken
      .mockResolvedValueOnce('expired-token')
      .mockResolvedValueOnce('fresh-token');
    (global.fetch as jest.Mock).mockResolvedValue(response(401));

    await expect(authedFetch('/api/questions')).rejects.toThrow(NotAuthenticatedError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the refresh returns the same token', async () => {
    mockGetCurrentToken.mockResolvedValue('same-token');
    (global.fetch as jest.Mock).mockResolvedValue(response(401));

    await expect(authedFetch('/api/questions')).rejects.toThrow('Session expired');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-401 failure', async () => {
    mockGetCurrentToken.mockResolvedValue('token-1');
    (global.fetch as jest.Mock).mockResolvedValue(response(500));

    const res = await authedFetch('/api/questions');

    expect(res.status).toBe(500);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves method and body while adding the header', async () => {
    mockGetCurrentToken.mockResolvedValue('token-1');
    (global.fetch as jest.Mock).mockResolvedValue(response(200));

    await authedFetch('/api/surveys', {
      method: 'POST',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'x' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });
});
