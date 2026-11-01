import { NextRequest } from 'next/server';

const mockVerifyToken = jest.fn();

jest.mock('@/lib/auth/verifyAdmin', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
  extractBearerToken: (header: string | null) => (header ? header.replace('Bearer ', '') : null),
}));
jest.mock('@/lib/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('@/lib/firebase/admin', () => ({ getFirestoreAdmin: jest.fn() }));

import { POST } from '../../../../../app/api/questions/by-meaning/route';
import { callSearchQuestionsByMeaning } from '../questionMeaningSearch';

function post(body: string, token?: string): NextRequest {
  return new NextRequest('http://localhost/api/questions/by-meaning', {
    method: 'POST',
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('POST /api/questions/by-meaning', () => {
  beforeEach(() => {
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue('user1');
  });

  it('401 without a token', async () => {
    expect((await POST(post('{"query":"budget"}'))).status).toBe(401);
  });

  it('401 with an invalid token', async () => {
    mockVerifyToken.mockResolvedValue(null);

    expect((await POST(post('{"query":"budget"}', 'bad'))).status).toBe(401);
  });

  it.each([
    ['malformed JSON', '{nope'],
    ['null body', 'null'],
    ['non-string query', '{"query":42}'],
    ['too-short query', '{"query":"ab"}'],
  ])('400 for %s', async (_label, body) => {
    expect((await POST(post(body, 'tok'))).status).toBe(400);
  });
});

describe('callSearchQuestionsByMeaning', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('maps a timeout to a clear error', async () => {
    const timeout = new Error('t');
    timeout.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(timeout);

    await expect(callSearchQuestionsByMeaning('http://x', 'tok', { query: 'budget' })).rejects.toThrow(
      /timed out/
    );
  });

  it('turns a non-JSON body into a readable error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    await expect(callSearchQuestionsByMeaning('http://x', 'tok', { query: 'budget' })).rejects.toThrow(
      /non-JSON response \(HTTP 502\)/
    );
  });
});
