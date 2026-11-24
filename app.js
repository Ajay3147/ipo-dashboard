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
  const raw = scalar(exactValue(ipo, ["issuesizecrore", "issuesizecr", "issuesize", "totalissuesize", "iposize", "offersize", "totaloffersize"]));
  if (raw == null) return "—";
  const text = String(raw).trim();
  if (/^(?:₹\s*)?[\d,.]+(?:\s*(?:cr\.?|crores?))?$/i.test(text)) return `₹${text.replace(/^₹\s*/, "").replace(/\s*(?:cr\.?|crores?)$/i, "")} Cr`;
  return text;
}
const dateKeys = {open:["opendate","startdate","issueopendate","ipoopendate"],close:["closedate","enddate","issueclosedate","ipoclosedate"],listing:["listingdate","ipolistingdate","listeddate"]};
function ipoDate(ipo, kind) { return parseDate(exactValue(ipo,dateKeys[kind])); }
function formatDate(d) { return d ? new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Kolkata"}).format(d) : "—"; }
function getOpenDate(ipo) { return formatDate(ipoDate(ipo,"open")); }
function getCloseDate(ipo) { return formatDate(ipoDate(ipo,"close")); }
function getListingDate(ipo) { return formatDate(ipoDate(ipo,"listing")); }
function offerDate(ipo) {
  const a=getOpenDate(ipo), b=getCloseDate(ipo);
  if(a==="—" && b==="—") return "—";
  const x=a.split(" "), y=b.split(" ");
  if(x.length===3 && y.length===3 && x[2]===y[2]) return x[1]===y[1] ? `${x[0]}–${b}` : `${x[0]} ${x[1]} – ${b}`;
  return `${a} – ${b}`;
}
function minInvestment(ipo) {
  const raw=scalar(exactValue(ipo,["mininvestment","minimuminvestment","minimumapplicationamount","minapplicationamount"]));
  if(raw==null) return "—";
  const n=Number(String(raw).replace(/[₹,\s]/g,""));
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : asText(raw);
}
function dateDistance(ipo) {
  const status=statusOf(ipo);
  const d=ipoDate(ipo,status==="upcoming"?"open":status==="open"?"close":"listing") || (status==="closed"||status==="listed"?ipoDate(ipo,"close"):null);
  const day = v => Date.parse(new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Asia/Kolkata"}).format(v));
  return d ? Math.abs(day(d)-day(new Date())) : Infinity;
}
const icons={tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1"/>',layers:'<path d="m12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5"/>',wallet:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M16 10h5v4h-5z"/>',trend:'<path d="m3 17 7-7 4 4 7-8 M15 6h6v6"/>',rupee:'<path d="M6 4h12 M6 8h12 M6 4c12 0 12 10 0 10l10 7"/>',chart:'<path d="M4 20V10 M12 20V4 M20 20V13"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4 M17 3v4 M3 10h18"/>',check:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4 M17 3v4 M3 10h18 m-6 5 3 3 4-5"/>'};
function label(icon,text){return `<span class="ipo-label"><svg width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[icon]}</svg>${text}</span>`;}
function metric(icon,title,value){return `<div>${label(icon,title)}<strong>${escapeHtml(value)}</strong></div>`;}

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
  const upper = Number((getPrice(ipo).match(/[\d,.]+/g) || []).pop()?.replace(/,/g,""));
  const percent = numeric(rawPercent ?? exactValue(ipo,["gmppercentage","gmppercent"])) ?? (price !== null && upper > 0 ? price / upper * 100 : null);
  return { amount: price === null ? "—" : `₹${price}`, percent };
}
function percentText(percent) {
  return percent === null ? "—" : `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
}
function percentClass(percent) {
  return percent > 0 ? "gmp-positive" : percent < 0 ? "gmp-negative" : "gmp-neutral";
}
// Exact aliases only: never confuse GMP or offer price with traded prices.
function gainNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const clean=String(value).replace(/[₹,%\s]/g, "");
  if (!clean || !/^[+-]?\d+(?:\.\d+)?$/.test(clean)) return null;
  const n=Number(clean); return Number.isFinite(n)?n:null;
}
function gainParts(ipo, kind) {
  const listing=kind==="listing";
  const price=gainNumber(exactValue(ipo, listing?["listingprice","listedprice","listingopenprice"]:["currentprice","currentmarketprice","lasttradedprice","ltp","cmp"]));
  const issue=gainNumber(exactValue(ipo,["finalissueprice","finalofferprice","allotmentprice","issueprice"]));
  const explicit=gainNumber(exactValue(ipo,listing?["listinggainpercentage","listinggainpercent","listinggainpct","listinggain"]:["currentgainpercentage","currentgainpercent","currentgainpct","currentgain"]));
  return {price, percent:explicit ?? (price!==null && price>0 && issue!==null && issue>0 ? (price-issue)/issue*100:null)};
}
function isListed(ipo) {
  if(statusOf(ipo)==="listed") return true;
  if(statusOf(ipo)!=="closed") return false;
  const d=ipoDate(ipo,"listing");
  return !!d && d<=new Date() && ["listing","current"].some(k=>{const g=gainParts(ipo,k);return g.percent!==null || g.price>0;});
}
function gainMetric(ipo,kind) {
  const g=gainParts(ipo,kind), name=kind==="listing"?"Listing":"Current";
  const price=g.price!==null && g.price>0 ? `₹${g.price.toLocaleString("en-IN",{maximumFractionDigits:2})}`:"Unavailable";
  return `<div>${label(kind==="listing"?"trend":"chart",name+" gain")}<div class="gmp-value"><strong class="${percentClass(g.percent)}">${percentText(g.percent)}</strong><button type="button" class="gmp-info" aria-label="Show ${name.toLowerCase()} price" aria-expanded="false" title="${name} price: ${price}">ⓘ</button><span class="gmp-pop" hidden>${name} price: ${price}</span></div></div>`;
}
function getGmp(ipo) {
  const {amount, percent} = gmpParts(ipo);
  return amount + (percent === null ? "" : ` (${percentText(percent)})`);
}

function getSubscription(ipo) {
  const raw = exactValue(ipo, ["subscriptiontotal", "overallsubscription", "totalsubscription", "subscriptiontimes", "subscription", "subscriptiondetails", "subscriptionstatus"]);
  const value = scalar(raw) ?? scalar(exactValue(raw, ["overall", "total", "subscriptiontotal", "overallsubscription", "totalsubscription", "times", "totaltimes"]));
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
  return [getPrice(ipo), getLotSize(ipo), getIssueSize(ipo), amount, percent, getOpenDate(ipo), getCloseDate(ipo), getListingDate(ipo), minInvestment(ipo), getSubscription(ipo)].filter(present).length;
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

  filtered.sort((a, b) => (dateDistance(a) - dateDistance(b)) || completeness(b) - completeness(a));
  $("resultCount").textContent = `${filtered.length} IPO${filtered.length === 1 ? "" : "s"}`;
  const grid = $("ipoRows");
  if (!filtered.length) {
    grid.innerHTML = `<p class="empty">${state.ipos.length ? "No IPOs match this filter." : "No IPO data loaded yet."}</p>`;
    return;
  }
  grid.innerHTML = filtered.map(ipo => {
    const status = isListed(ipo) ? "listed" : statusOf(ipo);
    const idx = state.ipos.indexOf(ipo);
    const {amount, percent} = gmpParts(ipo);
    const category = categoryOf(ipo);
    return `<article class="ipo-card">
      <div class="ipo-card-head"><div><h3>${escapeHtml(getName(ipo))}</h3>${category === "unknown" ? "" : `<span class="ipo-category ipo-category-${category}">${categoryLabel(category)}</span>`}</div><div class="ipo-card-actions"><span class="status status-${status}">${labelStatus(status)}</span><button class="details-link ipo-details" data-detail="${idx}" type="button" aria-label="View IPO details">Details →</button></div></div>
      <div class="ipo-fields ipo-metrics">${metric("tag","Offer Price",getPrice(ipo))}${metric("layers","Lot Size",getLotSize(ipo))}${metric("wallet","Issue Size",getIssueSize(ipo))}</div>
      <div class="ipo-gmp"><div>${label("trend","GMP")}<div class="gmp-value"><strong class="${percentClass(percent)}">${percentText(percent)}</strong><button type="button" class="gmp-info" aria-label="Show GMP price" aria-expanded="false" title="GMP Price: ${escapeHtml(amount)}">ⓘ</button><span class="gmp-pop" hidden>GMP Price: ${escapeHtml(amount)}</span></div></div>${metric("rupee","Min. investment",minInvestment(ipo))}${metric("chart","Subscription",getSubscription(ipo))}</div>
      <div class="gmp-disclaimer"><span aria-hidden="true">ⓘ</span><span>GMP is unofficial and unregulated, and not an indicator of listing price. SEBI has advised against relying on it (PR No. 75/2026). Not investment advice.</span></div>
      <div class="ipo-fields ipo-dates${isListed(ipo)?" ipo-dates-gains":""}">${metric("calendar","Offer Date",offerDate(ipo))}${metric("check","Listing Date",getListingDate(ipo))}${isListed(ipo)?gainMetric(ipo,"listing")+gainMetric(ipo,"current"):""}</div>
    </article>`;
  }).join("");
  grid.querySelectorAll(".gmp-info").forEach(btn => btn.addEventListener("click", () => { const pop=btn.nextElementSibling; pop.hidden=!pop.hidden; btn.setAttribute("aria-expanded",String(!pop.hidden)); }));
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
    ["Offer date", offerDate(ipo)],
    ["Listing date", getListingDate(ipo)],
    ["Minimum investment", minInvestment(ipo)],
    ["Total subscription", getSubscription(ipo)],
    ["GMP", getGmp(ipo)],
    ...(isListed(ipo)?[["Listing Gain",percentText(gainParts(ipo,"listing").percent)],["Current Gain",percentText(gainParts(ipo,"current").percent)]]:[])
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

    if (used.has(key.toLowerCase()) || Object.values(dateKeys).flat().includes(normalizeKey(key))) continue;

    html += `<div class="detail-item">
      <span>${escapeHtml(key.replace(/[_-]/g," "))}</span>
      <strong>${escapeHtml(/date/i.test(key) && typeof value === "string" && parseDate(value) ? formatDate(parseDate(value)) : asText(value))}</strong>
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
    $("lastUpdated").textContent = new Date().toLocaleString("en-IN", {day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:true,timeZone:"Asia/Kolkata"}).replace(/\b(am|pm)\b/gi, m => m.toUpperCase());
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
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
if (ios && !standalone()) installButton.hidden = false;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault(); installPrompt = event;
  if (!standalone()) installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (standalone()) return;
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); const choice=await prompt.userChoice; installButton.hidden=choice.outcome==="accepted"; }
    catch { $("installHelp").showModal(); }
  } else { $("installHelp").showModal(); }
});
window.addEventListener("appinstalled", () => { installButton.hidden = true; installPrompt = null; });
