import type { NextAuthConfig } from "next-auth";

/**
 * Config compartilhada entre o middleware (Edge Runtime) e o auth.ts completo
 * (Node.js). Não pode importar Prisma/bcrypt aqui - o middleware não suporta
 * módulos nativos do Node, só o necessário para decodificar o JWT da sessão.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.empresaId = (user as { empresaId: string }).empresaId;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.empresaId = token.empresaId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
