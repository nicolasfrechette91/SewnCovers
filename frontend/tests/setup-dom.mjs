import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://example.test/configure/",
});

for (const [name, value] of Object.entries({
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  navigator: dom.window.navigator,
  self: dom.window,
  window: dom.window,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });
}

Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: (callback) => {
    callback(0);
    return 1;
  },
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});
