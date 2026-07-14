"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Plus, Search, Copy, ExternalLink, Trash2, Calendar,
  Loader2, CheckCircle2, X, Link2, Upload, Download,
  Users, AlertTriangle, FileText, LayoutList, Send, Mail, MailCheck,
  ChevronLeft, ChevronRight, Ban, ClipboardList,
  ChevronDown, Filter, Check, Info, RefreshCw, RefreshCcw, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";

/* ─── Types ─── */
interface Template { id: string; name: string; localTemplatePath?: string | null; basePdfPath?: string | null; mode?: string | null; deletedAt?: string | null }

function templateHasFile(t: Template | null | undefined): boolean {
  if (!t) return false;
  return t.mode === 'overlay' ? !!t.basePdfPath : !!t.localTemplatePath;
}
interface Batch { id: string; name: string; createdAt: string; template: { id: string; name: string }; _count: { links: number } }
interface LinkItem {
  id: string; token: string; clientName?: string; clientEmail?: string;
  expiresAt: string; revokedAt?: string | null; accessCount: number; createdAt: string;
  emailSentAt?: string | null;
  template: { id: string; name: string; deletedAt?: string | null; department?: { name: string } | null };
  batch?: { id: string; name: string } | null;
  submissions?: { id: string; status: string; createdAt: string; documentUUID?: string }[];
  additionalSigners?: string;
  internalSigners?: string;
  recipientSessions?: { recipientOrder: number; status: string; email?: string; name?: string; token?: string; completedAt?: string | null }[];
}
interface SubmissionAttachment {
  id: string; filename: string; originalName: string; mimeType: string; createdAt: string;
  templateAttachment: { label: string; required: boolean; order: number; recipientOrder?: number | null };
}
interface LinkResponse {
  items: LinkItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
interface CsvRow { clientName: string; clientEmail: string; additionalSigners: string[]; valid: boolean; error?: string }
interface TemplateRecipient { id: string; order: number; label: string; color: string; }

/* ─── Constants ─── */
const SUB_LABELS: Record<string, string> = {
  pending: "Pendente", docx_generated: "Gerando", document_created: "Enviado",
  signer_created: "Configurando", sent_to_sign: "Aguardando Assinatura", signed: "Assinado", error: "Erro",
};
const SUB_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-500", docx_generated: "bg-blue-100 text-blue-600",
  document_created: "bg-indigo-100 text-indigo-600", signer_created: "bg-violet-100 text-violet-600",
  sent_to_sign: "bg-amber-100 text-amber-700", signed: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-600",
};

/* ─── Helpers ─── */
function linkStatus(l: LinkItem): "Ativo" | "Expirado" | "Revogado" | "Preenchido" {
  if (l.revokedAt) return "Revogado";
  if (l.submissions && l.submissions.length > 0) return "Preenchido";
  if (new Date(l.expiresAt) < new Date()) return "Expirado";
  return "Ativo";
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("pt-BR"); }
function cn(...c: unknown[]) { return (c.filter(Boolean) as string[]).join(" "); }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseXlsx(arrayBuffer: ArrayBuffer): CsvRow[] {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

  if (rows.length < 2) return [];

  const header = (rows[0] as string[]).map((h) => String(h ?? "").toLowerCase().trim());
  const nameIdx = header.findIndex((h) => h.includes("nome"));
  const emailIdx = header.findIndex((h) => h.includes("email") && !h.includes("signat"));
  const signatIdx = header.findIndex((h) => h.includes("signat"));

  return (rows.slice(1) as string[][])
    .filter((row) => row.some((cell) => cell))
    .map((row) => {
      const clientName = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
      const clientEmail = emailIdx >= 0 ? String(row[emailIdx] ?? "").trim() : "";
      const signatRaw = signatIdx >= 0 ? String(row[signatIdx] ?? "").trim() : "";
      const additionalSigners = signatRaw
        ? signatRaw.split(";").map((s) => s.trim()).filter((s) => EMAIL_RE.test(s))
        : [];

      const validEmail = !!clientEmail && EMAIL_RE.test(clientEmail);
      const validSigners = additionalSigners.length > 0;
      const valid = validEmail && validSigners;
      const error = !validEmail ? "E-mail inválido" : !validSigners ? "Sem signatários" : undefined;
      return { clientName, clientEmail, additionalSigners, valid, error };
    });
}

/* ════════════════════════════════════════════ */
import { DepartmentSelector } from "@/components/DepartmentSelector";
import { useAuth } from "@/contexts/AuthContext";

const ALL_LINK_STATUSES = ["Ativo", "Preenchido", "Expirado", "Revogado"];
const D4SIGN_DESK_URL = process.env.NEXT_PUBLIC_D4SIGN_DESK_URL || 'https://secure.d4sign.com.br';

