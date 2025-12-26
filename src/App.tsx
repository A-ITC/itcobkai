import { HashRouter, Route } from "@solidjs/router";
import Main from "./Main";
import Login from "./Login";
import Skyway from "./Skyway";

export default function App() {
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
        path="/skyway"
        component={Skyway}
      />
    </HashRouter>
  );
}
