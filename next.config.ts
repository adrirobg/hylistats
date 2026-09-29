import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  headers: async () => {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
