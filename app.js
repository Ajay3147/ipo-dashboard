const state = { ipos: [], filter: "all", category: "all", query: "" };
const $ = (id) => document.getElementById(id);

const STATUS_WORDS = {
  upcoming: ["upcoming", "not yet open", "pre open", "pre-open"],
  open: ["open", "ongoing", "live", "currently open"],
  closed: ["closed", "close", "completed", "ended"],
  listed: ["listed", "trading", "listing"]
};

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}
function findValue(obj, patterns) {
  if (!obj || typeof obj !== "object") return undefined;
  const entries = Object.entries(obj);
  for (const pattern of patterns) {
    const exact = entries.find(([k, v]) => normalizeKey(k) === pattern && v != null && v !== "");
    if (exact) return exact[1];
  }
  for (const pattern of patterns) {
    const partial = entries.find(([k, v]) => normalizeKey(k).includes(pattern) && v != null && v !== "");
    if (partial) return partial[1];
  }
  return undefined;
}
function asText(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function statusOf(ipo) {
  const raw = findValue(ipo, ["status", "ipostatus", "currentstatus", "subscriptionstatus"]);
  const s = String(raw ?? "").toLowerCase();
  if (STATUS_WORDS.listed.some(w => s.includes(w))) return "listed";
  if (STATUS_WORDS.closed.some(w => s.includes(w))) return "closed";
  if (STATUS_WORDS.upcoming.some(w => s.includes(w))) return "upcoming";
  if (STATUS_WORDS.open.some(w => s === w || s.includes(w))) return "open";

  const open = parseDate(findValue(ipo, ["opendate", "startdate", "issueopendate", "ipoopendate"]));
  const close = parseDate(findValue(ipo, ["closedate", "enddate", "issueclosedate", "ipoclosedate"]));
  const today = new Date(); today.setHours(0,0,0,0);
  if (open && today < open) return "upcoming";
  if (open && close && today >= open && today <= close) return "open";
  if (close && today > close) return "closed";
  return "unknown";
}
function categoryOf(ipo) {
  const keys = ["category", "ipocategory", "ipotype", "type", "issuetype", "segment", "marketsegment", "markettype", "platform", "listingtype", "exchange", "listingexchange", "listingon", "stockexchange"];
  for (const key of keys) {
    const entry = Object.entries(ipo).find(([k]) => normalizeKey(k) === key);
    if (!entry || entry[1] == null) continue;
    const value = String(typeof entry[1] === "object" ? JSON.stringify(entry[1]) : entry[1]).toLowerCase();
    if (/\bsme\b|\bemerge\b|\bsmall[ -](?:and[ -])?medium\b/.test(value)) return "sme";
    if (/main[ -]?board|main[ -]?line|main[ -]?market/.test(value)) return "mainboard";
  }
  return "unknown";
}
function categoryLabel(category) {
  return ({mainboard:"Mainboard IPO", sme:"SME IPO", unknown:"—"})[category];
}
function extractRows(data) {
  if (Array.isArray(data)) return data.filter(x => x && typeof x === "object");
  if (!data || typeof data !== "object") return [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length && value.every(x => x && typeof x === "object")) return value;
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = extractRows(value);
      if (nested.length) return nested;
    }
  }
  return [];
}
function getName(ipo) {
  return asText(findValue(ipo, ["companyname", "name", "iponame", "issuername", "company", "symbol"]));
}
function exactValue(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of keys) {
    const entry = Object.entries(obj).find(([k,v]) => normalizeKey(k) === key && v != null && v !== "");
    if (entry) return entry[1];
  }
}
function scalar(value) {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}
function getPrice(ipo) {
  const raw = exactValue(ipo, ["offerprice", "priceband", "issueprice", "pricerange", "issuepricerange", "price"]);
  const low = scalar(exactValue(raw, ["min", "low", "lower", "from", "minprice"])) ?? scalar(exactValue(ipo, ["minprice", "lowerprice", "floorprice", "pricemin"]));
  const high = scalar(exactValue(raw, ["max", "high", "upper", "to", "maxprice"])) ?? scalar(exactValue(ipo, ["maxprice", "upperprice", "capprice", "pricemax"]));
  const rupees = v => String(v).includes("₹") ? String(v) : `₹${v}`;
  if (low != null && high != null) return low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`;
  const value = scalar(raw);
  return value == null ? (high != null ? rupees(high) : low != null ? rupees(low) : "—") : /^\d/.test(String(value)) ? rupees(value) : asText(value);
}
function getLotSize(ipo) {
  const raw = exactValue(ipo, ["lotsize", "marketlot", "minimumlotsize", "minlotsize", "sharesperlot", "lot"]);
  const value = scalar(raw) ?? scalar(exactValue(raw, ["shares", "size", "quantity", "lotsize"]));
  return value == null ? "—" : /^\d[\d,]*$/.test(String(value)) ? `${value} shares` : asText(value);
}
function getIssueSize(ipo) {
  const raw = exactValue(ipo, ["issuesize", "totalissuesize", "iposize", "offersize", "totaloffersize", "issuesizecrore", "issuesizecr"]);
  const value = scalar(raw);
  if (value == null) return "—";
  const crore = exactValue(ipo, ["issuesizecrore", "issuesizecr"]);
  return raw === crore && /^\d+(\.\d+)?$/.test(String(value)) ? `₹${value} Cr` : asText(value);
}
function getOpenDate(ipo) {
  return asText(findValue(ipo, ["opendate", "startdate", "issueopendate", "ipoopendate"]));
}
function getCloseDate(ipo) {
  return asText(findValue(ipo, ["closedate", "enddate", "issueclosedate", "ipoclosedate"]));
}

function gmpParts(ipo) {
  const gmp = ipo.gmp ?? ipo.GMP;
  const rawPrice = gmp && typeof gmp === "object" ? gmp.price : gmp;
  const rawPercent = gmp && typeof gmp === "object" ? gmp.percentage : null;
  const numeric = value => {
    if (value == null || String(value).trim() === "") return null;
    const n = Number(String(value).replace(/[₹,%]/g, "").trim());
    return Number.isFinite(n) ? n : null;
  };
  const price = numeric(rawPrice);
  const percent = numeric(rawPercent);
  return { amount: price === null ? "—" : `₹${price}`, percent };
}
function percentText(percent) {
  return percent === null ? "—" : `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}
