const importedCollections = Object.fromEntries((window.COLLECTIONS_DATA || []).map(item => [item.id, item]));
const RARITIES = [
  { name: "消费级", shortName: "灰", color: "#b0c3d9", rgb: "176,195,217" },
  { name: "工业级", shortName: "浅蓝", color: "#5e98d9", rgb: "94,152,217" },
  { name: "军规级", shortName: "蓝", color: "#4b69ff", rgb: "75,105,255" },
  { name: "受限", shortName: "紫", color: "#8847ff", rgb: "136,71,255" },
  { name: "保密", shortName: "粉", color: "#d32ce6", rgb: "211,44,230" },
  { name: "隐秘", shortName: "红", color: "#eb4b4b", rgb: "235,75,75" },
  { name: "罕见特殊物品", shortName: "金", color: "#e8b34d", rgb: "232,179,77" }
];
const STANDARD_ODDS = [
  { rarity: 2, weight: 6662 },
  { rarity: 3, weight: 1598 },
  { rarity: 4, weight: 1280 },
  { rarity: 5, weight: 306 },
  { rarity: 6, weight: 154 }
];
const COBBLESTONE_ODDS = [
  { rarity: 0, weight: 77032 },
  { rarity: 1, weight: 16000 },
  { rarity: 2, weight: 3200 },
  { rarity: 3, weight: 640 },
  { rarity: 4, weight: 128 },
  { rarity: 5, weight: 3000 }
];
const CASES = [
  { id: "recoil", name: "反冲武器箱", key: "反冲武器箱钥匙", series: "RECOIL COLLECTION", resultCollection: "反冲收藏品", image: "assets/items/recoil/case.png", tint: "#9eab65", rgb: "158,171,101" },
  { id: "dreams", name: "梦魇武器箱", key: "梦魇武器箱钥匙", series: "DREAMS & NIGHTMARES", resultCollection: "梦魇收藏品", image: "assets/items/dreams/case.png", tint: "#9064cb", rgb: "144,100,203" },
  { id: "revolution", name: "变革武器箱", key: "变革武器箱钥匙", series: "REVOLUTION COLLECTION", resultCollection: "变革收藏品", image: "assets/items/revolution/case.png", tint: "#df7936", rgb: "223,121,54" },
  { id: "fever", name: "热潮武器箱", key: "热潮武器箱钥匙", series: "FEVER COLLECTION", resultCollection: "热潮收藏品", image: "assets/items/fever/case.png", tint: "#d55b3e", rgb: "213,91,62" },
  { id: "cobblestone", name: "古堡激战纪念包", key: null, requiresKey: false, odds: COBBLESTONE_ODDS, series: "THE COBBLESTONE COLLECTION", resultCollection: "古堡激战收藏品", image: "assets/items/cobblestone/case.png", tint: "#b69a63", rgb: "182,154,99" }
].map(item => ({
  ...item,
  requiresKey: item.requiresKey !== false,
  odds: item.odds || STANDARD_ODDS,
  image: importedCollections[item.id]?.image || item.image,
  pool: importedCollections[item.id]?.items || []
}));

const SPECIAL_TOKEN = {
  weapon: "★",
  skin: "罕见特殊物品",
  rarity: 6,
  image: null,
  concealed: true
};
const ROULETTE_DURATION_MS = 6200;

