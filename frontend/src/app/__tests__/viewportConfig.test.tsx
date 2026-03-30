import { appViewport } from "../viewportConfig";

describe("appViewport", () => {
  it("uses device-width and scale settings for mobile rendering", () => {
    expect(appViewport).toEqual({
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
    });
  });
});
