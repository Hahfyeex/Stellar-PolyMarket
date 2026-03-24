// Setup file for Firestore security rules tests
// This file runs before each test suite

// Set test timeout to 10 seconds (Firestore emulator can be slow)
jest.setTimeout(10000);

// Suppress console warnings during tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args) => {
    const message = args[0];
    if (
      typeof message === "string" &&
      (message.includes("Firestore") || message.includes("emulator"))
    ) {
      return;
    }
    originalWarn(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
});
