export const FINISH = "finish";
export const RESERVE = "reserve";

export const NODES = {
  n1: [86.7, 73.5], n2: [86.7, 58.2], n3: [86.7, 42.7], n4: [86.7, 27.4],
  n5: [86.7, 9.3], n6: [70.3, 9.3], n7: [56.1, 9.3], n8: [42.1, 9.3],
  n9: [28.1, 9.3], n10: [12.7, 9.3], n11: [12.7, 27.4], n12: [12.7, 42.7],
  n13: [12.7, 58.2], n14: [12.7, 73.5], n15: [12.7, 91.2], n16: [28.1, 91.2],
  n17: [42.1, 91.2], n18: [56.1, 91.2], n19: [70.3, 91.2],
  a1: [75.1, 21.8], a2: [67.6, 30.1], a3: [60, 38.2],
  b1: [23.9, 21.8], b2: [31.4, 30.1], b3: [39.1, 38.2],
  c: [49.5, 50.4],
  l1: [39.1, 61.3], l2: [31.4, 69.5], l3: [23.9, 77.8],
  r1: [60, 61.3], r2: [67.6, 69.5], r3: [75.1, 77.8]
};

export const PORTALS = {
  n8: { to: "b1", lane: "b", label: "하늘 지름길" },
  b2: { to: "n2", lane: "outer", label: "되돌이 화살표" },
  r2: { to: "n15", lane: "outer", label: "왼쪽 되돌이" }
};

export const RESULTS = {
  "-1": { name: "빽도", steps: -1 },
  "1": { name: "도", steps: 1 },
  "2": { name: "개", steps: 2 },
  "3": { name: "걸", steps: 3 },
  "4": { name: "윷", steps: 4 },
  "5": { name: "모", steps: 5 }
};

export function createGame() {
  return {
    currentTeam: 0,
    phase: "roll",
    pieces: [0, 1].map(() => Array.from({ length: 4 }, (_, id) => ({ id, pos: RESERVE, lane: "outer", history: [] }))),
    pending: null,
    lastSticks: null,
    winner: null,
    turn: 1,
    message: "첫 번째 팀이 아이패드를 흔들어 윷을 던지세요."
  };
}

export function scoreSticks(sticks) {
  if (!Array.isArray(sticks) || sticks.length !== 4 || sticks.some(value => typeof value !== "boolean")) {
    throw new Error("윷 네 개의 앞뒤 값이 필요합니다.");
  }
  const backs = sticks.filter(Boolean).length;
  if (backs === 0) return RESULTS[5];
  if (backs === 4) return RESULTS[4];
  if (backs === 1 && sticks[0]) return RESULTS[-1];
  return RESULTS[backs];
}

export function movablePieces(state) {
  if (state.phase !== "select") return [];
  return state.pieces[state.currentTeam].filter(piece =>
    piece.pos !== FINISH && (state.pending.steps !== -1 || piece.pos !== RESERVE)
  );
}

export function routeChoices(piece) {
  if (piece.pos === "n5" || piece.pos === "n10") return ["outer", "shortcut"];
  if (piece.pos === "c") return ["left", "right"];
  return [];
}

function nextPosition(piece, choice, first) {
  const pos = piece.pos;
  if (pos === RESERVE) return ["n1", "outer"];
  if (pos === "n5" && first && choice === "shortcut") return ["a1", "a"];
  if (pos === "n10" && first && choice === "shortcut") return ["b1", "b"];
  if (pos === "c") {
    const goRight = first && choice ? choice === "right" : piece.lane === "b" || piece.lane === "r";
    return goRight ? ["r1", "r"] : ["l1", "l"];
  }
  const diagonal = { a1: "a2", a2: "a3", a3: "c", b1: "b2", b2: "b3", b3: "c",
    l1: "l2", l2: "l3", l3: "n15", r1: "r2", r2: "r3", r3: FINISH };
  if (diagonal[pos]) return [diagonal[pos], pos === "l3" ? "outer" : piece.lane];
  const index = Number(pos.slice(1));
  if (Number.isInteger(index) && pos === `n${index}` && index >= 1 && index <= 19) {
    return [index === 19 ? FINISH : `n${index + 1}`, "outer"];
  }
  throw new Error(`알 수 없는 칸: ${pos}`);
}

