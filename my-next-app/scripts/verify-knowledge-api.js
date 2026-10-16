const BASE_URL = "http://localhost:3000/api/v1";
const USER = {
  username: "knowledge_verifier_" + Date.now(),
  password: "password123",
};

async function main() {
  console.log(`[Verify] Starting Knowledge API verification...`);

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

  // 2. Create Knowledge Card
  console.log("[Verify] 2. Creating Knowledge Card...");
  const cardData = {
    title: "Test Card",
    category: "Test Category",
    tags: ["test"],
    front: "What is Hono?",
    back: "A small, simple, and ultrafast web framework.",
    key_points: [{ term: "Hono", definition: "Framework" }],
  };

  const createRes = await fetch(`${BASE_URL}/knowledge/cards`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cardData),
  });
  const createData = await createRes.json();

  if (createRes.status !== 200) {
    console.error("[Verify] Create Card Failed:", createData);
    process.exit(1);
  }
  console.log(`[Verify] Card Created. ID: ${createData.id}`);

  // 3. List Knowledge Cards
  console.log("[Verify] 3. Listing Knowledge Cards...");
  const listRes = await fetch(`${BASE_URL}/knowledge/cards?limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();

  if (listRes.status !== 200) {
    console.error("[Verify] List Cards Failed:", listData);
    process.exit(1);
  }

  if (!Array.isArray(listData.cards)) {
    console.error("[Verify] Invalid List Response:", listData);
    process.exit(1);
  }

  const found = listData.cards.find((c) => c.id === createData.id);
  if (!found) {
    console.error("[Verify] Created card not found in list!");
    process.exit(1);
  }

  if (found.front !== cardData.front) {
    console.error("[Verify] Card content mismatch:", found);
    process.exit(1);
  }

  console.log(`[Verify] List success. Found created card.`);
  console.log("[Verify] Knowledge API Verification Complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
