"use client";

import {
  FileCheck,
  Send,
  Link as LinkIcon,
  Files,
  Loader2,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  docx_generated: "Gerando DOCX",
  document_created: "Enviado",
  signer_created: "Configurando",
  sent_to_sign: "Aguard. Assinatura",
  signed: "Assinado",
  error: "Erro",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-500",
  docx_generated: "bg-blue-100 text-blue-600",
  document_created: "bg-indigo-100 text-indigo-600",
  signer_created: "bg-violet-100 text-violet-600",
  sent_to_sign: "bg-amber-100 text-amber-700",
  signed: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-600",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

import { useState } from "react";
import { DepartmentSelector } from "@/components/DepartmentSelector";

// ... (STATUS constants e fmtDate se mantêm)

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", selectedDepts],
    queryFn: async () => {
      const params = new URLSearchParams();
      selectedDepts.forEach(id => params.append("departmentIds", id));
      const response = await api.get(`/dashboard/stats?${params.toString()}`);
      return response.data;
    },
    refetchInterval: 30000,
  });

  const canSeeBalance = user?.role === "SUPER_ADMIN" || !!user?.canViewBalance;

  const { data: balance, isLoading: loadingBalance, isError: balanceError } = useQuery({
    queryKey: ["d4sign-balance"],
    queryFn: () => api.get("/d4sign/balance").then((r) => r.data),
    enabled: canSeeBalance,
    refetchInterval: 60000,
  });

  const credit = Number(balance?.credit ?? 0);
  const sent = Number(balance?.sent ?? 0);
  const remaining = Math.max(credit - sent, 0);
  const usedPct = credit > 0 ? Math.min(Math.round((sent / credit) * 100), 100) : 0;

  const cards = [
    {
      label: "Links Ativos",
      value: stats?.linksActive ?? "—",
      sub: `${stats?.linksTotal ?? 0} no total`,
      icon: LinkIcon,
      color: "bg-primary",
    },
    {
      label: "Aguardando Assinatura",
      value: stats?.sentToSign ?? "—",
      sub: "Documentos enviados",
      icon: Send,
      color: "bg-amber-500",
    },
    {
      label: "Assinados",
      value: stats?.signed ?? "—",
      sub: "Concluídos",
      icon: FileCheck,
      color: "bg-emerald-500",
    },
    {
      label: "Formulários Preenchidos",
      value: stats?.totalSubmissions ?? "—",
      sub: "Clientes que concluíram o envio",
      icon: Files,
      color: "bg-sky-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20 text-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Painel de Controle</h1>
          <p className="text-slate-500 mt-1">Portal de Documentos e Assinaturas Digitais.</p>
          <div className="mt-4">
            <DepartmentSelector selectedIds={selectedDepts} onChange={setSelectedDepts} />
          </div>
        </div>
        <button
          onClick={() => router.push("/admin/links")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] self-start md:self-center"
        >
          <Plus className="w-5 h-5" />
          Novo Link
        </button>
      </header>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-xl text-white shadow-lg", stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <h3 className="text-slate-500 font-medium text-sm">{stat.label}</h3>
            <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Atividades Recentes */}
        <div className="xl:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Atividades Recentes</h2>
            <button
              onClick={() => router.push("/admin/links")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver todos
            </button>
          </div>

          {!stats?.recentSubmissions?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Files className="w-10 h-10 mb-3 opacity-20" />
              <p className="font-medium text-sm">Nenhuma atividade ainda</p>
              <p className="text-xs mt-1">As submissões aparecerão aqui.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentSubmissions.map((sub: any, i: number) => (
                <motion.li
                  key={sub.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 px-8 py-4 hover:bg-slate-50/50 transition-colors group"
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                    sub.status === "signed" ? "bg-emerald-100" :
                      sub.status === "error" ? "bg-rose-100" :
                        sub.status === "sent_to_sign" ? "bg-amber-100" : "bg-slate-100"
                  )}>
                    {sub.status === "signed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : sub.status === "error" ? (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">
                      {sub.clientName || <span className="text-slate-300 font-normal italic">Sem nome</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-slate-400 truncate">
                        <FileText className="w-3 h-3 flex-shrink-0" />
                        {sub.templateName}
                        {sub.departmentName && (
                          <span className="text-slate-300">·</span>
                        )}
                        {sub.departmentName && (
                          <span className="truncate">{sub.departmentName}</span>
                        )}
                      </span>
                      {sub.linkCreatedAt && (
                        <span className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                          <Calendar className="w-3 h-3 flex-shrink-0" />
                          {fmtDate(sub.linkCreatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight flex-shrink-0",
                    STATUS_COLORS[sub.status] || "bg-slate-100 text-slate-500"
                  )}>
                    {STATUS_LABELS[sub.status] || sub.status}
                  </span>
                  {sub.token && (
                    <button
                      onClick={() => router.push(`/admin/links?highlight=${sub.token}`)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-slate-100 rounded-lg"
                      title="Ver na lista de links"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}
                </motion.li>
              ))}
            </ul>
          )}
        </div>

        {/* Status breakdown + info */}
        <div className="space-y-6">
          {/* Saldo D4Sign — só super admin ou usuários com a flag */}
          {canSeeBalance && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900">Saldo D4Sign</h2>
                <div className="p-2 rounded-xl bg-slate-100 text-slate-500">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              {loadingBalance ? (
                <div className="flex items-center justify-center py-6 text-slate-300">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : balanceError ? (
                <div className="flex flex-col items-center text-center py-3 gap-2">
                  <div className="p-2 rounded-full bg-rose-50 text-rose-500">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-rose-600">D4Sign não conectado</p>
                  <p className="text-xs text-slate-400">Verifique o token da API configurado no servidor.</p>
                </div>
              ) : credit === 0 ? (
                <div className="flex flex-col items-center text-center py-3 gap-2">
                  <div className="p-2 rounded-full bg-amber-50 text-amber-500">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-amber-600">Nenhum crédito disponível</p>
                  <p className="text-xs text-slate-400">Confirme o saldo diretamente no painel da D4Sign.</p>
                </div>
              ) : (
                <>
                  <p className={cn("text-3xl font-bold", remaining === 0 ? "text-rose-600" : "text-slate-900")}>
                    {remaining.toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">créditos disponíveis</p>
                  <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", remaining === 0 ? "bg-rose-500" : "bg-primary")}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <p className={cn("text-[11px] mt-2", remaining === 0 ? "text-rose-500 font-semibold" : "text-slate-400")}>
                    {remaining === 0
                      ? "Créditos esgotados — novos envios podem falhar."
                      : `${sent.toLocaleString("pt-BR")} de ${credit.toLocaleString("pt-BR")} créditos usados (${usedPct}%)`}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Breakdown por status */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">Documentos por Status</h2>
            {!stats?.statusBreakdown || !Object.keys(stats.statusBreakdown).length ? (
              <p className="text-sm text-slate-400 text-center py-4">Sem dados ainda</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(stats.statusBreakdown as Record<string, number>)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight",
                        STATUS_COLORS[status] || "bg-slate-100 text-slate-500"
                      )}>
                        {STATUS_LABELS[status] || status}
                      </span>
                      <span className="text-sm font-bold text-slate-700">{count}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...inputs: unknown[]) {
  return (inputs.filter(Boolean) as string[]).join(" ");
}
