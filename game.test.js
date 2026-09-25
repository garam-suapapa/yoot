import test from "node:test";
import assert from "node:assert/strict";
import { createGame, FINISH, movePiece, RESERVE, scoreSticks, takeRoll } from "./game.js";

const DO = [false, true, false, false];
const GAE = [false, true, true, false];
const BACKDO = [true, false, false, false];

test("four sticks include the marked backdo, yut, and mo", () => {
  assert.equal(scoreSticks(BACKDO).steps, -1);
  assert.equal(scoreSticks(DO).steps, 1);
  assert.equal(scoreSticks(GAE).steps, 2);
  assert.equal(scoreSticks([true, true, true, true]).steps, 4);
  assert.equal(scoreSticks([false, false, false, false]).steps, 5);
});

test("a new piece enters the board and the turn changes", () => {
  const game = movePiece(takeRoll(createGame(), GAE), 0);
  assert.equal(game.pieces[0][0].pos, "n2");
  assert.equal(game.currentTeam, 1);
  assert.equal(game.phase, "roll");
});

test("backdo skips an empty team and retraces an entered piece", () => {
  const skipped = takeRoll(createGame(), BACKDO);
  assert.equal(skipped.currentTeam, 1);
  assert.equal(skipped.phase, "roll");

  const game = createGame();
  game.pieces[0][0] = { id: 0, pos: "n2", lane: "outer", history: [{ pos: RESERVE, lane: "outer" }, { pos: "n1", lane: "outer" }] };
  const moved = movePiece(takeRoll(game, BACKDO), 0);
  assert.equal(moved.pieces[0][0].pos, "n1");
});

test("corner shortcut and arrow destinations follow the illustrated board", () => {
  const game = createGame();
  game.pieces[0][0].pos = "n5";
  let moved = movePiece(takeRoll(game, DO), 0, "shortcut");
  assert.equal(moved.pieces[0][0].pos, "a1");

  game.pieces[0][0].pos = "n7";
  moved = movePiece(takeRoll(game, DO), 0);
  assert.equal(moved.pieces[0][0].pos, "b1");

  game.pieces[0][0].pos = "b1";
  game.pieces[0][0].lane = "b";
  moved = movePiece(takeRoll(game, DO), 0);
  assert.equal(moved.pieces[0][0].pos, "n2");

  game.pieces[0][0].pos = "r1";
  game.pieces[0][0].lane = "r";
  moved = movePiece(takeRoll(game, DO), 0);
  assert.equal(moved.pieces[0][0].pos, "n15");
});

test("the center allows a deliberate direction and yut keeps the turn", () => {
  const game = createGame();
  game.pieces[0][0].pos = "c";
  game.pieces[0][0].lane = "a";
  const right = movePiece(takeRoll(game, DO), 0, "right");
  assert.equal(right.pieces[0][0].pos, "r1");

  const extra = movePiece(takeRoll(createGame(), [true, true, true, true]), 0);
  assert.equal(extra.currentTeam, 0);
  assert.equal(extra.phase, "roll");
});

test("stacked pieces move together and capture earns another throw", () => {
  const game = createGame();
  game.pieces[0][0].pos = "n1";
  game.pieces[0][1].pos = "n1";
  game.pieces[1][0].pos = "n2";
  const moved = movePiece(takeRoll(game, DO), 0);
  assert.equal(moved.pieces[0][0].pos, "n2");
  assert.equal(moved.pieces[0][1].pos, "n2");
  assert.equal(moved.pieces[1][0].pos, RESERVE);
  assert.equal(moved.currentTeam, 0);
  assert.equal(moved.phase, "roll");
});

test("the first team to finish four pieces wins", () => {
  const game = createGame();
  for (let i = 0; i < 3; i += 1) game.pieces[0][i].pos = FINISH;
  game.pieces[0][3].pos = "n19";
  const moved = movePiece(takeRoll(game, DO), 3);
  assert.equal(moved.pieces[0][3].pos, FINISH);
  assert.equal(moved.phase, "won");
  assert.equal(moved.winner, 0);
});

test("movement metadata preserves each tile and the arrow jump for animation", () => {
  const first = movePiece(takeRoll(createGame(), GAE), 0);
  assert.deepEqual(first.lastMove.trail, ["n1", "n2"]);
  assert.deepEqual(first.lastMove.pieceIds, [0]);

  const portalGame = createGame();
  portalGame.pieces[0][0].pos = "n7";
  const jumped = movePiece(takeRoll(portalGame, DO), 0);
  assert.deepEqual(jumped.lastMove.trail, ["n8", "b1"]);
  assert.equal(jumped.lastMove.portal, "하늘 지름길");

  const captureGame = createGame();
  captureGame.pieces[0][0].pos = "n1";
  captureGame.pieces[1][0].pos = "n2";
  const captured = movePiece(takeRoll(captureGame, DO), 0);
  assert.equal(captured.lastMove.captured, 1);
  assert.equal(captured.lastMove.extra, true);
});
