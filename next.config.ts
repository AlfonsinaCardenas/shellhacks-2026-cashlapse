import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep the dev badge away from the sidebar's user menu
  devIndicators: { position: "bottom-right" },
  // pdf.js loads its worker file by relative path at runtime, which breaks
  // when bundled. Load it straight from node_modules instead.
  serverExternalPackages: ["pdfjs-dist"],
  // That worker file is loaded dynamically, so the build doesn't see it and
  // Vercel leaves it out. Ship it with the upload route explicitly.
  outputFileTracingIncludes: {
    "/api/statements/upload": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
