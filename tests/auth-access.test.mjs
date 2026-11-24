import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmationDestination, isExistingSignup } from "../src/lib/supabase/access.ts";

test("confirmed duplicate signup is recognized even without an API error", () => {
  assert.equal(isExistingSignup({ identities: [] }, null), true);
  assert.equal(isExistingSignup(null, { code: "user_already_exists" }), true);
  assert.equal(isExistingSignup(null, { code: "email_exists" }), true);
});

test("new and unconfirmed signups are not mistaken for confirmed duplicates", () => {
  assert.equal(isExistingSignup({ identities: [{ provider: "email" }] }, null), false);
  assert.equal(isExistingSignup({ }, null), false);
  assert.equal(isExistingSignup(null, null), false);
});

test("rate limits are not reported as an existing account", () => {
  assert.equal(isExistingSignup({ identities: [] }, { code: "over_email_send_rate_limit" }), false);
});

test("recovery reaches the new-password form without a next parameter", () => {
  assert.equal(confirmationDestination(null, "recovery"), "/auth/reset-password");
  assert.equal(confirmationDestination("/", "recovery"), "/auth/reset-password");
});

test("explicit recovery destination remains supported", () => {
  assert.equal(confirmationDestination("/auth/reset-password"), "/auth/reset-password");
});

test("normal confirmation goes home and rejects external redirect destinations", () => {
  for (const next of [null, "/", "https://example.com", "//example.com"]) {
    assert.equal(confirmationDestination(next), "/");
  }
});
