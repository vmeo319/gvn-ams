import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GVN Performance',
    short_name: 'GVN',
    description: 'GVN Performance Athlete Management System',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      {
        src: '/gvn-logo-wolf.png',
        sizes: '749x749',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/gvn-logo-wolf.png',
        sizes: '749x749',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
