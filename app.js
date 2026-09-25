import { createGame, movePiece, movablePieces, NODES, PORTALS, RESERVE, FINISH, routeChoices, scoreSticks, takeRoll } from "./game.js";
import { unlockAudio, setSoundEnabled, isSoundEnabled, playThrow, playStep, playPortal, playCaptureBonus } from "./sound.js";

const $ = id => document.getElementById(id);
const teamColors = ["#e44280", "#168c87"];
const teams = [
  { name: "분홍팀", photos: [null, null, null, null] },
  { name: "청록팀", photos: [null, null, null, null] }
];
const selectedPhoto = [0, 0];
let game = null;
let selectedPieceId = null;
let cameraStream = null;
let cameraTeam = null;
let cameraPiece = null;
let rolling = false;
let moving = false;
let resultHold = false;
let rolledTeam = 0;
let motionEnabled = false;
let lastShakePeak = 0;
let lastMotionValue = 0;
let lastThrowAt = 0;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function setNotice(message, error = false) {
  $("setupNotice").textContent = message;
  $("setupNotice").classList.toggle("error", error);
}

function refreshSetup() {
  teams.forEach((team, teamIndex) => {
    const grid = $("photos" + teamIndex);
    grid.replaceChildren();
    team.photos.forEach((photo, pieceIndex) => {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "photo-slot";
      slot.classList.toggle("selected", selectedPhoto[teamIndex] === pieceIndex);
      slot.classList.toggle("ready", Boolean(photo));
      slot.setAttribute("aria-label", team.name + " " + (pieceIndex + 1) + "번 말 사진 " + (photo ? "완료" : "필요"));
      if (photo) {
        const image = document.createElement("img");
        image.src = photo;
        image.alt = "";
        slot.append(image);
      } else {
        const number = document.createElement("span");
        number.textContent = pieceIndex + 1;
        slot.append(number);
      }
      const badge = document.createElement("small");
      badge.textContent = pieceIndex + 1;
      slot.append(badge);
      slot.addEventListener("click", () => {
        selectedPhoto[teamIndex] = pieceIndex;
        refreshSetup();
      });
      grid.append(slot);
    });
    $("selectedLabel" + teamIndex).textContent = (selectedPhoto[teamIndex] + 1) + "번 말 사진" + (team.photos[selectedPhoto[teamIndex]] ? " 다시 찍기" : " 찍기");
  });
  const count = teams.flatMap(team => team.photos).filter(Boolean).length;
  $("photoCount").textContent = count + " / 8장";
  $("startBtn").disabled = count !== 8;
  $("startText").textContent = count === 8 ? "게임 시작하기" : "사진 " + count + "/8장 준비";
  if (count === 8) setNotice("여덟 말의 사진이 모두 준비됐어요!");
  else setNotice("각 팀 말 4개에 서로 다른 사진을 넣어 주세요.");
}

function advancePhoto(teamIndex) {
  const next = teams[teamIndex].photos.findIndex(photo => !photo);
  if (next !== -1) selectedPhoto[teamIndex] = next;
}

function squarePhoto(source, width, height, mirror = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 360;
  const context = canvas.getContext("2d");
  const side = Math.min(width, height);
  if (mirror) { context.translate(360, 0); context.scale(-1, 1); }
  context.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 360, 360);
  return canvas.toDataURL("image/jpeg", 0.86);
}

async function loadPhotoFile(teamIndex, file) {
  const pieceIndex = selectedPhoto[teamIndex];
  $("file" + teamIndex).removeAttribute("capture");
  if (!file || !file.type.startsWith("image/")) {
    if (file) setNotice("이미지 파일을 선택해 주세요.", true);
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    teams[teamIndex].photos[pieceIndex] = squarePhoto(image, image.naturalWidth, image.naturalHeight);
    advancePhoto(teamIndex);
    refreshSetup();
  } catch {
    setNotice("사진을 읽지 못했습니다. 다른 사진을 선택해 주세요.", true);
  } finally {
    URL.revokeObjectURL(url);
    $("file" + teamIndex).value = "";
  }
}

async function openCamera(teamIndex) {
  cameraTeam = teamIndex;
  cameraPiece = selectedPhoto[teamIndex];
  $("cameraTitle").textContent = teams[teamIndex].name + " · " + (cameraPiece + 1) + "번 말 사진";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $("file" + teamIndex).setAttribute("capture", "user");
    $("file" + teamIndex).click();
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }
    });
    $("cameraVideo").srcObject = cameraStream;
    $("cameraModal").hidden = false;
    await $("cameraVideo").play();
  } catch {
    closeCamera();
    setNotice("카메라 접근이 안 됩니다. 사진 선택에서 촬영하거나 사진을 골라 주세요.", true);
  }
}

function closeCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  $("cameraVideo").srcObject = null;
  $("cameraModal").hidden = true;
}

function capturePhoto() {
  const video = $("cameraVideo");
  if (cameraTeam === null || cameraPiece === null || !video.videoWidth) return;
  teams[cameraTeam].photos[cameraPiece] = squarePhoto(video, video.videoWidth, video.videoHeight, true);
  const teamIndex = cameraTeam;
  closeCamera();
  advancePhoto(teamIndex);
  refreshSetup();
}

function startGame() {
  if (teams.some(team => team.photos.some(photo => !photo))) return;
  teams.forEach((team, index) => {
    team.name = $("name" + index).value.trim() || (index ? "청록팀" : "분홍팀");
  });
  unlockAudio();
  game = createGame();
  selectedPieceId = null;
  resultHold = false;
  document.body.classList.add("playing");
  $("setupScreen").hidden = true;
  $("gameScreen").hidden = false;
  $("newGameBtn").hidden = false;
  $("winnerModal").hidden = true;
  render();
  requestAnimationFrame(sizeBoard);
  window.scrollTo(0, 0);
}

function resetGame(keepPhotos) {
  if (moving || rolling) return;
  $("winnerModal").hidden = true;
  resultHold = false;
  if (keepPhotos) {
    game = createGame();
    selectedPieceId = null;
    render();
    return;
  }
  game = null;
  teams.forEach((team, index) => {
    team.photos = [null, null, null, null];
    selectedPhoto[index] = 0;
    $("file" + index).value = "";
  });
  document.body.classList.remove("playing");
  $("gameScreen").hidden = true;
  $("setupScreen").hidden = false;
  $("newGameBtn").hidden = true;
  refreshSetup();
  window.scrollTo(0, 0);
}

function groupedPieces(teamIndex) {
  const groups = new Map();
  for (const piece of game.pieces[teamIndex]) {
    if (piece.pos === RESERVE || piece.pos === FINISH) continue;
    if (!groups.has(piece.pos)) groups.set(piece.pos, []);
    groups.get(piece.pos).push(piece);
  }
  return [...groups.values()];
}

function photo(teamIndex, pieceId = 0) {
  return teams[teamIndex].photos[pieceId];
}

function makeAvatar(className, teamIndex, pieceId = 0) {
  const element = document.createElement("div");
  element.className = className;
  element.style.setProperty("--piece-color", teamColors[teamIndex]);
  element.style.backgroundImage = 'url("' + photo(teamIndex, pieceId) + '")';
  return element;
}

function sizeBoard() {
  const frame = document.querySelector(".board-frame");
  const board = $("board");
  if (!frame || frame.clientWidth === 0 || frame.clientHeight === 0) return;
  const style = getComputedStyle(frame);
  const width = frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = frame.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.max(0, Math.min(width / 527, height / 483));
  board.style.width = Math.floor(527 * scale) + "px";
  board.style.height = Math.floor(483 * scale) + "px";
}

function renderBoard() {
  const layer = $("boardPieces");
  layer.replaceChildren();
  for (let teamIndex = 0; teamIndex < 2; teamIndex += 1) {
    for (const group of groupedPieces(teamIndex)) {
      const position = NODES[group[0].pos];
      if (!position) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "board-piece";
      button.classList.toggle("goal-gate", group[0].pos === "n0");
      button.dataset.team = teamIndex;
      button.dataset.pos = group[0].pos;
      button.style.left = position[0] + "%";
      button.style.top = position[1] + "%";
      button.style.setProperty("--piece-color", teamColors[teamIndex]);
      button.setAttribute("aria-label", teams[teamIndex].name + " 말 " + group.map(piece => piece.id + 1).join(", ") + "번" + (group[0].pos === "n0" ? ", 한 칸이면 도착" : ""));
      const canSelect = game.phase === "select" && teamIndex === game.currentTeam && !moving && !resultHold;
      button.disabled = !canSelect;
      if (canSelect) button.classList.add("movable");
      const image = document.createElement("img");
      image.src = photo(teamIndex, group[0].id);
      image.alt = "";
      button.append(image);
      if (group.length > 1) {
        const badge = document.createElement("span");
        badge.className = "count-badge";
        badge.textContent = group.length;
        button.append(badge);
      }
      if (canSelect) button.addEventListener("click", () => selectPiece(group[0].id));
      layer.append(button);
    }
  }
}

