import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      empresaId: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    empresaId: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    empresaId: string;
    role: string;
  }
}
