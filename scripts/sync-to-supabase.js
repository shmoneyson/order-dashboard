const https = require("https");

const CONFIG = {
  RETAILCRM_URL: process.env.RETAILCRM_URL,
  RETAILCRM_KEY: process.env.RETAILCRM_API_KEY,
  SITE: process.env.RETAILCRM_SITE || "default",
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY,
};

function get(urlStr, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    https.get({ hostname: url.hostname, path: url.pathname + url.search, headers }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on("error", reject);
  });
}

function post(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(urlStr);
    const req = https.request({
      method: "POST", hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchAllOrders() {
  const all = [];
  let page = 1, totalPages = 1;
  do {
    const url = `${CONFIG.RETAILCRM_URL}/api/v5/orders?site=${CONFIG.SITE}&limit=100&page=${page}`;
    const data = await get(url, { "X-API-KEY": CONFIG.RETAILCRM_KEY });
    if (!data.success) throw new Error(JSON.stringify(data));
    all.push(...data.orders);
    totalPages = data.pagination.totalPageCount;
    console.log(`  Страница ${page}/${totalPages} — ${data.orders.length} заказов`);
    page++;
    await sleep(200);
  } while (page <= totalPages);
  return all;
}

function toRow(o) {
  return {
    external_id: String(o.externalId || o.id),
    crm_id: o.id,
    number: o.number,
    status: o.status,
    created_at: o.createdAt,
    total: o.sumTotal || 0,
    customer_name: [o.firstName, o.lastName].filter(Boolean).join(" ") || "—",
    customer_email: o.email || null,
    customer_phone: o.phone || null,
    items_count: (o.items || []).length,
    items_json: o.items || [],
    synced_at: new Date().toISOString(),
  };
}

async function upsert(rows) {
  const res = await post(
    `${CONFIG.SUPABASE_URL}/rest/v1/orders`,
    {
      "apikey": CONFIG.SUPABASE_KEY,
      "Authorization": `Bearer ${CONFIG.SUPABASE_KEY}`,
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    rows
  );
  if (res.status >= 400) throw new Error(`Supabase error: ${JSON.stringify(res.body)}`);
  return rows.length;
}

async function main() {
  console.log("RetailCRM → Supabase sync\n");
  console.log("1. Получаем заказы из RetailCRM...");
  const orders = await fetchAllOrders();
  console.log(`   Итого: ${orders.length} заказов\n`);

  console.log("2. Записываем в Supabase...");
  const rows = orders.map(toRow);
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    await upsert(rows.slice(i, i + BATCH));
    console.log(`   ${Math.min(i + BATCH, rows.length)}/${rows.length} записано`);
  }

  console.log("\nГотово!");
}

main().catch(console.error);