function renderMarkers() {
  const layer = $("portalMarkers");
  layer.replaceChildren();
  for (const [node, portal] of Object.entries(PORTALS)) {
    const marker = document.createElement("span");
    marker.className = "portal-marker " + (node === "n8" ? "shortcut" : "return");
    marker.style.left = NODES[node][0] + "%";
    marker.style.top = NODES[node][1] + "%";
    marker.title = portal.label + ": 이 칸에 도착하면 화살표 끝으로 이동";
    layer.append(marker);
  }
}

function renderSticks() {
  [...$("stickTray").children].forEach((stick, index) => {
    stick.classList.toggle("back", Boolean(resultHold && game.lastSticks && game.lastSticks[index]));
    stick.classList.toggle("marked", index === 0);
  });
  const result = $("rollResult");
  result.replaceChildren();
  if (resultHold && game.lastSticks) {
    const strong = document.createElement("strong");
    strong.textContent = scoreSticks(game.lastSticks).name;
    result.append(strong);
  } else result.textContent = "아이패드를 흔들거나 버튼을 눌러 주세요";
}

function renderPhase() {
  const phase = moving ? "move" : game.phase === "won" ? "won" : resultHold ? "result" : game.phase === "select" ? "select" : "roll";
  $("gameScreen").dataset.step = phase;
  $("throwStage").hidden = phase !== "roll" && phase !== "result";
  $("rollPhase").hidden = phase !== "roll" && phase !== "result";
  $("selectPhase").hidden = phase !== "select";
  $("movingPhase").hidden = phase !== "move";
  $("stepRoll").classList.toggle("active", phase === "roll" || phase === "result");
  $("stepSelect").classList.toggle("active", phase === "select");
  $("stepMove").classList.toggle("active", phase === "move");
  $("gameMessage").textContent = moving ? "말이 한 칸씩 이동하고 있어요." : game.message;
  $("rollBtn").hidden = phase !== "roll";
  $("rollBtn").disabled = phase !== "roll" || rolling;
  $("continueBtn").hidden = phase !== "result";
  $("continueBtn").textContent = game.phase === "select" ? "말 고르기 →" : "다음 팀 던지기 →";
  $("throwTeamLabel").textContent = teams[phase === "result" ? rolledTeam : game.currentTeam].name + " 차례";
  $("throwTitle").textContent = phase === "result" ? "윷 결과" : "윷을 던져요";
}

function renderSelection() {
  const list = $("candidateList");
  list.replaceChildren();
  const panel = $("routePanel");
  panel.replaceChildren();
  panel.hidden = selectedPieceId === null;
  list.hidden = selectedPieceId !== null;
  if (game.phase !== "select") return;
  $("moveResult").textContent = game.pending.name;
  $("movePrompt").textContent = game.pending.steps === -1 ? "한 칸 뒤로 갈 말을 고르세요" : game.pending.steps + "칸 움직일 말을 고르세요";
  if (selectedPieceId === null) {
    for (const piece of movablePieces(game)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "candidate-button";
      const image = document.createElement("img");
      image.src = photo(game.currentTeam, piece.id);
      image.alt = "";
      button.append(image);
      const label = document.createElement("span");
      label.textContent = (piece.id + 1) + "번 말";
      const status = document.createElement("small");
      status.textContent = piece.pos === RESERVE ? "새로 내보내기" : piece.pos === "n0" ? "한 칸이면 도착" : "말판에서 이동";
      label.append(status);
      button.append(label);
      button.addEventListener("click", () => selectPiece(piece.id));
      list.append(button);
    }
    return;
  }
  const piece = game.pieces[game.currentTeam][selectedPieceId];
  const prompt = document.createElement("p");
  prompt.textContent = (piece.id + 1) + "번 말 · " + (piece.pos === "c" ? "중앙에서 어느 쪽으로 갈까요?" : "모서리에서 어느 길로 갈까요?");
  panel.append(prompt);
  const options = document.createElement("div");
  options.className = "route-options";
  for (const choice of routeChoices(piece)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = { outer: "바깥길", shortcut: "대각선 지름길", left: "왼쪽 아래", right: "오른쪽 아래" }[choice];
    button.addEventListener("click", () => completeMove(piece.id, choice));
    options.append(button);
  }
  panel.append(options);
  const back = document.createElement("button");
  back.type = "button";
  back.className = "route-back";
  back.textContent = "다른 말 고르기";
  back.addEventListener("click", () => { selectedPieceId = null; renderSelection(); });
  panel.append(back);
}

