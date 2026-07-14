"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileText,
  Upload,
  Download,
  AlertCircle,
  Loader2,
  X,
  Trash2,
  Settings2,
  Pencil,
  Search,
  Building2,
  Eye,
  Layout,
  FileImage,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { DepartmentSelector } from "@/components/DepartmentSelector";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

interface TemplateField {
  id: string;
  variableName: string;
  label: string;
  fieldType: string;
  required: boolean;
  options?: string;
  order: number;
  recipientOrder?: number | null;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  documentType: string;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  d4signTemplateId?: string | null;
  localTemplatePath?: string | null;
  basePdfPath?: string | null;
  mode?: string | null;
  createdAt: string;
  formFields?: TemplateField[];
}

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [newTemplateMode, setNewTemplateMode] = useState<"template" | "overlay" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: "", description: "", departmentId: "" });
  const [search, setSearch] = useState("");
  const { data: allDepartments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get("/departments").then((r) => r.data),
  });
  const [uploadingPdfId, setUploadingPdfId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<{ template: Template; blobUrl: string } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const activePdfUploadId = useRef<string | null>(null);

  const { user } = useAuth();
  const { showToast } = useToast();
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

  const allowedDepartments = useMemo(() => {
    if (!user) return [];
    if (user.role === "SUPER_ADMIN") return allDepartments;
    const userDeptIds = user.departmentIds || [];
    return allDepartments.filter((d: any) => userDeptIds.includes(d.id));
  }, [allDepartments, user]);

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["templates", selectedDepts],
    queryFn: async () => {
      const params = new URLSearchParams();
      selectedDepts.forEach(id => params.append("departmentIds", id));
      return (await api.get(`/templates?${params.toString()}`)).data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newTemplate & { mode: string }) => api.post("/templates", data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setShowModal(false);
      setNewTemplateMode(null);
      setNewTemplate({ name: "", description: "", departmentId: "" });
      if (res.data?.mode === "overlay") {
        showToast("Modelo criado! Faça o upload do PDF base para continuar.");
      } else {
        showToast("Modelo criado com sucesso!");
      }
    },
    onError: () => showToast("Erro ao criar modelo.", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDeleteTarget(null);
      showToast("Modelo excluído com sucesso!");
    },
    onError: () => showToast("Erro ao excluir modelo.", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; description: string; departmentId: string } }) =>
      api.patch(`/templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setEditTarget(null);
      showToast("Modelo atualizado com sucesso!");
    },
    onError: () => showToast("Erro ao atualizar modelo.", "error"),
  });

  async function handleDownloadPdf(template: Template) {
    if (downloadingId === template.id) return;
    setDownloadingId(template.id);
    try {
      const res = await api.get(`/templates/${template.id}/base-pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name.replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { showToast("Erro ao baixar o PDF.", "error"); }
    finally { setDownloadingId(null); }
  }

  async function handlePreviewPdf(template: Template) {
    if (previewingId === template.id) return;
    setPreviewingId(template.id);
    try {
      const res = await api.get(`/templates/${template.id}/preview-overlay`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(res.data);
      setPreviewTemplate({ template, blobUrl });
    } catch { showToast("Erro ao carregar o preview do PDF.", "error"); }
    finally { setPreviewingId(null); }
  }

  function handleUploadPdfClick(id: string) {
    activePdfUploadId.current = id;
    pdfInputRef.current?.click();
  }

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = activePdfUploadId.current;
    if (!file || !id) return;
    e.target.value = "";
    setUploadingPdfId(id);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post(`/templates/${id}/upload-base-pdf`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      showToast("PDF base enviado! Agora configure os campos no editor visual.");
    } catch {
      showToast("Erro ao enviar arquivo. Verifique se é um .pdf válido.", "error");
    } finally {
      setUploadingPdfId(null);
      activePdfUploadId.current = null;
    }
  }

  const allTemplates = templates ?? [];
  const filtered = allTemplates.filter((t) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
  });
  const overlayCount = allTemplates.filter((t) => t.mode === "overlay").length;
  const withoutPdf = allTemplates.filter((t) => t.mode === "overlay" && !t.basePdfPath).length;
  const isFormValid = newTemplate.name.trim() && newTemplate.departmentId;

  return (
    <div className="space-y-6">
      <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfChange} />

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Modelos de Documento</h1>
          <p className="text-slate-500 mt-1">Gerencie os modelos e configure os campos do formulário.</p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-center">
          <DepartmentSelector selectedIds={selectedDepts} onChange={setSelectedDepts} />
          <button
            onClick={() => setShowHelpModal(true)}
            className="bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all"
            title="Entenda como funcionam os modelos"
          >
            <Info className="w-5 h-5" />
            Como Funciona
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" />
            Novo Modelo
          </button>
        </div>
      </header>

      {/* Summary + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600">
            {allTemplates.length} modelo{allTemplates.length !== 1 ? "s" : ""}
          </span>
          {overlayCount > 0 && (
            <span className="px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-xl text-xs font-semibold text-violet-700 flex items-center gap-1.5">
              <Layout className="w-3 h-3" />{overlayCount} PDF overlay
            </span>
          )}
          {withoutPdf > 0 && (
            <span className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl text-xs font-semibold text-amber-700 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />{withoutPdf} sem PDF base
            </span>
          )}
        </div>
        <div className="relative w-full sm:w-auto sm:min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar modelo..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl text-sm outline-none focus:bg-white border-2 border-transparent focus:border-primary/20 transition-all"
          />
        </div>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center p-20 text-primary">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <FileText className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {search ? "Nenhum modelo encontrado para essa busca" : "Nenhum modelo cadastrado"}
          </p>
          {search && (
            <button onClick={() => setSearch("")} className="mt-2 text-xs text-primary font-semibold hover:underline">
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((template, i) => {
            const hasPdf = !!template.basePdfPath;
            const isUploadingPdf = uploadingPdfId === template.id;
            const isDownloading = downloadingId === template.id;
            const isPreviewing = previewingId === template.id;
            const fieldCount = template.formFields?.length ?? 0;

            const statusColor = hasPdf ? "bg-violet-400" : "bg-amber-400";
            const iconBg = hasPdf ? "bg-violet-50 text-violet-600" : "bg-amber-50 text-amber-600";

            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden group"
              >
                {/* Faixa de status */}
                <div className={cn("h-1 shrink-0", statusColor)} />

                <div className="p-5 flex flex-col flex-1 gap-4">
                  {/* Ícone + badge de modo + editar/excluir */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
                        <FileImage className="w-5 h-5" />
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">
                        PDF Overlay
                      </span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditTarget(template)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-slate-600 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(template)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Nome + descrição */}
                  <div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-slate-400 mt-1 leading-snug line-clamp-2">{template.description}</p>
                    )}
                  </div>

                  {/* Metadados com ícones */}
                  <div className="space-y-2 py-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Building2 className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="truncate">{template.department?.name ?? "Sem setor definido"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Settings2 className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span>
                        {fieldCount > 0
                          ? `${fieldCount} campo${fieldCount !== 1 ? "s" : ""} configurado${fieldCount !== 1 ? "s" : ""}`
                          : "Nenhum campo configurado"}
                      </span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="space-y-2 mt-auto">
                      <button
                        onClick={() => handleUploadPdfClick(template.id)}
                        disabled={isUploadingPdf}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50",
                          hasPdf
                            ? "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                            : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        )}
                      >
                        {isUploadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {isUploadingPdf ? "Enviando…" : hasPdf ? "Substituir PDF Base" : "Upload PDF Base"}
                      </button>
                      {hasPdf && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleDownloadPdf(template)}
                            disabled={isDownloading}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all disabled:opacity-40"
                            title="Baixar PDF base original"
                          >
                            {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            Baixar
                          </button>
                          <button
                            onClick={() => handlePreviewPdf(template)}
                            disabled={isPreviewing}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all disabled:opacity-40"
                            title="Visualizar o PDF com campos"
                          >
                            {isPreviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                            Preview
                          </button>
                          <button
                            onClick={() => router.push(`/admin/templates/${template.id}`)}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                            title="Configurar responsáveis"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                            Responsáveis
                          </button>
                          <button
                            onClick={() => router.push(`/admin/templates/${template.id}/overlay`)}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-all"
                            title="Editor de campos no PDF"
                          >
                            <Layout className="w-3.5 h-3.5" />
                            Editor
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Card fantasma — novo modelo */}
          <button
            onClick={() => setShowModal(true)}
            className="border-2 border-dashed border-slate-200 rounded-2xl min-h-[280px] flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-primary/30 hover:text-primary/60 transition-all group"
          >
            <div className="w-11 h-11 rounded-full border-2 border-dashed border-current flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold">Adicionar novo modelo</span>
          </button>
        </div>
      )}

      {/* Modal Novo Modelo */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowModal(false);
                setNewTemplateMode(null);
                setNewTemplate({ name: "", description: "", departmentId: "" });
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">
                  {newTemplateMode ? "Novo Modelo" : "Tipo de Modelo"}
                </h2>
                <button
                  onClick={() => { setShowModal(false); setNewTemplateMode(null); setNewTemplate({ name: "", description: "", departmentId: "" }); }}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!newTemplateMode ? (
                /* Passo 1: escolha do modo */
                <div className="space-y-3">
                  <p className="text-sm text-slate-500 mb-4">Escolha como este modelo será preenchido:</p>
                  <button
                    onClick={() => setNewTemplateMode("overlay")}
                    className="w-full flex items-start gap-4 p-4 rounded-2xl border-2 border-slate-200 hover:border-violet-400/50 hover:bg-violet-50/50 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0 group-hover:bg-violet-100 transition-colors">
                      <FileImage className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">Formulário PDF Fixo</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                        Faça upload de um PDF com layout fixo. Posicione os campos visualmente no editor — os valores são sobrepostos nas coordenadas exatas.
                      </p>
                    </div>
                  </button>
                </div>
              ) : (
                /* Passo 2: nome/descrição/dept */
                <>
                  <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    {newTemplateMode === "overlay" ? (
                      <FileImage className="w-4 h-4 text-violet-600 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-600">
                      {newTemplateMode === "overlay" ? "Formulário PDF Fixo" : "Modelo DOCX"}
                    </span>
                    <button
                      onClick={() => setNewTemplateMode(null)}
                      className="ml-auto text-xs text-primary hover:underline font-semibold"
                    >
                      Alterar
                    </button>
                  </div>
                  <div className="space-y-4">
                    <ModalField label="Nome do Modelo" value={newTemplate.name} onChange={(v) => setNewTemplate((p) => ({ ...p, name: v }))} placeholder="Ex: F.150R02 Auto-Avaliação" />
                    <ModalField label="Descrição (opcional)" value={newTemplate.description} onChange={(v) => setNewTemplate((p) => ({ ...p, description: v }))} placeholder="Breve descrição do documento" />
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Departamento <span className="text-rose-500">*</span></label>
                      <select
                        value={newTemplate.departmentId}
                        onChange={(e) => setNewTemplate(p => ({ ...p, departmentId: e.target.value }))}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 font-medium text-sm"
                      >
                        <option value="">Selecione um departamento...</option>
                        {allowedDepartments.map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-4 mb-6">
                    {newTemplateMode === "overlay"
                      ? "Após criar, você será redirecionado ao editor visual de campos."
                      : "Após criar, faça o upload do arquivo .docx na lista."}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowModal(false); setNewTemplateMode(null); setNewTemplate({ name: "", description: "", departmentId: "" }); }}
                      className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => createMutation.mutate({ ...newTemplate, name: newTemplate.name.trim(), description: newTemplate.description.trim(), mode: newTemplateMode })}
                      disabled={!isFormValid || createMutation.isPending}
                      className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                    >
                      {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Modelo"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Editar Modelo */}
      <AnimatePresence>
        {editTarget && (
          <EditModal
            template={editTarget}
            departments={allowedDepartments}
            isSaving={updateMutation.isPending}
            onSave={(data) => updateMutation.mutate({ id: editTarget.id, data })}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Modal Confirmar Exclusão */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            template={deleteTarget}
            isDeleting={deleteMutation.isPending}
            onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Modal Help */}
      <AnimatePresence>
        {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
      </AnimatePresence>

      {/* Modal Preview */}
      <AnimatePresence>
        {previewTemplate && (
          <PreviewModal
            previewData={previewTemplate}
            onClose={() => setPreviewTemplate(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PreviewModal({
  previewData,
  onClose,
}: {
  previewData: { template: Template; blobUrl: string };
  onClose: () => void;
}) {
  const { template, blobUrl } = previewData;

  useEffect(() => {
    return () => { URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Preview do modelo</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{template.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 bg-slate-200 overflow-hidden relative rounded-b-3xl">
          <iframe src={blobUrl} className="w-full h-full border-0" />
        </div>
      </motion.div>
    </motion.div>
  );
}


function DeleteConfirmModal({
  template,
  isDeleting,
  onConfirm,
  onClose,
}: {
  template: Template;
  isDeleting: boolean;
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
      onClick={(e) => e.target === e.currentTarget && !isDeleting && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Excluir Modelo</h2>
            <p className="text-sm text-slate-500 mt-1">
              Esta ação é irreversível. Todos os links e submissions associados a este modelo também serão excluídos.
            </p>
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 mb-6">
          <p className="text-sm font-semibold text-rose-800 truncate">{template.name}</p>
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
            disabled={isDeleting}
            className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-rose-300 rounded-xl outline-none transition-all text-slate-700 font-medium text-sm disabled:opacity-50"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed || isDeleting}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {isDeleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EditModal({
  template,
  departments,
  isSaving,
  onSave,
  onClose,
}: {
  template: Template;
  departments: any[];
  isSaving: boolean;
  onSave: (data: { name: string; description: string; departmentId: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: template.name,
    description: template.description ?? "",
    departmentId: template.departmentId ?? ""
  });
  const isValid = form.name.trim() && form.departmentId;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !isSaving && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Editar Modelo</h2>
          <button onClick={onClose} disabled={isSaving} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <ModalField label="Nome do Modelo" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="Ex: F.150R02 Acordo de Qualidade" />
          <ModalField label="Descrição (opcional)" value={form.description} onChange={(v) => setForm((p) => ({ ...p, description: v }))} placeholder="Breve descrição do documento" />

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Departamento <span className="text-rose-500">*</span></label>
            <select
              value={form.departmentId}
              onChange={(e) => setForm(p => ({ ...p, departmentId: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 font-medium text-sm"
            >
              <option value="">Selecione um departamento...</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={isSaving} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => onSave({ ...form, name: form.name.trim(), description: form.description.trim() })}
            disabled={!isValid || isSaving}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ModalField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 font-medium text-sm"
      />
    </div>
  );
}

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
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Como funcionam os Modelos?</h2>
              <p className="text-sm text-slate-500 font-medium">Entenda como funciona o modo de criação.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex gap-5">
            <div className="w-12 h-12 shrink-0 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-600 mt-1">
              <Layout className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Formulário PDF Fixo (Overlay)</h3>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                Você sobe um arquivo <code>.pdf</code> base e usa o <strong>Editor Visual</strong> para desenhar caixas exatamente onde as respostas ou marcações devem aparecer.
              </p>
              <div className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-2">
                Ideal para: Modelos mais complexos, com diversidade de campos.
              </div>
              <ul className="text-xs font-semibold text-slate-500 space-y-1.5 list-disc pl-4">
                <li>O design do PDF original nunca é desconfigurado.</li>
                <li>Permite marcar opções exatamente em cima dos "quadradinhos" do PDF.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-all">
            Entendi
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