function percentClass(percent) {
  return percent > 0 ? "gmp-positive" : percent < 0 ? "gmp-negative" : "gmp-neutral";
}
function getGmp(ipo) {
  const {amount, percent} = gmpParts(ipo);
  return amount + (percent === null ? "" : ` (${percentText(percent)})`);
}

function getSubscription(ipo) {
  const raw = exactValue(ipo, ["overallsubscription", "totalsubscription", "subscriptiontimes", "subscription", "subscriptiondetails", "subscriptionstatus"]);
  const value = scalar(raw) ?? scalar(exactValue(raw, ["overall", "total", "overallsubscription", "totalsubscription", "times", "totaltimes"]));
  if (value == null) return "—";
  const str = String(value).trim();
  return /^\d+(\.\d+)?x?$/i.test(str) ? str.replace(/x$/i, "") + "x" : "—";
}
function labelStatus(status) {
  return ({upcoming:"Upcoming",open:"Open",closed:"Closed",listed:"Listed",unknown:"Unknown"})[status] || "Unknown";
}
function showNotice(message, type = "") {
  const el = $("notice");
  el.textContent = message;
  el.className = "notice show" + (type ? " " + type : "");
}
function hideNotice() { $("notice").className = "notice"; }

function completeness(ipo) {
  const {amount, percent} = gmpParts(ipo);
  const present = value => !/^(?:₹\s*)?(?:—|–|-|n\/?a|null|undefined|tbd|tba|not available|to be announced)?$/i.test(String(value ?? "").trim());
  return [getPrice(ipo), getLotSize(ipo), getIssueSize(ipo), amount, percent, getOpenDate(ipo), getCloseDate(ipo)].filter(present).length;
}
function render() {
  const counts = { upcoming:0, open:0, closed:0, listed:0, unknown:0 };
  const categories = {all:state.ipos.length, mainboard:0, sme:0, unknown:0};
  state.ipos.forEach(ipo => categories[categoryOf(ipo)]++);
  Object.entries(categories).forEach(([key, count]) => { const el = $("category-" + key); if (el) el.textContent = count; });
  const categoryRows = state.ipos.filter(ipo => state.category === "all" || categoryOf(ipo) === state.category);
  categoryRows.forEach(ipo => counts[statusOf(ipo)]++);
  $("upcomingCount").textContent = counts.upcoming;
  $("openCount").textContent = counts.open;
  $("closedCount").textContent = counts.closed + counts.listed;
  $("allTabCount").textContent = categoryRows.length;

  const filtered = categoryRows.filter(ipo => {
    const status = statusOf(ipo);
    const matchFilter = state.filter === "all" ||
      (state.filter === "closed" ? ["closed","listed"].includes(status) : status === state.filter);
    const searchText = (getName(ipo) + " " + JSON.stringify(ipo)).toLowerCase();
    return matchFilter && searchText.includes(state.query.toLowerCase());
  });

  filtered.sort((a, b) => completeness(b) - completeness(a));
  $("resultCount").textContent = `${filtered.length} IPO${filtered.length === 1 ? "" : "s"}`;
  const grid = $("ipoRows");
  if (!filtered.length) {
    grid.innerHTML = `<p class="empty">${state.ipos.length ? "No IPOs match this filter." : "No IPO data loaded yet."}</p>`;
    return;
  }
  grid.innerHTML = filtered.map(ipo => {
    const status = statusOf(ipo);
    const idx = state.ipos.indexOf(ipo);
    const {amount, percent} = gmpParts(ipo);
    const category = categoryOf(ipo);
    return `<article class="ipo-card">
      <div class="ipo-card-head"><div><h3>${escapeHtml(getName(ipo))}</h3>${category === "unknown" ? "" : `<span class="ipo-category ipo-category-${category}">${categoryLabel(category)}</span>`}</div><div class="ipo-card-actions"><span class="status status-${status}">${labelStatus(status)}</span><button class="details-link ipo-details" data-detail="${idx}" type="button" aria-label="View IPO details">Details →</button></div></div>
      <div class="ipo-fields ipo-metrics"><div><span class="ipo-label">Offer price</span><strong>${escapeHtml(getPrice(ipo))}</strong></div><div><span class="ipo-label">Lot size</span><strong>${escapeHtml(getLotSize(ipo))}</strong></div><div><span class="ipo-label">Issue size</span><strong>${escapeHtml(getIssueSize(ipo))}</strong></div></div>
      <div class="ipo-gmp"><div><span class="ipo-label">GMP</span><strong class="${percentClass(percent)}">${escapeHtml(amount)}</strong></div><div><span class="ipo-label">GMP percentage</span><strong class="${percentClass(percent)}">${percentText(percent)}</strong></div></div>
      <div class="ipo-fields ipo-dates"><div><span class="ipo-label">Open date</span><strong>${escapeHtml(getOpenDate(ipo))}</strong></div><div><span class="ipo-label">Close date</span><strong>${escapeHtml(getCloseDate(ipo))}</strong></div></div>
    </article>`;
  }).join("");
  grid.querySelectorAll("[data-detail]").forEach(btn => btn.addEventListener("click", () => openDetails(state.ipos[Number(btn.dataset.detail)])));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function openDetails(ipo) {
  $("modalTitle").textContent = getName(ipo);
  const preferred = [
    ["Status", labelStatus(statusOf(ipo))],
    ["IPO category", categoryLabel(categoryOf(ipo))],
    ["Offer price", getPrice(ipo)],
    ["Lot size", getLotSize(ipo)],
    ["Issue size", getIssueSize(ipo)],
    ["Open date", getOpenDate(ipo)],
    ["Close date", getCloseDate(ipo)],
    ["GMP", getGmp(ipo)]
  ];
  const used = new Set();
  let html = preferred.map(([k,v]) => {
    used.add(k.toLowerCase());
    return `<div class="detail-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`;
  }).join("");
  for (const [key, value] of Object.entries(ipo)) {
    if (value == null || value === "" || /subscription/i.test(key)) continue;

    // Skip GMP because it is already displayed in formatted form
    if (["gmp", "GMP"].includes(key)) continue;

    if (used.has(key.toLowerCase())) continue;

    html += `<div class="detail-item">
      <span>${escapeHtml(key.replace(/[_-]/g," "))}</span>
      <strong>${escapeHtml(asText(value))}</strong>
    </div>`;
}
  $("modalContent").innerHTML = html;
  $("detailModal").classList.add("open");
  $("detailModal").setAttribute("aria-hidden","false");
}
function closeDetails() {
  $("detailModal").classList.remove("open");
  $("detailModal").setAttribute("aria-hidden","true");
}
async function loadIpos() {
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Loading…";
  $("connection").className = "connection";
  $("connection").innerHTML = "<i></i> Connecting";
  try {
    const response = await fetch("/api/ipos", { headers: { "Accept": "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || `API request failed (${response.status})`);
    const rows = extractRows(data);
    if (!rows.length) {
      state.ipos = [];
      render();
      showNotice("The API responded, but this dashboard could not identify an IPO list in the response. Open the response JSON in Postman and share it (remove any API key) so the data mapping can be adjusted.", "error");
      $("connection").className = "connection error";
      $("connection").innerHTML = "<i></i> Data format needs mapping";
      return;
    }
    state.ipos = rows;
    render();
    hideNotice();
    $("connection").className = "connection ok";
    $("connection").innerHTML = "<i></i> API connected";
    $("lastUpdated").textContent = new Date().toLocaleString("en-IN", {day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true}).replace(/\b(am|pm)\b/gi, m => m.toUpperCase());
  } catch (err) {
    showNotice(err.message, "error");
    $("connection").className = "connection error";
    $("connection").innerHTML = "<i></i> Connection issue";
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "↻ Refresh";
  }
}

document.querySelectorAll(".category-tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".category-tab").forEach(t => {
    t.classList.toggle("active", t === tab);
    t.setAttribute("aria-pressed", String(t === tab));
  });
  state.category = tab.dataset.category;
  render();
}));
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  state.filter = tab.dataset.filter;
  render();
}));
$("searchInput").addEventListener("input", e => { state.query = e.target.value; render(); });
$("refreshBtn").addEventListener("click", loadIpos);
$("closeModal").addEventListener("click", closeDetails);
$("detailModal").addEventListener("click", e => { if (e.target.dataset.close) closeDetails(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetails(); });
loadIpos();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .catch(error => console.error("Service Worker:", error));
  });
}

let installPrompt;
const installButton = $("installBtn");
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  installButton.hidden = true;
  await prompt.prompt();
});
window.addEventListener("appinstalled", () => { installButton.hidden = true; installPrompt = null; });
