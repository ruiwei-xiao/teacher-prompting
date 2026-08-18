import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { acceptPendingEmailInvitesOnSignIn } from "@/lib/auth/accept-pending-email-invites";
import {
  createUser,
  getUserByEmail,
  rememberDisplayProfile,
  upsertOAuthUser,
} from "@/lib/auth/user-store";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

if (
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    })
  );
}

providers.push(
  Credentials({
    name: "Email and Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email || "").trim().toLowerCase();
      const password = String(credentials?.password || "");

      if (!email || !password) return null;

      const user = await getUserByEmail(email);
      if (!user?.passwordHash) return null;

      const matches = await compare(password, user.passwordHash);
      if (!matches) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name ?? user.email,
        image: user.image,
      };
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "credentials" && user.email) {
        const storedUser = await upsertOAuthUser({
          email: user.email,
          name: user.name ?? undefined,
          image: typeof user.image === "string" ? user.image : undefined,
        });
        user.id = storedUser.id;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      if (user?.email) {
        token.email = user.email;
      }
      if (typeof user?.name === "string" && user.name.trim()) {
        token.name = user.name.trim();
      }
      if (typeof user?.image === "string" && user.image.trim()) {
        token.picture = user.image.trim();
      }

      if (!token.userId && token.email) {
        const storedUser = await getUserByEmail(String(token.email));
        if (storedUser?.id) {
          token.userId = storedUser.id;
        }
      }

      // Task 5.1: on sign-in (user present), accept pending email Workspace invites.
      if (user && token.userId && token.email) {
        try {
          await acceptPendingEmailInvitesOnSignIn(
            String(token.userId),
            String(token.email)
          );
        } catch (error) {
          console.error("Failed to accept pending email Workspace invites:", error);
        }
      }

      if (user && token.userId) {
        try {
          await rememberDisplayProfile({
            userId: String(token.userId),
            name: typeof token.name === "string" ? token.name : undefined,
            image: typeof token.picture === "string" ? token.picture : undefined,
          });
        } catch (error) {
          console.error("Failed to remember display profile:", error);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = String(token.userId);
      }
      if (session.user && typeof token.name === "string") {
        session.user.name = token.name;
      }
      if (session.user && typeof token.picture === "string") {
        session.user.image = token.picture;
      }

      return session;
    },
  },
});

export async function registerUser(input: {
  email: string;
  passwordHash: string;
  name?: string;
}) {
  return createUser(input);
}
