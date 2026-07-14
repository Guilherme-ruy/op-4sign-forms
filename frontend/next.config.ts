import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['10.10.0.74:3000', '10.10.0.74', 'localhost:3000'],
  turbopack: {},
};

export default nextConfig;
