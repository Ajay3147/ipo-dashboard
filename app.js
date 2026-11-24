const state = { ipos: [], filter: "all", query: "" };
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
  if (STATUS_WORDS.open.some(w => s === w || s.includes(w))) return "open";
  if (STATUS_WORDS.closed.some(w => s.includes(w))) return "closed";
  if (STATUS_WORDS.upcoming.some(w => s.includes(w))) return "upcoming";

  const open = parseDate(findValue(ipo, ["opendate", "startdate", "issueopendate", "ipoopendate"]));
  const close = parseDate(findValue(ipo, ["closedate", "enddate", "issueclosedate", "ipoclosedate"]));
  const today = new Date(); today.setHours(0,0,0,0);
  if (open && today < open) return "upcoming";
  if (open && close && today >= open && today <= close) return "open";
  if (close && today > close) return "closed";
  return "unknown";
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
function getPrice(ipo) {
  return asText(findValue(ipo, ["priceband", "issueprice", "price", "pricerange", "issuepricerange"]));
}
function getOpenDate(ipo) {
  return asText(findValue(ipo, ["opendate", "startdate", "issueopendate", "ipoopendate"]));
}
function getCloseDate(ipo) {
  return asText(findValue(ipo, ["closedate", "enddate", "issueclosedate", "ipoclosedate"]));
}

function getGmp(ipo) {
  const gmp = ipo.gmp ?? ipo.GMP;

  if (!gmp) return "—";

  if (typeof gmp === "object") {
    const price = gmp.price;
    const percentage = gmp.percentage;

    const amount = price != null && price !== ""
      ? `₹${price}`
      : "—";

    const percent = percentage != null && percentage !== ""
      ? ` (${percentage}%)`
      : "";

    return amount + percent;
  }

  return `₹${gmp}`;
}

function getSubscription(ipo) {
  return findValue(ipo, ["subscription", "subscriptionstatus", "subscriptiondetails", "subscriptiontimes", "overallsubscription"]);
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

function render() {
  const counts = { upcoming:0, open:0, closed:0, listed:0, unknown:0 };
  state.ipos.forEach(ipo => counts[statusOf(ipo)]++);
  $("upcomingCount").textContent = counts.upcoming;
  $("openCount").textContent = counts.open;
  $("closedCount").textContent = counts.closed + counts.listed;
  $("allTabCount").textContent = state.ipos.length;

  const filtered = state.ipos.filter(ipo => {
    const status = statusOf(ipo);
    const matchFilter = state.filter === "all" ||
      (state.filter === "closed" ? ["closed","listed"].includes(status) : status === state.filter);
    const searchText = (getName(ipo) + " " + JSON.stringify(ipo)).toLowerCase();
    return matchFilter && searchText.includes(state.query.toLowerCase());
  });

  $("resultCount").textContent = `${filtered.length} IPO${filtered.length === 1 ? "" : "s"}`;
  const tbody = $("ipoRows");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${state.ipos.length ? "No IPOs match this filter." : "No IPO data loaded yet."}</td></tr>`;
    return;
  }
  console.log("GMP DEBUG:", filtered.map(ipo => ({
    name: getName(ipo),
    gmp: ipo.gmp,
    formatted: getGmp(ipo)
  })));
  tbody.innerHTML = filtered.map((ipo) => {
    const status = statusOf(ipo);
    const idx = state.ipos.indexOf(ipo);
    return `<tr>
      <td><span class="company">${escapeHtml(getName(ipo))}</span><span class="subline">${escapeHtml(asText(findValue(ipo, ["symbol","category","exchange","issue type"])))}</span></td>
      <td>${escapeHtml(getGmp(ipo))}</td>
      <td>${escapeHtml(getPrice(ipo))}</td>
      <td>${escapeHtml(getOpenDate(ipo))}</td>
      <td>${escapeHtml(getCloseDate(ipo))}</td>
      <td><span class="status status-${status}">${labelStatus(status)}</span></td>
      <td><button class="details-link" data-detail="${idx}" type="button">View details →</button></td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll("[data-detail]").forEach(btn => btn.addEventListener("click", () => openDetails(state.ipos[Number(btn.dataset.detail)])));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function openDetails(ipo) {
  $("modalTitle").textContent = getName(ipo);
  const preferred = [
    ["Status", labelStatus(statusOf(ipo))],
    ["Issue price", getPrice(ipo)],
    ["Open date", getOpenDate(ipo)],
    ["Close date", getCloseDate(ipo)],
    ["GMP", getGmp(ipo)],
    ["Subscription", asText(getSubscription(ipo))]
  ];
  const used = new Set();
  let html = preferred.map(([k,v]) => {
    used.add(k.toLowerCase());
    return `<div class="detail-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`;
  }).join("");
  for (const [key, value] of Object.entries(ipo)) {
    if (value == null || value === "") continue;

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
    $("lastUpdated").textContent = new Date().toLocaleString();
  } catch (err) {
    showNotice(err.message, "error");
    $("connection").className = "connection error";
    $("connection").innerHTML = "<i></i> Connection issue";
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "↻ Refresh";
  }
}

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
