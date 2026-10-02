import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // La vista del grupo vive solo en la pestaña Grupo de los perfiles de miembros.
  redirects: async () => [
    { source: "/grupo", destination: "/", permanent: false },
  ],
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
