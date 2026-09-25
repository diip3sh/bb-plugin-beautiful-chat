// node --experimental-strip-types --test app-css.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");
const bundledCss = readFileSync(new URL("./dist/app.css", import.meta.url), "utf8");

test("prompt styling leaves BB's mobile composer footer and layout in charge", () => {
  assert.match(css, /\[data-app-composer\] form\[data-promptbox\]\s*\{[^}]*box-shadow:\s*var\(--bui-shadow-soft\)/);
  assert.match(css, /\[data-promptbox\] \[data-promptbox-submit-action\]\s*\{/);
  for (const selector of [
    /\[data-follow-up-composer-(?:footer|anchor)\]/,
    /\[data-promptbox-project-control\]/,
    /\[data-promptbox-(?:full|compact)-label\]/,
  ]) {
    assert.equal(selector.test(css), false, `Unexpected mobile footer selector: ${selector}`);
  }
});

test("shipped CSS keeps the native footer behavior", () => {
  assert.match(bundledCss, /\[data-app-composer\] form\[data-promptbox\]/);
  assert.equal(bundledCss.includes("[data-follow-up-composer-footer]"), false);
  assert.equal(bundledCss.includes("[data-promptbox-project-control]"), false);
});
