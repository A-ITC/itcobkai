/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import "./index.css";

window.onload = () => {
  render(() => <App />, document.getElementById("root")!);
};