const STORAGE_PREFIX = "gongXiFaCai";
const LEGACY_STORAGE_PREFIX = ["case", "Lab"].join("");
const readStoredValue = suffix => localStorage.getItem(`${STORAGE_PREFIX}${suffix}`) ?? localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${suffix}`);
const defaultStock = Object.fromEntries(CASES.map(item => [item.id, { cases: 1, keys: item.requiresKey ? 1 : 0 }]));

let stock = loadStock();
let ownedItems = loadOwnedItems();

const storedSelectedId = readStoredValue("Selected");
let selectedId = CASES.some(item => item.id === storedSelectedId) ? storedSelectedId : "recoil";
let activeTab = "cases";
let vaultFilter = "all";
let vaultSort = ["newest", "rarity-desc", "rarity-asc"].includes(readStoredValue("VaultSort"))
  ? readStoredValue("VaultSort")
  : "newest";
let spinning = false;
let soundEnabled = true;
let audioContext;

const $ = selector => document.querySelector(selector);
const inventoryList = $("#inventoryList");
const stage = $(".opening-stage");
const rouletteWrap = $("#rouletteWrap");
const rouletteTrack = $("#rouletteTrack");
const skipAnimationInput = $("#skipAnimation");
skipAnimationInput.checked = readStoredValue("SkipAnimation") === "true";

function loadStock() {
  try {
    const saved = JSON.parse(readStoredValue("Stock"));
    if (!saved || typeof saved !== "object") return structuredClone(defaultStock);
    return Object.fromEntries(CASES.map(item => {
      const savedItem = saved[item.id];
      const cases = Number.isInteger(savedItem?.cases) && savedItem.cases >= 0 ? savedItem.cases : 1;
      const savedKeysAreValid = Number.isInteger(savedItem?.keys) && savedItem.keys >= 0;
      const keys = item.requiresKey ? (savedKeysAreValid ? savedItem.keys : 1) : 0;
      return [item.id, { cases, keys }];
    }));
  } catch { return structuredClone(defaultStock); }
}

function saveStock() {
  localStorage.setItem(`${STORAGE_PREFIX}Stock`, JSON.stringify(stock));
  localStorage.setItem(`${STORAGE_PREFIX}Selected`, selectedId);
}

function loadOwnedItems() {
  try {
    const saved = JSON.parse(readStoredValue("OwnedItems"));
    if (!Array.isArray(saved)) return [];
    let migrated = false;
    const normalizedItems = saved.map(item => {
      if (!item || item.rarityVersion === 2) return item;
      if (!Number.isInteger(item.rarity) || item.rarity < 0 || item.rarity > 4) return item;
      migrated = true;
      return {
        ...item,
        rarity: item.rarity === 4 ? 6 : item.rarity + 2,
        rarityVersion: 2
      };
    });
    const validItems = normalizedItems.filter(item =>
      item && typeof item.id === "string" && typeof item.weapon === "string" &&
      typeof item.skin === "string" && Number.isInteger(item.rarity) &&
      item.rarity >= 0 && item.rarity < RARITIES.length &&
      typeof item.image === "string" && item.image.startsWith("assets/") &&
      typeof item.caseName === "string" && typeof item.acquiredAt === "string"
    );
    if (migrated) localStorage.setItem(`${STORAGE_PREFIX}OwnedItems`, JSON.stringify(validItems));
    return validItems;
  } catch { return []; }
}

function saveOwnedItems() {
  localStorage.setItem(`${STORAGE_PREFIX}OwnedItems`, JSON.stringify(ownedItems));
}

function storeOwnedItem(weapon, caseItem) {
  const storedItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    weapon: weapon.weapon,
    skin: weapon.skin,
    rarity: weapon.rarity,
    rarityVersion: 2,
    image: weapon.image,
    caseId: caseItem.id,
    caseName: caseItem.name,
    acquiredAt: new Date().toISOString()
  };
  ownedItems.unshift(storedItem);
  saveOwnedItems();
  renderVault();
  renderRecentDrop();
  return storedItem;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function formatAcquiredAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
}

function renderRecentDrop() {
  const latest = ownedItems[0];
  if (!latest) {
    $("#recentDrop").innerHTML = "<span>最近获得</span><p>尚无开箱记录</p>";
    return;
  }
  const rarity = RARITIES[latest.rarity];
  $("#recentDrop").innerHTML = `<span>最近获得</span><p style="color:${rarity.color}">${escapeHtml(latest.weapon)} | ${escapeHtml(latest.skin)}</p>`;
}

function renderVault() {
  const filteredItems = vaultFilter === "all"
    ? ownedItems
    : ownedItems.filter(item => item.rarity === Number(vaultFilter));
  const sortedItems = [...filteredItems].sort((first, second) => {
    const newestFirst = new Date(second.acquiredAt).getTime() - new Date(first.acquiredAt).getTime();
    if (vaultSort === "rarity-desc") return second.rarity - first.rarity || newestFirst;
    if (vaultSort === "rarity-asc") return first.rarity - second.rarity || newestFirst;
    return newestFirst;
  });
  $("#vaultNavCount").textContent = ownedItems.length;
  $("#vaultTotal").textContent = ownedItems.length;
  $("#vaultGoldTotal").textContent = ownedItems.filter(item => item.rarity === 6).length;
  $("#vaultVisibleCount").textContent = `${sortedItems.length} 件物品`;
  $("#vaultGrid").innerHTML = sortedItems.map((item, index) => {
    const rarity = RARITIES[item.rarity];
    const serial = String(ownedItems.length - ownedItems.indexOf(item)).padStart(4, "0");
    return `<article class="vault-item" style="--rarity:${rarity.color};--rarity-rgb:${rarity.rgb};--delay:${Math.min(index, 12) * 35}ms">
      <div class="vault-item-media">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.weapon)} ${escapeHtml(item.skin)}" />
        <span>#${serial}</span>
      </div>
      <div class="vault-item-copy">
        <small><i></i>${rarity.name}</small>
        <h2>${escapeHtml(item.weapon)}</h2>
        <p>${escapeHtml(item.skin)}</p>
      </div>
      <footer><span>${escapeHtml(item.caseName)}</span><time datetime="${escapeHtml(item.acquiredAt)}">${formatAcquiredAt(item.acquiredAt)}</time></footer>
    </article>`;
  }).join("");
  const isEmpty = sortedItems.length === 0;
  $("#vaultGrid").hidden = isEmpty;
  $("#vaultEmpty").hidden = !isEmpty;
  $("#vaultEmpty h2").textContent = ownedItems.length ? "没有这个稀有度的物品" : "仓库中还没有物品";
  $("#vaultEmpty p").textContent = ownedItems.length ? "切换其他稀有度，查看已有收藏品。" : "开启任意容器，获得的物品会自动存入这里。";
}

function switchWorkspace(view) {
  if (spinning) return;
  const showVault = view === "vault";
  $("#openingWorkspace").hidden = showVault;
  $("#vaultWorkspace").hidden = !showVault;
  $("#openingNav").classList.toggle("active", !showVault);
  $("#vaultNav").classList.toggle("active", showVault);
  if (showVault) renderVault();
  playTone(showVault ? 360 : 270, .04, .018);
}

function selectedCase() { return CASES.find(item => item.id === selectedId); }

function hasContainerSupply(item) {
  return stock[item.id].cases > 0 && (!item.requiresKey || stock[item.id].keys > 0);
}

function setTheme(item) {
  document.documentElement.style.setProperty("--case-tint", item.tint);
  document.documentElement.style.setProperty("--case-tint-rgb", item.rgb);
}

function renderInventory() {
  const type = activeTab === "cases" ? "cases" : "keys";
  const visibleItems = activeTab === "cases" ? CASES : CASES.filter(item => item.requiresKey);
  inventoryList.innerHTML = visibleItems.map(item => {
    const isSelected = item.id === selectedId;
    const thumb = activeTab === "cases" ? `<img class="item-thumb" src="${item.image}" alt="" />` : `<span class="key-thumb" aria-hidden="true"></span>`;
    const label = activeTab === "cases" ? item.name : item.key;
    const supplyLabel = item.requiresKey ? `添加一组${item.name}和钥匙` : `添加一个${item.name}`;
    const supplyTitle = item.requiresKey ? "同时添加箱子与钥匙" : "添加一个无需钥匙的纪念包";
    return `<article class="inventory-item ${isSelected ? "selected" : ""}" data-id="${item.id}" style="--case-tint:${item.tint};--case-tint-rgb:${item.rgb}">
      <button class="item-main" type="button" aria-label="选择${label}">${thumb}<span class="item-copy"><b>${label}</b><small>库存 <em>× ${stock[item.id][type]}</em></small></span></button>
      <button class="add-one" type="button" aria-label="${supplyLabel}" title="${supplyTitle}">+</button>
    </article>`;
  }).join("");
  updateCounts();
}

function updateCounts() {
  const caseCount = CASES.reduce((sum,item) => sum + stock[item.id].cases, 0);
  const keyCount = CASES.reduce((sum,item) => sum + stock[item.id].keys, 0);
  $("#caseTotal").textContent = caseCount;
  $("#keyTotal").textContent = keyCount;
  $("#stockTotal").textContent = String(caseCount + keyCount).padStart(2,"0");
}

function renderSelected() {
  const item = selectedCase();
  setTheme(item);
  $("#caseImage").src = item.image;
  $("#caseImage").alt = item.name;
  $("#selectedCaseName").textContent = item.name;
  $("#caseSeries").textContent = item.series;
  $("#caseDescription").textContent = item.requiresKey
    ? "选择对应钥匙，开启后将随机获得一件收藏品。"
    : "纪念包无需钥匙，开启后将随机获得一件古堡激战收藏品。";
  $("#keySlot").classList.toggle("keyless", !item.requiresKey);
  $("#keySlot small").textContent = item.requiresKey ? "已匹配钥匙" : "纪念包认证";
  $("#selectedKeyName").textContent = item.requiresKey ? item.key : "无需钥匙";
  $("#selectedKeyCount").textContent = item.requiresKey ? `× ${stock[item.id].keys}` : "免费开启";
  $("#keySlot").setAttribute("aria-label", item.requiresKey ? `已选择${item.key}` : `${item.name}无需钥匙`);
  const hasSupply = hasContainerSupply(item);
  $("#openButton").disabled = !hasSupply;
  $("#openButton span").textContent = hasSupply ? "开启容器" : "库存不足";
  $("#openButton small").textContent = item.requiresKey ? "消耗 1 个箱子 + 1 把钥匙" : "消耗 1 个纪念包 · 无需钥匙";
  renderOdds(item);
  renderPreview();
}

function renderOdds(item) {
  const totalWeight = item.odds.reduce((sum, entry) => sum + entry.weight, 0);
  $("#rarityList").innerHTML = item.odds.map(entry => {
    const rarity = RARITIES[entry.rarity];
    const percent = entry.weight / totalWeight * 100;
    const digits = percent < .2 ? 3 : 2;
    return `<div style="--color:${rarity.color}"><i></i><span>${rarity.name}</span><b>${percent.toFixed(digits)}%</b></div>`;
  }).join("");
}

function renderPreview() {
  const item = selectedCase();
  const regularItems = item.pool.filter(weapon => weapon.rarity !== 6);
  const hasSpecialItems = item.pool.some(weapon => weapon.rarity === 6);
  $("#previewCount").textContent = hasSpecialItems ? `${regularItems.length} + ★` : `${regularItems.length} ITEMS`;
  const regularMarkup = regularItems.slice(-5).map(weapon => {
    const rarity = RARITIES[weapon.rarity];
    return `<div class="preview-item" style="--rarity:${rarity.color}" title="${weapon.weapon} | ${weapon.skin}"><img src="${weapon.image}" alt="${weapon.weapon} ${weapon.skin}" /></div>`;
  }).join("");
  const specialMarkup = hasSpecialItems
    ? `<div class="preview-item special" style="--rarity:${RARITIES[6].color}" title="★ 罕见特殊物品"><span class="gold-token small"><i>★</i></span></div>`
    : "";
  $("#previewGrid").innerHTML = regularMarkup + specialMarkup;
}

function selectCase(id) {
  if (spinning) return;
  selectedId = id;
  saveStock();
  renderInventory();
  renderSelected();
  playTone(270, .035, .025);
}

function addPair(id) {
  const item = CASES.find(entry => entry.id === id);
  stock[id].cases += 1;
  if (item.requiresKey) stock[id].keys += 1;
  saveStock();
  renderInventory();
  renderSelected();
  const message = item.requiresKey ? `${item.name} ×1 · 对应钥匙 ×1` : `${item.name} ×1 · 无需钥匙`;
  showToast("补给已入库", message);
  playTone(620, .08, .04);
}

function showToast(title, message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<i></i><div><b>${title}</b><span>${message}</span></div>`;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.classList.add("out"), 2400);
  setTimeout(() => toast.remove(), 2750);
}

