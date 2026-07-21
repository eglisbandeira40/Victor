"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { cadastroSchema } from "@/lib/validations";
import { signIn } from "@/auth";

export type CadastroState = { error?: string };

export async function cadastrar(
  _prevState: CadastroState,
  formData: FormData
): Promise<CadastroState> {
  const parsed = cadastroSchema.safeParse({
    empresaNome: formData.get("empresaNome"),
    nome: formData.get("nome"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { empresaNome, nome, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Já existe uma conta com este e-mail" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.empresa.create({
    data: {
      nome: empresaNome,
      email,
      users: {
        create: {
          name: nome,
          email,
          passwordHash,
          role: "ADMIN",
        },
      },
    },
  });

  await signIn("credentials", { email, password, redirectTo: "/dashboard" });

  return {};
}
