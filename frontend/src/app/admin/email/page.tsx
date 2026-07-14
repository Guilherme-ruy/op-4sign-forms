"use client";

import { useEffect, useState } from "react";
import {
  Send, Save, Loader2, Lock, ShieldCheck,
  AlertCircle, X, Trash2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

interface EmailSettingsData {
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPassword: boolean;
  source: "env" | "db";
  updatedAt: string | null;
}

/* ─── Modal de envio de teste ─── */
function TestModal({
  defaultTo,
  onClose,
}: {
  defaultTo: string;
  onClose: () => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const { showToast } = useToast();

  const testMutation = useMutation({
    mutationFn: (address: string) =>
      api.post("/email-settings/test", { to: address }).then((r) => r.data),
    onSuccess: (res: { ok: boolean; message: string }) => {
      showToast(res.message, res.ok ? "success" : "error");
      if (res.ok) onClose();
    },
    onError: () => showToast("Falha ao enviar o e-mail de teste.", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-slate-800">Enviar e-mail de teste</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            O teste usa a configuração <strong>salva</strong>. Se você fez alterações, salve antes de testar.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Enviar para</label>
            <input
              type="email"
              autoFocus
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="voce@empresa.com"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => to.includes("@") && testMutation.mutate(to.trim())}
              disabled={testMutation.isPending || !to.includes("@")}
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal de confirmação para limpar configurações ─── */
function ResetModal({
  onConfirm,
  onClose,
  isPending,
}: {
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-rose-600" />
            <h2 className="font-semibold text-slate-800">Limpar configurações de e-mail</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Isso remove a configuração SMTP salva do banco de dados. O portal volta a usar o
            fallback do <code>.env</code>, se houver, até que você configure novamente.
          </p>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Limpar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════ */
export default function EmailSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();

  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<number | "">("");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [error, setError] = useState("");

  const isSuper = user?.role === "SUPER_ADMIN";

  const { data, isLoading } = useQuery<EmailSettingsData>({
    queryKey: ["email-settings"],
    queryFn: () => api.get("/email-settings").then((r) => r.data),
    enabled: isSuper,
  });

  // Popula o formulário quando a configuração chega (segredos ficam vazios = mascarados).
  useEffect(() => {
    if (!data) return;
    setFromName(data.fromName || "");
    setFromEmail(data.fromEmail || "");
    setSmtpHost(data.smtpHost || "");
    setSmtpPort(data.smtpPort ?? "");
    setSmtpSecure(data.smtpSecure);
    setSmtpUser(data.smtpUser || "");
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put("/email-settings", {
        fromName,
        fromEmail,
        smtpHost,
        smtpPort: smtpPort === "" ? undefined : Number(smtpPort),
        smtpSecure,
        smtpUser,
        smtpPassword: smtpPassword || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-settings"] });
      showToast("Configurações de e-mail salvas!");
      setSmtpPassword("");
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || "Erro ao salvar as configurações.");
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.delete("/email-settings"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-settings"] });
      showToast("Configurações de e-mail removidas.");
      setSmtpPassword("");
      setShowReset(false);
    },
    onError: () => showToast("Falha ao limpar as configurações.", "error"),
  });

  // Considera "configurado" só quando há uma configuração salva via UI (não o fallback do .env).
  const isConfigured = !!data?.updatedAt && !!data?.fromEmail;

  function handleSave() {
    setError("");
    if (!fromEmail.trim()) { setError("Informe o e-mail do remetente."); return; }
    if (!smtpHost.trim()) { setError("Informe o servidor SMTP (host)."); return; }
    if (!smtpPort) { setError("Informe a porta SMTP."); return; }
    if (!smtpUser.trim()) { setError("Informe o usuário SMTP."); return; }
    if (!smtpPassword && !data?.hasSmtpPassword) { setError("Informe a senha SMTP."); return; }
    saveMutation.mutate();
  }

  // Guard: página exclusiva para Super Admin (mesmo padrão da Gestão de Acesso).
  if (user && !isSuper) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400">
        <ShieldCheck className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-bold text-slate-600">Acesso Restrito</h2>
        <p className="text-sm">Esta página é exclusiva para Super Administradores.</p>
      </div>
    );
  }

  const inputCls =
    "w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Configurações de E-mail</h1>
        <p className="text-sm text-slate-500 mt-1">
          Defina como o portal envia e-mails (links, convites, redefinição de senha).
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-3xl">
          <div className="p-6 sm:p-8 space-y-6">
            {/* Remetente */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do remetente</label>
                <input value={fromName} onChange={(e) => setFromName(e.target.value)} className={inputCls} placeholder="Portal de Documentos" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail do remetente</label>
                <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} className={inputCls} placeholder="noreply@empresa.com" />
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* SMTP */}
            <div className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Servidor SMTP (host)</label>
                  <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className={inputCls} placeholder="smtp.empresa.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Porta</label>
                  <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value === "" ? "" : Number(e.target.value))} className={inputCls} placeholder="587" />
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                <span>
                  <span className="block text-sm font-medium text-slate-700">Conexão segura (SSL/TLS)</span>
                  <span className="block text-xs text-slate-400">Ative para porta 465 (SSL); desative para 587 (STARTTLS).</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={smtpSecure}
                  onClick={() => setSmtpSecure((v) => !v)}
                  className={cn("relative w-10 h-6 rounded-full transition-colors flex-shrink-0", smtpSecure ? "bg-primary" : "bg-slate-300")}
                >
                  <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", smtpSecure ? "translate-x-4" : "translate-x-0")} />
                </button>
              </label>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Usuário</label>
                  <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className={inputCls} placeholder="usuario@empresa.com" autoComplete="off" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      className={cn(inputCls, "pl-9")}
                      placeholder={data?.hasSmtpPassword ? "•••••••••• (mantém a atual)" : "senha do SMTP"}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Nota de segurança */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Os segredos são guardados cifrados no banco e nunca exibidos novamente.
            </div>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {data?.updatedAt ? `Atualizado em ${new Date(data.updatedAt).toLocaleString("pt-BR")}` : "Nunca configurado pela interface"}
              </span>
              {isConfigured && (
                <button
                  type="button"
                  onClick={() => setShowReset(true)}
                  className="flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar configurações
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowTest(true)}
                disabled={!isConfigured}
                title={!isConfigured ? "Salve uma configuração antes de enviar um teste." : undefined}
                className="flex items-center gap-2 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                Enviar e-mail de teste
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm shadow-primary/20 whitespace-nowrap"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {showTest && <TestModal defaultTo={user?.email || ""} onClose={() => setShowTest(false)} />}
      {showReset && (
        <ResetModal
          isPending={resetMutation.isPending}
          onConfirm={() => resetMutation.mutate()}
          onClose={() => setShowReset(false)}
        />
      )}
    </div>
  );
}
