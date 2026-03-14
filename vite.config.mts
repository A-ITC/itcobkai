import { defineConfig, loadEnv } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

const isBuild = process.argv.includes("build");
const env = loadEnv("production", process.cwd(), "");

export default defineConfig({
  server: {
    port: parseInt(env.DEV_PORT) || 5173,
    allowedHosts: [env.DOMAIN],
    proxy: {
      "/api": {
        target: `https://${env.DOMAIN}/api`,
        changeOrigin: true
      }
    }
  },
  build: {
    target: "esnext",
    manifest: true
  },
  base: `https://${env.DOMAIN}/${isBuild ? "itcobkai" : "dev"}`,
  plugins: [tailwindcss(), solidPlugin()]
});
