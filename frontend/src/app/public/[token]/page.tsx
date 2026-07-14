"use client";

import { useState, useEffect, useMemo, use } from "react";
import {
  ShieldCheck,
  Send,
  ChevronRight,
  CheckCircle2,
  FileText,
  AlertCircle,
  ScrollText,
  ChevronLeft,
  Check,
  ClipboardCheck,
  Download,
  Loader2,
  Paperclip,
  X,
  ImageIcon,
  Eye,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const SUBMIT_STEPS = [
  "Verificando informações",
  "Preparando documento",
  "Processando",
  "Concluindo",
];

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

interface AttachmentSlot {
  id: string;
  label: string;
  required: boolean;
  order: number;
  recipientOrder?: number | null;
}

interface UploadedAttachment {
  filename: string;
  originalName: string;
}

// Cabeçalhos ("section") não têm responsável próprio: herdam o do primeiro
// campo de verdade abaixo deles na lista, pulando outros cabeçalhos pelo caminho.
function sectionRecipientOwner(allFields: TemplateField[], sectionIndex: number): number | null {
  for (let i = sectionIndex + 1; i < allFields.length; i++) {
    const f = allFields[i];
    if (f.fieldType === "section") continue;
    if (f.recipientOrder != null) return f.recipientOrder;
  }
  return null;
}

export default function PublicFormPage({
  params: paramsPromise,
}: {
  params: Promise<{ token: string }>;
}) {
  const params = use(paramsPromise);

  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(-1);
  const [submitted, setSubmitted] = useState(false);
  const [linkData, setLinkData] = useState<any>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [apiUrl, setApiUrl] = useState(API_URL);
  const [attachmentSlots, setAttachmentSlots] = useState<AttachmentSlot[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<Record<string, UploadedAttachment>>({});
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ filename: string; isPdf: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [prevAnswersOpenSet, setPrevAnswersOpenSet] = useState<Set<number>>(new Set());

  async function fetchLinkInfo() {
    setFetchLoading(true);
    setError(null);
    try {
      const response = await api.get(`/links/${params.token}`);
      const link = response.data;
      setLinkData(link);

      if (link.template?.id) {
        const [fieldsRes, attachmentsRes] = await Promise.all([
          api.get(`/templates/${link.template.id}/fields`),
          api.get(`/templates/${link.template.id}/attachments`),
        ]);
        const templateFields: TemplateField[] = fieldsRes.data;
        setFields(templateFields);
        setAttachmentSlots(attachmentsRes.data || []);
        const initial: Record<string, string> = {};
        for (const f of templateFields)
          initial[f.variableName] = f.options === "auto_date" ? todayBR() : "";
        setFormData(initial);
      }
    } catch (err: any) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.submissionStatus) {
        setSubmissionStatus(data.submissionStatus);
      } else {
        setError(data?.message || "Link inválido ou expirado.");
      }
    } finally {
      setFetchLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (hostname !== "localhost" && API_URL.includes("localhost")) {
        setApiUrl(API_URL.replace("localhost", hostname));
      }
    }
  }, []);

  useEffect(() => {
    if (params.token) fetchLinkInfo();
  }, [params.token]);

  // When accessed via PublicLink token for a multi-recipient link, the backend returns
  // sessionToken (the actual RecipientSession token). Use it for all subsequent API calls
  // so previews, attachments and submissions go through the correct session path.
  const effectiveToken: string = (linkData?.sessionToken as string | undefined) ?? params.token;

  // Previous answers from ALL preceding recipients (only when canSeePreviousAnswers = true)
  // R3 sees R1 + R2, R4 sees R1 + R2 + R3, etc.
  type PreviousAnswersField = {
    label: string; variableName: string; fieldType: string; value: string;
    groupId?: string; groupQuestion?: string; groupMaxSelections?: number;
    groupOptions?: { variableName: string; label: string; checked: boolean }[];
  };
  type PreviousAnswersAttachment = { slotLabel: string; slotId: string; filename: string; originalName: string };
  type PreviousAnswersEntry = {
    recipientOrder: number;
    recipientLabel: string;
    recipientColor: string;
    prevSessionToken: string;
    fields: PreviousAnswersField[];
    attachments: PreviousAnswersAttachment[];
  };
  const previousAnswers: PreviousAnswersEntry[] = (linkData?.previousAnswers as PreviousAnswersEntry[] | undefined) ?? [];

  async function fetchPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    setIframeLoaded(false);
    setAgreed(false);
    try {
      const res = await api.post(`/links/${effectiveToken}/preview`, { formData });
      setPreview(res.data);
    } catch (err: any) {
      setPreviewError(err.response?.data?.message || "Não foi possível gerar o preview do documento.");
    } finally {
      setPreviewLoading(false);
    }
  }

  const setField = (key: string) => (val: string) =>
    setFormData((prev) => ({ ...prev, [key]: val }));

  const setCheckboxField = (key: string, group: string, maxSelections: number = 1) => (val: string) =>
    setFormData((prev) => {
      const next = { ...prev, [key]: val };
      if (val === "✓" && group) {
        const groupVars: string[] = [];
        for (const f of fields) {
          if (f.fieldType === "checkbox" && f.variableName !== key) {
            try {
              const opts = f.options ? JSON.parse(f.options) : {};
              const groupData = opts.grpMeta || opts.group;
              const groupId = groupData?.id || (typeof groupData === "string" ? groupData : null);
              if (groupId === group) groupVars.push(f.variableName);
            } catch { }
          }
        }

        const currentlyChecked = groupVars.filter(v => next[v] === "✓");
        if (currentlyChecked.length >= maxSelections) {
          next[currentlyChecked[0]] = ""; // Desmarca o mais antigo/primeiro da lista
        }
      }
      return next;
    });

  const sessionType = linkData?.sessionType as string | undefined;
  const recipientOrder = (linkData?.recipientOrder as number | null) ?? null;
  const recipientLabel = (linkData?.recipientLabel as string | null) ?? null;
  const recipientColor = (linkData?.recipientColor as string | null) ?? null;
  const totalRecipients = (linkData?.totalRecipients as number | null) ?? null;
  const isMultiRecipient = sessionType === 'recipient';
  const isFinalRecipient = !isMultiRecipient || (recipientOrder != null && totalRecipients != null && recipientOrder === totalRecipients);


  const visibleFields = useMemo(() => {
    if (!isMultiRecipient || recipientOrder == null) return fields;
    return fields.filter((f, i) => {
      const owner = f.fieldType === "section" ? sectionRecipientOwner(fields, i) : f.recipientOrder;
      return owner == null || owner === recipientOrder;
    });
  }, [fields, isMultiRecipient, recipientOrder]);

  const visibleAttachmentSlots = useMemo(() => {
    if (!isMultiRecipient || recipientOrder == null) return attachmentSlots;
    return attachmentSlots.filter(s => s.recipientOrder == null || s.recipientOrder === recipientOrder);
  }, [attachmentSlots, isMultiRecipient, recipientOrder]);

  const regularFields = visibleFields.filter((f) => f.variableName !== "CLIENT_EMAIL");

  // Grupos rádio: checkboxes com mesmo variableName + checkValue no overlay
  const radioGroupMap = new Map<string, TemplateField[]>();
  for (const f of regularFields) {
    if (f.fieldType !== "checkbox" || !f.options) continue;
    try {
      const opts = JSON.parse(f.options);
      if (opts.grpMeta) continue; // Ignora se for um grupo novo
      if (opts?.overlay?.checkValue !== undefined) {
        if (!radioGroupMap.has(f.variableName)) radioGroupMap.set(f.variableName, []);
        radioGroupMap.get(f.variableName)!.push(f);
      }
    } catch { }
  }

  // Remove grupos rádio de apenas 1 item
  for (const [key, items] of radioGroupMap.entries()) {
    if (items.length <= 1) radioGroupMap.delete(key);
  }

  // Grupos legados e novos (CheckboxGroupMeta)
  const fieldGroupMap = new Map<string, { groupLabel: string; maxSelections: number; indices: number[] }>();
  regularFields.forEach((f, i) => {
    if (f.fieldType !== "checkbox") return;
    try {
      const opts = f.options ? JSON.parse(f.options) : {};
      const groupData = opts.grpMeta || opts.group;
      const groupId = groupData?.id || (typeof groupData === "string" ? groupData : null);
      if (!groupId) return;
      if (!fieldGroupMap.has(groupId)) {
        fieldGroupMap.set(groupId, {
          groupLabel: groupData?.question || groupData?.groupLabel || "",
          maxSelections: groupData?.maxSelections || 1,
          indices: []
        });
      }
      fieldGroupMap.get(groupId)!.indices.push(i);
    } catch { }
  });

  const fieldConsumed = new Set<number>();
  const seenRadioVars = new Set<string>();
  type FieldRenderItem =
    | { kind: "skip" }
    | { kind: "section"; field: TemplateField }
    | { kind: "radio"; variableName: string; required: boolean; fields: TemplateField[] }
    | { kind: "group"; groupId: string; groupLabel: string; maxSelections: number; fieldIndices: number[] }
    | { kind: "field"; field: TemplateField };

  const regularRenderItems: FieldRenderItem[] = regularFields.map((f, i) => {
    if (fieldConsumed.has(i)) return { kind: "skip" };

    // Rádio overlay
    if (f.fieldType === "checkbox" && radioGroupMap.has(f.variableName)) {
      if (seenRadioVars.has(f.variableName)) { fieldConsumed.add(i); return { kind: "skip" }; }
      seenRadioVars.add(f.variableName);
      regularFields.forEach((rf, ri) => { if (rf.variableName === f.variableName) fieldConsumed.add(ri); });
      return { kind: "radio", variableName: f.variableName, required: f.required, fields: radioGroupMap.get(f.variableName)! };
    }

    // Grupo (legado ou novo)
    try {
      const opts = f.options ? JSON.parse(f.options) : {};
      const groupData = opts.grpMeta || opts.group;
      const groupId = groupData?.id || (typeof groupData === "string" ? groupData : null);
      if (f.fieldType === "checkbox" && groupId && fieldGroupMap.has(groupId)) {
        const gData = fieldGroupMap.get(groupId)!;
        if (gData.indices[0] !== i) { fieldConsumed.add(i); return { kind: "skip" }; }
        gData.indices.forEach(idx => fieldConsumed.add(idx));
        return { kind: "group", groupId, groupLabel: gData.groupLabel, maxSelections: gData.maxSelections, fieldIndices: gData.indices };
      }
    } catch { }
    if (f.fieldType === "section") return { kind: "section", field: f };
    return { kind: "field", field: f };
  });
  const emailField = fields.find((f) => f.variableName === "CLIENT_EMAIL");

  const step0Valid = regularRenderItems.every((item) => {
    if (item.kind === "skip") return true;
    if (item.kind === "section") return true;
    if (item.kind === "field") {
      return !item.field.required || !!formData[item.field.variableName]?.trim();
    }
    if (item.kind === "radio") {
      const isRequired = item.fields.some(f => f.required);
      if (!isRequired) return true;
      return item.fields.some(f => {
        let checkValue = "";
        try { checkValue = JSON.parse(f.options || "{}").overlay?.checkValue ?? ""; } catch { }
        return formData[item.variableName] === checkValue;
      });
    }
    if (item.kind === "group") {
      const groupFields = item.fieldIndices.map(idx => regularFields[idx]);
      const isRequired = groupFields.some(f => f.required);
      if (!isRequired) return true;
      return groupFields.some(f => formData[f.variableName] === "✓");
    }
    return true;
  });

  const step1Valid = emailField ? !!formData["CLIENT_EMAIL"]?.trim() : true;

  const attachmentsValid = visibleAttachmentSlots
    .filter((s) => s.required)
    .every((s) => !!uploadedAttachments[s.id]);

  // Ordem dos steps: fields → email? → attachments? → review
  const stepOrder: ("fields" | "email" | "attachments" | "review")[] = ["fields"];
  if (emailField) stepOrder.push("email");
  if (visibleAttachmentSlots.length > 0) stepOrder.push("attachments");
  stepOrder.push("review");

  const totalSteps = stepOrder.length;
  const reviewStep = totalSteps - 1;
  const attachmentStep = stepOrder.indexOf("attachments");
  const emailStep = stepOrder.indexOf("email");

  const progressWidth = `${((step + 1) / (totalSteps + 1)) * 100}%`;

  const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".docx"];
  const ALLOWED_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.docx";

  async function handleAttachmentUpload(slotId: string, file: File) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert(`Formato não permitido. Envie: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }
    setUploadingSlot(slotId);
    try {
      const formPayload = new FormData();
      formPayload.append("file", file);
      const res = await api.post(`/links/${effectiveToken}/attachment/${slotId}`, formPayload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadedAttachments((prev) => ({ ...prev, [slotId]: res.data }));
    } catch {
      alert("Erro ao enviar o arquivo. Tente novamente.");
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleAttachmentRemove(slotId: string) {
    try {
      await api.delete(`/links/${effectiveToken}/attachment/${slotId}`);
      setUploadedAttachments((prev) => { const n = { ...prev }; delete n[slotId]; return n; });
    } catch { /* ignora */ }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitStep(0);

    let apiError: string | null = null;
    const apiPromise = api
      .post(`/links/${effectiveToken}/submit`, formData)
      .catch((err: any) => {
        apiError = err.response?.data?.message || "Erro ao enviar formulário. Tente novamente.";
      });

    const durations = [1000, 1300, 1200, 900];
    for (let i = 0; i < durations.length; i++) {
      setSubmitStep(i);
      await new Promise((r) => setTimeout(r, durations[i]));
    }

    await apiPromise;

    if (apiError) {
      setIsSubmitting(false);
      setSubmitStep(-1);
      setError(apiError);
      return;
    }

    setSubmitted(true);
  };

  /* ---- Loading ---- */
  if (fetchLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-primary">
        <div className="relative w-16 h-16 mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-4 border-slate-200 border-t-primary"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <FileText className="w-6 h-6 text-primary" />
          </div>
        </div>
        <p className="font-medium animate-pulse text-slate-400 uppercase tracking-widest text-[10px]">
          Carregando formulário seguro...
        </p>
      </div>
    );
  }

  /* ---- Link já utilizado ---- */
  if (submissionStatus) {
    const isSigned = submissionStatus === "signed";
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`bg-white p-10 rounded-[2.5rem] shadow-2xl border text-center max-w-sm w-full ${isSigned ? "border-emerald-100 shadow-emerald-500/10" : "border-amber-100 shadow-amber-500/10"
            }`}
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${isSigned ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
            {isSigned ? <CheckCircle2 className="w-8 h-8" /> : <ScrollText className="w-8 h-8" />}
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            {isSigned ? "Documento Assinado" : "Aguardando Assinatura"}
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            {isSigned
              ? "Este acordo já foi assinado com sucesso. Obrigado!"
              : "O formulário já foi preenchido e o documento está aguardando assinatura no e-mail informado."}
          </p>
          <div className={`mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide ${isSigned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isSigned ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
            {isSigned ? "Concluído" : "Em andamento"}
          </div>
        </motion.div>
      </div>
    );
  }

  /* ---- Error ---- */
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-rose-100 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Ops! Ocorreu um erro</h1>
          <p className="text-slate-500 mb-6 text-sm">{error}</p>
          <button onClick={fetchLinkInfo} className="w-full bg-slate-100 text-slate-900 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all text-sm">
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  /* ---- Success ---- */
  if (submitted) {
    if (!isFinalRecipient) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-sky-500/10 border border-sky-100 text-center max-w-md w-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
              className="w-20 h-20 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center mx-auto mb-6"
            >
              <CheckCircle2 className="w-10 h-10" />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Respostas enviadas!</h1>
              <p className="text-slate-500 text-sm leading-relaxed">
                Sua parte foi preenchida com sucesso. O próximo responsável receberá o link por e-mail para continuar o processo.
              </p>
              {recipientOrder != null && totalRecipients != null && (
                <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-sky-50 text-sky-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  Etapa {recipientOrder} de {totalRecipients} concluída
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-emerald-500/10 border border-emerald-100 text-center max-w-md w-full"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
            className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="w-10 h-10" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Tudo certo!</h1>
            <p className="text-slate-500 text-sm leading-relaxed">
              Seu formulário foi enviado com sucesso. Em breve você receberá o documento para assinatura no e-mail informado.
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  /* ---- Form ---- */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 sm:p-6 font-sans selection:bg-primary/10">
      <header className="w-full max-w-xl mb-6 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block text-base leading-tight">Portal de Documentos</span>
            <span className="text-[9px] text-primary font-bold uppercase tracking-widest">Assinaturas Digitais</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
          <ShieldCheck className="w-3 h-3" />
          Seguro
        </div>
      </header>

      <main className="w-full max-w-xl">
        <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden relative">
          {/* Progress bar */}
          <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: progressWidth }}
              transition={{ duration: 0.4 }}
            />
          </div>

          <div className="p-6 sm:p-8 pt-8">
            <AnimatePresence mode="wait">

              {/* ---- STEP 0: Campos regulares ---- */}
              {step === 0 && (
                <motion.div key="step0" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-6">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                      Passo 01 de {totalSteps}
                    </span>
                    {isMultiRecipient && recipientLabel && totalRecipients && (
                      <div className="flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: recipientColor ? `${recipientColor}22` : undefined, color: recipientColor ?? undefined }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: recipientColor ?? undefined }} />
                        {recipientLabel} · Etapa {recipientOrder} de {totalRecipients}
                      </div>
                    )}
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">Preencha os dados</h2>
                    <p className="text-slate-500 text-sm">
                      Você está preenchendo:{" "}
                      <strong className="text-primary font-semibold">{linkData?.template?.name || "Documento"}</strong>
                    </p>
                  </div>

                  {/* ── Painéis: respostas dos responsáveis anteriores (R3 vê R1+R2, etc.) ── */}
                  {previousAnswers.length > 0 && (
                    <div className="space-y-2">
                      {previousAnswers.map((prev) => {
                        const isOpen = prevAnswersOpenSet.has(prev.recipientOrder);
                        const fieldsCount = prev.fields.filter((f) => f.fieldType !== "section").length;
                        const toggle = () => setPrevAnswersOpenSet((s) => {
                          const next = new Set(s);
                          next.has(prev.recipientOrder) ? next.delete(prev.recipientOrder) : next.add(prev.recipientOrder);
                          return next;
                        });
                        return (
                          <div key={prev.recipientOrder} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: prev.recipientColor + "40" }}>
                            <button
                              type="button"
                              onClick={toggle}
                              className="w-full flex items-center justify-between px-4 py-3 transition-colors"
                              style={{ backgroundColor: prev.recipientColor + "10" }}
                            >
                              <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4 flex-shrink-0" style={{ color: prev.recipientColor }} />
                                <span className="text-xs font-bold" style={{ color: prev.recipientColor }}>
                                  Ver respostas de {prev.recipientLabel}
                                </span>
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: prev.recipientColor + "22", color: prev.recipientColor }}>
                                  {fieldsCount} campo{fieldsCount !== 1 ? "s" : ""}
                                  {prev.attachments.length > 0 ? ` · ${prev.attachments.length} anexo${prev.attachments.length !== 1 ? "s" : ""}` : ""}
                                </span>
                              </div>
                              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: prev.recipientColor }} />
                            </button>

                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div
                                  key="body"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-4 pt-3 space-y-3 bg-white">
                                    {/* Campos */}
                                    {prev.fields.length > 0 && (
                                      <div className="space-y-2">
                                        {prev.fields.map((f) => (
                                          f.fieldType === 'section' ? (
                                            <div key={f.variableName} className="pt-2 first:pt-0">
                                              <div className="flex items-center gap-2.5">
                                                <div className="flex-1 h-px" style={{ backgroundColor: prev.recipientColor + "30" }} />
                                                <span className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: prev.recipientColor }}>
                                                  {f.label}
                                                </span>
                                                <div className="flex-1 h-px" style={{ backgroundColor: prev.recipientColor + "30" }} />
                                              </div>
                                            </div>
                                          ) : f.fieldType === 'checkboxGroup' && f.groupOptions ? (
                                            <div key={f.variableName} className="rounded-xl bg-slate-50 px-3 py-2.5 space-y-1.5">
                                              <p className="text-xs font-bold text-slate-600">{f.groupQuestion}</p>
                                              <div className="space-y-1">
                                                {f.groupOptions.map((opt) => (
                                                  <div key={opt.variableName} className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm font-medium ${opt.checked ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
                                                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${opt.checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                                                      {opt.checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                    </span>
                                                    {opt.label}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          ) : (
                                            <div key={f.variableName} className="rounded-xl bg-slate-50 px-3 py-2.5">
                                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                                              <p className="text-sm font-semibold text-slate-700 break-words">{f.value || "—"}</p>
                                            </div>
                                          )
                                        ))}
                                      </div>
                                    )}

                                    {/* Anexos */}
                                    {prev.attachments.length > 0 && (
                                      <div className="space-y-2">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Anexos</p>
                                        {prev.attachments.map((att) => {
                                          const isImage = /\.(jpg|jpeg|png|webp)$/i.test(att.filename);
                                          const fileUrl = `${apiUrl}/links/session-attachment/${prev.prevSessionToken}/${att.filename}`;
                                          return (
                                            <div key={att.slotId} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                                              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: prev.recipientColor + "22" }}>
                                                {isImage ? <ImageIcon className="w-4 h-4" style={{ color: prev.recipientColor }} /> : <FileText className="w-4 h-4" style={{ color: prev.recipientColor }} />}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">{att.slotLabel}</p>
                                                <p className="text-xs font-semibold text-slate-600 truncate">{att.originalName}</p>
                                              </div>
                                              <a
                                                href={fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors flex-shrink-0"
                                                title="Ver / Baixar"
                                              >
                                                <Download className="w-3.5 h-3.5 text-slate-500" />
                                              </a>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {prev.fields.length === 0 && prev.attachments.length === 0 && (
                                      <p className="text-sm text-slate-400 text-center py-2">Nenhuma resposta registrada.</p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-4">
                    {regularFields.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">
                        Este modelo não possui campos configurados.
                      </p>
                    )}
                    {regularRenderItems.map((item, ri) => {
                      if (item.kind === "skip") return null;

                      if (item.kind === "section") {
                        return (
                          <div key={item.field.variableName} className="pt-3 pb-1">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-px bg-slate-200" />
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap px-1">
                                {item.field.label}
                              </span>
                              <div className="flex-1 h-px bg-slate-200" />
                            </div>
                          </div>
                        );
                      }

                      if (item.kind === "radio") {
                        const currentVal = formData[item.variableName] ?? "";
                        return (
                          <div key={`radio-${item.variableName}`} className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 block">
                              {item.variableName.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                              {item.required && <span className="text-rose-400 ml-0.5">*</span>}
                            </label>
                            <div className="space-y-1.5">
                              {item.fields.map(f => {
                                let checkValue = "";
                                try { checkValue = JSON.parse(f.options || "{}").overlay?.checkValue ?? ""; } catch { }
                                const isSelected = currentVal === checkValue;
                                return (
                                  <button
                                    key={f.id || f.variableName + checkValue}
                                    type="button"
                                    onClick={() => setField(item.variableName)(isSelected ? "" : checkValue)}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left ${isSelected ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                                      }`}
                                  >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? "bg-primary border-primary" : "border-slate-300 bg-white"
                                      }`}>
                                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                    <span className={`text-sm font-semibold transition-colors ${isSelected ? "text-primary" : "text-slate-600"}`}>
                                      {f.label || checkValue}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      if (item.kind === "group") {
                        const totalOptions = item.fieldIndices.length;
                        const allowsMultiple = item.maxSelections > 1;
                        const cap = Math.min(item.maxSelections, totalOptions);
                        const selectedCount = item.fieldIndices.filter(fi => formData[regularFields[fi].variableName] === "✓").length;
                        return (
                          <div key={`grp-${item.groupId}`} className="space-y-2">
                            {(item.groupLabel || allowsMultiple) && (
                              <div className="flex items-end justify-between gap-3 ml-1">
                                {item.groupLabel ? (
                                  <label className="text-[12px] font-bold text-slate-400 uppercase block">
                                    {item.groupLabel}
                                  </label>
                                ) : <span />}
                                {allowsMultiple && (
                                  <span className={`text-[10px] font-semibold whitespace-nowrap transition-colors ${selectedCount >= cap ? "text-primary" : "text-slate-400"}`}>
                                    {selectedCount} de {cap} {selectedCount === 1 ? "selecionada" : "selecionadas"}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="space-y-1.5">
                              {item.fieldIndices.map(fi => {
                                const gf = regularFields[fi];
                                const isChecked = formData[gf.variableName] === "✓";
                                return (
                                  <button
                                    key={gf.variableName}
                                    type="button"
                                    onClick={() => setCheckboxField(gf.variableName, item.groupId, item.maxSelections)(isChecked ? "" : "✓")}
                                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left ${isChecked ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                                      }`}
                                  >
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isChecked ? "bg-primary border-primary" : "border-slate-300 bg-white"
                                      }`}>
                                      {isChecked && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className={`text-sm font-semibold transition-colors ${isChecked ? "text-primary" : "text-slate-600"}`}>
                                      {gf.label || gf.variableName}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <DynamicField
                          key={item.field.variableName}
                          field={item.field}
                          value={formData[item.field.variableName] ?? ""}
                          onValueChange={
                            item.field.fieldType === "checkbox"
                              ? setCheckboxField(item.field.variableName, "", 1)
                              : setField(item.field.variableName)
                          }
                        />
                      );
                    })}
                  </div>

                  <button
                    onClick={() => {
                      const next = 1;
                      setStep(next);
                      if (stepOrder[next] === "review") fetchPreview();
                    }}
                    disabled={!step0Valid && regularFields.some((f) => f.required)}
                    className="w-full bg-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all active:scale-95 text-sm"
                  >
                    Próximo Passo
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </motion.div>
              )}

              {/* ---- STEP: E-mail ---- */}
              {step === emailStep && emailStep > 0 && emailField && (
                <motion.div key="step-email" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-6">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                      Passo {emailStep + 1} de {totalSteps}
                    </span>
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">E-mail para assinatura</h2>
                    <p className="text-slate-500 text-sm">Informe o e-mail que receberá o documento para assinatura digital.</p>
                  </div>

                  <DynamicField field={emailField} value={formData["CLIENT_EMAIL"] ?? ""} onValueChange={setField("CLIENT_EMAIL")} />

                  <div className="flex gap-3">
                    <button onClick={() => setStep(emailStep - 1)} className="flex items-center justify-center gap-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-500 font-bold transition-all hover:bg-slate-200 active:scale-95">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        const next = emailStep + 1;
                        setStep(next);
                        if (stepOrder[next] === "review") fetchPreview();
                      }}
                      disabled={!step1Valid}
                      className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all active:scale-95 text-sm"
                    >
                      {stepOrder[emailStep + 1] === "review" ? "Ver Documento" : "Próximo Passo"}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ---- STEP: Anexos ---- */}
              {step === attachmentStep && attachmentStep > 0 && (
                <motion.div key="step-attachments" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                      Passo {attachmentStep + 1} de {totalSteps}
                    </span>
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">Documentos</h2>
                    <p className="text-slate-500 text-sm">Anexe os documentos solicitados antes de prosseguir.</p>
                  </div>

                  <div className="space-y-3">
                    {visibleAttachmentSlots.map((slot) => {
                      const uploaded = uploadedAttachments[slot.id];
                      const isUploading = uploadingSlot === slot.id;
                      return (
                        <div key={slot.id} className="rounded-2xl border-2 border-slate-100 bg-slate-50 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold text-slate-800 text-sm">{slot.label}</span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${slot.required ? "bg-rose-100 text-rose-600" : "bg-slate-200 text-slate-500"}`}>
                              {slot.required ? "Obrigatório" : "Opcional"}
                            </span>
                          </div>
                          {uploaded ? (
                            <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-emerald-100">
                              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                {uploaded.originalName.match(/\.(jpg|jpeg|png)$/i)
                                  ? <ImageIcon className="w-4 h-4 text-emerald-600" />
                                  : <FileText className="w-4 h-4 text-emerald-600" />}
                              </div>
                              <p className="flex-1 text-xs font-semibold text-slate-700 truncate">{uploaded.originalName}</p>
                              <button
                                onClick={() => handleAttachmentRemove(slot.id)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors flex-shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <label className={`flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${isUploading ? "border-primary/30 bg-primary/5" : "border-slate-200 hover:border-primary/40 hover:bg-primary/5"}`}>
                              {isUploading
                                ? <><Loader2 className="w-5 h-5 text-primary animate-spin" /><span className="text-sm font-semibold text-primary">Enviando...</span></>
                                : <><Paperclip className="w-5 h-5 text-slate-400" /><span className="text-sm font-semibold text-slate-500">Anexar Documento</span></>}
                              <input
                                type="file"
                                accept={ALLOWED_ACCEPT}
                                className="sr-only"
                                disabled={isUploading}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAttachmentUpload(slot.id, f); e.target.value = ""; }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setStep(attachmentStep - 1)} className="flex items-center justify-center gap-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-500 font-bold transition-all hover:bg-slate-200 active:scale-95">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => { setStep(reviewStep); fetchPreview(); }}
                      disabled={!attachmentsValid || uploadingSlot !== null}
                      className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all active:scale-95 text-sm"
                    >
                      Ver Documento
                      <ClipboardCheck className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ---- STEP revisão: preview do documento + confirmação ---- */}
              {step === reviewStep && (
                <motion.div key="review" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                      Passo {totalSteps} de {totalSteps} — Revisão
                    </span>
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">Revise o documento</h2>
                    <p className="text-slate-500 text-sm">
                      Confira o documento com seus dados antes de confirmar o envio.
                    </p>
                  </div>

                  {/* Preview do documento */}
                  <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <ScrollText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="text-xs font-semibold text-slate-600 truncate">
                          {linkData?.template?.name || "Documento preenchido"}
                        </span>
                      </div>
                      {preview && !preview.isPdf && (
                        <a
                          href={`${apiUrl}/links/preview-file/${preview.filename}`}
                          download
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold text-primary hover:bg-primary/5 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          BAIXAR
                        </a>
                      )}
                    </div>

                    <div style={{ height: "50vh" }} className="relative">
                      {(previewLoading || (preview?.isPdf && !iframeLoaded)) && !previewError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 z-10">
                          <Loader2 className="w-8 h-8 text-primary animate-spin" />
                          <p className="text-xs text-slate-400 font-medium">
                            {previewLoading ? "Gerando documento preenchido..." : "Carregando visualização..."}
                          </p>
                        </div>
                      )}

                      {previewError && !previewLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
                          <AlertCircle className="w-8 h-8 text-amber-500" />
                          <p className="text-sm text-slate-600">{previewError}</p>
                          <button
                            onClick={fetchPreview}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-all"
                          >
                            Tentar novamente
                          </button>
                        </div>
                      )}

                      {preview && !previewLoading && preview.isPdf && (
                        <iframe
                          src={`${apiUrl}/links/preview-file/${preview.filename}`}
                          className="w-full h-full"
                          style={{ border: "none", background: "white" }}
                          title="Documento preenchido"
                          onLoad={() => setIframeLoaded(true)}
                        />
                      )}

                      {preview && !previewLoading && !preview.isPdf && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
                          <FileText className="w-10 h-10 text-primary/40" />
                          <p className="text-sm text-slate-600">
                            Visualização inline não disponível. Baixe o documento para conferir.
                          </p>
                          <a
                            href={`${apiUrl}/links/preview-file/${preview.filename}`}
                            download
                            className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-2"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Baixar DOCX preenchido
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checkbox de concordância */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-0.5 flex-shrink-0">
                      <input type="checkbox" className="sr-only" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${agreed ? "bg-primary border-primary" : "border-slate-300 group-hover:border-primary/50"}`}>
                        {agreed && (
                          <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </motion.svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-slate-600 leading-snug">
                      {isFinalRecipient
                        ? <>Li e confirmo que os dados do{" "}<strong className="text-slate-800">{linkData?.template?.name || "documento"}</strong>{" "}estão corretos e autorizo o envio para assinatura digital.</>
                        : <>Confirmo que as informações preenchidas por mim estão corretas e autorizo o prosseguimento para o próximo responsável.</>
                      }
                    </span>
                  </label>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(reviewStep - 1)}
                      className="flex items-center justify-center gap-1 px-4 py-4 rounded-2xl bg-slate-100 text-slate-500 font-bold transition-all hover:bg-slate-200 active:scale-95"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !agreed || previewLoading}
                      className="flex-1 bg-primary text-primary-foreground py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all active:scale-95 text-sm"
                    >
                      {isFinalRecipient ? "Confirmar e Enviar" : "Confirmar Respostas"}
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>

        <p className="text-center text-slate-400 text-[10px] uppercase tracking-[0.15em] leading-relaxed mt-8 px-4">
          {isFinalRecipient
            ? "Ao enviar, você concorda em receber o documento para assinatura via D4Sign."
            : "Ao enviar, suas respostas serão registradas e o próximo responsável será notificado."}
        </p>

        <a
          href="https://guilhermeruy.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-slate-300 text-[9px] uppercase tracking-[0.15em] mt-3 hover:text-slate-400 transition-colors"
        >
          Criado por Guilherme Ruy
        </a>
      </main>

      {/* Submitting Overlay */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 24 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-xs w-full text-center"
            >
              <div className="relative w-24 h-24 mx-auto mb-8">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="42" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                  <motion.circle
                    cx="48" cy="48" r="42" fill="none" strokeWidth="5" strokeLinecap="round"
                    className="text-primary" stroke="currentColor" strokeDasharray="263.9"
                    initial={{ strokeDashoffset: 263.9 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 4.4, ease: "easeInOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                    <FileText className="w-7 h-7 text-primary" />
                  </motion.div>
                </div>
              </div>

              <h2 className="text-lg font-bold text-slate-900 mb-1">{isFinalRecipient ? "Processando" : "Enviando"}</h2>
              <p className="text-slate-400 text-xs mb-8 uppercase tracking-widest">{isFinalRecipient ? "Aguarde um instante" : "Registrando suas respostas"}</p>

              <div className="space-y-3 text-left">
                {SUBMIT_STEPS.map((label, i) => {
                  const done = submitStep > i;
                  const active = submitStep === i;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-500 ${done ? "bg-emerald-500" : active ? "bg-primary" : "bg-slate-100"}`}>
                        {done ? (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}>
                            <Check className="w-3.5 h-3.5 text-white" />
                          </motion.div>
                        ) : active ? (
                          <motion.div animate={{ scale: [0.7, 1.1, 0.7] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }} className="w-2.5 h-2.5 bg-white rounded-full" />
                        ) : (
                          <div className="w-2 h-2 bg-slate-300 rounded-full" />
                        )}
                      </div>
                      <span className={`text-sm font-semibold transition-colors duration-500 ${done ? "text-emerald-600" : active ? "text-slate-900" : "text-slate-300"}`}>
                        {label}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Mask helpers ─── */
function maskCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}
function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10)
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
function maskDate(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d
    .replace(/(\d{2})(\d)/, "$1/$2")
    .replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}
function todayBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function DynamicField({
  field,
  value,
  onValueChange,
}: {
  field: TemplateField;
  value: string;
  onValueChange: (val: string) => void;
}) {
  const [autoDate, setAutoDate] = useState(field.options === "auto_date");

  const inputClass =
    "w-full px-5 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-2xl outline-none transition-all text-slate-700 font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed";

  function applyMask(raw: string): string {
    switch (field.fieldType) {
      case "cpf": return maskCPF(raw);
      case "cnpj": return maskCNPJ(raw);
      case "phone": return maskPhone(raw);
      case "date": return maskDate(raw);
      default: return raw;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onValueChange(applyMask(e.target.value));
  }

  function handleAutoDate(checked: boolean) {
    setAutoDate(checked);
    onValueChange(checked ? todayBR() : "");
  }

  const isDate = field.fieldType === "date";
  const isSelect = field.fieldType === "select";
  const isCheckbox = field.fieldType === "checkbox";
  const htmlType = field.fieldType === "email" ? "email" : "text";

  // Parse select choices
  const selectChoices: string[] = (() => {
    if (!isSelect || !field.options) return [];
    try {
      const parsedChoices = JSON.parse(field.options).choices || [];
      return parsedChoices.filter((c: string) => c.trim() !== "");
    } catch { return []; }
  })();

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 transition-colors group-focus-within:text-primary">
          {field.label}
          {field.required && <span className="text-rose-400 ml-0.5">*</span>}
        </label>
        {isDate && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${autoDate ? "bg-primary border-primary" : "border-slate-300"}`}>
              {autoDate && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <input type="checkbox" className="sr-only" checked={autoDate} onChange={(e) => handleAutoDate(e.target.checked)} />
            <span className="text-[10px] text-slate-400 font-semibold">Data atual</span>
          </label>
        )}
      </div>
      {isCheckbox ? (
        <button
          type="button"
          onClick={() => onValueChange(value === "✓" ? "" : "✓")}
          className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all ${value === "✓" ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50 hover:border-slate-300"
            }`}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${value === "✓" ? "bg-primary border-primary" : "border-slate-300 bg-white"
            }`}>
            {value === "✓" && <Check className="w-3 h-3 text-white" />}
          </div>
          <span className={`text-sm font-semibold transition-colors ${value === "✓" ? "text-primary" : "text-slate-500"}`}>
            {value === "✓" ? "Marcado" : "Não marcado"}
          </span>
        </button>
      ) : isSelect ? (
        <div className="flex flex-wrap gap-2">
          {selectChoices.map((choice, ci) => (
            <label
              key={ci}
              className={`flex items-center gap-2.5 flex-1 min-w-[120px] px-4 py-3.5 rounded-2xl border-2 cursor-pointer transition-all select-none ${value === choice ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${value === choice ? "border-primary" : "border-slate-300"}`}>
                {value === choice && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <span className={`text-sm font-semibold transition-colors ${value === choice ? "text-primary" : "text-slate-600"}`}>{choice}</span>
              <input type="radio" name={field.variableName} value={choice} checked={value === choice} onChange={() => onValueChange(choice)} className="sr-only" />
            </label>
          ))}
        </div>
      ) : field.fieldType === "textarea" ? (
        <textarea value={value} onChange={handleChange} rows={3} className={`${inputClass} resize-none`} />
      ) : (
        <input
          type={htmlType}
          value={value}
          onChange={handleChange}
          disabled={isDate && autoDate}
          placeholder={isDate ? "DD/MM/AAAA" : undefined}
          inputMode={["cpf", "cnpj", "phone"].includes(field.fieldType) ? "numeric" : undefined}
          className={inputClass}
        />
      )}
    </div>
  );
}
