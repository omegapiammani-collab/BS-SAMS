import assert from "node:assert/strict";
// Inspect rendered styles against their actual opaque ancestor background.
export async function assertReadable(page, expectations) {
  for (const { selector } of expectations)
    await page.locator(selector).first().waitFor({ state: "visible" });
  const readings = await page.evaluate((items) => {
    const channels = (color) => color.match(/[\d.]+/g).map(Number);
    const luminance = (color) => {
      const rgb = channels(color)
        .slice(0, 3)
        .map((value) => {
          const n = value / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    return items.map(({ selector, minimum }) => {
      const el = [...document.querySelectorAll(selector)].find(
        (node) =>
          node.getBoundingClientRect().width &&
          node.getBoundingClientRect().height,
      );
      if (!el) return { selector, missing: true };
      const style = getComputedStyle(el);
      let background = "rgb(255, 255, 255)";
      for (let node = el; node; node = node.parentElement) {
        const candidate = getComputedStyle(node).backgroundColor;
        const components = channels(candidate);
        if (components.length === 3 || components[3] === 1) {
          background = candidate;
          break;
        }
      }
      const foregroundLuminance = luminance(style.color),
        backgroundLuminance = luminance(background);
      return {
        selector,
        minimum,
        size: parseFloat(style.fontSize),
        contrast:
          (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
      };
    });
  }, expectations);
  for (const reading of readings) {
    assert.equal(
      reading.missing,
      undefined,
      `Missing readability target: ${reading.selector}`,
    );
    assert.ok(
      reading.size >= reading.minimum,
      `${reading.selector}: ${reading.size}px < ${reading.minimum}px`,
    );
    assert.ok(
      reading.contrast >= 4.5,
      `${reading.selector}: contrast ${reading.contrast.toFixed(2)} < 4.5`,
    );
  }
  return readings;
}
