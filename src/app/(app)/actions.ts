"use server";

import { signOut } from "@/auth";

export async function sair() {
  await signOut({ redirectTo: "/login" });
}