function randomRarity(item) {
  const totalWeight = item.odds.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.floor(Math.random() * totalWeight);
  for (const entry of item.odds) {
    roll -= entry.weight;
    if (roll < 0) return entry.rarity;
  }
  return item.odds[0].rarity;
}

function pickItemForRarity(item, rarityIndex) {
  let candidates = item.pool.filter(weapon => weapon.rarity === rarityIndex);
  if (!candidates.length) candidates = item.pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function itemCard(weapon) {
  const rarity = RARITIES[weapon.rarity];
  if (weapon.rarity === 6) {
    return `<div class="roulette-card special-card" style="--rarity:${rarity.color};--rarity-rgb:${rarity.rgb}"><span class="gold-token"><i>★</i></span><span>★</span><b>罕见特殊物品</b></div>`;
  }
  return `<div class="roulette-card" style="--rarity:${rarity.color};--rarity-rgb:${rarity.rgb}"><img src="${weapon.image}" alt="" /><span>${weapon.weapon}</span><b>${weapon.skin}</b></div>`;
}

async function openCase() {
  const item = selectedCase();
  if (spinning || !hasContainerSupply(item)) return;
  spinning = true;
  stock[item.id].cases -= 1;
  if (item.requiresKey) stock[item.id].keys -= 1;
  saveStock();

  const winningRarity = randomRarity(item);
  const winner = pickItemForRarity(item, winningRarity);
  if (skipAnimationInput.checked) {
    playWin(item.pool.indexOf(winner));
    storeOwnedItem(winner, item);
    showResult(winner, item);
    renderInventory();
    renderSelected();
    return;
  }

  $("#caseScene").classList.add("opening");
  playUnlock();
  await delay(850);

  const winningCard = winningRarity === 6 ? SPECIAL_TOKEN : winner;
  const regularPool = item.pool.filter(poolItem => poolItem.rarity !== 6);
  const winnerIndex = 50;
  const strip = Array.from(
    { length: 58 },
    (_, index) => index === winnerIndex
      ? winningCard
      : regularPool[Math.floor(Math.random() * regularPool.length)]
  );
  rouletteTrack.innerHTML = strip.map(itemCard).join("");
  rouletteTrack.style.transition = "none";
  rouletteTrack.style.transform = "translateX(0px)";
  stage.classList.add("spinning");
  rouletteWrap.classList.add("visible");
  rouletteWrap.setAttribute("aria-hidden", "false");
  let percent = 0;
  const percentTimer = setInterval(() => { percent = Math.min(99, percent + Math.ceil((100 - percent) / 10)); $("#decryptPercent").textContent = `${String(percent).padStart(2,"0")}%`; }, 180);

  await delay(80);
  const card = rouletteTrack.children[winnerIndex];
  const windowWidth = $("#rouletteWindow").clientWidth;
  const cardCenter = card.offsetLeft + card.offsetWidth / 2;
  const jitter = (Math.random() - .5) * 62;
  const target = windowWidth / 2 - cardCenter + jitter;
  rouletteTrack.style.transition = `transform ${ROULETTE_DURATION_MS / 1000}s cubic-bezier(.075,.67,.12,1)`;
  requestAnimationFrame(() => rouletteTrack.style.transform = `translateX(${target}px)`);
  runTickSequence(ROULETTE_DURATION_MS);
  await delay(ROULETTE_DURATION_MS + 20);
  clearInterval(percentTimer);
  $("#decryptPercent").textContent = "100%";
  playWin(item.pool.indexOf(winner));
  await delay(420);
  storeOwnedItem(winner, item);
  showResult(winner, item);
  renderInventory();
  renderSelected();
}

function showResult(weapon, item) {
  const rarity = RARITIES[weapon.rarity];
  $("#resultWeapon img").src = weapon.image;
  $("#resultWeapon img").alt = `${weapon.weapon} ${weapon.skin}`;
  $("#resultName").textContent = `${weapon.weapon} | ${weapon.skin}`;
  $("#resultCollection").textContent = item.resultCollection;
  $("#resultRarity").textContent = rarity.name;
  $("#resultContent").style.setProperty("--result-color", rarity.color);
  $("#resultContent").style.setProperty("--result-rgb", rarity.rgb);
  const modal = $("#resultModal");
  modal.classList.add("visible");
  modal.setAttribute("aria-hidden", "false");
  $("#openAgainButton").disabled = !hasContainerSupply(item);
  $("#openAgainButton").textContent = $("#openAgainButton").disabled ? "库存不足" : "再开一次";
}

function closeResult(openAgain = false) {
  const modal = $("#resultModal");
  modal.classList.remove("visible");
  modal.setAttribute("aria-hidden", "true");
  stage.classList.remove("spinning");
  rouletteWrap.classList.remove("visible");
  rouletteWrap.setAttribute("aria-hidden", "true");
  $("#caseScene").classList.remove("opening");
  $("#decryptPercent").textContent = "00%";
  spinning = false;
  if (openAgain) setTimeout(openCase, 350);
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function getAudioContext() {
  if (!soundEnabled) return null;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}

function playTone(frequency, duration = .04, volume = .025, type = "square", offset = 0) {
  const context = getAudioContext(); if (!context) return;
  const oscillator = context.createOscillator(), gain = context.createGain();
  oscillator.type = type; oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, context.currentTime + offset);
  gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + offset + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime + offset); oscillator.stop(context.currentTime + offset + duration);
}

