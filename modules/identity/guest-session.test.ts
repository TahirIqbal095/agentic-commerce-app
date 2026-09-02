import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuestSessionRoute,
  type GuestSessionStore,
} from "./guest-session";

test("the first stateful request receives a secure Guest Session cookie", async () => {
  const createdSessions: Array<{
    tokenHash: string;
    expiresAt: Date;
  }> = [];
  const store: GuestSessionStore = {
    async findActive() {
      return null;
    },
    async create(input) {
      createdSessions.push(input);
      return { id: "guest-session-id" };
    },
    async refresh() {
      throw new Error("A new Guest Session must not be refreshed");
    },
  };
  const route = createGuestSessionRoute(
    async (_request, guestSession) =>
      Response.json({ guestSessionId: guestSession.id }),
    {
      store,
      now: () => new Date("2026-09-01T00:00:00.000Z"),
      issueToken: () => "server-issued-opaque-token",
    },
  );

  const response = await route(
    new Request("https://storefront.example/api/stateful", {
      method: "POST",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    guestSessionId: "guest-session-id",
  });
  assert.equal(createdSessions.length, 1);
  assert.notEqual(createdSessions[0].tokenHash, "server-issued-opaque-token");
  assert.equal(
    createdSessions[0].expiresAt.toISOString(),
    "2026-10-01T00:00:00.000Z",
  );

  const cookie = response.headers.get("set-cookie");
  assert.match(cookie ?? "", /^guest_session=server-issued-opaque-token;/);
  assert.match(cookie ?? "", /HttpOnly/i);
  assert.match(cookie ?? "", /Secure/i);
  assert.match(cookie ?? "", /SameSite=Lax/i);
  assert.match(cookie ?? "", /Path=\//i);
  assert.match(cookie ?? "", /Max-Age=2592000/i);
});

test("an existing Guest Session is reused with a sliding 30-day expiry", async () => {
  const refreshedSessions: Array<{ id: string; expiresAt: Date }> = [];
  const store: GuestSessionStore = {
    async findActive(tokenHash, now) {
      assert.equal(
        tokenHash,
        "be76020019b4a283b1a917ffb86da2788d11459191ccc0da98d3e7b9950a8c62",
      );
      assert.equal(now.toISOString(), "2026-09-15T12:00:00.000Z");
      return { id: "existing-guest-session-id" };
    },
    async create() {
      throw new Error("An active Guest Session must be reused");
    },
    async refresh(id, expiresAt) {
      refreshedSessions.push({ id, expiresAt });
    },
  };
  const route = createGuestSessionRoute(
    async (_request, guestSession) =>
      Response.json({ guestSessionId: guestSession.id }),
    {
      store,
      now: () => new Date("2026-09-15T12:00:00.000Z"),
      issueToken: () => {
        throw new Error("An active Guest Session needs no new token");
      },
    },
  );

  const response = await route(
    new Request("https://storefront.example/api/stateful", {
      method: "POST",
      headers: { cookie: "guest_session=existing-opaque-token" },
    }),
  );

  assert.deepEqual(await response.json(), {
    guestSessionId: "existing-guest-session-id",
  });
  assert.deepEqual(
    refreshedSessions.map(({ id, expiresAt }) => ({
      id,
      expiresAt: expiresAt.toISOString(),
    })),
    [
      {
        id: "existing-guest-session-id",
        expiresAt: "2026-10-15T12:00:00.000Z",
      },
    ],
  );
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /^guest_session=existing-opaque-token;/,
  );
});

test("the next stateful request after expiry starts a fresh Guest Session", async () => {
  const createdSessions: Array<{
    tokenHash: string;
    expiresAt: Date;
  }> = [];
  const store: GuestSessionStore = {
    async findActive(_tokenHash, now) {
      assert.equal(now.toISOString(), "2026-09-01T00:00:00.001Z");
      return null;
    },
    async create(input) {
      createdSessions.push(input);
      return { id: "fresh-guest-session-id" };
    },
    async refresh() {
      throw new Error("An expired Guest Session must not be refreshed");
    },
  };
  const route = createGuestSessionRoute(
    async (_request, guestSession) =>
      Response.json({ guestSessionId: guestSession.id }),
    {
      store,
      now: () => new Date("2026-09-01T00:00:00.001Z"),
      issueToken: () => "fresh-server-issued-token",
    },
  );

  const response = await route(
    new Request("https://storefront.example/api/stateful", {
      method: "POST",
      headers: { cookie: "guest_session=expired-browser-token" },
    }),
  );

  assert.deepEqual(await response.json(), {
    guestSessionId: "fresh-guest-session-id",
  });
  assert.equal(createdSessions.length, 1);
  assert.equal(
    createdSessions[0].expiresAt.toISOString(),
    "2026-10-01T00:00:00.001Z",
  );
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /^guest_session=fresh-server-issued-token;/,
  );
});