function cloneGame(state) {
  return {
    ...state,
    pieces: state.pieces.map(team => team.map(piece => ({ ...piece, history: piece.history.map(step => ({ ...step })) })))
  };
}

export function takeRoll(state, sticks) {
  if (state.phase !== "roll") throw new Error("지금은 윷을 던질 차례가 아닙니다.");
  const next = cloneGame(state);
  next.pending = scoreSticks(sticks);
  next.lastSticks = [...sticks];
  next.phase = "select";
  next.message = `${next.pending.name}! 이동할 말을 선택하세요.`;
  if (movablePieces(next).length === 0) {
    next.message = "빽도! 움직일 말이 없어 차례가 넘어갑니다.";
    next.pending = null;
    next.currentTeam = 1 - next.currentTeam;
    next.turn += 1;
    next.phase = "roll";
  }
  return next;
}

export function movePiece(state, pieceId, choice = null) {
  if (state.phase !== "select") throw new Error("먼저 윷을 던져야 합니다.");
  if (!movablePieces(state).some(piece => piece.id === pieceId)) throw new Error("이 말은 이동할 수 없습니다.");
  const next = cloneGame(state);
  const team = next.pieces[next.currentTeam];
  const piece = team[pieceId];
  const choices = routeChoices(piece);
  if (choices.length && next.pending.steps > 0 && !choices.includes(choice)) throw new Error("갈림길 방향을 선택하세요.");
  const moving = piece.pos === RESERVE ? [piece] : team.filter(member => member.pos === piece.pos);
  const steps = next.pending.steps;
  let portalLabel = "";
  if (steps === -1) {
    const previous = piece.history.pop();
    if (!previous) throw new Error("빽도로 돌아갈 칸이 없습니다.");
    piece.pos = previous.pos;
    piece.lane = previous.lane;
  } else {
    for (let i = 0; i < steps && piece.pos !== FINISH; i += 1) {
      const before = { pos: piece.pos, lane: piece.lane };
      const [pos, lane] = nextPosition(piece, choice, i === 0);
      piece.history.push(before);
      piece.pos = pos;
      piece.lane = lane;
    }
    const portal = PORTALS[piece.pos];
    if (portal) {
      piece.history.push({ pos: piece.pos, lane: piece.lane });
      piece.pos = portal.to;
      piece.lane = portal.lane;
      portalLabel = portal.label;
    }
  }
  for (const member of moving) {
    member.pos = piece.pos;
    member.lane = piece.lane;
    member.history = piece.history.map(step => ({ ...step }));
  }

  let captured = 0;
  if (piece.pos !== RESERVE && piece.pos !== FINISH) {
    const rivals = next.pieces[1 - next.currentTeam].filter(member => member.pos === piece.pos);
    captured = rivals.length;
    for (const rival of rivals) {
      rival.pos = RESERVE;
      rival.lane = "outer";
      rival.history = [];
    }
    for (const ally of team.filter(member => member.pos === piece.pos)) {
      ally.lane = piece.lane;
      ally.history = piece.history.map(step => ({ ...step }));
    }
  }

  const finished = team.every(member => member.pos === FINISH);
  const extra = steps >= 4 || captured > 0;
  next.pending = null;
  if (finished) {
    next.phase = "won";
    next.winner = next.currentTeam;
    next.message = `${next.currentTeam + 1}팀 승리! 네 말이 모두 도착했습니다.`;
  } else if (extra) {
    next.phase = "roll";
    next.message = captured ? `${captured}개 말을 잡았습니다! 한 번 더 던지세요.` : "윷 또는 모! 한 번 더 던지세요.";
  } else {
    next.phase = "roll";
    next.currentTeam = 1 - next.currentTeam;
    next.turn += 1;
    next.message = "다음 팀 차례입니다. 아이패드를 흔들어 주세요.";
  }
  if (portalLabel && !finished) next.message = `${portalLabel} 발동! ${next.message}`;
  return next;
}
