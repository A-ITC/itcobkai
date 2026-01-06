import { promisify } from "node:util";
import { unlink } from "node:fs/promises";
import { config } from "dotenv";
import { build } from "esbuild";
import { exec } from "node:child_process";

(async () => {
  config({ path: "../.env" });
  await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: ["node20"],
    outdir: "dist",
    format: "cjs",
    sourcemap: true,
    minify: false,
    external: ["aws-sdk"]
  });
  await promisify(exec)("zip -j dist.zip dist/index.js dist/index.js.map ../.env");
  const cmd = `aws lambda update-function-code --function-name ${process.env.VITE_APP_NAME} --zip-file fileb://dist.zip`;
  const { stdout } = await promisify(exec)(cmd);
  const result = JSON.parse(stdout);
  console.log(`Success! LastModified: ${result.LastModified}`);
  await unlink("dist.zip");
})();
