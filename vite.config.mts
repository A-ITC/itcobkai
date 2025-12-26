import { defineConfig, loadEnv } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

const env = loadEnv("production", process.cwd());

export default defineConfig({
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: env.VITE_API_URL,
        changeOrigin: true
      }
    }
  },
  build: {
    target: "esnext"
  },
  base: "./",
  plugins: [tailwindcss(), solidPlugin()]
});
