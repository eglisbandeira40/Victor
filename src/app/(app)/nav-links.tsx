"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Users,
  Repeat,
  CreditCard,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contas-a-receber", label: "Contas a Receber", icon: ArrowDownCircle },
  { href: "/contas-a-pagar", label: "Contas a Pagar", icon: ArrowUpCircle },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/regua-de-cobranca", label: "Régua de Cobrança", icon: Repeat },
  { href: "/configuracoes/gateway", label: "Gateway de Pagamento", icon: CreditCard },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-emerald-50 text-emerald-700"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
