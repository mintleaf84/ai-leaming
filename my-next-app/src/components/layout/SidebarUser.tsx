import { getSession } from "@/lib/auth/auth";
import { UserSection } from "./UserSection";

export async function SidebarUser() {
    const session = await getSession();
    const user = session?.user ? { 
        id: session.user.id, 
        username: session.user.username 
    } : null;

    return <UserSection user={user} />;
}
