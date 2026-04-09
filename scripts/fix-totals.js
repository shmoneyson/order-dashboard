const https = require("https");
const fs = require("fs");

const SUPABASE_URL = "https://vuqmyekwnrchbwhpeere.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cW15ZWt3bnJjaGJ3aHBlZXJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjM0MDEsImV4cCI6MjA5MTI5OTQwMX0.DhUcBO8WWhSlpO_PhbAZ4JHqU7R3QNk8BDENOeg6-y0";

function patch(externalId, total) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ total });
    const url = new URL(`${SUPABASE_URL}/rest/v1/orders?external_id=eq.${externalId}`);
    const req = https.request({
      method: "PATCH", hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      }
    }, (res) => { res.resume(); res.on("end", resolve); });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const orders = JSON.parse(fs.readFileSync("./mock_orders.json", "utf-8"));
  for (const o of orders) {
    await patch(o.number, o.total);
    console.log(`✅ ${o.number} → ${o.total} ₸`);
  }
  console.log("\nГотово!");
}

main().catch(console.error);