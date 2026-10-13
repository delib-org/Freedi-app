import { postToCloudFunction } from '../cloudFunction';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function htmlResponse(status: number): Response {
  return new Response('\n<html><head><title>500 Server Error</title></head></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
  });
}

describe('postToCloudFunction', () => {
  const endpoint = 'https://me-west1-test.cloudfunctions.net/mergeStatements';

  it('returns the JSON answer of a successful call', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { statementId: 's1' }));

    const result = await postToCloudFunction(endpoint, { a: 1 }, { fetchImpl, retryDelayMs: 0 });

    expect(result).toEqual({ kind: 'json', status: 200, ok: true, data: { statementId: 's1' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].body).toBe(JSON.stringify({ a: 1 }));
  });

  it('passes the function’s own JSON errors through without retrying', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'bad' }));

    const result = await postToCloudFunction(endpoint, {}, { fetchImpl, retryDelayMs: 0 });

    expect(result).toEqual({ kind: 'json', status: 400, ok: false, data: { error: 'bad' } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries once after a cold-start HTML 500 and returns the second answer', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(htmlResponse(500))
      .mockResolvedValueOnce(jsonResponse(200, { statementId: 's2' }));

    const result = await postToCloudFunction(endpoint, {}, { fetchImpl, retryDelayMs: 0 });

    expect(result).toEqual({ kind: 'json', status: 200, ok: true, data: { statementId: 's2' } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable, never throwing, when the HTML page repeats', async () => {
    const fetchImpl = jest.fn().mockImplementation(() => Promise.resolve(htmlResponse(503)));

    const result = await postToCloudFunction(endpoint, {}, { fetchImpl, retryDelayMs: 0 });

    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') {
      expect(result.status).toBe(503);
      expect(result.attempts).toBe(2);
      expect(result.preview).toContain('<html>');
    }
  });

  it('does not retry a gateway timeout, which may have run the function', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(htmlResponse(504));

    const result = await postToCloudFunction(endpoint, {}, { fetchImpl, retryDelayMs: 0 });

    expect(result.kind).toBe('unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
