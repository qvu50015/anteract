"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseEventTags } from "@/lib/event-tags";
import type { Category, Hangout } from "@/lib/hangouts";

export type SharedEvent = Hangout & {
  startsAt: string;
  createdAt?: string;
  hostName: string;
  isJoined: boolean;
  isHost: boolean;
};

type NewEvent = {
  title: string;
  category: Exclude<Category, "All">;
  location: string;
  startsAt: string;
  description: string;
  meetingPoint: string;
  bring: string;
  capacity: number;
  tags: string[];
};

type EventContextValue = {
  events: SharedEvent[];
  userId: string;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  createEvent: (event: NewEvent) => Promise<string>;
  joinEvent: (eventId: string) => Promise<void>;
  leaveEvent: (eventId: string) => Promise<void>;
  cancelEvent: (eventId: string) => Promise<void>;
};

const EventContext = createContext<EventContextValue | null>(null);

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Could not complete that event action. Please try again.";
}

export function EventProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<SharedEvent[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const [{ data: { user }, error: authError }, { data, error: queryError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("events").select("*, profiles!events_host_id_fkey(display_name), event_members(user_id)").order("starts_at", { ascending: true }),
      ]);
      if (authError) throw authError;
      if (queryError) throw queryError;
      setUserId(user?.id ?? "");
      setEvents((data ?? []).map((row) => {
        const members = Array.isArray(row.event_members) ? row.event_members : [];
        const host = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id,
          title: row.title,
          category: row.category,
          location: row.location,
          time: formatEventTime(row.starts_at),
          startsAt: row.starts_at,
          createdAt: row.created_at,
          tags: Array.isArray(row.tags) ? row.tags : [],
          description: row.description,
          participants: members.length + 1,
          capacity: row.capacity,
          hostId: row.host_id,
          attendeeIds: members.map((member: { user_id: string }) => member.user_id),
          meetingPoint: row.meeting_point,
          bring: row.bring,
          hostName: host?.display_name ?? "UCI student",
          isJoined: members.some((member: { user_id: string }) => member.user_id === user?.id),
          isHost: row.host_id === user?.id,
        } satisfies SharedEvent;
      }));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createEvent(event: NewEvent) {
    const parsedTags = parseEventTags(event.tags);
    if (!parsedTags.ok) throw new Error(parsedTags.error);
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error("Please log in to create an event.");
    const { error: profileError, data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Save your profile before creating an event.");
    const { data, error: insertError } = await supabase.from("events").insert({
      host_id: user.id,
      title: event.title,
      category: event.category,
      location: event.location,
      starts_at: event.startsAt,
      description: event.description,
      meeting_point: event.meetingPoint,
      bring: event.bring,
      capacity: event.capacity,
      tags: parsedTags.tags,
    }).select("id").single();
    if (insertError) throw insertError;
    await refresh();
    return data.id as string;
  }

  async function joinEvent(eventId: string) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error("Please log in to join an event.");
    const { error: joinError } = await supabase.from("event_members").insert({ event_id: eventId, user_id: user.id });
    if (joinError) throw joinError;
    await refresh();
  }

  async function leaveEvent(eventId: string) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error("Please log in to leave an event.");
    const { error: leaveError } = await supabase.from("event_members").delete().eq("event_id", eventId).eq("user_id", user.id);
    if (leaveError) throw leaveError;
    await refresh();
  }

  async function cancelEvent(eventId: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("events").delete().eq("id", eventId);
    if (deleteError) throw deleteError;
    await refresh();
  }

  return <EventContext.Provider value={{ events, userId, loading, error, refresh, createEvent, joinEvent, leaveEvent, cancelEvent }}>{children}</EventContext.Provider>;
}

export function useEvents() {
  const context = useContext(EventContext);
  if (!context) throw new Error("useEvents must be used inside EventProvider");
  return context;
}
