import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Next 15's default wasm hasher intermittently crashes during build with
    // "Cannot read properties of undefined (reading 'length')" in WasmHash.
    // Switching to a native hash avoids that flaky code path, which matters now
    // that pushes trigger production builds automatically.
    config.output.hashFunction = "sha256";
    return config;
  },
};

export default nextConfig;
