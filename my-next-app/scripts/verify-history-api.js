const BASE_URL = "http://localhost:3000/api/v1";
const USER = {
  username: "history_verifier_" + Date.now(),
  password: "password123",
};

async function main() {
  console.log(`[Verify] Starting History API verification...`);

  // 1. Register/Login
  console.log("[Verify] 1. Getting Token...");
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(USER),
  });
  const regData = await regRes.json();
  if (!regRes.ok)
    throw new Error("Registration failed: " + JSON.stringify(regData));
  const token = regData.token;
  console.log("[Verify] Token acquired.");

  // 2. Call History List
  console.log("[Verify] 2. Calling GET /history ...");
  const listRes = await fetch(`${BASE_URL}/history?page=1&pageSize=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  console.log(`[Verify] List Status: ${listRes.status}`);

  if (listRes.status !== 200) {
    console.error("[Verify] List API Failed:", listData);
    process.exit(1);
  }

  if (!Array.isArray(listData.items) || typeof listData.total !== "number") {
    console.error("[Verify] Invalid List Response Structure:", listData);
    process.exit(1);
  }
  console.log(
    `[Verify] List API success. Found ${listData.items.length} items (Total: ${listData.total})`,
  );

  // 3. Call History Detail
  console.log("[Verify] 3. Calling GET /history/999999 (Expect 404/Empty)...");
  const detailRes = await fetch(`${BASE_URL}/history/999999`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (detailRes.status === 404) {
    console.log(
      "[Verify] Detail API correctly returned 404 for non-existent session.",
    );
  } else if (detailRes.status === 200) {
    console.log(
      "[Verify] Detail API returned 200 (Unexpected but valid HTTP).",
    );
  } else {
    console.error(
      `[Verify] Detail API returned unexpected status: ${detailRes.status}`,
    );
    if (detailRes.status === 500) process.exit(1);
  }

  console.log("[Verify] History API Verification Complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
