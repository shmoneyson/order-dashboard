const fs = require("fs");
const https = require("https");

const CONFIG = {
  RETAILCRM_URL: process.env.RETAILCRM_URL,
  RETAILCRM_KEY: process.env.RETAILCRM_API_KEY,
  SITE: process.env.RETAILCRM_SITE || "default",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function retailcrmPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(body).toString();
    const url = new URL(path, CONFIG.RETAILCRM_URL);
    const options = {
      method: "POST",
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
        "X-API-KEY": CONFIG.RETAILCRM_KEY,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function mapStatus(s) {
  const map = { new: "new", processing: "new", completed: "complete", cancelled: "cancel-other" };
  return map[s] || "new";
}

async function main() {
  const orders = JSON.parse(fs.readFileSync("./mock_orders.json", "utf-8"));
  console.log(`Загружаем ${orders.length} заказов в RetailCRM...\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];

    const crmOrder = {
      externalId: order.number,
      createdAt: order.createdAt.replace("T", " ").replace("Z", ""),
      status: mapStatus(order.status),
      "customer[firstName]": order.customer.firstName,
      "customer[lastName]": order.customer.lastName,
      "customer[email]": order.customer.email,
      "customer[phones][0][number]": order.customer.phone,
      sumTotal: order.total,
    };

    order.items.forEach((item, idx) => {
      crmOrder[`items[${idx}][offer][name]`] = item.name;
      crmOrder[`items[${idx}][quantity]`] = item.quantity;
      crmOrder[`items[${idx}][initialPrice]`] = item.price;
    });

    let attempt = 0, success = false;

    while (attempt < 3 && !success) {
      attempt++;
      try {
        const res = await retailcrmPost(
          `/api/v5/orders/create?site=${CONFIG.SITE}`,
          { order: JSON.stringify(crmOrder) }
        );

        if (res.status === 201 || res.body?.success) {
          console.log(`✅ [${i + 1}/50] ${order.number} — OK`);
          ok++;
          success = true;
        } else {
          console.warn(`⚠️  [${i + 1}/50] ${order.number} — ${JSON.stringify(res.body?.errorMsg ?? res.body)}`);
          if (attempt < 3) await sleep(2000 * attempt);
        }
      } catch (err) {
        console.error(`❌ [${i + 1}/50] ${order.number} — ${err.message}`);
        if (attempt < 3) await sleep(2000 * attempt);
      }
    }

    if (!success) fail++;
    await sleep(200);
  }

  console.log(`\nГотово! Успешно: ${ok}, Ошибок: ${fail}`);
}

main().catch(console.error);