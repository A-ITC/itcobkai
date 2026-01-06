import { defineConfig, loadEnv } from "vite";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { parse } from "dotenv";
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
    target: "esnext",
    manifest: true
  },
  base: "./",
  plugins: [
    tailwindcss(),
    solidPlugin(),
    {
      name: "upload",
      async writeBundle(_, bundle) {
        const files = Object.keys(bundle);
        const jsFile = files.find(f => f.endsWith(".js") && f.includes("index"));
        const cssFile = files.find(f => f.endsWith(".css") && f.includes("index"));
        const val = { ...parse(await readFile(".env")), JS_PATH: jsFile, CSS_PATH: cssFile };
        const envJson = JSON.stringify({ Variables: val });
        const cmd = `aws lambda update-function-configuration --function-name ${env.VITE_APP_NAME} --environment '${envJson}'`;
        promisify(exec)(cmd);
      },
      closeBundle() {
        promisify(exec)(`aws s3 cp dist/index.html s3://${env.VITE_S3_BUCKET}/index.html`);
        promisify(exec)(`aws s3 sync dist/assets s3://${env.VITE_S3_BUCKET}/assets --delete`);
      }
    }
  ]
});
