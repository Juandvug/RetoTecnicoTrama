import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin Cache Components: la CSP con nonce exige que la página se renderice en
  // cada request (ADR-0005). Un shell prerenderizado lleva scripts sin nonce, y
  // la app es una sola página de cliente que no gana nada con el caché.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
};

export default nextConfig;
