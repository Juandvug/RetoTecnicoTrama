// Setup del proyecto jsdom de Vitest: matchers de jest-dom y limpieza entre
// tests (sin globals, Testing Library no la registra sola).
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
