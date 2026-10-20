const fs = require("fs");
const path = require("path");

const USER = process.env.GH_USER || "shivanimourya2";
const TOKEN = process.env.GH_TOKEN;
const OUT = process.env.OUT || "assets/contribution-graph.svg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Last 12 months, oldest -> newest (e.g. Nov ... Oct)
const now = new Date();
const slots = [];
for (let i = 11; i >= 0; i--) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
  slots.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: MONTHS[d.getUTCMonth()], count: 0 });
}
const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

async function load() {
  if (process.env.MOCK) {
    const mock = [18, 34, 26, 62, 48, 80, 55, 98, 70, 118, 90, 125];
    slots.forEach((s, i) => (s.count = mock[i]));
    return;
  }
  if (!TOKEN) throw new Error("GH_TOKEN is not set");
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){ contributionsCollection(from:$from,to:$to){
      contributionCalendar{ weeks{ contributionDays{ date contributionCount } } }
    } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { login: USER, from: from.toISOString(), to: now.toISOString() },
    }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
  for (const w of weeks) {
    for (const d of w.contributionDays) {
      const dt = new Date(d.date + "T00:00:00Z");
      const slot = slots.find((s) => s.key === `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`);
      if (slot) slot.count += d.contributionCount;
    }
  }
}

function render() {
  const W = 900, H = 400;
  const L = 90, R = 40, T = 30, B = 80;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(...slots.map((s) => s.count), 4);
  const top = Math.ceil((max * 1.1) / 4) * 4;
  const x = (i) => L + (pw * i) / (slots.length - 1);
  const y = (v) => T + ph * (1 - v / top);
  const pts = slots.map((s, i) => [x(i), y(s.count)]);
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `M${L},${T + ph} ` + pts.map((p) => `L${p[0]},${p[1]}`).join(" ") + ` L${x(slots.length - 1)},${T + ph} Z`;

  let grid = "";
  for (let g = 1; g <= 4; g++) {
    const v = (top / 4) * g;
    const gy = y(v);
    grid += `<line x1="${L}" y1="${gy}" x2="${W - R}" y2="${gy}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2" stroke-dasharray="10 8"/>`;
    grid += `<text x="${L - 12}" y="${gy + 4}" text-anchor="end" fill="#8b8b9a" font-size="12">${Math.round(v)}</text>`;
  }
  const labels = slots
    .map((s, i) => `<text x="${x(i)}" y="${T + ph + 30}" text-anchor="middle" fill="#e6e6ef" font-size="15">${s.label}</text>`)
    .join("");
  const dots = pts
    .map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="6" fill="#FF8FC7"><title>${slots[i].label}: ${slots[i].count} contributions</title></circle>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="stroke" gradientUnits="userSpaceOnUse" x1="${L}" y1="0" x2="${W - R}" y2="0">
      <stop offset="0" stop-color="#9B5DE5"/><stop offset="0.5" stop-color="#C45BD6"/><stop offset="1" stop-color="#FF8FC7"/>
    </linearGradient>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C45BD6" stop-opacity="0.35"/><stop offset="1" stop-color="#7B4AE2" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="#0d1117"/>
  ${grid}
  <line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="#8b8b9a" stroke-width="2"/>
  <line x1="${L}" y1="${T + ph}" x2="${W - R}" y2="${T + ph}" stroke="#8b8b9a" stroke-width="2"/>
  <path d="${area}" fill="url(#fill)"/>
  <polyline points="${line}" fill="none" stroke="url(#stroke)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  ${labels}
  <text x="${L + pw / 2}" y="${H - 14}" text-anchor="middle" fill="#e6e6ef" font-size="20">Month</text>
  <text transform="translate(24 ${T + ph / 2}) rotate(-90)" text-anchor="middle" fill="#e6e6ef" font-size="20">Contributions</text>
</svg>`;
}

load()
  .then(() => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, render());
    console.log("Wrote", OUT, slots.map((s) => `${s.label}:${s.count}`).join(" "));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });