import "@testing-library/jest-dom/vitest";

// jsdom lacks the layout APIs Radix menus, selects and popovers touch.
if (typeof Element !== "undefined") {
  const noop = () => undefined;
  globalThis.ResizeObserver ??= class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
  Element.prototype.scrollIntoView ??= noop;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= noop;
}
