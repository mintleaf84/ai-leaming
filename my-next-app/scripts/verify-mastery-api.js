const BASE_URL = "http://localhost:3000/api/v1";
const USER = {
  username: "mastery_verifier_" + Date.now(),
  password: "password123",
};

async function main() {
  console.log(`[Verify] Starting Mastery API verification...`);

  // 1. Register
  console.log("[Verify] 1. Registering...");
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(USER),
  });
  const regData = await regRes.json();
  if (!regRes.ok) {
    console.error("[Verify] Registration failed:", regData);
    process.exit(1);
  }
  const token = regData.token;
  console.log("[Verify] Token acquired.");

  // 2. Get Mastery Tree (Should be empty initially or basic structure)
  console.log("[Verify] 2. Getting Mastery Tree...");
  const treeRes = await fetch(`${BASE_URL}/mastery/tree`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const treeData = await treeRes.json();

  if (treeRes.status !== 200) {
    console.error("[Verify] Get Tree Failed:", treeData);
    process.exit(1);
  }

  if (!Array.isArray(treeData)) {
    console.error("[Verify] Invalid Tree Response (Not Array):", treeData);
    process.exit(1);
  }
  console.log(`[Verify] Tree received. Nodes count: ${treeData.length}`);

  // 3. Get specific stats (e.g. for a non-existent tag should return 0)
  console.log('[Verify] 3. Getting Stats for "non/existent/tag"...');
  const statsRes = await fetch(
    `${BASE_URL}/mastery/stats?tag=non/existent/tag`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const statsData = await statsRes.json();

  if (statsRes.status !== 200) {
    console.error("[Verify] Get Stats Failed:", statsData);
    process.exit(1);
  }

  if (
    typeof statsData.avgScore !== "number" ||
    typeof statsData.count !== "number"
  ) {
    console.error("[Verify] Invalid Stats Response:", statsData);
    process.exit(1);
  }
  console.log(
    `[Verify] Stats received. Avg: ${statsData.avgScore}, Count: ${statsData.count}`,
  );

  console.log("[Verify] Mastery API Verification Complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
