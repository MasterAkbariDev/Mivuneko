import { defineConfig } from "vite";
export default defineConfig({
  server: { port: 1420, strictPort: true },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ["three"], vrm: ["@pixiv/three-vrm"] } },
    },
  },
});
