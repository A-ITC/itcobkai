import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  define: {
    // テスト時に import.meta.env.VITE_* を差し替え
    "import.meta.env.VITE_APP_NAME": JSON.stringify("itcobkai-test"),
    "import.meta.env.VITE_DISCORD_CLIENT_ID": JSON.stringify("test-client-id"),
    "import.meta.env.VITE_API_URL": JSON.stringify("http://localhost")
  },
  test: {
    // happy-dom: 純粋JS実装のブラウザ環境 (モニター/ネイティブ依存なし)
    environment: "happy-dom",
    // SolidJS JSX をブラウザ用トランスフォームで処理
    environmentOptions: {},
    setupFiles: ["./tests/ui/setup.ts"],
    include: ["tests/ui/**/*.test.{ts,tsx}"]
  }
});
