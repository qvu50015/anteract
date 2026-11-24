import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/chat-screen";

// Existing /chat/<profile-id> links continue to open a direct conversation.
// Participant and accepted-friend authorization is enforced in Postgres.
export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <ChatScreen key={id} recipientId={id} />;
}
