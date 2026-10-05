import { render } from "preact";
import { devtoolsSource } from "./sources/devtools";
import { harSource } from "./sources/har-file";
import type { Source } from "./sources/source";
import { RequestStore } from "./store";
import { App } from "./ui/App";
import { followDevtoolsTheme } from "./ui/theme";

/** DevTools when running as the extension panel; sample data when running in a normal tab during development. */
async function pickSource(): Promise<Source> {
  if (globalThis.chrome?.devtools?.network) return devtoolsSource();
  if (import.meta.env.DEV) return (await import("./sources/dev-samples")).devSamplesSource();
  return harSource([]);
}

async function main() {
  followDevtoolsTheme();
  const store = new RequestStore();
  (await pickSource()).start(store);
  const app = document.getElementById("app");
  if (app) render(<App store={store} />, app);
}

void main();
