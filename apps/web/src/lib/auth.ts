import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@chess/db";
import { username } from "better-auth/plugins";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  user: {
    additionalFields: {
      username: { type: "string", required: true, input: true },
      role: { type: "string", required: false, defaultValue: "MEMBER", input: false },
      vipExpiresAt: { type: "date", required: false, input: false },
      staExpiresAt: { type: "date", required: false, input: false },
      wins: { type: "number", required: false, defaultValue: 0, input: false },
      losses: { type: "number", required: false, defaultValue: 0, input: false },
      draws: { type: "number", required: false, defaultValue: 0, input: false },
      banned: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  plugins: [
    username({
      usernameNormalization: false,
      minUsernameLength: 3,
      maxUsernameLength: 20,
    }),
  ],
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"],
});

export type Session = typeof auth.$Infer.Session;
