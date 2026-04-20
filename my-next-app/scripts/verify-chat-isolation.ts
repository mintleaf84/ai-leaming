
import _db, { closeDb } from '../src/lib/db';
import { createSession, listSessions, getSession, saveMessage } from '../src/lib/services/chat';
import { createUser } from '../src/lib/auth/user-service';

async function verifyIsolation() {
    console.log('🧪 Starting Chat Isolation Verification...');

    try {
        // 1. Create two temporary test users
        const timestamp = Date.now();
        const userA = await createUser(`test_user_a_${timestamp}`, 'password123');
        const userB = await createUser(`test_user_b_${timestamp}`, 'password123');

        console.log(`✅ Created test users: UserA(id=${userA.id}), UserB(id=${userB.id})`);

        // 2. User A creates a session
        const sessionA_Id = createSession(userA.id, 'User A Secret Chat');
        saveMessage(userA.id, sessionA_Id, 'user', 'Hello from User A');
        console.log(`✅ User A created session ${sessionA_Id}`);

        // 3. User B creates a session
        const sessionB_Id = createSession(userB.id, 'User B Secret Chat');
        saveMessage(userB.id, sessionB_Id, 'user', 'Hello from User B');
        console.log(`✅ User B created session ${sessionB_Id}`);

        // 4. Verify User A cannot see User B's session in list
        const userAList = listSessions(userA.id);
        const hasSessionB = userAList.some(s => s.id === sessionB_Id);
        if (hasSessionB) {
            throw new Error('❌ CRITICAL: User A can see User B\'s session in list!');
        }
        console.log('✅ Verified: User A list does not contain User B session');

        // 5. Verify User A cannot access User B's session detail
        const sessionBAccessAttempt = getSession(userA.id, sessionB_Id);
        if (sessionBAccessAttempt !== null) {
            throw new Error('❌ CRITICAL: User A can access User B\'s session details!');
        }
        console.log('✅ Verified: User A cannot get User B session details');

        // 6. Verify correct ownership
        const userBList = listSessions(userB.id);
        const userBOwnsSessionB = userBList.some(s => s.id === sessionB_Id);
        if (!userBOwnsSessionB) {
            throw new Error('❌ Error: User B cannot see their own session!');
        }
        console.log('✅ Verified: User B sees their own session');

        console.log('🎉 PASSED: Multi-tenancy isolation verified successfully!');

    } catch (error) {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    } finally {
        closeDb();
    }
}

verifyIsolation();