function selectPiece(pieceId) {
  if (!game || game.phase !== "select" || moving || resultHold) return;
  const piece = game.pieces[game.currentTeam][pieceId];
  if (!movablePieces(game).some(candidate => candidate.id === pieceId)) return;
  if (game.pending.steps > 0 && routeChoices(piece).length) {
    selectedPieceId = pieceId;
    renderSelection();
  } else completeMove(pieceId);
}

async function animateMove(move) {
  const layer = $("boardPieces");
  const existing = [...layer.querySelectorAll(".board-piece")].find(element => Number(element.dataset.team) === move.team && element.dataset.pos === move.from);
  const token = existing ? existing.cloneNode(true) : document.createElement("button");
  if (existing) existing.style.visibility = "hidden";
  else {
    token.type = "button";
    token.className = "board-piece";
    token.style.setProperty("--piece-color", teamColors[move.team]);
    const image = document.createElement("img");
    image.src = photo(move.team, move.pieceIds[0]);
    image.alt = "";
    token.append(image);
    token.style.left = "86.7%";
    token.style.top = "91.2%";
  }
  token.disabled = true;
  token.classList.remove("movable");
  token.classList.add("traveling");
  layer.append(token);
  await new Promise(resolve => requestAnimationFrame(resolve));
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (let index = 0; index < move.trail.length; index += 1) {
    const node = move.trail[index];
    const [x, y] = NODES[node] || [86.7, 91.2];
    token.style.left = x + "%";
    token.style.top = y + "%";
    $("movingCount").textContent = (index + 1) + " / " + move.trail.length + "칸";
    await wait(reduced ? 45 : 290);
    if (move.portal && index === move.trail.length - 1) playPortal();
    else playStep(index);
  }
  if (move.captured > 0) {
    $("gameMessage").textContent = "상대 말을 잡았어요!";
    playCaptureBonus();
    await wait(reduced ? 180 : 550);
  }
}

async function completeMove(pieceId, choice = null) {
  if (moving || resultHold) return;
  try {
    const next = movePiece(game, pieceId, choice);
    moving = true;
    renderPhase();
    await animateMove(next.lastMove);
    game = next;
    moving = false;
    selectedPieceId = null;
    render();
    if (game.phase === "won") $("winnerModal").hidden = false;
  } catch (error) {
    moving = false;
    selectedPieceId = null;
    if (game) game.message = error.message;
    render();
  }
}

function renderScore() {
  const container = $("scoreRows");
  container.replaceChildren();
  teams.forEach((team, index) => {
    const finished = game.pieces[index].filter(piece => piece.pos === FINISH).length;
    const row = document.createElement("div");
    row.className = "score-row";
    row.style.setProperty("--piece-color", teamColors[index]);
    row.append(makeAvatar("score-avatar", index));
    const name = document.createElement("span");
    name.className = "score-name";
    name.textContent = team.name;
    row.append(name);
    const progress = document.createElement("span");
    progress.className = "score-progress";
    progress.textContent = finished + "/4";
    row.append(progress);
    const pieces = document.createElement("div");
    pieces.className = "score-pieces";
    game.pieces[index].forEach(piece => {
      const token = document.createElement("button");
      token.type = "button";
      token.className = "score-piece";
      token.classList.toggle("finished", piece.pos === FINISH);
      token.style.backgroundImage = 'url("' + photo(index, piece.id) + '")';
      token.setAttribute("aria-label", team.name + " " + (piece.id + 1) + "번 말: " + (piece.pos === FINISH ? "도착" : piece.pos === RESERVE ? "대기" : piece.pos === "n0" ? "한 칸이면 도착" : "이동 중"));
      const canSelect = game.phase === "select" && index === game.currentTeam && piece.pos === RESERVE && game.pending.steps > 0 && !moving && !resultHold;
      token.disabled = !canSelect;
      if (canSelect) token.addEventListener("click", () => selectPiece(piece.id));
      pieces.append(token);
    });
    row.append(pieces);
    container.append(row);
  });
}

function render() {
  if (!game) return;
  $("turnNumber").textContent = String(game.turn).padStart(2, "0");
  $("currentTeamName").textContent = teams[game.currentTeam].name;
  $("currentAvatar").style.backgroundImage = 'url("' + photo(game.currentTeam) + '")';
  $("currentAvatar").style.borderColor = teamColors[game.currentTeam];
  renderSticks();
  renderPhase();
  renderSelection();
  renderBoard();
  renderScore();
  if (game.phase === "won") $("winnerTitle").textContent = teams[game.winner].name + " 승리!";
}

