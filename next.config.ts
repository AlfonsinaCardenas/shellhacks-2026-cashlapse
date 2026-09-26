import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep the dev badge away from the sidebar's user menu
  devIndicators: { position: "bottom-right" },
  // pdf.js loads its worker file by relative path at runtime, which breaks
  // when bundled. Load it straight from node_modules instead.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
