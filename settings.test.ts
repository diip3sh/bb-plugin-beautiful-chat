// node --experimental-strip-types --test settings.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { rootAttributes } from "./settings.ts";

test("defaults: drive loader, surface chips, nothing turned off", () => {
  assert.deepEqual(rootAttributes({}), { loader: "drive", chips: "surface", composer: "default", off: [] });
});

test("turned-off toggles become CSS tokens; unknown values fall back", () => {
  assert.deepEqual(
    rootAttributes({ loader: "orbit", toolChips: "plain", shimmer: false, streamingCaret: false, promptBar: true }),
    { loader: "orbit", chips: "plain", composer: "default", off: ["shimmer", "caret"] },
  );
  assert.deepEqual(rootAttributes({ loader: "surfer", toolChips: 3, workRows: "no" }), { loader: "drive", chips: "surface", composer: "default", off: [] });
});

test("composer style: tray when chosen, default otherwise", () => {
  assert.equal(rootAttributes({ composer: "tray" }).composer, "tray");
  assert.equal(rootAttributes({}).composer, "default");
  assert.equal(rootAttributes({ composer: "bogus" }).composer, "default");
});
