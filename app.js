import { createGame, movePiece, movablePieces, NODES, PORTALS, RESERVE, FINISH, routeChoices, scoreSticks, takeRoll } from "./game.js";

const $ = id => document.getElementById(id);
const teamColors = ["#e44280", "#168c87"];
const teams = [{ name: "분홍팀", photo: null }, { name: "청록팀", photo: null }];
let game = null;
let selectedPieceId = null;
let cameraStream = null;
let cameraTeam = null;
let rolling = false;
let motionEnabled = false;
let lastShakePeak = 0;
let lastMotionValue = 0;
let lastThrowAt = 0;

function setNotice(message, error = false) {
  $("setupNotice").textContent = message;
  $("setupNotice").classList.toggle("error", error);
}

function refreshSetup() {
  teams.forEach((team, index) => {
    const preview = $(`preview${index}`);
    preview.replaceChildren();
    if (team.photo) {
      const image = document.createElement("img");
      image.src = team.photo;
      image.alt = `${team.name} 말 사진`;
      preview.append(image);
    } else {
      const label = document.createElement("span");
      label.innerHTML = "사진을 찍어<br>말 만들기";
      preview.append(label);
    }
  });
  const ready = teams.every(team => team.photo);
  $("startBtn").disabled = !ready;
  $("startBtn").firstChild.textContent = ready ? "게임 시작하기 " : "사진 2장 준비 후 게임 시작 ";
  if (ready) setNotice("사진 준비 완료! 두 팀 모두 동그란 말 4개씩 생깁니다.");
}

function squarePhoto(source, width, height, mirror = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 360;
  const context = canvas.getContext("2d");
  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;
  if (mirror) { context.translate(360, 0); context.scale(-1, 1); }
  context.drawImage(source, sx, sy, side, side, 0, 0, 360, 360);
  return canvas.toDataURL("image/jpeg", 0.86);
}

async function loadPhotoFile(index, file) {
  $(`file${index}`).removeAttribute("capture");
  if (!file || !file.type.startsWith("image/")) { setNotice("이미지 파일을 선택해 주세요.", true); return; }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    teams[index].photo = squarePhoto(image, image.naturalWidth, image.naturalHeight);
    refreshSetup();
  } catch {
    setNotice("사진을 읽지 못했습니다. 다른 사진을 선택해 주세요.", true);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function openCamera(index) {
  cameraTeam = index;
  if (!navigator.mediaDevices?.getUserMedia) {
    setNotice("이 주소에서는 카메라를 열 수 없습니다. 사진 선택으로 촬영해 주세요.", true);
    $(`file${index}`).setAttribute("capture", "user");
    $(`file${index}`).click();
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } } });
    $("cameraVideo").srcObject = cameraStream;
    $("cameraModal").hidden = false;
    await $("cameraVideo").play();
  } catch {
    closeCamera();
    setNotice("카메라 접근이 안 됩니다. 사진 선택 버튼을 눌러 촬영하거나 사진을 고르세요.", true);
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
  if (cameraTeam === null || !video.videoWidth) return;
  teams[cameraTeam].photo = squarePhoto(video, video.videoWidth, video.videoHeight, true);
  closeCamera();
  refreshSetup();
}

