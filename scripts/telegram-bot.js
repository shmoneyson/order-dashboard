const https = require("https");
const fs = require("fs");

const RETAILCRM_URL = "https://ernurrgalamat21104.retailcrm.ru";
const RETAILCRM_KEY = "cWncIMKNnyHc16HgSRaNO6V7E00bCkLZ";
const TELEGRAM_TOKEN = "8664031953:AAG6jgd6jZfwxLhdHJblJyWt0dTpkDZBbeI";
const TELEGRAM_CHAT_ID = "818105788";
const THRESHOLD = 50000;
const STATE_FILE = ".bot-state.json";

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
  catch { return { seenIds: [] }; }
}

function saveState(state) {
  state.seenIds = state.seenIds.slice(-500);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function tgPost(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" });
    const req = https.request({
      method: "POST",
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function crmGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, RETAILCRM_URL);
    https.get({
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { "X-API-KEY": RETAILCRM_KEY }
    }, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
}

function formatOrder(order) {
  const name = [order.firstName, order.lastName].filter(Boolean).join(" ") || "Неизвестно";
  const total = Number(order.totalSumm || 0).toLocaleString("ru");
  const items = (order.items || []).map(i => `  • ${i.offer?.name || "Товар"} x ${i.quantity}`).join("\n") || "  —";
  return `🔔 <b>Новый крупный заказ!</b>\n\n💰 <b>Сумма: ${total} ₸</b>\n📋 Номер: <code>${order.number}</code>\n👤 Клиент: ${name}\n\n🛒 Товары:\n${items}`;
}

async function poll(state) {
  try {
    const data1 = await crmGet("/api/v5/orders?limit=50&page=1");
    const data2 = await crmGet("/api/v5/orders?limit=50&page=2");
    const allOrders = [...(data1.orders || []), ...(data2.orders || [])];
    for (const order of allOrders) {
      const id = String(order.id);
      if (state.seenIds.includes(id)) continue;
      state.seenIds.push(id);
      if (Number(order.totalSumm || 0) > THRESHOLD) {
        console.log(`🔔 Заказ ${order.number} — ${order.totalSumm} ₸`);
        await tgPost(formatOrder(order));
      }
    }
    saveState(state);
  } catch (e) {
    console.error("Ошибка:", e.message);
  }
}

async function main() {
  console.log("🤖 Бот запущен, порог:", THRESHOLD, "₸");
  await tgPost(`✅ <b>Бот запущен!</b>\nОтслеживаю заказы &gt; ${THRESHOLD.toLocaleString("ru")} ₸`);
  const state = loadState();
  console.log("✅ Жду новых заказов...");
  setInterval(() => poll(state), 30000);
}

main().catch(console.error);