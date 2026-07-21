import { auth } from "@/auth";
import { NavLinks } from "./nav-links";
import { sair } from "./actions";
import { LogOut } from "lucide-react";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-1">
      <aside className="flex w-64 flex-col border-r border-zinc-200 bg-white px-4 py-6">
        <span className="mb-8 px-2 text-xl font-bold tracking-tight text-emerald-600">
          HubFinance
        </span>

        <NavLinks />

        <div className="mt-auto border-t border-zinc-200 pt-4">
          <p className="truncate px-2 text-sm font-medium text-zinc-800">
            {session?.user?.name}
          </p>
          <p className="truncate px-2 text-xs text-zinc-500">
            {session?.user?.email}
          </p>
          <form action={sair}>
            <button
              type="submit"
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              <LogOut size={16} />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 bg-zinc-50 p-8">{children}</main>
    </div>
  );
}
