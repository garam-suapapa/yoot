import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NODES } from "./game.js";

test("vector board has a matching circle for every playable position", () => {
  const svg = readFileSync(new URL("./assets/board.svg", import.meta.url), "utf8");
  assert.match(svg, /viewBox="0 0 527 483"/);
  for (const [id, [percentX, percentY]] of Object.entries(NODES)) {
    const group = svg.match(new RegExp('<g data-node="' + id + '"><circle[^>]* cx="([0-9.]+)" cy="([0-9.]+)"'));
    assert.ok(group, "missing board position " + id);
    assert.ok(Math.abs(Number(group[1]) - percentX * 527 / 100) < 0.11, id + " x differs");
    assert.ok(Math.abs(Number(group[2]) - percentY * 483 / 100) < 0.11, id + " y differs");
  }
});
