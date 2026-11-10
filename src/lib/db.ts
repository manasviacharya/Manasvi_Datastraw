import { PrismaClient } from "@prisma/client";

/**
 * A single Prisma client for the whole app.
 *
 * Next.js hot-reloads modules in development, which would otherwise create a
 * new connection pool on every edit until Postgres refuses new connections.
 * Stashing the client on globalThis keeps one instance across reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
