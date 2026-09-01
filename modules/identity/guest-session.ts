import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import type { db } from "@/db";
import { db as storefrontDatabase } from "@/db";
import { agentActions } from "@/db/schema/agent";
import { recommendationEvents } from "@/db/schema/analytics";
import { guestSessions } from "@/db/schema/identity";

const GUEST_SESSION_COOKIE = "guest_session";
const GUEST_SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export type GuestSession = {
  id: string;
};

export type GuestSessionStore = {
  findActive(tokenHash: string, now: Date): Promise<GuestSession | null>;
  create(input: {
    tokenHash: string;
    expiresAt: Date;
  }): Promise<GuestSession>;
  refresh(id: string, expiresAt: Date): Promise<void>;
};

type GuestSessionRouteOptions = {
  store: GuestSessionStore;
  now?: () => Date;
  issueToken?: () => string;
};

type GuestSessionHandler<Arguments extends unknown[] = []> = (
  request: Request,
  guestSession: GuestSession,
  ...arguments_: Arguments
) => Promise<Response>;

type GuestSessionBrowsingHandler<Arguments extends unknown[] = []> = (
  request: Request,
  guestSession: GuestSession | null,
  ...arguments_: Arguments
) => Promise<Response>;

export function createGuestSessionRoute<Arguments extends unknown[]>(
  handler: GuestSessionHandler<Arguments>,
  options: GuestSessionRouteOptions,
): (request: Request, ...arguments_: Arguments) => Promise<Response> {
  return createGuestSessionBoundary(
    (request, guestSession, ...arguments_) => {
      if (!guestSession) {
        throw new Error("A stateful route requires a Guest Session.");
      }
      return handler(request, guestSession, ...arguments_);
    },
    options,
    true,
  );
}

export function createGuestSessionBrowsingRoute<Arguments extends unknown[]>(
  handler: GuestSessionBrowsingHandler<Arguments>,
  options: GuestSessionRouteOptions,
): (request: Request, ...arguments_: Arguments) => Promise<Response> {
  return createGuestSessionBoundary(handler, options, false);
}

function createGuestSessionBoundary<Arguments extends unknown[]>(
  handler: (
    request: Request,
    guestSession: GuestSession | null,
    ...arguments_: Arguments
  ) => Promise<Response>,
  options: GuestSessionRouteOptions,
  createIfMissing: boolean,
): (request: Request, ...arguments_: Arguments) => Promise<Response> {
  return async (request, ...arguments_) => {
    const now = options.now?.() ?? new Date();
    const existingToken = readCookie(request, GUEST_SESSION_COOKIE);
    const existingSession = existingToken
      ? await options.store.findActive(hashToken(existingToken), now)
      : null;
    if (!existingSession && !createIfMissing) {
      return handler(request, null, ...arguments_);
    }

    const token =
      existingSession !== null
        ? existingToken!
        : (options.issueToken?.() ?? randomBytes(32).toString("base64url"));
    const tokenHash = hashToken(token);
    const expiresAt = guestSessionExpiry(now);
    const guestSession =
      existingSession ??
      (await options.store.create({ tokenHash, expiresAt }));
    if (existingSession) {
      await options.store.refresh(existingSession.id, expiresAt);
    }
    const response = await handler(request, guestSession, ...arguments_);

    response.headers.append("Set-Cookie", guestSessionCookie(token));
    return response;
  };
}

export function createDatabaseGuestSessionStore(
  database: Pick<typeof db, "select" | "insert" | "update">,
): GuestSessionStore {
  return {
    async findActive(tokenHash, now) {
      const [session] = await database
        .select({ id: guestSessions.id })
        .from(guestSessions)
        .where(
          and(
            eq(guestSessions.tokenHash, tokenHash),
            gt(guestSessions.expiresAt, now),
          ),
        )
        .limit(1);
      return session ?? null;
    },
    async create(input) {
      const [session] = await database
        .insert(guestSessions)
        .values(input)
        .returning({ id: guestSessions.id });
      return session;
    },
    async refresh(id, expiresAt) {
      await database
        .update(guestSessions)
        .set({ expiresAt, updatedAt: new Date() })
        .where(eq(guestSessions.id, id));
    },
  };
}

export async function cleanupExpiredGuestSessions(
  database: Pick<typeof db, "transaction">,
  now: Date,
): Promise<{ deletedGuestSessions: number }> {
  return database.transaction(async (transaction) => {
    const expiredSessions = await transaction
      .select({ id: guestSessions.id })
      .from(guestSessions)
      .where(lte(guestSessions.expiresAt, now))
      .for("update");
    if (expiredSessions.length === 0) {
      return { deletedGuestSessions: 0 };
    }

    const expiredSessionIds = expiredSessions.map(({ id }) => id);
    await transaction
      .delete(agentActions)
      .where(inArray(agentActions.guestSessionId, expiredSessionIds));
    await transaction
      .delete(recommendationEvents)
      .where(inArray(recommendationEvents.guestSessionId, expiredSessionIds));
    const deletedSessions = await transaction
      .delete(guestSessions)
      .where(
        and(
          inArray(guestSessions.id, expiredSessionIds),
          lte(guestSessions.expiresAt, now),
        ),
      )
      .returning({ id: guestSessions.id });

    return { deletedGuestSessions: deletedSessions.length };
  });
}

export function createStorefrontGuestSessionRoute(
  handler: GuestSessionHandler,
): (request: Request) => Promise<Response> {
  return createGuestSessionRoute(handler, {
    store: createDatabaseGuestSessionStore(storefrontDatabase),
  });
}

export function createStorefrontBrowsingRoute<Arguments extends unknown[]>(
  handler: (request: Request, ...arguments_: Arguments) => Promise<Response>,
): (request: Request, ...arguments_: Arguments) => Promise<Response> {
  return createGuestSessionBrowsingRoute(
    (request, _guestSession, ...arguments_) =>
      handler(request, ...arguments_),
    { store: createDatabaseGuestSessionStore(storefrontDatabase) },
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function guestSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + GUEST_SESSION_LIFETIME_SECONDS * 1000);
}

function guestSessionCookie(token: string): string {
  return `${GUEST_SESSION_COOKIE}=${token}; Max-Age=${GUEST_SESSION_LIFETIME_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = cookie.trim().split("=");
    if (cookieName === name) return valueParts.join("=");
  }

  return null;
}
