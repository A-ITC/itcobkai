import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    // happy-dom: 純粋JS実装のブラウザ環境 (モニター/ネイティブ依存なし)
    environment: "happy-dom",
    // SolidJS JSX をブラウザ用トランスフォームで処理
    environmentOptions: {},
    setupFiles: ["./tests/ui/setup.ts"],
    include: ["tests/ui/**/*.test.{ts,tsx}"]
  }
});
