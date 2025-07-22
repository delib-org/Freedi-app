import { http, HttpResponse } from 'msw';

export const handlers = [
  // Example API handler
  http.get('/api/user', () => {
    return HttpResponse.json({
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    });
  }),

  // Example Firebase Functions handler
  http.post('https://us-central1-*.cloudfunctions.net/api/*', () => {
    return HttpResponse.json({
      success: true,
      data: {},
    });
  }),

  // Example error handler
  http.get('/api/error', () => {
    return new HttpResponse(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }),
];