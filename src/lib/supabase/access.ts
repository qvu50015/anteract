export function isUciEmail(email: string | undefined): boolean {
  return typeof email === "string" && /^[^\s@]+@uci\.edu$/i.test(email);
}
export function confirmationDestination(value: string | null, redirectType?: string | null) {
  return redirectType === "recovery" || value === "/auth/reset-password" ? "/auth/reset-password" : "/";
}

export function isExistingSignup(user: { identities?: unknown[] } | null, error: { code?: string } | null) {
  return error?.code === "user_already_exists" || error?.code === "email_exists" ||
    (!error && user?.identities?.length === 0);
}