function playUnlock() { playTone(120,.12,.04,"sawtooth"); playTone(520,.08,.025,"square",.13); playTone(780,.12,.02,"sine",.22); }
function playWin(seed) { [0,4,7,12].forEach((step,index) => playTone(310 * 2 ** (step/12), .32, .035, "triangle", index*.09)); if (seed % 2) playTone(930,.42,.018,"sine",.31); }
function runTickSequence(duration) { const start = performance.now(); let last = 0; function tick(now) { const progress = Math.min(1,(now-start)/duration); const interval = 42 + 380 * progress ** 2.7; if (now-last > interval) { playTone(150 + progress*100,.025,.012,"square"); last=now; } if (progress<1) requestAnimationFrame(tick); } requestAnimationFrame(tick); }

inventoryList.addEventListener("click", event => {
  const article = event.target.closest(".inventory-item"); if (!article) return;
  if (event.target.closest(".add-one")) addPair(article.dataset.id); else selectCase(article.dataset.id);
});

document.querySelectorAll(".inventory-tabs button").forEach(button => button.addEventListener("click", () => {
  activeTab = button.dataset.tab;
  document.querySelectorAll(".inventory-tabs button").forEach(item => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", item === button); });
  renderInventory();
}));

$("#openButton").addEventListener("click", openCase);
skipAnimationInput.addEventListener("change", () => {
  localStorage.setItem(`${STORAGE_PREFIX}SkipAnimation`, String(skipAnimationInput.checked));
});
$("#closeResultButton").addEventListener("click", () => closeResult(false));
$("#openAgainButton").addEventListener("click", () => { if (!$("#openAgainButton").disabled) closeResult(true); });
$("#soundToggle").addEventListener("click", event => { soundEnabled = !soundEnabled; event.currentTarget.classList.toggle("muted", !soundEnabled); event.currentTarget.setAttribute("aria-pressed", soundEnabled); if (soundEnabled) playTone(540,.06,.025); });
$("#openingNav").addEventListener("click", () => switchWorkspace("opening"));
$("#vaultNav").addEventListener("click", () => switchWorkspace("vault"));
$("#emptyOpenButton").addEventListener("click", () => switchWorkspace("opening"));
$("#vaultFilters").addEventListener("click", event => {
  const button = event.target.closest("button[data-rarity]");
  if (!button) return;
  vaultFilter = button.dataset.rarity;
  document.querySelectorAll("#vaultFilters button").forEach(item => item.classList.toggle("active", item === button));
  renderVault();
});
$("#vaultSort").value = vaultSort;
$("#vaultSort").addEventListener("change", event => {
  vaultSort = event.currentTarget.value;
  localStorage.setItem(`${STORAGE_PREFIX}VaultSort`, vaultSort);
  renderVault();
});
document.addEventListener("keydown", event => { if (event.key === "Escape" && $("#resultModal").classList.contains("visible")) closeResult(false); });

renderInventory();
renderSelected();
renderVault();
renderRecentDrop();
setTimeout(() => $("#bootScreen").classList.add("done"), 900);
