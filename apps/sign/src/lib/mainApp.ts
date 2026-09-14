export const MAIN_APP_URL = process.env.NEXT_PUBLIC_MAIN_APP_URL ||
 (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://app.wizcol.com');
