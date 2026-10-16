const BASE_URL = "http://localhost:3000/api/v1";
const USER = {
  username: "mobile_verify_user_" + Date.now(),
  password: "password123",
};

async function main() {
  console.log(
    `[Verify] Starting mobile auth verification for user: ${USER.username}`,
  );

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

  if (!regData.token) {
    console.error("[Verify] No token returned in register response!");
    process.exit(1);
  }
  console.log(
    "[Verify] Registration success. Token received:",
    regData.token.substring(0, 10) + "...",
  );

  const token = regData.token;

  // 2. Access Protected Route (First Principles)
  console.log("[Verify] 2. Accessing Protected API (First Principles)...");

  // Route in practice.ts is /first-principles
  // Mounted at /practice
  // Full URL: /api/v1/practice/first-principles
  const apiRes = await fetch(`${BASE_URL}/practice/first-principles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ questionContent: "Test", correctAnswer: "A" }),
  });

  const apiData = await apiRes.json();
  console.log(`[Verify] API Response Status: ${apiRes.status}`);

  if (apiRes.status === 401) {
    console.error(
      "[Verify] Auth Failed! Got 401 Unauthorized with valid token.",
    );
    process.exit(1);
  }

  if (apiRes.status === 200 || apiRes.status === 403 || apiRes.status === 500) {
    if (apiData.error === "Unauthorized") {
      console.error("[Verify] Logic returned Unauthorized error body!");
      process.exit(1);
    }
    console.log("[Verify] Auth check passed! (Status was not 401)");
  }

  console.log("[Verify] Verification Complete!");
}

main().catch(console.error);
