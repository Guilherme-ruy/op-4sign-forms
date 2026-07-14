"use client";

import { useEffect, useState } from "react";
import {
  Send, Save, Loader2, Lock, ShieldCheck,
  AlertCircle, X, Trash2, Palette, Eye, Server,
  Link2, KeyRound, UserPlus, Info, Code2, type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

type EmailType = "link" | "reset" | "invite";

interface EmailTypeContent {
  subject: string;
  title: string;
  body: string;
  buttonText: string;
}

interface EmailContentData {
  accentColor: string;
  portalDisplayName: string;
  link: EmailTypeContent;
  reset: EmailTypeContent;
  invite: EmailTypeContent;
  source: "db" | "default";
  updatedAt: string | null;
}

const EMAIL_TYPE_TABS: { key: EmailType; label: string; description: string; icon: LucideIcon }[] = [
  {
    key: "link",
    label: "Link de Preenchimento",
    description: "Enviado quando você gera um link para o cliente preencher um documento.",
    icon: Link2,
  },
  {
    key: "reset",
    label: "Redefinição de Senha",
    description: "Enviado quando um usuário do portal pede para redefinir a senha.",
    icon: KeyRound,
  },
  {
    key: "invite",
    label: "Convite",
    description: "Enviado quando você convida um novo usuário para acessar o portal.",
    icon: UserPlus,
  },
];

const EMAIL_TYPE_TOKENS: Record<EmailType, string[]> = {
  link: ["{{templateName}}", "{{portalName}}"],
  reset: ["{{recipientName}}", "{{portalName}}"],
  invite: ["{{recipientName}}", "{{portalName}}"],
};

const TOKEN_DICTIONARY: { token: string; description: string; availableIn: string }[] = [
  {
    token: "{{templateName}}",
    description: "Nome do modelo de documento que o cliente vai preencher.",
    availableIn: "Link de Preenchimento",
  },
  {
    token: "{{recipientName}}",
    description: "Nome da pessoa que vai receber o e-mail.",
    availableIn: "Redefinição de Senha, Convite",
  },
  {
    token: "{{portalName}}",
    description: 'O nome definido no campo "Nome exibido no e-mail", logo acima dos modelos.',
    availableIn: "Todos os modelos",
  },
];

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

/* ─── Modal de confirmação para restaurar o conteúdo padrão dos e-mails ─── */
function ContentResetModal({
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
            <h2 className="font-semibold text-slate-800">Restaurar padrão dos e-mails</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Isso remove toda a personalização de cor, nome e texto dos 3 e-mails (link, redefinição
            de senha e convite), voltando ao conteúdo padrão do sistema. Essa ação não pode ser desfeita.
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
              Restaurar padrão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal "Como Funciona" ─── */
function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Como funcionam os E-mails?</h2>
              <p className="text-sm text-slate-500 font-medium">Configuração de envio e personalização do conteúdo.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto">
          {/* Resumo das duas seções */}
          <div className="space-y-5">
            <div className="flex gap-5">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 mt-1">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">SMTP</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Define <strong>como</strong> o portal envia os e-mails: servidor, porta, usuário e senha da sua caixa de e-mail.
                </p>
              </div>
            </div>
            <div className="flex gap-5">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mt-1">
                <Palette className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Design e Conteúdo</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Define <strong>o que</strong> é enviado: cor de destaque, nome do portal, e o assunto/título/mensagem/botão
                  de cada um dos 3 modelos — Link de Preenchimento, Redefinição de Senha e Convite. Cada modelo é independente
                  dos outros dois.
                </p>
              </div>
            </div>
          </div>

          {/* Dicionário de variáveis */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Code2 className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Dicionário de variáveis</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              No campo <strong>Mensagem</strong> (e no Assunto), você pode usar as variáveis abaixo entre chaves duplas —
              elas são trocadas automaticamente pelo valor real na hora do envio.
            </p>
            <div className="space-y-2.5">
              {TOKEN_DICTIONARY.map((item) => (
                <div key={item.token} className="flex items-start gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <code className="text-xs font-bold text-primary bg-primary/10 px-2 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0 mt-0.5">
                    {item.token}
                  </code>
                  <div>
                    <p className="text-sm text-slate-700">{item.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Disponível em: {item.availableIn}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-all">
            Entendi
          </button>
        </div>
      </motion.div>
    </motion.div>
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
  const [showHelpModal, setShowHelpModal] = useState(false);
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

  /* ─── Navegação principal da página (SMTP vs Design) ─── */
  const [activeMainTab, setActiveMainTab] = useState<"smtp" | "design">("smtp");

  /* ─── Personalização de conteúdo/design dos e-mails ─── */
  const [activeEmailTab, setActiveEmailTab] = useState<EmailType>("link");
  const [accentColor, setAccentColor] = useState("#0A0A0A");
  const [portalDisplayName, setPortalDisplayName] = useState("");
  const [emailContent, setEmailContent] = useState<Record<EmailType, EmailTypeContent>>({
    link: { subject: "", title: "", body: "", buttonText: "" },
    reset: { subject: "", title: "", body: "", buttonText: "" },
    invite: { subject: "", title: "", body: "", buttonText: "" },
  });
  const [showContentReset, setShowContentReset] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const { data: contentData, isLoading: loadingContent } = useQuery<EmailContentData>({
    queryKey: ["email-content"],
    queryFn: () => api.get("/email-content").then((r) => r.data),
    enabled: isSuper,
  });

  useEffect(() => {
    if (!contentData) return;
    setAccentColor(contentData.accentColor || "#0A0A0A");
    setPortalDisplayName(contentData.portalDisplayName || "");
    setEmailContent({ link: contentData.link, reset: contentData.reset, invite: contentData.invite });
    setPreview(null);
  }, [contentData]);

  function updateActiveField(field: keyof EmailTypeContent, value: string) {
    setEmailContent((prev) => ({ ...prev, [activeEmailTab]: { ...prev[activeEmailTab], [field]: value } }));
  }

  const saveContentMutation = useMutation({
    mutationFn: () =>
      api.put("/email-content", {
        accentColor,
        portalDisplayName,
        linkSubject: emailContent.link.subject,
        linkTitle: emailContent.link.title,
        linkBody: emailContent.link.body,
        linkButtonText: emailContent.link.buttonText,
        resetSubject: emailContent.reset.subject,
        resetTitle: emailContent.reset.title,
        resetBody: emailContent.reset.body,
        resetButtonText: emailContent.reset.buttonText,
        inviteSubject: emailContent.invite.subject,
        inviteTitle: emailContent.invite.title,
        inviteBody: emailContent.invite.body,
        inviteButtonText: emailContent.invite.buttonText,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-content"] });
      showToast("Personalização dos e-mails salva!");
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || "Erro ao salvar a personalização.", "error");
    },
  });

  const resetContentMutation = useMutation({
    mutationFn: () => api.delete("/email-content"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-content"] });
      showToast("E-mails restaurados ao padrão.");
      setShowContentReset(false);
    },
    onError: () => showToast("Falha ao restaurar o padrão.", "error"),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      api
        .post("/email-content/preview", {
          type: activeEmailTab,
          accentColor,
          portalDisplayName,
          ...emailContent[activeEmailTab],
        })
        .then((r) => r.data),
    onSuccess: (data: { subject: string; html: string }) => setPreview(data),
    onError: () => showToast("Falha ao gerar a visualização.", "error"),
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
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Configurações de E-mail</h1>
          <p className="text-sm text-slate-500 mt-1">
            Defina como o portal envia e-mails e personalize o conteúdo enviado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHelpModal(true)}
          className="bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all self-start md:self-center whitespace-nowrap"
          title="Entenda como funcionam os e-mails"
        >
          <Info className="w-5 h-5" />
          Como Funciona
        </button>
      </header>

      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
        <button
          type="button"
          onClick={() => setActiveMainTab("smtp")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            activeMainTab === "smtp" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Server className="w-4 h-4" />
          SMTP
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab("design")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            activeMainTab === "design" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Palette className="w-4 h-4" />
          Design e Conteúdo
        </button>
      </div>

      {activeMainTab === "smtp" && (isLoading ? (
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
      ))}

      {/* Personalização de conteúdo/design dos e-mails */}
      {activeMainTab === "design" && (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-w-3xl">
        <div className="p-6 sm:p-8 space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-slate-800">Design e Conteúdo dos E-mails</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Personalize a cor, o nome exibido e o texto dos e-mails enviados pelo portal.
            </p>
          </div>

          {loadingContent ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Cor de destaque</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : "#0A0A0A"}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-11 h-11 rounded-lg border border-slate-300 cursor-pointer p-1"
                    />
                    <input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className={inputCls}
                      placeholder="#0A0A0A"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome exibido no e-mail</label>
                  <input
                    value={portalDisplayName}
                    onChange={(e) => setPortalDisplayName(e.target.value)}
                    className={inputCls}
                    placeholder="Portal de Documentos"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100" />

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                  Qual e-mail você quer personalizar? São 3 modelos independentes.
                </p>
                <div className="grid sm:grid-cols-3 gap-3">
                  {EMAIL_TYPE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeEmailTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => { setActiveEmailTab(tab.key); setPreview(null); }}
                        className={cn(
                          "text-left p-4 rounded-xl border-2 transition-all",
                          active ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={cn("p-1.5 rounded-lg flex-shrink-0", active ? "bg-primary text-white" : "bg-slate-100 text-slate-500")}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className={cn("text-sm font-bold", active ? "text-primary" : "text-slate-700")}>{tab.label}</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">{tab.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 -mb-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Editando o modelo:</span>
                  <span className="text-xs font-bold text-primary">{EMAIL_TYPE_TABS.find((t) => t.key === activeEmailTab)?.label}</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Assunto</label>
                  <input
                    value={emailContent[activeEmailTab].subject}
                    onChange={(e) => updateActiveField("subject", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Título</label>
                  <input
                    value={emailContent[activeEmailTab].title}
                    onChange={(e) => updateActiveField("title", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensagem</label>
                  <textarea
                    value={emailContent[activeEmailTab].body}
                    onChange={(e) => updateActiveField("body", e.target.value)}
                    rows={5}
                    className={cn(inputCls, "resize-y")}
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Variáveis disponíveis: {EMAIL_TYPE_TOKENS[activeEmailTab].join(", ")}. Uma linha em branco separa parágrafos.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Texto do botão</label>
                  <input
                    value={emailContent[activeEmailTab].buttonText}
                    onChange={(e) => updateActiveField("buttonText", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {preview && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 flex items-center justify-between">
                    <span className="truncate">Assunto: {preview.subject}</span>
                    <button onClick={() => setPreview(null)} className="p-1 text-slate-400 hover:text-slate-600 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <iframe srcDoc={preview.html} className="w-full h-[480px] bg-white" title="Pré-visualização do e-mail" />
                </div>
              )}
            </>
          )}
        </div>

        {!loadingContent && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 sm:px-8 py-4 bg-slate-50 border-t border-slate-100">
            <div>
              {contentData?.source === "db" && contentData.updatedAt && (
                <button
                  type="button"
                  onClick={() => setShowContentReset(true)}
                  className="flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-600 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Restaurar padrão
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                className="flex items-center gap-2 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {previewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Visualizar
              </button>
              <button
                onClick={() => saveContentMutation.mutate()}
                disabled={saveContentMutation.isPending}
                className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm shadow-primary/20 whitespace-nowrap"
              >
                {saveContentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar personalização
              </button>
            </div>
          </div>
        )}
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
      {showContentReset && (
        <ContentResetModal
          isPending={resetContentMutation.isPending}
          onConfirm={() => resetContentMutation.mutate()}
          onClose={() => setShowContentReset(false)}
        />
      )}
      <AnimatePresence>
        {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
