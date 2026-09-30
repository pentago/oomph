import { render } from "preact";
import { App } from "./App";
import { initTheme } from "./theme";

initTheme();
render(<App />, document.getElementById("app") as HTMLElement);
