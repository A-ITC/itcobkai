/* @refresh reload */
import { render } from "solid-js/web";
import { HashRouter, Route } from "@solidjs/router";
import Viewer from "./viewer/Viewer";
import Login from "./Login";
import Master from "./master/Master";
import "./index.css";

window.onload = () => {
  render(() => <Router />, document.getElementById("root")!);
};

function Router() {
  return (
    <HashRouter>
      <Route
        path="/"
        component={Viewer}
      />
      <Route
        path="/login"
        component={Login}
      />
      <Route
        path="/master"
        component={Master}
      />
    </HashRouter>
  );
}
