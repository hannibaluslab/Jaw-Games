import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'publickey-credentials-create=*, publickey-credentials-get=*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
