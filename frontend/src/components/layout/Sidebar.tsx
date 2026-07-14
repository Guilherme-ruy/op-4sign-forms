"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Link as LinkIcon,
  LayoutDashboard,
  Files,
  LogOut,
  Users,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const baseMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: Files, label: "Modelos", href: "/admin/templates" },
  { icon: LinkIcon, label: "Links de Envio", href: "/admin/links" },
  { icon: BarChart3, label: "Relatórios", href: "/admin/reports" },
];

const adminMenuItems = [
  { icon: Users, label: "Gestão de Acesso", href: "/admin/users" },
  { icon: Mail, label: "E-mail", href: "/admin/email" },
];

interface EmailSettingsStatus {
  provider: "api" | "smtp";
  hasApiKey: boolean;
  smtpHost: string;
  smtpUser: string;
  hasSmtpPassword: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const menuItems = [
    ...baseMenuItems,
    ...(isSuperAdmin ? adminMenuItems : []),
  ];

  // Só o Super Admin vê o item de E-mail e tem permissão no endpoint.
  const { data: emailSettings } = useQuery<EmailSettingsStatus>({
    queryKey: ["email-settings"],
    queryFn: () => api.get("/email-settings").then((r) => r.data),
    enabled: isSuperAdmin,
    staleTime: 60_000,
  });

  // Enquanto não carrega, assume configurado para não piscar o alerta.
  const emailConfigured = emailSettings
    ? emailSettings.provider === "smtp"
      ? !!(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.hasSmtpPassword)
      : emailSettings.hasApiKey
    : true;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="w-64 h-full bg-primary flex flex-col text-white shadow-2xl">
      <div className="px-5 py-6">
        <div className="bg-white rounded-2xl px-4 py-3 flex items-center justify-center">
          <span className="text-base font-bold text-primary">Portal de Documentos</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
              pathname === item.href
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            <item.icon
              className={cn(
                "w-5 h-5 transition-colors",
                pathname === item.href ? "text-white" : "group-hover:text-white"
              )}
            />
            <span className="font-medium">{item.label}</span>
            {item.href === "/admin/email" && !emailConfigured && (
              <AlertTriangle
                className="w-4 h-4 ml-auto shrink-0 text-amber-400"
                aria-label="Nenhum e-mail configurado"
              />
            )}
            {pathname === item.href && (
              <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full" />
            )}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        {user && (
          <div className="px-4 py-2 mb-2">
            <p className="text-sm font-medium text-white truncate">{user.name || user.email}</p>
            <p className="text-xs text-white/50 truncate">{user.email}</p>
            <span className="inline-block mt-1 text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded-full">
              {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ADMIN" ? "Admin Dept." : "Operador"}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sair</span>
        </button>
      </div>
    </div>
  );
}
