export type FriendProfile = { id: string; display_name: string; major: string; class_year: string; interests: string[]; avatar_path: string | null; photoUrl: string };
export type Friendship = { id: string; sender_id: string; recipient_id: string; status: "pending" | "accepted" | "rejected"; created_at: string };
export type PeopleFilters = { major: string; year: string; sharedOnly: boolean };
export const emptyPeopleFilters: PeopleFilters = { major: "", year: "", sharedOnly: false };
const normalized = (value: string) => value.trim().toLowerCase();

export function sharedInterests(interests: string[], own: string[]) {
  const yours = new Set(own.map(normalized));
  return interests.filter(interest => yours.has(normalized(interest)));
}

export function filterPeople(people: FriendProfile[], filters: PeopleFilters, own: string[]) {
  return people.filter(person => (!filters.major || normalized(person.major) === normalized(filters.major))
    && (!filters.year || person.class_year === filters.year)
    && (!filters.sharedOnly || sharedInterests(person.interests, own).length > 0));
}

export function activeFriendship(requests: Friendship[], userId: string, profileId: string) {
  return requests.find(request => request.status !== "rejected" &&
    ((request.sender_id === userId && request.recipient_id === profileId) || (request.recipient_id === userId && request.sender_id === profileId)));
}

export function splitFriendships(requests: Friendship[], userId: string) {
  const own = requests.filter(request => request.sender_id === userId || request.recipient_id === userId);
  return {
    friends: own.filter(request => request.status === "accepted"),
    received: own.filter(request => request.status === "pending" && request.recipient_id === userId),
    sent: own.filter(request => request.status === "pending" && request.sender_id === userId),
  };
}
