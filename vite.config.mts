import { defineConfig, loadEnv } from "vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { promisify } from "node:util";
import { exec } from "node:child_process";

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
  plugins: [
    tailwindcss(),
    solidPlugin(),
    {
      name: "upload",
      closeBundle() {
        promisify(exec)(`aws s3 cp dist/index.html s3://${env.VITE_S3_BUCKET}/index.html`);
        promisify(exec)(`aws s3 sync dist/assets s3://${env.VITE_S3_BUCKET}/assets --delete`);
      }
    }
  ]
});
