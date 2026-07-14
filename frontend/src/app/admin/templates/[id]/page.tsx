"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  X,
  Trash2,
  ArrowLeft,
  Save,
  FileText,
  Users,
  Lock,
  Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";

interface Template {
  id: string;
  name: string;
  description?: string;
}

interface TemplateRecipient {
  id?: string;
  order: number;
  label: string;
  color: string;
  canSeePreviousAnswers?: boolean;
}

const RECIPIENT_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

export default function TemplateConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();

  const [recipients, setRecipients] = useState<TemplateRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null); // index no array

  const { data: template, isLoading: loadingTemplate } = useQuery<Template>({
    queryKey: ["template", id],
    queryFn: () => api.get(`/templates/${id}`).then((r) => r.data),
  });

  useEffect(() => {
    if (!id) return;
    setLoadingRecipients(true);
    api.get(`/templates/${id}/recipients`)
      .then((r) => setRecipients(r.data))
      .catch(() => {})
      .finally(() => setLoadingRecipients(false));
  }, [id]);

  async function saveRecipients() {
    const trimmed = recipients.map((r) => ({ ...r, label: r.label.trim() }));
    const emptyLabel = trimmed.find((r) => !r.label);
    if (emptyLabel) {
      showToast(`R${emptyLabel.order} está sem nome. Preencha antes de salvar.`, "error");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/templates/${id}/recipients`, { recipients: trimmed });
      showToast("Responsáveis salvos com sucesso!");
    } catch {
      showToast("Erro ao salvar responsáveis.", "error");
    } finally {
      setSaving(false);
    }
  }

  function addRecipient() {
    const nextOrder = recipients.length > 0 ? Math.max(...recipients.map((r) => r.order)) + 1 : 1;
    const color = RECIPIENT_COLORS[(nextOrder - 1) % RECIPIENT_COLORS.length];
    setRecipients((prev) => [...prev, { order: nextOrder, label: `Responsável ${nextOrder}`, color, canSeePreviousAnswers: false }]);
  }

  function updateRecipient(i: number, patch: Partial<TemplateRecipient>) {
    setRecipients((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function confirmRemoveRecipient(i: number) {
    // Remove e renumera mantendo as cores
    setRecipients((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.map((r, idx) => ({ ...r, order: idx + 1 }));
    });
    setDeleteTarget(null);
  }

  if (loadingTemplate) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-slate-400 font-medium">Carregando configurações...</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500">
          <X className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Modelo não encontrado</h2>
        <button
          onClick={() => router.push("/admin/templates")}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para lista
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/admin/templates")}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Configuração de Modelo</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{template.name}</h1>
        </div>
      </div>

      {/* Info + assign button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="w-4 h-4 text-primary shrink-0" />
          <span className="font-bold text-slate-800 text-sm">Responsáveis pelo preenchimento</span>
          {recipients.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-primary/10 text-primary">
              {recipients.length}
            </span>
          )}
        </div>

      </div>

      <p className="text-sm text-slate-500 -mt-3">
        Defina quem preencherá este formulário e em qual ordem. Cada responsável recebe o link por e-mail após a etapa anterior ser concluída.
      </p>

      {/* Cards */}
      {loadingRecipients ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {recipients.map((r, i) => (
              <motion.div
                key={r.order}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden"
              >
                {/* Stripe de cor */}
                <div className="h-1.5 shrink-0" style={{ backgroundColor: r.color }} />

                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Badge + delete */}
                  <div className="flex items-start justify-between">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-base shadow-sm"
                      style={{ backgroundColor: r.color }}
                    >
                      R{r.order}
                    </div>

                    {recipients.length === 1 ? (
                      <div
                        className="p-1.5 rounded-lg text-slate-200 cursor-not-allowed"
                        title="R1 é obrigatório e não pode ser excluído"
                      >
                        <Lock className="w-4 h-4" />
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteTarget(i)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors"
                        title="Excluir responsável"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Input nome */}
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-0.5">
                      Nome
                    </p>
                    <input
                      value={r.label}
                      onChange={(e) => updateRecipient(i, { label: e.target.value })}
                      onBlur={(e) => updateRecipient(i, { label: e.target.value.trim() })}
                      placeholder="Ex: Cliente, Sócio, Gerente..."
                      className="w-full px-3 py-2.5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none text-sm text-slate-700 font-semibold transition-all"
                    />
                  </div>

                  {/* Swatches de cor */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-0.5">Cor</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {RECIPIENT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateRecipient(i, { color })}
                          className="w-5 h-5 rounded-full transition-all hover:scale-110 shrink-0"
                          style={{
                            backgroundColor: color,
                            outline: r.color === color ? `2px solid ${color}` : "none",
                            outlineOffset: "2px",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Toggle: ver respostas do responsável anterior (só R2+) */}
                  {r.order > 1 && (
                    <button
                      type="button"
                      onClick={() => updateRecipient(i, { canSeePreviousAnswers: !r.canSeePreviousAnswers })}
                      className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                        r.canSeePreviousAnswers
                          ? "border-primary/30 bg-primary/5 text-primary"
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        r.canSeePreviousAnswers ? "bg-primary border-primary" : "border-slate-300 bg-white"
                      }`}>
                        {r.canSeePreviousAnswers && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-3 h-3 flex-shrink-0" />
                        <span className="text-xs font-semibold leading-tight">Ver respostas do responsável anterior</span>
                      </div>
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Card fantasma — adicionar */}
          <motion.button
            layout
            onClick={addRecipient}
            className="border-2 border-dashed border-slate-200 rounded-2xl min-h-[200px] flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-primary/30 hover:text-primary/60 transition-all group"
          >
            <div className="w-11 h-11 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold">
              {recipients.length === 0 ? "Adicionar primeiro responsável" : "Adicionar responsável"}
            </span>
          </motion.button>
        </div>
      )}

      {recipients.length === 0 && !loadingRecipients && (
        <p className="text-xs text-slate-400 text-center -mt-2">
          Sem responsáveis configurados — o formulário será de preenchimento único (sem etapas sequenciais).
        </p>
      )}

      {/* Modal confirmação de exclusão */}
      <AnimatePresence>
        {deleteTarget !== null && (
          <DeleteConfirmModal
            recipient={recipients[deleteTarget]}
            onConfirm={() => confirmRemoveRecipient(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Rodapé fixo */}
      <div className="fixed bottom-0 left-64 right-0 z-30 bg-white/80 backdrop-blur-md border-t border-slate-300 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium">
            {recipients.length} responsável{recipients.length !== 1 ? "is" : ""} configurado{recipients.length !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/admin/templates")}
              className="px-5 py-2.5 rounded-xl text-slate-500 font-semibold hover:bg-slate-100 transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={saveRecipients}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  recipient,
  onConfirm,
  onClose,
}: {
  recipient: TemplateRecipient;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toLowerCase() === "sim";

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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8"
      >
        <div className="flex items-start gap-4 mb-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-base shrink-0"
            style={{ backgroundColor: recipient.color }}
          >
            R{recipient.order}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Excluir responsável</h2>
            <p className="text-sm text-slate-500 mt-1">
              <strong className="text-slate-700">{recipient.label}</strong> será removido e os demais serão renumerados automaticamente.
            </p>
          </div>
        </div>

        <div className="mb-6">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
            Digite <span className="text-rose-600 font-extrabold">sim</span> para confirmar
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="sim"
            autoFocus
            className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-rose-300 rounded-xl outline-none transition-all text-slate-700 font-medium text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