export default function LinksPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  /* Pagination state */
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  /* UI state */
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([...ALL_LINK_STATUSES]);
  const [filterTemplates, setFilterTemplates] = useState<string[]>([]);
  const [filterBatch, setFilterBatch] = useState("");
  const [tab, setTab] = useState<"all" | "individual" | "batch">("all");
  const [copied, setCopied] = useState<string | null>(null);
  const [showIndividualModal, setShowIndividualModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [revokeTarget, setRevokeTarget] = useState<LinkItem | null>(null);
  const [showBulkRevokeConfirm, setShowBulkRevokeConfirm] = useState(false);
  const [showDeletedTemplates, setShowDeletedTemplates] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<LinkItem | null>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [showBatchHelp, setShowBatchHelp] = useState(false);
  const [resendingToken, setResendingToken] = useState<string | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const pendingHighlight = searchParams.get("highlight");

  /* Queries */
  /* Inicializa departamento do usuário por padrão */
  useEffect(() => {
    if (user && user.role !== "SUPER_ADMIN" && user.departmentIds?.length) {
      setSelectedDepts(user.departmentIds);
    }
  }, [user]);

  const { data: linkData, isLoading: loadingLinks } = useQuery<LinkResponse>({
    queryKey: ["links", currentPage, pageSize, selectedDepts, showDeletedTemplates, pendingHighlight],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", String(currentPage));
      params.append("limit", String(pageSize));
      params.append("includeDeletedTemplates", String(showDeletedTemplates));
      selectedDepts.forEach(id => params.append("departmentIds", id));
      if (pendingHighlight) params.append("findToken", pendingHighlight);
      return (await api.get(`/links?${params.toString()}`)).data;
    },
  });

  const { data: statsData } = useQuery<{ total: number; active: number; waiting: number; signed: number }>({
    queryKey: ["links-stats", selectedDepts],
    queryFn: async () => {
      const params = new URLSearchParams();
      selectedDepts.forEach(id => params.append("departmentIds", id));
      return (await api.get(`/links/stats?${params.toString()}`)).data;
    },
  });

  const links = linkData?.items || [];
  const totalPages = linkData?.totalPages || 1;

  /* Filtered links */
  const filtered = useMemo(() => {
    return links.filter((l) => {
      if (!showDeletedTemplates && l.template.deletedAt) return false;
      const s = search.toLowerCase();
      const matchSearch = !s || l.template.name.toLowerCase().includes(s) ||
        (l.clientName || "").toLowerCase().includes(s) || (l.clientEmail || "").toLowerCase().includes(s) ||
        (l.batch?.name || "").toLowerCase().includes(s);
      const matchStatus = filterStatus.includes(linkStatus(l));
      const matchTemplate = filterTemplates.length === 0 || filterTemplates.includes(l.template.id);
      const matchBatch = !filterBatch || l.batch?.id === filterBatch;
      const matchTab = tab === "all" || (tab === "individual" && !l.batch) || (tab === "batch" && !!l.batch);
      return matchSearch && matchStatus && matchTemplate && matchBatch && matchTab;
    });
  }, [links, search, filterStatus, filterTemplates, filterBatch, tab, showDeletedTemplates]);

  /* Highlight: navega para a página certa se necessário */
  useEffect(() => {
    if (!pendingHighlight || !linkData) return;
    const tokenPage = (linkData as any).tokenPage;
    if (tokenPage && tokenPage !== currentPage) {
      setCurrentPage(tokenPage);
    }
  }, [pendingHighlight, linkData, currentPage]);

  /* Scroll para a linha destacada */
  useEffect(() => {
    if (!pendingHighlight || loadingLinks) return;
    
    // Pequeno delay para garantir que o DOM está pronto e animado
    const timer = setTimeout(() => {
      const el = document.getElementById(`link-row-${pendingHighlight}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 600);
    
    return () => clearTimeout(timer);
  }, [pendingHighlight, loadingLinks]);

  /* Temporizador para remover o destaque visual */
  useEffect(() => {
    if (pendingHighlight) {
      setActiveHighlight(pendingHighlight);
      const timer = setTimeout(() => setActiveHighlight(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [pendingHighlight]);



  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: async () => (await api.get("/templates")).data,
  });
  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/links/batches")).data,
  });

  /* Individual link form */
  const [newLink, setNewLink] = useState({ templateId: "", clientName: "", clientEmail: "", expiresInDays: 30 });
  const [extraEmails, setExtraEmails] = useState<string[]>([""]);
  const [templateRecipients, setTemplateRecipients] = useState<TemplateRecipient[]>([]);
  const [recipientEmails, setRecipientEmails] = useState<{ order: number; email: string; name: string }[]>([]);
  type CreateLinkPayload = { templateId: string; clientName?: string; clientEmail?: string; expiresInDays: number; additionalSigners: string[]; internalSigners: string[]; recipientAssignments?: { order: number; email: string; name?: string }[] };

  useEffect(() => {
    if (!newLink.templateId || !showIndividualModal) {
      setTemplateRecipients([]);
      setRecipientEmails([]);
      return;
    }
    api.get(`/templates/${newLink.templateId}/recipients`).then(res => {
      const recipients: TemplateRecipient[] = res.data;
      setTemplateRecipients(recipients);
      setRecipientEmails(recipients.map(r => ({ order: r.order, email: '', name: '' })));
    }).catch(() => {
      setTemplateRecipients([]);
      setRecipientEmails([]);
    });
  }, [newLink.templateId, showIndividualModal]);

  const createMutation = useMutation({
    mutationFn: (data: CreateLinkPayload) => api.post("/links", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["links-stats"] });
      setShowIndividualModal(false);
      setNewLink({ templateId: templates[0]?.id || "", clientName: "", clientEmail: "", expiresInDays: 30 });
      setExtraEmails([""]);
      setTemplateRecipients([]);
      setRecipientEmails([]);
      showToast("Link de envio gerado com sucesso!");
    },
    onError: () => showToast("Erro ao criar link.", "error"),
  });

  /* Batch form */
  const [batchName, setBatchName] = useState("");
  const [batchTemplateId, setBatchTemplateId] = useState("");
  const [batchExpires, setBatchExpires] = useState(30);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const batchMutation = useMutation({
    mutationFn: (dto: { name: string; templateId: string; expiresInDays: number; rows: { clientName: string; clientEmail: string; additionalSigners: string[] }[] }) =>
      api.post("/links/batch", dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["links-stats"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      setShowBatchModal(false);
      setCsvRows([]);
      setBatchName("");
      showToast("Lote processado com sucesso!");
    },
    onError: () => showToast("Erro ao processar lote.", "error"),
  });

  const revokeMutation = useMutation({
    mutationFn: (token: string) => api.delete(`/links/${token}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["links-stats"] });
      setRevokeTarget(null);
      showToast("Link revogado com sucesso.");
    },
    onError: () => showToast("Erro ao revogar link.", "error"),
  });

  const bulkRevokeMutation = useMutation({
    mutationFn: (tokens: string[]) => api.post("/links/bulk-revoke", { tokens }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["links-stats"] });
      setSelectedTokens(new Set());
      setShowBulkRevokeConfirm(false);
      showToast(`${res.data.count ?? "Vários"} links foram revogados.`);
    },
    onError: () => showToast("Erro ao revogar links selecionados.", "error"),
  });

  const resendEmailMutation = useMutation({
    mutationFn: (token: string) => api.post(`/links/${token}/resend-email`),
    onMutate: (token) => setResendingToken(token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      showToast("E-mail reenviado com sucesso!");
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || "Erro ao reenviar e-mail.", "error");
    },
    onSettled: () => setResendingToken(null),
  });

  const retryMutation = useMutation({
    mutationFn: (subId: string) => api.post(`/links/submissions/${subId}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["links"] });
      showToast("Reprocessamento iniciado.");
    },
    onError: (err: any) => showToast(err?.response?.data?.message || "Erro ao reprocessar.", "error"),
  });

  const syncMutation = useMutation({
    mutationFn: (subId: string) => api.post(`/links/submissions/${subId}/sync`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["links-stats"] });
      showToast(`Status sincronizado: ${SUB_LABELS[res.data.status] || res.data.status}`);
    },
    onError: () => showToast("Erro ao sincronizar status na D4Sign.", "error"),
  });

  const syncPendingMutation = useMutation({
    mutationFn: () => api.post(`/links/submissions/sync-pending`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["links-stats"] });
      showToast(`${res.data.updatedCount} documentos atualizados de ${res.data.totalChecked} verificados!`);
    },
    onError: () => showToast("Erro ao sincronizar em massa na D4Sign.", "error"),
  });

  /* Actions */
  function getEffectiveToken(link: LinkItem): string {
    // Multi-recipient: return first pending/in_progress session token, or first session token
    if (link.recipientSessions && link.recipientSessions.length > 0) {
      const pending = link.recipientSessions.find(s => s.status !== 'completed' && s.token);
      const first = link.recipientSessions[0];
      return (pending?.token || first?.token) ?? link.token;
    }
    return link.token;
  }

  function copyLink(link: LinkItem) {
    const token = getEffectiveToken(link);
    navigator.clipboard.writeText(`${baseUrl}/public/${token}`);
    setCopied(link.token);
    showToast("URL copiada para a área de transferência.", "info");
    setTimeout(() => setCopied(null), 2000);
  }

  const selectableTokens = filtered.filter((l) => linkStatus(l) === "Ativo").map((l) => l.token);

  function toggleSelection(token: string) {
    const link = filtered.find((l) => l.token === token);
    if (!link || linkStatus(link) !== "Ativo") return;
    const next = new Set(selectedTokens);
    if (next.has(token)) next.delete(token);
    else next.add(token);
    setSelectedTokens(next);
  }

  function toggleAll() {
    if (selectedTokens.size === selectableTokens.length && selectableTokens.length > 0) {
      setSelectedTokens(new Set());
    } else {
      setSelectedTokens(new Set(selectableTokens));
    }
  }

  /* Stats globais vindas do backend — refletem a tabela completa, não só a página */
  const activeCount = statsData?.active ?? 0;
  const sentCount   = statsData?.waiting ?? 0;
  const signedCount = statsData?.signed ?? 0;

  const selectedTemplate = templates.find((t) => t.id === newLink.templateId);
  const selectedBatchTemplate = templates.find((t) => t.id === batchTemplateId);
  const validRows = csvRows.filter((r) => r.valid);

  function handleXlsxFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const arrayBuffer = ev.target?.result as ArrayBuffer;
      try {
        const rows = parseXlsx(arrayBuffer);
        if (!rows.length) { setCsvError("Planilha vazia ou sem dados."); return; }
        setCsvRows(rows);
        setCsvError(null);
      } catch { setCsvError("Erro ao ler o arquivo. Verifique o formato."); }
    };
    reader.readAsArrayBuffer(file);
  }

  function downloadXlsxTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["nome_cliente", "email", "signatarios"],
      ["Ana Paula Ferreira", "ana.ferreira@empresa.com.br", "joao.silva@empresa.com;maria.santos@empresa.com"],
      ["Carlos Eduardo Lima", "carlos.lima@contatos.com", "gerente@empresa.com;juridico@empresa.com"],
      ["Fernanda Costa", "fernanda@escritoriocosta.adv.br", "socio1@escritorio.com;socio2@escritorio.com"],
      ["Roberto Alves", "roberto.alves@grupomercantil.com", "diretor@grupomercantil.com"],
    ]);
    ws["!cols"] = [{ wch: 32 }, { wch: 36 }, { wch: 52 }];
    XLSX.utils.book_append_sheet(wb, ws, "Destinatários");
    XLSX.writeFile(wb, "modelo_envio_em_massa.xlsx");
  }

  /* ─────────── RENDER ─────────── */
  return (
    <div className="space-y-6 pb-80">

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Links de Envio</h1>
          <p className="text-slate-500 mt-1">Gerencie e envie links de preenchimento para clientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start md:self-center">
          <button
            onClick={() => syncPendingMutation.mutate()}
            disabled={syncPendingMutation.isPending}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
            title="Sincroniza todos os documentos que estão aguardando assinatura"
          >
            <RefreshCcw className={cn("w-4 h-4", syncPendingMutation.isPending && "animate-spin text-primary")} />
            <span className="hidden sm:inline">Sincronizar Todos</span>
          </button>
          <button
            onClick={() => setShowBatchModal(true)}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all"
          >
            <Upload className="w-4 h-4" />
            Envio em Massa
          </button>
          <button
            onClick={() => { setNewLink((p) => ({ ...p, templateId: templates[0]?.id || "", clientName: "", clientEmail: "" })); setExtraEmails([""]); setShowIndividualModal(true); }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Novo Link
          </button>
        </div>
      </header>

      {/* Bulk actions bar */}
      <AnimatePresence>
        {selectedTokens.size > 0 && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="bg-primary text-white p-4 rounded-2xl flex items-center justify-between shadow-xl shadow-primary/20 sticky top-4 z-40"
          >
            <div className="flex items-center gap-4 ml-2">
              <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">{selectedTokens.size} selecionados</span>
              <p className="text-sm font-medium">Ações em massa para os links selecionados.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkRevokeConfirm(true)}
                disabled={bulkRevokeMutation.isPending}
                className="bg-rose-500 hover:bg-rose-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
              >
                <Ban className="w-3.5 h-3.5" />
                Revogar Selecionados
              </button>
              <button onClick={() => setSelectedTokens(new Set())} className="px-4 py-2 hover:bg-white/10 rounded-xl text-xs font-bold transition-all">
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Links Ativos", value: activeCount, color: "text-primary", bg: "bg-primary/10" },
          { label: "Total de Links", value: statsData?.total ?? linkData?.total ?? 0, color: "text-slate-600", bg: "bg-slate-100" },
          { label: "Aguardando Assinatura", value: sentCount, color: "text-amber-700", bg: "bg-amber-100" },
          { label: "Assinados", value: signedCount, color: "text-emerald-700", bg: "bg-emerald-100" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
            <p className={cn("text-3xl font-bold mt-1", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col">

        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 space-y-3">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            {([["all", "Todos", LayoutList], ["individual", "Individual", Link2], ["batch", "Em Lote", Users]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                  tab === id ? "bg-primary/10 text-primary" : "text-slate-400 hover:bg-slate-50")}
              >
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente, e-mail, lote..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl text-sm outline-none focus:bg-white border-2 border-transparent focus:border-primary/20 transition-all"
              />
            </div>
            <DepartmentSelector selectedIds={selectedDepts} onChange={(ids) => { setSelectedDepts(ids); setCurrentPage(1); }} compact />
            <StatusMultiSelect selected={filterStatus} onChange={(v) => { setFilterStatus(v); setCurrentPage(1); }} />
            <TemplateMultiSelect templates={templates} selected={filterTemplates} onChange={(v) => { setFilterTemplates(v); setCurrentPage(1); }} />
            {batches.length > 0 && (
              <select
                value={filterBatch} onChange={(e) => { setFilterBatch(e.target.value); setCurrentPage(1); }}
                className="px-3 py-1.5 bg-slate-50 rounded-xl text-xs font-semibold text-slate-600 outline-none border-2 border-transparent focus:border-primary/20 transition-all"
              >
                <option value="">Lotes</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b._count.links})</option>)}
              </select>
            )}
            <button
              onClick={() => setShowDeletedTemplates((v) => !v)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border",
                showDeletedTemplates
                  ? "bg-rose-100 text-rose-700 border-rose-200"
                  : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100")}
              title="Mostrar links cujo modelo foi excluído"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {showDeletedTemplates ? "Ocultar excluídos" : "Modelo excluído"}
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden rounded-b-3xl">
          {/* Table */}
          <div className="flex-1 flex flex-col min-h-0">
            {loadingLinks ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 h-full">
                <Loader2 className="w-8 h-8 animate-spin mb-3" /><p className="text-sm">Carregando links...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 h-full">
                <Link2 className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum link encontrado</p>
                <p className="text-xs mt-1 opacity-60">Ajuste os filtros ou crie um novo link.</p>
              </div>
            ) : (
              <div ref={tableScrollRef} className="overflow-x-auto">
                <table className="w-full text-left min-w-[1100px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-100">
                      <th className="px-5 py-3 w-[40px] text-center">
                        <input
                          type="checkbox"
                          className="rounded text-primary focus:ring-primary w-4 h-4 disabled:opacity-30"
                          checked={selectableTokens.length > 0 && selectedTokens.size === selectableTokens.length}
                          disabled={selectableTokens.length === 0}
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="px-5 py-3 w-[200px]">Cliente</th>
                      <th className="px-5 py-3 w-[160px]">Modelo</th>
                      <th className="px-5 py-3 w-[120px]">Lote</th>
                      <th className="px-5 py-3 w-[90px]">Criado</th>
                      <th className="px-5 py-3 w-[90px]">Expira</th>
                      <th className="px-5 py-3 w-[80px]">E-mail</th>
                      <th className="px-5 py-3 w-[90px]">Link</th>
                      <th className="px-5 py-3 w-[110px]">Documento</th>
                      <th className="px-5 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map((link, i) => {
                      const status = linkStatus(link);
                      const sub = link.submissions?.[0];
                      const isSelected = selectedTokens.has(link.token);
                      return (
                        <motion.tr
                          key={link.id}
                          id={`link-row-${link.token}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.01 }}
                          className={cn("hover:bg-slate-50/70 group", isSelected && "bg-primary/5")}
                          style={{
                            backgroundColor: activeHighlight === link.token ? "rgba(0,48,87,0.09)" : undefined,
                            transition: "background-color 0.8s ease",
                          }}
                        >
                          {/* Selector */}
                          <td className="px-5 py-3.5 text-center">
                            <input
                              type="checkbox"
                              className="rounded text-primary focus:ring-primary w-4 h-4 disabled:opacity-30 disabled:cursor-not-allowed"
                              checked={isSelected}
                              disabled={status !== "Ativo"}
                              onChange={() => toggleSelection(link.token)}
                            />
                          </td>

                          {/* Cliente */}
                          <td className="px-5 py-3.5 max-w-[200px]">
                            <p className="font-semibold text-slate-800 text-sm truncate" title={link.clientName || undefined}>
                              {link.clientName || <span className="text-slate-300 font-normal italic text-xs">Sem nome</span>}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate" title={link.clientEmail || undefined}>
                              {link.clientEmail || <span className="text-slate-300">—</span>}
                            </p>
                          </td>

                          {/* Modelo */}
                          <td className="px-5 py-3.5 max-w-[160px]">
                            <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5 truncate" title={link.template.name}>
                              <FileText className={cn("w-3.5 h-3.5 flex-shrink-0", link.template.deletedAt ? "text-rose-300" : "text-slate-300")} />
                              <span className="truncate">{link.template.name}</span>
                            </span>
                            {link.template.department?.name && (
                              <span className="text-[10px] text-slate-400 truncate block mt-0.5 pl-5" title={link.template.department.name}>
                                {link.template.department.name}
                              </span>
                            )}
                            {link.template.deletedAt && (
                              <span className="text-[9px] font-bold text-rose-400 uppercase tracking-wider">excluído</span>
                            )}
                          </td>

                          {/* Lote */}
                          <td className="px-5 py-3.5 max-w-[120px]">
                            {link.batch ? (
                              <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded-full text-[10px] font-bold inline-flex items-center gap-1 max-w-full" title={link.batch.name}>
                                <Users className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate">{link.batch.name}</span>
                              </span>
                            ) : <span className="text-xs text-slate-200">—</span>}
                          </td>

                          {/* Criado */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className="text-xs text-slate-500 flex items-center gap-1" title={new Date(link.createdAt).toLocaleString("pt-BR")}>
                              <Calendar className="w-3 h-3 text-slate-300 flex-shrink-0" />{fmtDate(link.createdAt)}
                            </span>
                          </td>

                          {/* Expira */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className="text-xs text-slate-500 flex items-center gap-1" title={new Date(link.expiresAt).toLocaleString("pt-BR")}>
                              <Calendar className="w-3 h-3 text-slate-300 flex-shrink-0" />{fmtDate(link.expiresAt)}
                            </span>
                          </td>

                          {/* E-mail */}
                          <td className="px-5 py-3.5">
                            {!link.clientEmail ? (
                              <span className="text-xs text-slate-200">—</span>
                            ) : link.emailSentAt ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold" title={`Enviado em ${new Date(link.emailSentAt).toLocaleString("pt-BR")}`}>
                                <MailCheck className="w-3 h-3" /> Enviado
                              </span>
                            ) : (
                              <ResendEmailBtn
                                token={link.token}
                                status={status}
                                isSending={resendingToken === link.token}
                                onResend={() => resendEmailMutation.mutate(link.token)}
                              />
                            )}
                          </td>

                          {/* Status do link */}
                          <td className="px-5 py-3.5">
                            <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight whitespace-nowrap",
                              status === "Ativo" ? "bg-emerald-100 text-emerald-700" :
                                status === "Revogado" ? "bg-rose-100 text-rose-600" :
                                status === "Preenchido" ? "bg-sky-100 text-sky-700" :
                                "bg-slate-100 text-slate-400")}>
                              {status}
                            </span>
                          </td>

                          {/* Documento */}
                          <td className="px-5 py-3.5">
                            {sub ? (
                              <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight whitespace-nowrap",
                                SUB_COLORS[sub.status] || "bg-slate-100 text-slate-500")}>
                                {SUB_LABELS[sub.status] || sub.status}
                              </span>
                            ) : link.recipientSessions && link.recipientSessions.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-amber-100 text-amber-700">
                                <Users className="w-3 h-3" />
                                {link.recipientSessions.filter(s => s.status === 'completed').length}/{link.recipientSessions.length} Resp.
                              </span>
                            ) : <span className="text-xs text-slate-200">—</span>}
                          </td>

                          {/* Ações */}
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex items-center gap-1">
                              <ActionBtn title="Copiar link" onClick={() => copyLink(link)}>
                                {copied === link.token ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </ActionBtn>
                              <a href={`/public/${getEffectiveToken(link)}`} target="_blank" rel="noopener noreferrer">
                                <ActionBtn title={link.recipientSessions?.length ? "Abrir formulário (R1 — primeiro responsável)" : "Abrir formulário"}>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </ActionBtn>
                              </a>
                              <ActionBtn title="Ver detalhes completos" onClick={() => setDetailsTarget(link)}>
                                <ClipboardList className="w-3.5 h-3.5" />
                              </ActionBtn>
                              {sub && ['docx_generated', 'document_created', 'signer_created', 'error'].includes(sub.status) && (
                                <ActionBtn
                                  title="Reprocessar envio"
                                  onClick={() => retryMutation.mutate(sub.id)}
                                  disabled={
                                    (retryMutation.isPending || retryMutation.isSuccess) &&
                                    retryMutation.variables === sub.id
                                  }
                                >
                                  <RefreshCcw className={cn(
                                    "w-3.5 h-3.5",
                                    retryMutation.isPending && retryMutation.variables === sub.id && "animate-spin"
                                  )} />
                                </ActionBtn>
                              )}
                              {status === "Ativo" && (
                                <ActionBtn title="Revogar link" danger onClick={() => setRevokeTarget(link)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </ActionBtn>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination & Summary */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto shrink-0">
            <div className="text-xs text-slate-400 font-medium">
              Mostrando <strong>{filtered.length}</strong> de <strong>{linkData?.total || 0}</strong> links
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1 || loadingLinks}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                    if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                  }
                  if (pageNum <= 0) return null;
                  if (pageNum > totalPages) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                        currentPage === pageNum ? "bg-primary text-white" : "hover:bg-slate-200 text-slate-600"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                disabled={currentPage === totalPages || loadingLinks}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal: Novo Link Individual ─── */}
      <AnimatePresence>
        {showIndividualModal && (
          <Modal onClose={() => setShowIndividualModal(false)} title="Novo Link Individual" subtitle="Crie um link único para enviar a um cliente.">
            <form onSubmit={(e) => {
              e.preventDefault();
              const payload: CreateLinkPayload = {
                templateId: newLink.templateId,
                clientName: newLink.clientName,
                expiresInDays: newLink.expiresInDays,
                additionalSigners: extraEmails.filter((em) => em.includes("@")),
                internalSigners: [],
              };
              if (templateRecipients.length > 0) {
                payload.recipientAssignments = recipientEmails.map(r => ({ order: r.order, email: r.email, name: r.name || undefined }));
              } else {
                payload.clientEmail = newLink.clientEmail;
              }
              createMutation.mutate(payload);
            }} className="space-y-4">
              <FormField label="Modelo de Documento">
                <select value={newLink.templateId} onChange={(e) => setNewLink((p) => ({ ...p, templateId: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 text-sm font-medium" required>
                  {templates.length === 0 ? <option value="">Nenhum modelo cadastrado</option> :
                    templates.map((t) => <option key={t.id} value={t.id}>{t.name}{!templateHasFile(t) ? " ⚠ sem arquivo" : ""}</option>)}
                </select>
                {newLink.templateId && !templateHasFile(selectedTemplate) && (
                  <p className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />Este modelo ainda não tem arquivo. Faça upload em Modelos.
                  </p>
                )}
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nome do Cliente">
                  <input type="text" value={newLink.clientName} onChange={(e) => setNewLink((p) => ({ ...p, clientName: e.target.value }))}
                    placeholder="Nome completo" className={inputCls} required />
                </FormField>
                <FormField label="Validade (dias)">
                  <input type="number" min={1} max={365} value={newLink.expiresInDays}
                    onChange={(e) => setNewLink((p) => ({ ...p, expiresInDays: Number(e.target.value) }))} className={inputCls} />
                </FormField>
              </div>

              {/* E-mail de entrega do link */}
              {templateRecipients.length > 0 ? (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 block mb-2">Responsáveis pelo preenchimento</label>
                  <div className="space-y-2">
                    {templateRecipients.map((r) => {
                      const entry = recipientEmails.find(e => e.order === r.order) || { order: r.order, email: '', name: '' };
                      return (
                        <div key={r.order} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                          <span className="text-xs font-semibold text-slate-600 w-24 flex-shrink-0 truncate">{r.label}</span>
                          <input
                            type="email"
                            value={entry.email}
                            onChange={(ev) => setRecipientEmails(prev => prev.map(p => p.order === r.order ? { ...p, email: ev.target.value } : p))}
                            placeholder={`E-mail — ${r.label}`}
                            className={inputCls}
                            required
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <FormField label="E-mail para preenchimento">
                  <input
                    type="email"
                    value={newLink.clientEmail}
                    onChange={(e) => setNewLink((p) => ({ ...p, clientEmail: e.target.value }))}
                    placeholder="Opcional — recebe o link por e-mail"
                    className={inputCls}
                  />
                </FormField>
              )}

              {/* Signatários D4Sign */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Signatários D4Sign</label>
                  <span className="text-[10px] text-slate-400">Mínimo 1 obrigatório</span>
                </div>
                <div className="space-y-2">
                  {extraEmails.map((email, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setExtraEmails((prev) => prev.map((v, i) => i === idx ? e.target.value : v))}
                        placeholder="email@empresa.com"
                        className={inputCls}
                      />
                      {extraEmails.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setExtraEmails((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-2 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExtraEmails((prev) => [...prev, ""])}
                    className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:text-primary/80 transition-colors mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar signatário
                  </button>
                </div>
              </div>

              {createMutation.isError && (
                <p className="text-rose-500 text-sm">{(createMutation.error as any)?.response?.data?.message || "Erro ao criar link."}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowIndividualModal(false)} className={cancelBtn}>Cancelar</button>
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    !newLink.templateId ||
                    !templateHasFile(selectedTemplate) ||
                    !newLink.clientName.trim() ||
                    extraEmails.filter((em) => em.includes("@")).length === 0 ||
                    (templateRecipients.length > 0 && recipientEmails.some(r => !r.email || !EMAIL_RE.test(r.email)))
                  }
                  className={submitBtn}
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Gerar Link</>}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      {/* ─── Modal: Documentos Enviados ─── */}
      <AnimatePresence>
        {detailsTarget && (
          <DetailsModal
            link={detailsTarget}
            onClose={() => setDetailsTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Modal: Confirmação de Revogação Individual ─── */}
      <AnimatePresence>
        {revokeTarget && (
          <RevokeConfirmModal
            link={revokeTarget}
            isRevoking={revokeMutation.isPending}
            onConfirm={() => revokeMutation.mutate(revokeTarget.token)}
            onClose={() => setRevokeTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Modal: Confirmação de Revogação em Massa ─── */}
      <AnimatePresence>
        {showBulkRevokeConfirm && (
          <BulkRevokeConfirmModal
            count={selectedTokens.size}
            isRevoking={bulkRevokeMutation.isPending}
            onConfirm={() => bulkRevokeMutation.mutate(Array.from(selectedTokens))}
            onClose={() => setShowBulkRevokeConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* ─── Modal: Envio em Massa ─── */}
      <AnimatePresence>
        {showBatchModal && (
          <Modal onClose={() => { setShowBatchModal(false); setShowBatchHelp(false); }} title="Envio em Massa" subtitle="Importe um CSV para gerar vários links de uma vez." wide>
            <div className="space-y-5">

              {/* Tutorial accordion */}
              <div className="rounded-2xl border border-sky-100 bg-sky-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowBatchHelp((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2 text-sky-700">
                    <Info className="w-4 h-4" />
                    <span className="text-sm font-semibold">Como funciona?</span>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-sky-400 transition-transform duration-200", showBatchHelp && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {showBatchHelp && (
                    <motion.div
                      key="help"
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3 border-t border-sky-100">
                        {[
                          {
                            n: 1,
                            title: "Configure o lote",
                            desc: "Dê um nome para identificar o lote, escolha o modelo de documento e defina a validade dos links (em dias).",
                          },
                          {
                            n: 2,
                            title: "Importe o CSV",
                            desc: 'Faça upload de uma planilha .xlsx com as colunas nome_cliente, email e signatarios. A coluna signatarios deve conter os e-mails dos assinantes separados por ponto-e-vírgula (;). Cada linha gera um link exclusivo com seus próprios signatários.',
                          },
                          {
                            n: 3,
                            title: "Revise e gere",
                            desc: "Confira a lista de destinatários no preview. Linhas com e-mail inválido são ignoradas automaticamente. Clique em Gerar Links para criar tudo de uma vez.",
                          },
                          {
                            n: 4,
                            title: "E-mails enviados automaticamente",
                            desc: "Se a coluna email estiver preenchida, o link é enviado por e-mail para o destinatário assim que os links são gerados. Nenhuma ação extra é necessária.",
                          },
                        ].map((s) => (
                          <div key={s.n} className="flex gap-3 pt-3">
                            <div className="w-5 h-5 rounded-full bg-sky-200 text-sky-700 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                              {s.n}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-sky-800">{s.title}</p>
                              <p className="text-xs text-sky-600 mt-0.5 leading-relaxed">{s.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Step 1: Config */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nome do Lote">
                  <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)}
                    placeholder="Ex: Campanha Abril 2026" className={inputCls} />
                </FormField>
                <FormField label="Validade (dias)">
                  <input type="number" min={1} max={365} value={batchExpires}
                    onChange={(e) => setBatchExpires(Number(e.target.value))} className={inputCls} />
                </FormField>
              </div>
              <FormField label="Modelo de Documento">
                <select value={batchTemplateId} onChange={(e) => setBatchTemplateId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 text-sm font-medium">
                  <option value="">Selecione um modelo...</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{!templateHasFile(t) ? " ⚠ sem arquivo" : ""}</option>)}
                </select>
                {batchTemplateId && !templateHasFile(selectedBatchTemplate) && (
                  <p className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />Este modelo ainda não tem arquivo. Faça upload em Modelos.
                  </p>
                )}
              </FormField>

              {/* Step 2: CSV */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Planilha de Destinatários</label>
                  <button onClick={downloadXlsxTemplate} className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                    <Download className="w-3.5 h-3.5" />Baixar modelo XLSX
                  </button>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleXlsxFile} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 hover:border-primary/30 rounded-xl py-6 flex flex-col items-center gap-2 text-slate-400 hover:text-primary transition-all group">
                  <Upload className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-semibold">{csvRows.length ? `${csvRows.length} linhas carregadas — clique para substituir` : "Clique para selecionar a planilha .xlsx"}</span>
                  <span className="text-xs opacity-60">Colunas: nome_cliente, email, signatarios (separados por ;)</span>
                </button>
                {csvError && <p className="mt-2 text-xs text-rose-500 font-medium">{csvError}</p>}
              </div>

              {/* Preview table */}
              {csvRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Preview — {validRows.length} válidos / {csvRows.length - validRows.length} com erro
                    </p>
                    {csvRows.length - validRows.length > 0 && (
                      <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />Linhas inválidas serão ignoradas
                      </span>
                    )}
                  </div>
                  <div className="border border-slate-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left font-bold text-slate-400">#</th>
                          <th className="px-4 py-2 text-left font-bold text-slate-400">Nome</th>
                          <th className="px-4 py-2 text-left font-bold text-slate-400">E-mail</th>
                          <th className="px-4 py-2 text-left font-bold text-slate-400">Signatários</th>
                          <th className="px-4 py-2 text-center font-bold text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {csvRows.map((row, i) => (
                          <tr key={i} className={row.valid ? "" : "bg-rose-50/50"}>
                            <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                            <td className="px-4 py-2 font-medium text-slate-700">{row.clientName || <span className="italic text-slate-300">—</span>}</td>
                            <td className="px-4 py-2 text-slate-600">{row.clientEmail}</td>
                            <td className="px-4 py-2 text-slate-500 max-w-[180px]">
                              {row.additionalSigners.length > 0
                                ? <span title={row.additionalSigners.join("; ")} className="truncate block">{row.additionalSigners.length} signatário{row.additionalSigners.length > 1 ? "s" : ""}</span>
                                : <span className="text-rose-400 font-semibold">—</span>}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {row.valid
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                : <span className="text-rose-500 font-semibold">{row.error}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {batchMutation.isError && (
                <p className="text-rose-500 text-sm">{(batchMutation.error as any)?.response?.data?.message || "Erro ao criar lote."}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowBatchModal(false); setShowBatchHelp(false); }} className={cancelBtn}>Cancelar</button>
                <button
                  onClick={() => batchMutation.mutate({ name: batchName, templateId: batchTemplateId, expiresInDays: batchExpires, rows: validRows.map(({ clientName, clientEmail, additionalSigners }) => ({ clientName, clientEmail, additionalSigners })) })}
                  disabled={batchMutation.isPending || !batchName.trim() || !batchTemplateId || !templateHasFile(selectedBatchTemplate) || validRows.length === 0}
                  className={submitBtn}
                >
                  {batchMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><Send className="w-4 h-4" />Gerar {validRows.length} Link{validRows.length !== 1 ? "s" : ""}</>}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Sub-components ─── */
function Modal({ children, onClose, title, subtitle, wide }: { children: React.ReactNode; onClose: () => void; title: string; subtitle?: string; wide?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className={cn("bg-white rounded-3xl shadow-2xl w-full p-8 max-h-[90vh] overflow-y-auto", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-slate-500 text-sm mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 flex-shrink-0 ml-4"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{label}</label>
      {children}
    </div>
  );
}

function ResendEmailBtn({ token, status, isSending, onResend }: {
  token: string;
  status: string;
  isSending: boolean;
  onResend: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const canResend = status === "Ativo";

  const blockedReason =
    status === "Expirado" ? "Link expirado — crie um novo" :
    status === "Preenchido" ? "Formulário já preenchido" :
    status === "Revogado" ? "Link revogado" : null;

  function handleMouseEnter() {
    if (!blockedReason || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setTooltipPos({ x: r.left + r.width / 2, y: r.top });
  }

  if (canResend) {
    return (
      <button
        onClick={onResend}
        disabled={isSending}
        title="Clique para reenviar o e-mail"
        className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-95 rounded-full text-[10px] font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSending
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : <RefreshCw className="w-3 h-3" />}
        {isSending ? "Enviando…" : "Pendente"}
      </button>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setTooltipPos(null)}
        className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-300 rounded-full text-[10px] font-bold cursor-not-allowed"
      >
        <Mail className="w-3 h-3" /> Pendente
      </button>
      {tooltipPos && blockedReason && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{ left: tooltipPos.x, top: tooltipPos.y, transform: "translate(-50%, calc(-100% - 8px))" }}
        >
          <div className="bg-slate-800 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
            {blockedReason}
          </div>
          <div className="mx-auto w-0 h-0 border-x-[4px] border-x-transparent border-t-[4px] border-t-slate-800" />
        </div>,
        document.body
      )}
    </>
  );
}

function ActionBtn({ children, title, onClick, danger, disabled }: { children: React.ReactNode; title?: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  function handleMouseEnter() {
    if (!title || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setTooltipPos({ x: r.left + r.width / 2, y: r.top });
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setTooltipPos(null)}
        className={cn("p-1.5 rounded-lg border border-transparent transition-all disabled:opacity-40 disabled:cursor-not-allowed",
          danger ? "text-slate-400 hover:text-rose-500 hover:bg-rose-50 hover:border-rose-100" : "text-slate-400 hover:text-primary hover:bg-slate-100")}
      >
        {children}
      </button>
      {tooltipPos && title && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{ left: tooltipPos.x, top: tooltipPos.y, transform: "translate(-50%, calc(-100% - 8px))" }}
        >
          <div className="bg-slate-800 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
            {title}
          </div>
          <div className="mx-auto w-0 h-0 border-x-[4px] border-x-transparent border-t-[4px] border-t-slate-800" />
        </div>,
        document.body
      )}
    </>
  );
}

const inputCls = "w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 text-sm font-medium";
const cancelBtn = "flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all text-sm";
const submitBtn = "flex-[2] py-3 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all text-sm";

/* ─── AttachmentCard ─── */
function AttachmentCard({ att, downloading, onDownload }: {
  att: SubmissionAttachment;
  downloading: string | null;
  onDownload: (att: SubmissionAttachment) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl">
      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-0.5">{att.templateAttachment?.label || "Sem descrição"}</p>
        <p className="text-sm font-semibold text-slate-700 truncate">{att.originalName}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {new Date(att.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <button onClick={() => onDownload(att)} disabled={downloading === att.id}
        className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-40 shrink-0"
        title="Baixar arquivo">
        {downloading === att.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ─── DetailsModal ─── */
interface DetailCheckboxOption { variableName: string; label: string; checked: boolean }
interface DetailTextField {
  label: string;
  variableName: string;
  fieldType: string;
  value: string;
  groupId?: string;
  groupQuestion?: string;
  groupMaxSelections?: number;
  groupOptions?: DetailCheckboxOption[];
}
interface DetailScoreField { variableName: string; label: string; answer: string; points: number | null; maxPoints: number | null; choices: string[] }
interface DetailRecipientSession {
  order: number;
  email: string | null;
  name: string | null;
  status: string;
  completedAt: string | null;
  fields: DetailTextField[];
}
interface DetailResult {
  textFields: DetailTextField[];
  scoreFields: DetailScoreField[];
  hasScoring: boolean;
  totalPoints: number;
  maxPoints: number;
  percentage: number;
  attachments: SubmissionAttachment[];
  submittedAt?: string;
  recipientSessions?: DetailRecipientSession[];
  recipients?: { order: number; label: string; color: string }[];
}

function DetailsModal({
  link, onClose,
}: { link: LinkItem; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [data, setData] = useState<DetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadingDoc, setDownloadingDoc] = useState(false);

  const submission = link.submissions?.[0];
  const submissionId = submission?.id;
  const clientName = link.clientName;

  const syncMutation = useMutation({
    mutationFn: (subId: string) => api.post(`/links/submissions/${subId}/sync`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["links"] });
      qc.invalidateQueries({ queryKey: ["links-stats"] });
      showToast(`Status sincronizado: ${SUB_LABELS[res.data.status] || res.data.status}`);
      onClose(); // Optional: or we could just leave it open and it might update if we passed global data
    },
    onError: () => showToast("Erro ao sincronizar status na D4Sign.", "error"),
  });

  useEffect(() => {
    if (!submissionId) {
      setLoading(false);
      return;
    }
    api.get(`/links/submissions/${submissionId}/details`)
      .then((r) => setData(r.data))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [submissionId]);

  async function handleDownload(att: SubmissionAttachment) {
    if (downloading === att.id || !submissionId) return;
    setDownloading(att.id);
    try {
      const res = await api.get(`/links/attachment-file/${submissionId}/${att.filename}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = att.originalName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { /* silencioso */ } finally { setDownloading(null); }
  }

  function scoreBadge(field: DetailScoreField) {
    if (!field.answer) return "bg-slate-100 text-slate-400";
    if (field.points !== null && field.maxPoints !== null) {
      if (field.points === field.maxPoints) return "bg-emerald-100 text-emerald-700";
      if (field.points > 0) return "bg-amber-100 text-amber-700";
      return "bg-rose-100 text-rose-600";
    }
    const a = field.answer.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (a === "SIM") return "bg-emerald-100 text-emerald-700";
    if (a === "NAO") return "bg-rose-100 text-rose-600";
    return "bg-slate-100 text-slate-600";
  }

  const pct = data?.percentage ?? 0;
  const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-rose-500";
  const filledTextFields = data?.textFields.filter((f) => f.value.trim()) ?? [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Detalhes do Envio</h2>
              {clientName && <p className="text-sm font-semibold text-slate-600 mt-0.5">{clientName}</p>}
              {data?.submittedAt && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Preenchido em {new Date(data.submittedAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Info bar — status + acessos + ações */}
        <div className="px-8 py-4 border-b border-slate-100 flex items-center gap-6 shrink-0 bg-slate-50/60">
          {/* Status documento */}
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documento</span>
            <span className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight flex items-center gap-1.5",
              SUB_COLORS[submission?.status || "pending"] || "bg-slate-100 text-slate-500"
            )}>
              {submission?.status === "signed" ? <CheckCircle2 className="w-3 h-3" /> :
                submission?.status === "error" ? <AlertTriangle className="w-3 h-3" /> :
                <Clock className="w-3 h-3" />}
              {SUB_LABELS[submission?.status || "pending"] || submission?.status || "Pendente"}
            </span>
          </div>

          {/* Divisor */}
          <div className="w-px h-5 bg-slate-200 shrink-0" />

          {/* Acessos */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acessos</span>
            <span className="text-sm font-bold text-slate-700 tabular-nums">{link.accessCount}</span>
          </div>

          {/* Ações D4Sign */}
          {submission && (
            <>
              <div className="w-px h-5 bg-slate-200 shrink-0" />
              <div className="flex items-center gap-2 ml-auto shrink-0">
                {(submission.status === "sent_to_sign" || submission.status === "signed") && submission.documentUUID && (
                  <a href={`${D4SIGN_DESK_URL}/desk/viewblob/${submission.documentUUID}`}
                      target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm whitespace-nowrap shrink-0">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    D4Sign
                  </a>
                )}
                {submission.status === "sent_to_sign" && (
                  <button
                    onClick={() => syncMutation.mutate(submission.id)}
                    disabled={syncMutation.isPending}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <RefreshCcw className={cn("w-3.5 h-3.5 shrink-0", syncMutation.isPending && "animate-spin text-primary")} />
                    Sincronizar
                  </button>
                )}
                {submission.status === "signed" && submission.documentUUID && (
                  <button
                    onClick={async () => {
                      try {
                        setDownloadingDoc(true);
                        const res = await api.post(`/links/submissions/${submission.id}/download`, { type: "PDF" });
                        if (res.data.url) window.open(res.data.url, "_blank");
                      } catch {
                        showToast("Erro ao gerar link de download.", "error");
                      } finally { setDownloadingDoc(false); }
                    }}
                    disabled={downloadingDoc}
                    className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-sm shadow-primary/20 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {downloadingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Download className="w-3.5 h-3.5 shrink-0" />}
                    Baixar PDF
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-7 space-y-6">

          {/* ── Responsáveis pelo preenchimento (multi-recipient) ── */}
          {link.recipientSessions && link.recipientSessions.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-700 border-l-2 border-sky-400 pl-3 mb-3">
                Responsáveis pelo Preenchimento
              </p>
              <div className="space-y-2">
                {link.recipientSessions.map((s) => {
                  const isCompleted = s.status === 'completed';
                  const sessionFromData = data?.recipientSessions?.find(rs => rs.order === s.recipientOrder);
                  return (
                    <div key={s.recipientOrder} className="flex items-center gap-3 py-2">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                        isCompleted ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700"
                      )}>
                        {isCompleted ? <Check className="w-3.5 h-3.5" /> : s.recipientOrder}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">
                          R{s.recipientOrder}{s.name ? ` · ${s.name}` : ""}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{s.email || "—"}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            {s.completedAt ? new Date(s.completedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Concluído"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
                            <Clock className="w-3 h-3" />
                            Aguardando
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Signatários D4Sign ── */}
          {(() => {
            try {
              const add = link.additionalSigners ? JSON.parse(link.additionalSigners) as string[] : [];
              const intS = link.internalSigners ? JSON.parse(link.internalSigners) as string[] : [];
              if (!link.clientEmail && add.length === 0 && intS.length === 0) return null;
              return (
                <div className="bg-slate-50 rounded-2xl p-5">
                  <p className="text-xs font-bold text-slate-700 border-l-2 border-primary pl-3 mb-3">Signatários D4Sign</p>
                  <div className="space-y-2">
                    {link.clientEmail && (
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-500 w-20 shrink-0">Cliente:</span>
                        <span className="truncate">{link.clientEmail}</span>
                      </div>
                    )}
                    {add.map((email, idx) => (
                      <div key={`add-${idx}`} className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-500 w-20 shrink-0">Adicional:</span>
                        <span className="truncate">{email}</span>
                      </div>
                    ))}
                    {intS.map((email, idx) => (
                      <div key={`int-${idx}`} className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="font-semibold text-slate-500 w-20 shrink-0">Interno:</span>
                        <span className="truncate">{email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            } catch { return null; }
          })()}

          {/* ── Conteúdo do formulário ── */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : !data && submissionId ? (
            <div className="text-center py-16 text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Não foi possível carregar o formulário</p>
            </div>
          ) : !submissionId && (!link.recipientSessions || link.recipientSessions.length === 0) ? (
            <div className="text-center py-8 text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">O cliente ainda não preencheu o formulário.</p>
            </div>
          ) : !submissionId && link.recipientSessions && link.recipientSessions.length > 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {link.recipientSessions.filter(s => s.status === 'completed').length === 0
                  ? "Nenhum responsável preencheu o formulário ainda."
                  : `${link.recipientSessions.filter(s => s.status === 'completed').length} de ${link.recipientSessions.length} responsável(is) concluiu — aguardando os demais.`}
              </p>
            </div>
          ) : data && (
            <>
              {/* Per-recipient breakdown */}
              {data.recipientSessions && data.recipientSessions.length > 0 && (
                <div className="space-y-4">
                  {data.recipientSessions.map((rs) => (
                    rs.fields.length > 0 && (
                      <section key={rs.order} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                          <p className="text-xs font-bold text-slate-700">
                            R{rs.order}{rs.name ? ` · ${rs.name}` : ""}
                            {rs.email && <span className="font-normal text-slate-400 ml-1">({rs.email})</span>}
                          </p>
                        </div>
                        <div className="space-y-2 pl-7">
                          {rs.fields.map((f) => (
                            f.fieldType === 'checkboxGroup' && f.groupOptions ? (
                              <div key={f.variableName} className="px-4 py-3 bg-slate-50 rounded-xl space-y-2">
                                <p className="text-xs font-bold text-slate-600">{f.groupQuestion}</p>
                                <div className="space-y-1">
                                  {f.groupOptions.map((opt) => (
                                    <div key={opt.variableName} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium ${opt.checked ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
                                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${opt.checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                                        {opt.checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                      </span>
                                      {opt.label}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div key={f.variableName} className="px-4 py-3 bg-slate-50 rounded-xl">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                                <p className="text-sm font-medium text-slate-700 break-words leading-relaxed">
                                  {f.fieldType === 'checkbox' ? (f.value ? '✓ Marcado' : '✗ Não marcado') : f.value || '—'}
                                </p>
                              </div>
                            )
                          ))}
                        </div>
                      </section>
                    )
                  ))}
                </div>
              )}

              {/* Merged view OR fallback (no per-recipient sessions) */}
              {(!data.recipientSessions || data.recipientSessions.length === 0) && (
                <div className="grid grid-cols-2 gap-8 items-start">
                  {filledTextFields.length > 0 && (
                    <section className="space-y-3">
                      <p className="text-xs font-bold text-slate-700 border-l-2 border-primary pl-3">Respostas do Formulário</p>
                      <div className="space-y-2.5">
                        {filledTextFields.map((f) => (
                          <div key={f.variableName} className="px-5 py-4 bg-slate-50 rounded-2xl">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{f.label}</p>
                            <p className="text-sm font-medium text-slate-700 break-words leading-relaxed">{f.value}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="space-y-8">
                    {data.scoreFields.length > 0 && (
                      <section className="space-y-3">
                        <p className="text-xs font-bold text-slate-700 border-l-2 border-amber-400 pl-3">Questões</p>
                        <div className="space-y-2.5">
                          {data.scoreFields.map((field) => (
                            <div key={field.variableName} className="flex items-start gap-3 px-5 py-4 bg-slate-50 rounded-2xl">
                              <p className="flex-1 text-sm font-medium text-slate-600 leading-snug">{field.label}</p>
                              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${scoreBadge(field)}`}>{field.answer || "—"}</span>
                                {field.points !== null && field.maxPoints !== null && (
                                  <span className="text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap">{field.points}/{field.maxPoints}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                  {filledTextFields.length === 0 && data.scoreFields.length === 0 && data.attachments.length === 0 && (
                    <div className="col-span-2 text-center py-8 text-slate-400">
                      <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">Formulário vazio.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Anexos */}
              {data.attachments.length > 0 && (
                <section className="space-y-3">
                  <p className="text-xs font-bold text-slate-700 border-l-2 border-violet-400 pl-3">Anexos Recebidos</p>
                  {data.recipients && data.recipients.length > 0 ? (() => {
                    const unmatchedAtts = data.attachments.filter(
                      att => !data.recipients!.some(r => r.order === att.templateAttachment?.recipientOrder)
                    );
                    return (
                      <div className="space-y-4">
                        {data.recipients.map((r) => {
                          const recipientAtts = data.attachments.filter(att => att.templateAttachment?.recipientOrder === r.order);
                          if (recipientAtts.length === 0) return null;
                          return (
                            <div key={r.order} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: r.color }}>
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                                <p className="text-xs font-bold text-slate-700">R{r.order} · {r.label}</p>
                              </div>
                              <div className="space-y-2 pl-7">
                                {recipientAtts.map((att) => (
                                  <AttachmentCard key={att.id} att={att} downloading={downloading} onDownload={handleDownload} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {unmatchedAtts.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center shrink-0">
                                <FileText className="w-3 h-3 text-white" />
                              </div>
                              <p className="text-xs font-bold text-slate-500">Responsável não identificado</p>
                            </div>
                            <div className="space-y-2 pl-7">
                              {unmatchedAtts.map((att) => (
                                <AttachmentCard key={att.id} att={att} downloading={downloading} onDownload={handleDownload} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="space-y-2">
                      {data.attachments.map((att) => (
                        <AttachmentCard key={att.id} att={att} downloading={downloading} onDownload={handleDownload} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* Score footer */}
        {data?.hasScoring && (
          <div className="px-8 py-5 border-t border-slate-100 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-slate-700">Pontuação Total</span>
              <span className="text-lg font-black text-slate-900 tabular-nums">
                {data.totalPoints}
                <span className="text-slate-400 font-normal text-sm"> / {data.maxPoints}</span>
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-1.5">
              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={`h-full rounded-full ${barColor}`} />
            </div>
            <div className="flex justify-end">
              <span className={`text-sm font-black ${pct >= 70 ? "text-emerald-600" : pct >= 40 ? "text-amber-500" : "text-rose-600"}`}>
                {pct}%
              </span>
            </div>
          </div>
        )}

        <div className="px-8 pb-8 pt-3 shrink-0">
          <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all text-sm">Fechar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RevokeConfirmModal({
  link, isRevoking, onConfirm, onClose,
}: { link: LinkItem; isRevoking: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !isRevoking && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Revogar Link</h2>
            <p className="text-sm text-slate-500 mt-0.5">Este link ficará inativo imediatamente.</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-2xl px-4 py-3 mb-6 space-y-0.5">
          <p className="text-sm font-semibold text-slate-700 truncate">{link.clientName || "Sem nome"}</p>
          <p className="text-xs text-slate-400 truncate">{link.clientEmail || "Sem e-mail"}</p>
          <p className="text-xs text-slate-400 truncate">{link.template.name}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={isRevoking} className={cancelBtn}>Cancelar</button>
          <button onClick={onConfirm} disabled={isRevoking}
            className="flex-[2] py-3 rounded-xl bg-amber-500 text-white font-bold shadow-lg shadow-amber-500/20 disabled:opacity-40 flex items-center justify-center gap-2 text-sm transition-all">
            {isRevoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            {isRevoking ? "Revogando..." : "Revogar"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BulkRevokeConfirmModal({
  count, isRevoking, onConfirm, onClose,
}: { count: number; isRevoking: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !isRevoking && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
            <Ban className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Revogar em Massa</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              <strong className="text-rose-600">{count}</strong> link{count !== 1 ? "s" : ""} serão desativados imediatamente.
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-6">Esta ação não pode ser desfeita. Os links deixarão de funcionar para os destinatários.</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={isRevoking} className={cancelBtn}>Cancelar</button>
          <button onClick={onConfirm} disabled={isRevoking}
            className="flex-[2] py-3 rounded-xl bg-rose-600 text-white font-bold shadow-lg shadow-rose-600/20 disabled:opacity-40 flex items-center justify-center gap-2 text-sm transition-all">
            {isRevoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            {isRevoking ? "Revogando..." : `Revogar ${count}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
const STATUS_OPTIONS = [
  { key: "Ativo",      color: "bg-emerald-500" },
  { key: "Preenchido", color: "bg-sky-500"      },
  { key: "Expirado",   color: "bg-slate-400"    },
  { key: "Revogado",   color: "bg-rose-500"     },
];

function StatusMultiSelect({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const allSelected = selected.length === STATUS_OPTIONS.length;

  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(s => s !== key) : [...selected, key]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all duration-200 text-xs font-semibold",
          isOpen || !allSelected
            ? "bg-white border-primary/20 text-primary shadow-sm"
            : "bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100"
        )}
      >
        <div className="flex items-center gap-0.5">
          {STATUS_OPTIONS.filter(s => selected.includes(s.key)).map(s => (
            <div key={s.key} className={cn("w-2 h-2 rounded-full", s.color)} />
          ))}
        </div>
        <span className="whitespace-nowrap">
          {allSelected ? "Status" : selected.length === 0 ? "Nenhum" : `${selected.length} status`}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 3, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              className="absolute left-0 top-full z-20 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                {!allSelected && (
                  <button onClick={() => onChange([...ALL_LINK_STATUSES])}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors">
                    Todos
                  </button>
                )}
              </div>
              <div className="p-2 space-y-0.5">
                {STATUS_OPTIONS.map(({ key, color }) => {
                  const on = selected.includes(key);
                  return (
                    <button key={key} type="button" onClick={() => toggle(key)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition-all text-left">
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                        on ? `${color} border-transparent` : "border-slate-200 bg-white"
                      )}>
                        {on && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                      </div>
                      <span className={cn("text-xs font-semibold", on ? "text-slate-700" : "text-slate-400")}>{key}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function TemplateMultiSelect({ templates, selected, onChange }: { templates: Template[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredTpls = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all duration-200 text-xs font-semibold",
          isOpen || selected.length > 0
            ? "bg-white border-primary/20 text-primary shadow-sm"
            : "bg-slate-50 border-transparent text-slate-600 hover:bg-slate-100"
        )}
      >
        <span className="whitespace-nowrap">
          {selected.length === 0 ? "Modelo" : `${selected.length} modelo${selected.length > 1 ? "s" : ""}`}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setIsOpen(false); setSearch(""); }} />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 3, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              className="absolute left-0 top-full z-20 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="p-2 border-b border-slate-100 bg-slate-50/50 space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar modelo..." autoFocus
                    className="w-full pl-8 pr-3 py-1.5 bg-white rounded-lg text-xs outline-none border border-slate-200 focus:border-primary/30 transition-all"
                  />
                </div>
                {selected.length > 0 && (
                  <button onClick={() => onChange([])}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-600 px-1 transition-colors">
                    Limpar seleção
                  </button>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto p-2 space-y-0.5">
                {filteredTpls.length === 0
                  ? <p className="text-xs text-slate-400 text-center py-4">Nenhum modelo encontrado</p>
                  : filteredTpls.map(t => {
                    const on = selected.includes(t.id);
                    return (
                      <button key={t.id} type="button" onClick={() => toggle(t.id)}
                        className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left",
                          on ? "bg-primary/5 text-primary" : "text-slate-600 hover:bg-slate-50")}>
                        <div className={cn(
                          "w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                          on ? "bg-primary border-primary" : "border-slate-200 bg-white"
                        )}>
                          {on && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                        </div>
                        <span className="text-xs font-semibold truncate">{t.name}</span>
                      </button>
                    );
                  })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
