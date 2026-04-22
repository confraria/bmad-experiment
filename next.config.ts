import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.65'],
};

const isDev = process.env.NODE_ENV === 'development';

// Serwist injects a webpack config, which clashes with Next 16's default Turbopack.
// In dev we skip the wrapper entirely (SW is disabled for dev anyway — see AC #6).
// In prod build, `npm run build --webpack` opts into webpack so Serwist can run.
const config: NextConfig = isDev
  ? nextConfig
  : withSerwistInit({
      swSrc: 'src/app/sw.ts',
      swDest: 'public/sw.js',
    })(nextConfig);

export default config;
