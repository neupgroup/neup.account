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
  turbopack: {},
};

export default nextConfig;
