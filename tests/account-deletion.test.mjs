import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Execute the actual route with isolated Auth/Storage doubles; never delete a live account.
const source = stripTypeScriptTypes(readFileSync(new URL("../src/app/api/account/route.ts", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "").replace("export async function DELETE", "async function DELETE");
function setup({ user = { id: "caller", email: "student@uci.edu", email_confirmed_at: "today" }, failRemove = false, failSignOut = false } = {}) {
  const calls = [];
  let listed = false;
  const auth = { getUser: async () => ({ data: { user } }), signOut: async () => { calls.push("signOut"); return { error: failSignOut }; } };
  const admin = { storage: { from: () => ({
    list: async id => { calls.push(["list", id]); const data = listed ? [] : [{ name: "old.png" }, { name: "new.png" }]; listed = true; return { data }; },
    remove: async paths => { calls.push(["remove", paths]); return { error: failRemove }; },
  }) }, auth: { admin: { deleteUser: async id => { calls.push(["delete", id]); return {}; } } } };
  const route = new Function("NextResponse", "createAdminClient", "createClient", "isUciEmail", "profilePhotoBucket", "process", `${source}; return DELETE;`)(
    Response, () => admin, async () => ({ auth }), email => email?.endsWith("@uci.edu"), "profile-photos",
    { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "test-only" } },
  );
  return { calls, route };
}
function request(body = { confirmation: "DELETE", userId: "someone-else" }, origin = "https://anteract.test") {
  return new Request("https://anteract.test/api/account", { method: "DELETE", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("deletion rejects cross-origin requests and missing confirmation before touching data", async () => {
  const { route, calls } = setup();
  assert.equal((await route(request(undefined, "https://evil.test"))).status, 403);
  assert.equal((await route(request({}))).status, 400);
  assert.deepEqual(calls, []);
});
test("deletion requires a verified UCI user", async () => {
  for (const user of [null, { id: "caller", email: "student@uci.edu" }, { id: "caller", email: "other@example.com", email_confirmed_at: "today" }]) {
    const { route, calls } = setup({ user });
    assert.equal((await route(request())).status, 401);
    assert.deepEqual(calls, []);
  }
});
test("deletes only the authenticated caller after all photos and sessions are removed", async () => {
  const { route, calls } = setup();
  assert.equal((await route(request())).status, 200);
  assert.deepEqual(calls, [["list", "caller"], ["remove", ["caller/old.png", "caller/new.png"]], ["list", "caller"], "signOut", ["delete", "caller"]]);
});
test("storage and session failures stop auth deletion", async () => {
  for (const options of [{ failRemove: true }, { failSignOut: true }]) {
    const { route, calls } = setup(options);
    assert.equal((await route(request())).status, 500);
    assert.equal(calls.some(call => Array.isArray(call) && call[0] === "delete"), false);
  }
});
