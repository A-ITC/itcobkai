/* @refresh reload */
import { HashRouter, Route } from "@solidjs/router";
import { render } from "solid-js/web";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Main from "./main/Main";
import "toastify-js/src/toastify.css";
import "./index.css";

window.onload = () => {
  render(() => <Router />, document.getElementById("root")!);
};

function Router() {
  return (
    <HashRouter>
      <Route
        path="/"
        component={Main}
      />
      <Route
        path="/login"
        component={Login}
      />
      <Route
        path="/setup"
        component={Setup}
      />
      <Route
        path="*"
        component={() => (
          <div class="text-white p-2">
            <h1>404 - ページが見つかりません</h1>
            <p>お探しのページは削除されたか、URLが間違っている可能性があります。</p>
            <div class="pt-2 underline">
              <a href="#/">ホームに戻る</a>
            </div>
          </div>
        )}
      />
    </HashRouter>
  );
}