function randomSticks() {
  const bytes = new Uint8Array(4);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 4; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(value => value % 2 === 0);
}

async function throwYut() {
  if (!game || game.phase !== "roll" || rolling || moving || resultHold) return;
  rolling = true;
  rolledTeam = game.currentTeam;
  lastThrowAt = Date.now();
  playThrow();
  $("rollBtn").disabled = true;
  $("throwStage").classList.add("is-throwing");
  $("rollResult").textContent = "윷이 날아갑니다…";
  await wait(1100);
  game = takeRoll(game, randomSticks());
  resultHold = true;
  rolling = false;
  $("throwStage").classList.remove("is-throwing");
  selectedPieceId = null;
  render();
}

function onMotion(event) {
  if (!game || game.phase !== "roll" || rolling || moving || resultHold) return;
  const acceleration = event.acceleration;
  const value = acceleration && acceleration.x != null
    ? Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0)
    : Math.abs(Math.hypot(event.accelerationIncludingGravity?.x || 0, event.accelerationIncludingGravity?.y || 0, event.accelerationIncludingGravity?.z || 0) - 9.8);
  const now = Date.now();
  if (now - lastThrowAt < 1800 || value < 12 || lastMotionValue >= 12) { lastMotionValue = value; return; }
  if (now - lastShakePeak > 120 && now - lastShakePeak < 900) {
    lastShakePeak = 0;
    throwYut();
  } else lastShakePeak = now;
  lastMotionValue = value;
}

async function enableMotion() {
  if (motionEnabled) return;
  if (!("DeviceMotionEvent" in window)) {
    $("motionStatus").textContent = "이 기기에는 흔들기 센서가 없습니다. 버튼으로 던져 주세요.";
    return;
  }
  try {
    let permission = "granted";
    if (typeof DeviceMotionEvent.requestPermission === "function") permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") throw new Error("permission denied");
    window.addEventListener("devicemotion", onMotion);
    motionEnabled = true;
    $("motionBtn").classList.add("active");
    $("motionBtn").textContent = "흔들기 센서 켜짐 ✓";
    $("motionStatus").textContent = "아이패드를 짧게 두 번 흔들면 윷을 던집니다.";
    unlockAudio();
  } catch {
    $("motionStatus").textContent = "흔들기 권한을 받지 못했습니다. 버튼으로 던져 주세요.";
  }
}

function toggleSound() {
  setSoundEnabled(!isSoundEnabled());
  const enabled = isSoundEnabled();
  $("soundBtn").textContent = enabled ? "♪" : "×";
  $("soundBtn").classList.toggle("muted", !enabled);
  $("soundBtn").setAttribute("aria-pressed", String(enabled));
  $("soundBtn").setAttribute("aria-label", enabled ? "소리 끄기" : "소리 켜기");
}

document.querySelectorAll("[data-camera]").forEach(button => button.addEventListener("click", () => openCamera(Number(button.dataset.camera))));
document.querySelectorAll("[data-upload]").forEach(button => button.addEventListener("click", () => {
  const input = $("file" + button.dataset.upload);
  input.removeAttribute("capture");
  input.click();
}));
[0, 1].forEach(index => {
  $("file" + index).addEventListener("change", event => loadPhotoFile(index, event.target.files && event.target.files[0]));
  $("name" + index).addEventListener("input", event => { teams[index].name = event.target.value.trim() || (index ? "청록팀" : "분홍팀"); });
});
$("startBtn").addEventListener("click", startGame);
$("closeCameraBtn").addEventListener("click", closeCamera);
$("captureBtn").addEventListener("click", capturePhoto);
$("rollBtn").addEventListener("click", throwYut);
$("continueBtn").addEventListener("click", () => { if (!resultHold) return; resultHold = false; render(); });
$("motionBtn").addEventListener("click", enableMotion);
$("soundBtn").addEventListener("click", toggleSound);
$("playAgainBtn").addEventListener("click", () => resetGame(true));
$("newPhotosBtn").addEventListener("click", () => resetGame(false));
$("newGameBtn").addEventListener("click", () => resetGame(false));
renderMarkers();
if ("ResizeObserver" in window) new ResizeObserver(sizeBoard).observe(document.querySelector(".board-frame"));
window.addEventListener("resize", sizeBoard);
refreshSetup();
