import { createNoopCanvas } from "./canvas-stub";

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
    createElement: () => createStubElement(),
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
