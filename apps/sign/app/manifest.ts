import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WizCol Sign',
    short_name: 'WizCol Sign',
    description: 'Document signing and deliberation platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#1B2650',
    theme_color: '#1B2650',
    icons: [
      {
        src: '/icons/logo-48px.png',
        sizes: '48x48',
        type: 'image/png',
      },
      {
        src: '/icons/logo-72px.png',
        sizes: '72x72',
        type: 'image/png',
      },
      {
        src: '/icons/logo-96px.png',
        sizes: '96x96',
        type: 'image/png',
      },
      {
        src: '/icons/logo-128px.png',
        sizes: '128x128',
        type: 'image/png',
      },
      {
        src: '/icons/logo-192px.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/logo-512px.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