function startGame() {
  if (!teams.every(team => team.photo)) return;
  teams.forEach((team, index) => { team.name = $(`name${index}`).value.trim() || (index ? "청록팀" : "분홍팀"); });
  game = createGame();
  selectedPieceId = null;
  $("setupScreen").hidden = true;
  $("gameScreen").hidden = false;
  $("newGameBtn").hidden = false;
  $("winnerModal").hidden = true;
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function resetGame(keepPhotos) {
  $("winnerModal").hidden = true;
  if (keepPhotos) {
    game = createGame();
    selectedPieceId = null;
    render();
  } else {
    game = null;
    teams.forEach((team, index) => { team.photo = null; $(`file${index}`).value = ""; });
    $("gameScreen").hidden = true;
    $("setupScreen").hidden = false;
    $("newGameBtn").hidden = true;
    refreshSetup();
    setNotice("두 팀의 사진을 준비해 주세요.");
  }
}

function pieceLabel(piece) {
  if (piece.pos === RESERVE) return `대기 말 ${piece.id + 1}`;
  return `말 ${piece.id + 1}`;
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

function makeAvatar(className, teamIndex) {
  const element = document.createElement("div");
  element.className = className;
  element.style.setProperty("--piece-color", teamColors[teamIndex]);
  element.style.backgroundImage = `url("${teams[teamIndex].photo}")`;
  return element;
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
      button.style.left = `${position[0]}%`;
      button.style.top = `${position[1]}%`;
      button.style.setProperty("--piece-color", teamColors[teamIndex]);
      button.setAttribute("aria-label", `${teams[teamIndex].name} 말 ${group.length}개`);
      const canSelect = game.phase === "select" && teamIndex === game.currentTeam;
      button.disabled = !canSelect;
      if (canSelect) button.classList.add("movable");
      const image = document.createElement("img");
      image.src = teams[teamIndex].photo;
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
    marker.className = `portal-marker ${node === "n8" ? "shortcut" : "return"}`;
    marker.style.left = `${NODES[node][0]}%`;
    marker.style.top = `${NODES[node][1]}%`;
    marker.title = `${portal.label}: 이 칸에 도착하면 화살표 끝으로 이동`;
    marker.setAttribute("aria-label", marker.title);
    layer.append(marker);
  }
}

function renderSticks() {
  const sticks = $("stickTray").children;
  [...sticks].forEach((stick, index) => {
    stick.classList.toggle("back", !!game.lastSticks?.[index]);
    stick.classList.toggle("marked", index === 0);
  });
  const result = $("rollResult");
  result.replaceChildren();
  if (game.lastSticks) {
    const strong = document.createElement("strong");
    strong.textContent = scoreSticks(game.lastSticks).name;
    result.append(strong);
  } else result.textContent = "윷을 던져 주세요";
}

function selectPiece(pieceId) {
  if (game.phase !== "select") return;
  const piece = game.pieces[game.currentTeam][pieceId];
  if (!movablePieces(game).some(candidate => candidate.id === pieceId)) return;
  const choices = game.pending.steps > 0 ? routeChoices(piece) : [];
  if (choices.length === 0) {
    completeMove(pieceId);
    return;
  }
  selectedPieceId = pieceId;
  renderSelection();
}

function completeMove(pieceId, choice = null) {
  try {
    game = movePiece(game, pieceId, choice);
    selectedPieceId = null;
    render();
    if (game.phase === "won") $("winnerModal").hidden = false;
  } catch (error) {
    $("gameMessage").textContent = error.message;
  }
}

function renderSelection() {
  const card = $("selectionCard");
  card.hidden = game.phase !== "select";
  if (card.hidden) return;
  $("movePrompt").textContent = `${game.pending.name} · ${game.pending.steps === -1 ? "한 칸 뒤로" : `${game.pending.steps}칸 앞으로`}`;
  const list = $("candidateList");
  list.replaceChildren();
  const shown = new Set();
  for (const piece of movablePieces(game)) {
    if (piece.pos !== RESERVE && shown.has(piece.pos)) continue;
    shown.add(piece.pos);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `candidate-button ${selectedPieceId === piece.id ? "selected" : ""}`;
    const count = piece.pos === RESERVE ? 1 : game.pieces[game.currentTeam].filter(member => member.pos === piece.pos).length;
    button.textContent = `${pieceLabel(piece)}${count > 1 ? ` ×${count}` : ""}`;
    button.addEventListener("click", () => selectPiece(piece.id));
    list.append(button);
  }
  const panel = $("routePanel");
  panel.replaceChildren();
  panel.hidden = selectedPieceId === null;
  if (selectedPieceId === null) return;
  const piece = game.pieces[game.currentTeam][selectedPieceId];
  const prompt = document.createElement("p");
  prompt.textContent = piece.pos === "c" ? "중앙에서 어느 쪽으로 갈까요?" : "모서리에서 어느 길로 갈까요?";
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
    const name = document.createElement("span"); name.className = "score-name"; name.textContent = team.name; row.append(name);
    const progress = document.createElement("span"); progress.className = "score-progress"; progress.textContent = `${finished}/4`; row.append(progress);
    const pieces = document.createElement("div"); pieces.className = "score-pieces";
    game.pieces[index].forEach(piece => {
      const token = document.createElement("button");
      token.type = "button";
      token.className = `score-piece ${piece.pos === FINISH ? "finished" : ""}`;
      token.style.backgroundImage = `url("${team.photo}")`;
      token.setAttribute("aria-label", `${team.name} ${piece.id + 1}번 말: ${piece.pos === FINISH ? "도착" : piece.pos === RESERVE ? "대기" : "이동 중"}`);
      const canSelect = game.phase === "select" && index === game.currentTeam && piece.pos === RESERVE && game.pending.steps > 0;
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
  $("currentAvatar").style.backgroundImage = `url("${teams[game.currentTeam].photo}")`;
  $("currentAvatar").style.borderColor = teamColors[game.currentTeam];
  $("gameMessage").textContent = game.message;
  $("rollBtn").disabled = game.phase !== "roll" || rolling;
  $("rollBtn").firstChild.textContent = game.phase === "select" ? "말을 선택해 주세요 " : "윷 던지기 ";
  renderSticks(); renderBoard(); renderSelection(); renderScore();
  if (game.phase === "won") $("winnerTitle").textContent = `${teams[game.winner].name} 승리!`;
}

function randomSticks() {
  const bytes = new Uint8Array(4);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 4; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map(value => value % 2 === 0);
}

async function throwYut() {
  if (!game || game.phase !== "roll" || rolling) return;
  rolling = true;
  lastThrowAt = Date.now();
  $("rollBtn").disabled = true;
  $("stickTray").classList.add("rolling");
  $("rollResult").textContent = "데구르르…";
  await new Promise(resolve => setTimeout(resolve, 650));
  game = takeRoll(game, randomSticks());
  rolling = false;
  $("stickTray").classList.remove("rolling");
  selectedPieceId = null;
  render();
}

function onMotion(event) {
  if (!game || game.phase !== "roll" || rolling) return;
  const acceleration = event.acceleration;
  const value = acceleration?.x != null ? Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0)
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
  if (!("DeviceMotionEvent" in window)) { $("motionStatus").textContent = "이 기기에는 흔들기 센서가 없습니다. 윷 던지기 버튼을 사용하세요."; return; }
  try {
    let permission = "granted";
    if (typeof DeviceMotionEvent.requestPermission === "function") permission = await DeviceMotionEvent.requestPermission();
    if (permission !== "granted") throw new Error("permission denied");
    window.addEventListener("devicemotion", onMotion);
    motionEnabled = true;
    $("motionBtn").classList.add("active");
    $("motionBtn").textContent = "흔들기 센서 켜짐 ✓";
    $("motionStatus").textContent = "아이패드를 짧게 두 번 흔들면 윷이 던져집니다.";
  } catch {
    $("motionStatus").textContent = "흔들기 권한을 받지 못했습니다. 윷 던지기 버튼을 사용하세요.";
  }
}

document.querySelectorAll("[data-camera]").forEach(button => button.addEventListener("click", () => openCamera(Number(button.dataset.camera))));
document.querySelectorAll("[data-upload]").forEach(button => button.addEventListener("click", () => {
  const input = $(`file${button.dataset.upload}`);
  input.removeAttribute("capture");
  input.click();
}));
[0, 1].forEach(index => {
  $(`file${index}`).addEventListener("change", event => loadPhotoFile(index, event.target.files?.[0]));
  $(`name${index}`).addEventListener("input", event => { teams[index].name = event.target.value.trim() || (index ? "청록팀" : "분홍팀"); });
});
$("startBtn").addEventListener("click", startGame);
$("closeCameraBtn").addEventListener("click", closeCamera);
$("captureBtn").addEventListener("click", capturePhoto);
$("rollBtn").addEventListener("click", throwYut);
$("motionBtn").addEventListener("click", enableMotion);
$("playAgainBtn").addEventListener("click", () => resetGame(true));
$("newPhotosBtn").addEventListener("click", () => resetGame(false));
$("newGameBtn").addEventListener("click", () => resetGame(false));
renderMarkers();
refreshSetup();
