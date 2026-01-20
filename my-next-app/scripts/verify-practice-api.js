
const BASE_URL = 'http://localhost:3000/api/v1';
const USER = { username: 'practice_verifier_' + Date.now(), password: 'password123' };

async function main() {
    console.log(`[Verify] Starting Practice API verification...`);

    // 1. Register
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(USER)
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error('Registration failed: ' + JSON.stringify(regData));
    const token = regData.token;
    console.log('[Verify] Token acquired.');

    // 2. Create Session
    console.log('[Verify] 2. Creating Practice Session...');
    const sessionRes = await fetch(`${BASE_URL}/practice/session`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode: 'random', limit: 5 })
    });
    const sessionData = await sessionRes.json();

    if (sessionRes.status !== 200) {
        console.error('[Verify] Create Session Failed:', sessionData);
        process.exit(1);
    }

    if (!sessionData.sessionId || !Array.isArray(sessionData.questions)) {
        console.error('[Verify] Invalid Session Response:', sessionData);
        process.exit(1);
    }
    console.log(`[Verify] Session Created: ${sessionData.sessionId} (${sessionData.questions.length} questions)`);

    if (sessionData.questions.length === 0) {
        // If DB is empty, we can't test submit. 
        console.log('[Verify] No questions returned (DB might be empty). Skipping submit test.');
        return;
    }

    // 3. Submit Answer
    const q1 = sessionData.questions[0];
    console.log(`[Verify] 3. Submitting Answer for QID ${q1.id}...`);

    // Note: Hono route is defined as /session/:sessionId/submit
    const submitRes = await fetch(`${BASE_URL}/practice/session/${sessionData.sessionId}/submit`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            questionId: q1.id,
            userAnswer: 'A', // Just a random guess
            duration: 1000
        })
    });
    const submitData = await submitRes.json();

    if (submitRes.status !== 200) {
        console.error('[Verify] Submit Failed:', submitData);
        process.exit(1);
    }

    if (typeof submitData.isCorrect !== 'boolean' || typeof submitData.correctAnswer !== 'string') {
        console.error('[Verify] Invalid Submit Response:', submitData);
        process.exit(1);
    }

    console.log(`[Verify] Submit success. Correct? ${submitData.isCorrect}. Answer: ${submitData.correctAnswer}`);
    console.log('[Verify] Practice API Verification Complete!');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
