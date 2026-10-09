import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // assetPrefix: '',
  basePath: '/account',
  assetPrefix: '/account',
  experimental: {
    authInterrupts: true,
  },

  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'neupcdn.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'neupgroup.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.neupgroup.com',
        port: '',
        pathname: '/**',
      }
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [ 
        { 
        source: '/assets/:path*',
        destination: 'https://api.propertyinnepal.com.np/storage/4377/vwQUtoSdfXzHQ0KOPYgm1HC4jjE7Iy-metaV2hhdHNBcHAgSW1hZ2UgMjAyNS0wOC0yNyBhdCAxMy40OS4yMF82ZjYxMDAyZC5qcGc=-.jpg',
        basePath: false,
      },
    ],
      afterFiles: [],
      fallback: [],
    };
  },
  turbopack: {},
};

export default nextConfig;
