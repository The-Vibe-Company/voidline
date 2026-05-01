import { createNoopCanvas } from "./canvas-stub";
import { readFileSync } from "node:fs";
import { beforeEach } from "vitest";
import { initSync } from "../generated/voidline-wasm/voidline_wasm.js";

const stubCanvas = createNoopCanvas();

function createStubElement(): HTMLElement {
  const dataset: Record<string, string> = {};
  const classList = {
    add: () => {},
    remove: () => {},
    toggle: () => false,
    contains: () => false,
  };
  const style = new Proxy(
    {},
    {
      get: () => "",
      set: () => true,
    },
  ) as CSSStyleDeclaration;
  const element: Record<string, unknown> = {
    dataset,
    classList,
    style,
    children: [],
    childNodes: [],
    textContent: "",
    innerHTML: "",
    isConnected: false,
    offsetWidth: 0,
    offsetHeight: 0,
    appendChild: (child: unknown) => child,
    removeChild: (child: unknown) => child,
    remove: () => {},
    setAttribute: () => {},
    removeAttribute: () => {},
    toggleAttribute: () => false,
    addEventListener: () => {},
    removeEventListener: () => {},
    contains: () => false,
    focus: () => {},
    blur: () => {},
    click: () => {},
    getClientRects: () => [],
    querySelector: () => createStubElement(),
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
  };
  return element as unknown as HTMLElement;
}

if (typeof globalThis.document === "undefined") {
  const stubDocument: Record<string, unknown> = {
    querySelector: (selector: string) =>
      selector === "#gameCanvas" ? stubCanvas : createStubElement(),
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    getElementById: () => createStubElement(),
    createElement: (tagName: string) =>
      tagName.toLowerCase() === "canvas" ? stubCanvas : createStubElement(),
    createTextNode: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: createStubElement(),
    activeElement: null,
  };
  (globalThis as unknown as { document: Document }).document = stubDocument as unknown as Document;
}

if (typeof globalThis.window === "undefined") {
  const stubWindow: Record<string, unknown> = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    location: { search: "" },
    devicePixelRatio: 1,
  };
  (globalThis as unknown as { window: Window }).window = stubWindow as unknown as Window;
}

if (typeof globalThis.HTMLElement === "undefined") {
  class StubHTMLElement {}
  (globalThis as unknown as { HTMLElement: typeof StubHTMLElement }).HTMLElement = StubHTMLElement;
}
if (typeof globalThis.HTMLButtonElement === "undefined") {
  class StubHTMLButtonElement {}
  (globalThis as unknown as { HTMLButtonElement: typeof StubHTMLButtonElement }).HTMLButtonElement =
    StubHTMLButtonElement;
}
if (typeof globalThis.requestAnimationFrame === "undefined") {
  (globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame =
    () => 0;
}

initSync({
  module: readFileSync(new URL("../generated/voidline-wasm/voidline_wasm_bg.wasm", import.meta.url)),
});

const isDataExport = process.env.RUN_DATA_EXPORT === "1" || process.env.CHECK_DATA_EXPORT === "1";

if (!isDataExport) {
const [{ initializeRustSimulationEngine }, { createSimulation }, { initializeAccountProgress }, { initializeRelicUnlocks }] =
  await Promise.all([
    import("../simulation/rust-engine"),
    import("../simulation/simulation"),
    import("../systems/account"),
    import("../systems/relics"),
  ]);
await initializeRustSimulationEngine();

beforeEach(() => {
  initializeAccountProgress(null);
  initializeRelicUnlocks(null);
  createSimulation({ seed: 0 });
});
}
