import { expect, test } from "@playwright/test";

const DEVICE_WIDTHS = [375, 360];

for (const width of DEVICE_WIDTHS) {
  test(`home page has viewport meta and no horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveCount(1);
    await expect(viewportMeta).toHaveAttribute("content", /width=device-width/);
    await expect(viewportMeta).toHaveAttribute("content", /initial-scale=1/);

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth;
    });

    expect(hasHorizontalOverflow).toBe(false);
  });
}
