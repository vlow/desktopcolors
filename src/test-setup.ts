import "@testing-library/jest-dom";

// jsdom does not implement matchMedia. Provide a default (desktop: never
// matches) so components using media queries render deterministically. A test
// can override window.matchMedia before render to simulate a narrow viewport.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
