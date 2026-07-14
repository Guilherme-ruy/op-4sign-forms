"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  ArrowLeft, Plus, Trash2, Save, Loader2,
  MousePointer2, Move, GripVertical, Maximize2, Check, Link2, X, Upload,
  ChevronLeft, ChevronRight, Type,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ─── Types ─────────────────────────────────────────────────────────── */
interface OverlayPos {
  page: number;
  x: number;      // fração 0-1 da largura do canvas
  y: number;      // fração 0-1 da altura do canvas (top-left)
  width: number;  // fração 0-1
  height: number; // fração 0-1
  fontSize: number;
  checkValue?: string;
}

interface CheckboxGroupMeta {
  id: string;           // ID único compartilhado entre as opções do grupo
  question: string;     // Pergunta exibida ao usuário final
  maxSelections: number; // 1 = rádio, N = multi-select com limite
  score: number;        // pontução desta opção específica
}

interface AttachmentSlot {
  id?: string;
  label: string;
  required: boolean;
  order: number;
  recipientOrder?: number | null;
}

interface OverlayField {
  id?: string;
  variableName: string;
  label: string;
  fieldType: string;
  required: boolean;
  placeholder?: string;
  options: string;
  order: number;
  recipientOrder?: number | null;
}

interface TemplateRecipient {
  order: number;
  label: string;
  color: string;
}

const RECIPIENT_COLORS_FALLBACK = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899",
];

function getRecipientColor(recipients: TemplateRecipient[], order: number | null | undefined, fallback = "#3B82F6"): string {
  if (order == null) return fallback;
  return recipients.find((r) => r.order === order)?.color ?? RECIPIENT_COLORS_FALLBACK[(order - 1) % RECIPIENT_COLORS_FALLBACK.length];
}

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "date", label: "Data" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "checkbox", label: "Checkbox (✗)" },
];

const DEFAULT_W = 0.18;
const DEFAULT_H = 0.025;
const HANDLE_PX = 10;

const FIELD_DEFAULTS: Record<string, { w: number; h: number; fontSize: number }> = {
  text:     { w: 0.18,  h: 0.025, fontSize: 11 },
  date:     { w: 0.12,  h: 0.025, fontSize: 11 },
  cpf:      { w: 0.14,  h: 0.025, fontSize: 11 },
  cnpj:     { w: 0.16,  h: 0.025, fontSize: 11 },
  email:    { w: 0.20,  h: 0.025, fontSize: 11 },
  phone:    { w: 0.12,  h: 0.025, fontSize: 11 },
  checkbox: { w: 0.030, h: 0.040, fontSize: 11 }, // tamanho proporcional ao fontSize padrão
};

/* ─── Helpers ───────────────────────────────────────────────────────── */
function parsePos(raw: string | null | undefined): OverlayPos | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return p?.overlay ?? null;
  } catch { return null; }
}
function serializePos(pos: OverlayPos): string {
  return JSON.stringify({ overlay: pos });
}
function toUniqueVarName(): string {
  return `CAMPO_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
function toGroupId(): string {
  return `grp_${Math.random().toString(36).slice(2, 10)}`;
}
// Extended parse that also extracts group metadata
function parseStoredOptions(raw: string | null | undefined): { overlay: OverlayPos | null; grpMeta?: CheckboxGroupMeta } {
  if (!raw) return { overlay: null };
  try {
    const p = JSON.parse(raw);
    return { overlay: p?.overlay ?? null, grpMeta: p?.group as CheckboxGroupMeta | undefined };
  } catch { return { overlay: null }; }
}
// Serialize overlay + optional group data
function serializeStoredOptions(overlay: OverlayPos, grpMeta?: CheckboxGroupMeta): string {
  return JSON.stringify({ overlay, ...(grpMeta ? { group: grpMeta } : {}) });
}

/* ─── Sortable field row ────────────────────────────────────────────── */
function SortableFieldRow({
  fieldId,
  children,
}: {
  fieldId: string;
  children: (listeners: Record<string, unknown> | undefined) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: fieldId });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 999 : undefined,
        position: isDragging ? "relative" : undefined,
      }}
      {...attributes}
    >
      {children(listeners)}
    </div>
  );
}

/* ─── PDF canvas hook ───────────────────────────────────────────────── */
function usePdfCanvas(url: string, pageNumber: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState(1);
  const pdfDocRef = useRef<any>(null);
  const [pdfReady, setPdfReady] = useState(false);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setPdfReady(false);
    setLoading(true);
    pdfDocRef.current = null;

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if (!cancelled) {
          pdfDocRef.current = pdf;
          setNumPages(pdf.numPages);
          setPdfReady(true);
        }
      } catch (e) {
        console.error("pdfjs load error", e);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!pdfReady || !pdfDocRef.current) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const page = await pdfDocRef.current.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setSize({ w: viewport.width, h: viewport.height });

        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx as any, viewport }).promise;
        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error("pdfjs render error", e);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pdfReady, pageNumber]);

  return { canvasRef, size, loading, numPages };
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function OverlayEditorPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const overlayRef = useRef<HTMLDivElement>(null);
  const [fields, setFields] = useState<OverlayField[]>([]);
  const [attachments, setAttachments] = useState<AttachmentSlot[]>([]);
  const [recipients, setRecipients] = useState<TemplateRecipient[]>([]);
  const [activeTab, setActiveTab] = useState<"fields" | "attachments">("fields");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<Set<number>>(new Set());
  const [groupModal, setGroupModal] = useState<{
    indices: number[];
    question: string;
    maxSelections: number;
    scores: number[];
    recipientOrder: number | null;
  } | null>(null);

  // drag state — move ou resize no canvas
  type DragMode = "move" | "resize";
  const dragInfo = useRef<{
    idx: number; mode: DragMode;
    startMx: number; startMy: number;
    orig: OverlayPos;
  } | null>(null);

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  // drag and drop na lista de campos (reordenar)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleFieldDragStart(event: DragStartEvent) {
    setDraggingItemId(String(event.active.id));
  }

  function handleFieldDragEnd(event: DragEndEvent) {
    setDraggingItemId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldItemIdx = sortableItems.findIndex(item => item.id === String(active.id));
    const newItemIdx = sortableItems.findIndex(item => item.id === String(over.id));
    if (oldItemIdx === -1 || newItemIdx === -1) return;

    const reordered = arrayMove(sortableItems, oldItemIdx, newItemIdx);
    const newFields: OverlayField[] = [];
    reordered.forEach(item => {
      if (item.type === 'field') {
        newFields.push(fields[item.fieldIdx]);
      } else {
        item.fieldIndices.forEach(idx => newFields.push(fields[idx]));
      }
    });

    if (selectedIdx !== null) {
      const selId = fields[selectedIdx].id ?? fields[selectedIdx].variableName;
      const newSel = newFields.findIndex(f => (f.id ?? f.variableName) === selId);
      setSelectedIdx(newSel === -1 ? null : newSel);
    }
    setFields(newFields);
    setSelectedForGroup(new Set());
    setIsDirty(true);
  }

  /* ── Queries ── */
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ["template", id],
    queryFn: () => api.get(`/templates/${id}`).then(r => r.data),
  });

  const { data: savedFields, isLoading: fieldsLoading } = useQuery({
    queryKey: ["template-fields", id],
    queryFn: () => api.get(`/templates/${id}/fields`).then(r => r.data),
  });

  const { data: savedAttachments, isLoading: attachmentsLoading } = useQuery({
    queryKey: ["template-attachments", id],
    queryFn: () => api.get(`/templates/${id}/attachments`).then(r => r.data),
  });

  const { data: savedRecipients } = useQuery({
    queryKey: ["template-recipients", id],
    queryFn: () => api.get(`/templates/${id}/recipients`).then(r => r.data),
  });

  useEffect(() => {
    if (!savedFields) return;
    setFields(savedFields.map((f: any, i: number) => ({
      id: f.id,
      variableName: f.variableName,
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
      placeholder: f.placeholder ?? "",
      options: f.options ?? "{}",
      order: f.order ?? i,
      recipientOrder: f.recipientOrder ?? null,
    })));
    setIsDirty(false);
  }, [savedFields]);

  useEffect(() => {
    if (savedRecipients) setRecipients(savedRecipients);
  }, [savedRecipients]);

  useEffect(() => {
    if (!savedAttachments) return;
    setAttachments(savedAttachments.map((a: any, i: number) => ({
      id: a.id,
      label: a.label,
      required: a.required,
      order: a.order ?? i,
      recipientOrder: a.recipientOrder ?? null,
    })));
  }, [savedAttachments]);

  /* ── PDF canvas ── */
  const pdfUrl = (() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const resolved = typeof window !== "undefined" && window.location.hostname !== "localhost"
      ? base.replace("localhost", window.location.hostname) : base;
    return `${resolved}/templates/${id}/base-pdf`;
  })();

  const [currentPage, setCurrentPage] = useState(1);
  const { canvasRef, size: canvasSize, loading: pdfLoading, numPages } = usePdfCanvas(pdfUrl, currentPage);

  /* ── Save ── */
  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/templates/${id}/fields`, { fields: fields.map((f, i) => ({ ...f, order: i })) });
      await api.put(`/templates/${id}/attachments`, { attachments: attachments.map((a, i) => ({ ...a, order: i })) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-fields", id] });
      queryClient.invalidateQueries({ queryKey: ["template-attachments", id] });
      setIsDirty(false);
      showToast("Salvo com sucesso!");
    },
    onError: () => showToast("Erro ao salvar.", "error"),
  });

  function handleSave() {
    if (recipients.length > 0) {
      const unassignedFields = fields.filter(f => f.fieldType !== "section" && f.recipientOrder == null);
      if (unassignedFields.length > 0) {
        showToast(`${unassignedFields.length} campo(s) sem responsável definido. Atribua um responsável a todos os campos antes de salvar.`, "error");
        return;
      }
      const unassignedAttachments = attachments.filter(a => a.recipientOrder == null);
      if (unassignedAttachments.length > 0) {
        showToast(`${unassignedAttachments.length} documento(s) sem responsável definido. Atribua um responsável a todos os documentos antes de salvar.`, "error");
        return;
      }
    }
    saveMutation.mutate();
  }

  /* ── Coordinate helpers ── */
  const toFraction = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el || !canvasSize) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / canvasSize.w)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / canvasSize.h)),
    };
  }, [canvasSize]);

  /* ── Click to add ── */
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!addMode || dragInfo.current) return;
    const frac = toFraction(e.clientX, e.clientY);
    if (!frac) return;
    const newField: OverlayField = {
      variableName: toUniqueVarName(),
      label: `Campo ${fields.length + 1}`,
      fieldType: "text",
      required: true,
      options: serializePos({ page: currentPage, x: frac.x, y: frac.y, width: DEFAULT_W, height: DEFAULT_H, fontSize: 11 }),
      order: fields.length,
      recipientOrder: recipients.length > 0 ? 1 : null,
    };
    const next = [...fields, newField];
    setFields(next);
    setSelectedIdx(next.length - 1);
    setIsDirty(true);
    setAddMode(false);
  }

  /* ── Add section label ── */
  function addSection() {
    const newSection: OverlayField = {
      variableName: `SECAO_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      label: "Novo Cabeçalho",
      fieldType: "section",
      required: false,
      options: "{}",
      order: fields.length,
    };
    setFields(prev => [...prev, newSection]);
    setSelectedIdx(fields.length);
    setIsDirty(true);
    setAddMode(false);
  }

  /* ── Drag start (move or resize) ── */
  function startDrag(e: React.MouseEvent, idx: number, mode: DragMode) {
    e.stopPropagation();
    e.preventDefault();
    const pos = parsePos(fields[idx].options);
    if (!pos) return;
    dragInfo.current = { idx, mode, startMx: e.clientX, startMy: e.clientY, orig: { ...pos } };
    setSelectedIdx(idx);
    setAddMode(false);
  }

  /* ── Mouse move ── */
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const d = dragInfo.current;
    if (!d || !canvasSize) return;
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - d.startMx) / canvasSize.w;
    const dy = (e.clientY - d.startMy) / canvasSize.h;

    setFields(prev => prev.map((f, i) => {
      if (i !== d.idx) return f;
      const o = d.orig;
      let next: OverlayPos;
      if (d.mode === "move") {
        next = { ...o, x: Math.max(0, Math.min(1 - o.width, o.x + dx)), y: Math.max(0, Math.min(1 - o.height, o.y + dy)) };
      } else {
        const newW = Math.max(0.04, Math.min(1 - o.x, o.width + dx));
        const newH = Math.max(0.01, Math.min(1 - o.y, o.height + dy));
        next = { ...o, width: newW, height: newH };
      }
      const { grpMeta } = parseStoredOptions(f.options);
      return { ...f, options: serializeStoredOptions(next, grpMeta) };
    }));
    setIsDirty(true);
  }

  function handleMouseUp() { dragInfo.current = null; }

  /* ── Field updates ── */
  function updateField(idx: number, patch: Partial<OverlayField>) {
    setFields(prev => {
      const updated = prev.map((f, i) => i === idx ? { ...f, ...patch } : f);
      // Ao alterar recipientOrder de um campo agrupado, propaga para todos do mesmo grupo
      if ('recipientOrder' in patch) {
        const { grpMeta } = parseStoredOptions(prev[idx].options);
        if (grpMeta) {
          return updated.map(f => {
            const { grpMeta: gm } = parseStoredOptions(f.options);
            if (gm?.id === grpMeta.id) return { ...f, recipientOrder: patch.recipientOrder };
            return f;
          });
        }
      }
      return updated;
    });
    setIsDirty(true);
  }
  function updatePos(idx: number, patch: Partial<OverlayPos>) {
    setFields(prev => prev.map((f, i) => {
      if (i !== idx) return f;
      const { overlay: cur, grpMeta } = parseStoredOptions(f.options);
      const base = cur ?? { page: 1, x: 0.1, y: 0.1, width: DEFAULT_W, height: DEFAULT_H, fontSize: 11 };
      return { ...f, options: serializeStoredOptions({ ...base, ...patch }, grpMeta) };
    }));
    setIsDirty(true);
  }
  function deleteField(idx: number) {
    setFields(prev => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
    setSelectedForGroup(new Set());
    setIsDirty(true);
  }

  /* ── Checkbox group management ── */
  function toggleSelectForGroup(index: number) {
    if (fields[index]?.fieldType !== "checkbox") return;
    setSelectedForGroup(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }
  function openGroupModal() {
    const indices = Array.from(selectedForGroup);
    // Detecta responsável comum (se todos tiverem o mesmo, pré-seleciona)
    const orders = indices.map(i => fields[i].recipientOrder ?? null);
    const uniqueOrders = new Set(orders.map(o => String(o)));
    const commonRecipient = uniqueOrders.size === 1 ? orders[0] : null;
    setGroupModal({ indices, question: "", maxSelections: 1, scores: indices.map(() => 0), recipientOrder: commonRecipient });
  }
  function confirmCreateGroup() {
    if (!groupModal) return;
    const gid = toGroupId();
    setFields(prev => prev.map((f, i) => {
      const posInGroup = groupModal.indices.indexOf(i);
      if (posInGroup === -1) return f;
      const { overlay } = parseStoredOptions(f.options);
      if (!overlay) return f;
      const grp: CheckboxGroupMeta = { id: gid, question: groupModal.question, maxSelections: groupModal.maxSelections, score: groupModal.scores[posInGroup] ?? 0 };
      return { ...f, options: serializeStoredOptions(overlay, grp), recipientOrder: groupModal.recipientOrder };
    }));
    setGroupModal(null);
    setSelectedForGroup(new Set());
    setIsDirty(true);
  }
  function ungroupAll(groupId: string) {
    setFields(prev => prev.map(f => {
      const { overlay, grpMeta } = parseStoredOptions(f.options);
      if (grpMeta?.id !== groupId || !overlay) return f;
      return { ...f, options: serializeStoredOptions(overlay) };
    }));
    setIsDirty(true);
  }
  function updateGroupConfig(groupId: string, patch: Partial<Omit<CheckboxGroupMeta, "id" | "score">>) {
    setFields(prev => prev.map(f => {
      const { overlay, grpMeta } = parseStoredOptions(f.options);
      if (grpMeta?.id !== groupId || !overlay) return f;
      return { ...f, options: serializeStoredOptions(overlay, { ...grpMeta, ...patch }) };
    }));
    setIsDirty(true);
  }
  function updateGroupScore(varName: string, score: number) {
    setFields(prev => prev.map(f => {
      if (f.variableName !== varName) return f;
      const { overlay, grpMeta } = parseStoredOptions(f.options);
      if (!overlay || !grpMeta) return f;
      return { ...f, options: serializeStoredOptions(overlay, { ...grpMeta, score }) };
    }));
    setIsDirty(true);
  }

  type SortableItem =
    | { id: string; type: 'field'; fieldIdx: number }
    | { id: string; type: 'group'; groupId: string; fieldIndices: number[] };

  const sortableItems = useMemo((): SortableItem[] => {
    const items: SortableItem[] = [];
    const seenGroups = new Set<string>();
    fields.forEach((f, i) => {
      const { grpMeta } = parseStoredOptions(f.options);
      if (grpMeta) {
        if (!seenGroups.has(grpMeta.id)) {
          seenGroups.add(grpMeta.id);
          const groupIndices = fields.reduce<number[]>((acc, ff, ii) => {
            const { grpMeta: gm } = parseStoredOptions(ff.options);
            if (gm?.id === grpMeta.id) acc.push(ii);
            return acc;
          }, []);
          items.push({ id: `group:${grpMeta.id}`, type: 'group', groupId: grpMeta.id, fieldIndices: groupIndices });
        }
      } else {
        items.push({ id: `field:${f.id ?? f.variableName}`, type: 'field', fieldIdx: i });
      }
    });
    return items;
  }, [fields]);

  const isLoading = templateLoading || fieldsLoading || attachmentsLoading;
  const selectedField = selectedIdx !== null ? fields[selectedIdx] : null;
  const selectedPos = selectedField ? parsePos(selectedField.options) : null;

  if (isLoading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  // Guard: sem PDF base, mostra tela de aviso em vez do editor quebrado
  if (template && !(template as any).basePdfPath) return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] gap-6 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
        <Upload className="w-8 h-8" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">PDF base não enviado</h2>
        <p className="text-slate-500 text-sm max-w-sm">
          Antes de abrir o editor visual, faça o upload do PDF base na lista de modelos.
        </p>
      </div>
      <button
        onClick={() => router.push("/admin/templates")}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar e fazer upload
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/templates")}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">Editor Visual — {template?.name}</h1>
            <p className="text-xs text-slate-400">Clique em "Adicionar Campo" e depois clique no PDF. Arraste para mover ou redimensionar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addSection}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:border-amber-400/50 hover:text-amber-600 hover:bg-amber-50/50 transition-all"
          >
            <Type className="w-4 h-4" />
            Cabeçalho
          </button>
          <button
            onClick={() => setAddMode(v => !v)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
              addMode
                ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                : "border-slate-200 text-slate-600 hover:border-primary/30 hover:text-primary hover:bg-primary/5"
            )}
          >
            {addMode ? <MousePointer2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {addMode ? "Clique no PDF…" : "Adicionar Campo"}
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40 disabled:shadow-none transition-all"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF canvas area */}
        <div className="flex-1 bg-slate-300 overflow-auto flex flex-col items-center p-4 gap-3">
          {numPages > 1 && (
            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl shadow text-sm font-semibold text-slate-700 shrink-0">
              <button
                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); setSelectedIdx(null); setAddMode(false); }}
                disabled={currentPage === 1}
                className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Página {currentPage} de {numPages}</span>
              <button
                onClick={() => { setCurrentPage(p => Math.min(numPages, p + 1)); setSelectedIdx(null); setAddMode(false); }}
                disabled={currentPage === numPages}
                className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="relative shadow-2xl select-none"
            style={{ width: canvasSize?.w ?? 800, height: canvasSize?.h ?? 1100 }}>

            {/* PDF canvas — renderizado pelo pdfjs (coordenadas exatas) */}
            <canvas ref={canvasRef} className="absolute inset-0 block" />

            {pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {/* Overlay de interação — mesmo tamanho do canvas */}
            {canvasSize && (
              <div
                ref={overlayRef}
                className={cn("absolute inset-0 z-10", addMode ? "cursor-crosshair" : "cursor-default")}
                style={{ width: canvasSize.w, height: canvasSize.h }}
                onClick={handleOverlayClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {fields.map((field, idx) => {
                  const { overlay: pos, grpMeta } = parseStoredOptions(field.options);
                  if (!pos || pos.page !== currentPage) return null;
                  const isSelected = selectedIdx === idx;
                  const isCheckbox = field.fieldType === "checkbox";
                  const isGrouped = !!grpMeta;
                  const isDraggingThis = draggingItemId
                    ? draggingItemId.startsWith('group:')
                      ? grpMeta?.id === draggingItemId.slice(6)
                      : (field.id ?? field.variableName) === draggingItemId.slice(6)
                    : false;
                  const isHighlighted = isSelected || isDraggingThis;
                  const px = pos.x * canvasSize.w;
                  const py = pos.y * canvasSize.h;
                  const pw = pos.width * canvasSize.w;
                  const ph = pos.height * canvasSize.h;

                  // Recipient-aware color
                  const fieldColor = recipients.length > 0
                    ? getRecipientColor(recipients, field.recipientOrder, isGrouped ? "#8B5CF6" : "#3B82F6")
                    : isGrouped ? "#8B5CF6" : "#3B82F6";

                  return (
                    <div
                      key={idx}
                      className="absolute rounded-sm group z-10"
                      style={{
                        left: px, top: py, width: pw, height: ph,
                        border: `2px solid ${fieldColor}${isHighlighted ? "dd" : "99"}`,
                        backgroundColor: `${fieldColor}${isHighlighted ? "30" : "15"}`,
                        zIndex: isHighlighted ? 20 : 10,
                        animation: isHighlighted ? undefined : undefined,
                      }}
                      onClick={e => { e.stopPropagation(); setSelectedIdx(idx); setAddMode(false); setSelectedForGroup(new Set()); }}
                    >
                      <div
                        className="absolute -top-5 left-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-t text-[10px] font-bold whitespace-nowrap cursor-move select-none text-white"
                        style={{ backgroundColor: `${fieldColor}${isSelected ? "ff" : "cc"}` }}
                        onMouseDown={e => startDrag(e, idx, "move")}
                      >
                        <GripVertical className="w-2.5 h-2.5" />
                        {field.label || field.variableName}
                      </div>

                      {!isCheckbox && (
                        <div className="absolute inset-0 flex items-center justify-center cursor-move transition-opacity opacity-0 group-hover:opacity-40" onMouseDown={e => startDrag(e, idx, "move")}>
                          <Move className="w-4 h-4 pointer-events-none" style={{ color: fieldColor }} />
                        </div>
                      )}
                      {isCheckbox && <div className="absolute inset-0 cursor-move" onMouseDown={e => startDrag(e, idx, "move")} />}

                      <div
                        className="absolute bottom-0 right-0 cursor-se-resize z-30 flex items-center justify-center w-4 h-4 rounded-tl-sm text-white opacity-0 group-hover:opacity-100"
                        style={{ backgroundColor: isSelected ? fieldColor : `${fieldColor}cc` }}
                        onMouseDown={e => startDrag(e, idx, "resize")}
                      >
                        <Maximize2 className="w-2 h-2 pointer-events-none" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
          <div className="flex border-b border-slate-100 shrink-0">
            {([["fields", "Campos (PDF)"], ["attachments", "Exigir Docs"]] as const).map(([tId, label]) => (
              <button key={tId} onClick={() => setActiveTab(tId)}
                className={cn("flex-1 py-3.5 text-xs font-bold transition-colors border-b-2", activeTab === tId ? "text-primary border-primary bg-primary/5" : "text-slate-400 border-transparent hover:bg-slate-50")}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === "fields" && (
            <>
              {selectedIdx === null ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-3 pt-3 pb-2 shrink-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Campos ({fields.length})</p>
                </div>
                {fields.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 text-slate-400 text-center p-6 gap-3">
                    <Move className="w-8 h-8 opacity-40" />
                    <p className="text-sm font-medium">Adicione campos clicando em "Adicionar Campo" e depois no PDF</p>
                  </div>
                ) : (
                <div className="flex-1 overflow-y-auto px-3 pb-3">

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleFieldDragStart} onDragEnd={handleFieldDragEnd}>
                    <SortableContext items={sortableItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {sortableItems.map(item => {
                          if (item.type === 'field') {
                            const f = fields[item.fieldIdx];
                            const i = item.fieldIdx;
                            const isCheckbox = f.fieldType === "checkbox";
                            const isSection = f.fieldType === "section";
                            const isSelForGrp = selectedForGroup.has(i);

                            if (isSection) {
                              return (
                                <SortableFieldRow key={item.id} fieldId={item.id}>
                                  {(listeners) => (
                                    <div className="flex items-center gap-1 mt-1">
                                      <div
                                        {...(listeners as any)}
                                        className="flex items-center justify-center w-5 h-7 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                                      >
                                        <GripVertical className="w-3 h-3" />
                                      </div>
                                      <button
                                        onClick={() => { setSelectedIdx(i); setAddMode(false); setSelectedForGroup(new Set()); }}
                                        className={cn(
                                          "flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-left transition-colors min-w-0 border",
                                          selectedIdx === i
                                            ? "bg-amber-50 text-amber-700 font-bold border-amber-300"
                                            : "hover:bg-amber-50/60 text-slate-500 font-semibold border-slate-200"
                                        )}
                                      >
                                        <Type className="w-3 h-3 shrink-0 text-amber-500" />
                                        <span className="truncate flex-1">{f.label || "Cabeçalho sem título"}</span>
                                      </button>
                                    </div>
                                  )}
                                </SortableFieldRow>
                              );
                            }

                            return (
                              <SortableFieldRow key={item.id} fieldId={item.id}>
                                {(listeners) => (
                                  <div className="flex items-center gap-1">
                                    <div
                                      {...(listeners as any)}
                                      className="flex items-center justify-center w-5 h-7 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                                    >
                                      <GripVertical className="w-3 h-3" />
                                    </div>
                                    {isCheckbox ? (
                                      <button
                                        onClick={() => toggleSelectForGroup(i)}
                                        className={cn("w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all",
                                          isSelForGrp ? "bg-violet-600 border-violet-600" : "border-slate-300 hover:border-violet-400"
                                        )}
                                      >
                                        {isSelForGrp && <Check className="w-2.5 h-2.5 text-white" />}
                                      </button>
                                    ) : <div className="w-4 shrink-0" />}
                                    <button
                                      onClick={() => {
                                        const pos = parsePos(f.options);
                                        if (pos && pos.page !== currentPage) setCurrentPage(pos.page);
                                        setSelectedIdx(i); setAddMode(false); setSelectedForGroup(new Set());
                                      }}
                                      className={cn("flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-left transition-colors min-w-0",
                                        selectedIdx === i ? "bg-blue-100 text-blue-700 font-semibold" : "hover:bg-slate-100 text-slate-600"
                                      )}
                                    >
                                      <span className={cn("font-mono text-[10px] px-1 py-0.5 rounded shrink-0",
                                        selectedIdx === i ? "bg-blue-200 text-blue-700" : "bg-slate-200 text-slate-500"
                                      )}>
                                        {isCheckbox ? "✗" : f.fieldType.slice(0, 3).toUpperCase()}
                                      </span>
                                      <span className="truncate font-medium flex-1">{f.label || "Campo sem nome"}</span>
                                      {f.recipientOrder != null && recipients.length > 0 && (
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getRecipientColor(recipients, f.recipientOrder) }} />
                                      )}
                                      {numPages > 1 && (() => { const pos = parsePos(f.options); return pos ? <span className="text-[9px] font-bold text-slate-400 shrink-0">p.{pos.page}</span> : null; })()}
                                    </button>
                                  </div>
                                )}
                              </SortableFieldRow>
                            );
                          }

                          // Grupo — card violeta, drag na unidade toda
                          const firstField = fields[item.fieldIndices[0]];
                          const { grpMeta, overlay: grpFirstOverlay } = parseStoredOptions(firstField.options);
                          const grpRecipientOrder = firstField.recipientOrder ?? null;
                          const grpRecipientColor = getRecipientColor(recipients, grpRecipientOrder, "#8B5CF6");
                          const grpRecipientLabel = recipients.find(r => r.order === grpRecipientOrder)?.label;
                          const grpPage = grpFirstOverlay?.page;
                          return (
                            <SortableFieldRow key={item.id} fieldId={item.id}>
                              {(listeners) => (
                                <div className="bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
                                  <div className="flex items-center gap-1.5 px-2 py-2 border-b border-violet-200/60">
                                    <div
                                      {...(listeners as any)}
                                      className="flex items-center justify-center w-5 h-5 text-violet-300 hover:text-violet-600 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                                    >
                                      <GripVertical className="w-3 h-3" />
                                    </div>
                                    <Link2 className="w-3 h-3 text-violet-500 shrink-0" />
                                    <span className="text-[10px] font-bold text-violet-700 truncate flex-1">
                                      {grpMeta?.question || "Grupo sem pergunta"}
                                    </span>
                                    {/* Indicador de página */}
                                    {numPages > 1 && grpPage && (
                                      <span className="text-[9px] font-bold text-violet-400 shrink-0">p.{grpPage}</span>
                                    )}
                                    {/* Badge de responsável */}
                                    {recipients.length > 0 && (
                                      grpRecipientOrder != null ? (
                                        <span
                                          className="flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
                                          style={{ backgroundColor: grpRecipientColor }}
                                        >
                                          R{grpRecipientOrder}{grpRecipientLabel ? ` · ${grpRecipientLabel}` : ""}
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-semibold text-slate-400 shrink-0">— Nenhum</span>
                                      )
                                    )}
                                  </div>
                                  <div className="p-1 space-y-0.5">
                                    {item.fieldIndices.map(i => {
                                      const f = fields[i];
                                      return (
                                        <button
                                          key={i}
                                          onClick={() => { setSelectedIdx(i); setAddMode(false); setSelectedForGroup(new Set()); }}
                                          className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors",
                                            selectedIdx === i ? "bg-violet-200 text-violet-800 font-semibold" : "hover:bg-violet-100/70 text-slate-600"
                                          )}
                                        >
                                          <span className={cn("font-mono text-[10px] px-1 py-0.5 rounded shrink-0",
                                            selectedIdx === i ? "bg-violet-300 text-violet-800" : "bg-violet-100 text-violet-500"
                                          )}>✗</span>
                                          <span className="truncate font-medium">{f.label || "Campo sem nome"}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </SortableFieldRow>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                {selectedForGroup.size >= 2 && (
                  <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-violet-100">
                    <span className="text-[10px] font-semibold text-violet-600">{selectedForGroup.size} selecionados</span>
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedForGroup(new Set())} className="text-[10px] text-slate-400 hover:text-slate-600 px-2 py-1 rounded">Limpar</button>
                      <button onClick={openGroupModal} className="flex items-center gap-1 px-2 py-1 bg-violet-600 text-white rounded-lg text-[10px] font-bold hover:bg-violet-700 transition-colors">
                        <Link2 className="w-3 h-3" /> Criar Grupo
                      </button>
                    </div>
                  </div>
                )}
                </div>
              )}
              </div>
              ) : selectedField && selectedField.fieldType === "section" ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setSelectedIdx(null); setSelectedForGroup(new Set()); }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <Type className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-bold text-slate-900 truncate flex-1">Cabeçalho</span>
                  <button onClick={() => deleteField(selectedIdx!)}
                    className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <PanelField
                    label="Texto do cabeçalho"
                    value={selectedField.label}
                    onChange={v => updateField(selectedIdx!, { label: v })}
                    placeholder="Ex: 4. Responsável pelas informações"
                  />
                  <p className="text-[11px] text-slate-400 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 leading-relaxed">
                    Este rótulo aparece como cabeçalho no formulário do cliente. Não é posicionado no PDF.
                  </p>
                </div>
              </div>
              ) : selectedField && selectedPos ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setSelectedIdx(null); setSelectedForGroup(new Set()); }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-slate-900 truncate flex-1">{selectedField.label || "Campo sem nome"}</span>
                  <button onClick={() => deleteField(selectedIdx!)}
                    className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <PanelField label="Label (exibição)"
                      value={selectedField.label}
                      onChange={v => updateField(selectedIdx!, { label: v })}
                      placeholder="Nome do campo"
                    />
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Tipo</label>
                      <select value={selectedField.fieldType}
                        onChange={e => {
                          const newType = e.target.value;
                          const def = FIELD_DEFAULTS[newType] ?? FIELD_DEFAULTS.text;
                          setFields(prev => prev.map((f, i) => {
                            if (i !== selectedIdx!) return f;
                            const { overlay: fpos, grpMeta } = parseStoredOptions(f.options);
                            const basePos = fpos ?? { page: 1, x: 0.1, y: 0.1, ...FIELD_DEFAULTS.text };
                            return { ...f, fieldType: newType, options: serializeStoredOptions({ ...basePos, width: def.w, height: def.h, fontSize: def.fontSize }, grpMeta) };
                          }));
                          setIsDirty(true);
                        }}
                        className="w-full px-3 py-2.5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none text-slate-700 font-medium text-sm">
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {selectedField.fieldType === "checkbox" && (() => {
                      const { grpMeta } = parseStoredOptions(selectedField.options);
                      if (grpMeta) {
                        const groupItemsCount = fields.filter(f => parseStoredOptions(f.options).grpMeta?.id === grpMeta.id).length;
                        return (
                          <div className="space-y-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-violet-700 flex items-center gap-1"><Link2 className="w-3 h-3" /> Grupo</span>
                              <button onClick={() => ungroupAll(grpMeta.id)} className="text-[10px] text-rose-400 hover:text-rose-600 font-semibold">Desagrupar todos</button>
                            </div>
                            <PanelField label="Pergunta do grupo" value={grpMeta.question} onChange={v => updateGroupConfig(grpMeta.id, { question: v })} placeholder="Ex: Existe registro?" />
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Máx. seleções</label>
                              <select 
                                value={grpMeta.maxSelections}
                                onChange={e => updateGroupConfig(grpMeta.id, { maxSelections: parseInt(e.target.value) || 1 })}
                                className="w-full px-3 py-2.5 bg-white border-2 border-transparent focus:border-violet-300 rounded-xl outline-none text-slate-700 font-medium text-sm"
                              >
                                {[...Array(groupItemsCount)].map((_, i) => i + 1).map(n => (
                                  <option key={n} value={n}>{n === 1 ? "1 (Única)" : `${n} opções`}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Pontuação desta opção</label>
                              <input type="number" min={0} value={grpMeta.score}
                                onChange={e => updateGroupScore(selectedField.variableName, parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 bg-white border-2 border-transparent focus:border-violet-300 rounded-xl outline-none text-slate-700 font-medium text-sm" />
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
                          <p className="text-[10px] text-slate-400">Dica: Selecione 2+ checkboxes na lista acima e clique em "Criar Grupo" para fazer uma pergunta de múltipla escolha.</p>
                        </div>
                      );
                    })()}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Tamanho da fonte (pt)</label>
                      <input type="number" min={6} max={36} value={selectedPos.fontSize ?? 11}
                        onChange={e => updatePos(selectedIdx!, { fontSize: parseInt(e.target.value) || 11 })}
                        className="w-full px-3 py-2.5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none text-slate-700 font-medium text-sm"
                      />
                    </div>
                    {/* Recipient selector */}
                    {recipients.length > 0 && (
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Responsável</label>
                        <select
                          value={selectedField.recipientOrder ?? ""}
                          onChange={e => {
                            updateField(selectedIdx!, { recipientOrder: e.target.value ? Number(e.target.value) : null });
                            setIsDirty(true);
                          }}
                          className="w-full px-3 py-2.5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none font-medium text-sm"
                          style={selectedField.recipientOrder != null ? {
                            color: getRecipientColor(recipients, selectedField.recipientOrder),
                            borderColor: getRecipientColor(recipients, selectedField.recipientOrder) + "40",
                          } : { color: "#64748b" }}
                        >
                          <option value="">— Selecione —</option>
                          {recipients.map((r) => (
                            <option key={r.order} value={r.order}>R{r.order} · {r.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex items-center justify-between py-3 border-t border-slate-100">
                      <span className="text-xs font-semibold text-slate-600">Obrigatório</span>
                      <button onClick={() => updateField(selectedIdx!, { required: !selectedField.required })}
                        className={cn("w-10 h-5 rounded-full transition-colors relative", selectedField.required ? "bg-primary" : "bg-slate-200")}>
                        <div className={cn("w-4 h-4 rounded-full bg-white shadow absolute top-0.5 transition-all", selectedField.required ? "left-5" : "left-0.5")} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {activeTab === "attachments" && (
            <div className="flex flex-col h-full overflow-y-auto">
              <div className="p-5 space-y-4">
                <p className="text-[10px] text-slate-500 font-medium bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  Adicione documentos que o cliente precisará enviar em anexo ao preencher o formulário (ex: RG, CNH, Comprovante).
                </p>

                <div className="space-y-3">
                  {attachments.map((att, i) => (
                    <div key={i} className="p-3 bg-white border border-slate-200 rounded-xl space-y-3 relative">
                      <button onClick={() => { setAttachments(p => p.filter((_, idx) => idx !== i)); setIsDirty(true); }} className="absolute top-2 right-2 p-1.5 hover:bg-rose-50 rounded-lg text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nome do Documento</label>
                        <input value={att.label} onChange={e => { setAttachments(p => p.map((a, idx) => idx === i ? { ...a, label: e.target.value } : a)); setIsDirty(true); }} placeholder="Ex: RG ou CNH" className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-primary/30 rounded-lg outline-none text-slate-700 font-medium text-xs pr-8" />
                      </div>
                      {recipients.length > 0 && (
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Responsável pelo envio</label>
                          <select
                            value={att.recipientOrder ?? ""}
                            onChange={e => { setAttachments(p => p.map((a, idx) => idx === i ? { ...a, recipientOrder: e.target.value ? Number(e.target.value) : null } : a)); setIsDirty(true); }}
                            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 focus:bg-white focus:border-primary/30 rounded-lg outline-none font-medium text-xs"
                            style={att.recipientOrder != null ? {
                              color: getRecipientColor(recipients, att.recipientOrder),
                              borderColor: getRecipientColor(recipients, att.recipientOrder) + "40",
                            } : { color: "#64748b" }}
                          >
                            <option value="">— Selecione —</option>
                            {recipients.map(r => (
                              <option key={r.order} value={r.order}>R{r.order} · {r.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-500">Obrigatório</span>
                        <button onClick={() => { setAttachments(p => p.map((a, idx) => idx === i ? { ...a, required: !a.required } : a)); setIsDirty(true); }}
                          className={cn("w-8 h-4 rounded-full transition-colors relative", att.required ? "bg-primary" : "bg-slate-200")}>
                          <div className={cn("w-3 h-3 rounded-full bg-white shadow absolute top-0.5 transition-all", att.required ? "left-[18px]" : "left-0.5")} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => { setAttachments(p => [...p, { label: "", required: true, order: p.length, recipientOrder: recipients.length > 0 ? 1 : null }]); setIsDirty(true); }} className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 font-bold hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors">
                  <Plus className="w-4 h-4" /> Adicionar Anexo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {groupModal && (
        <GroupConfigModal
          indices={groupModal.indices}
          fields={fields}
          question={groupModal.question}
          maxSelections={groupModal.maxSelections}
          scores={groupModal.scores}
          recipients={recipients}
          recipientOrder={groupModal.recipientOrder}
          onChangeQuestion={q => setGroupModal(g => g ? { ...g, question: q } : null)}
          onChangeMax={n => setGroupModal(g => g ? { ...g, maxSelections: n } : null)}
          onChangeScore={(pos, s) => setGroupModal(g => {
            if (!g) return null;
            const scores = [...g.scores]; scores[pos] = s; return { ...g, scores };
          })}
          onChangeRecipient={order => setGroupModal(g => g ? { ...g, recipientOrder: order } : null)}
          onConfirm={confirmCreateGroup}
          onCancel={() => { setGroupModal(null); setSelectedForGroup(new Set()); }}
        />
      )}
    </div>
  );
}

function PanelField({ label, value, onChange, placeholder, mono = false }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={cn("w-full px-3 py-2.5 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none text-slate-700 font-medium text-sm", mono && "font-mono")}
      />
    </div>
  );
}

function GroupConfigModal({
  indices, fields, question, maxSelections, scores, recipients, recipientOrder,
  onChangeQuestion, onChangeMax, onChangeScore, onChangeRecipient, onConfirm, onCancel,
}: {
  indices: number[];
  fields: { label: string; variableName: string }[];
  question: string;
  maxSelections: number;
  scores: number[];
  recipients: TemplateRecipient[];
  recipientOrder: number | null;
  onChangeQuestion: (q: string) => void;
  onChangeMax: (n: number) => void;
  onChangeScore: (pos: number, score: number) => void;
  onChangeRecipient: (order: number | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-violet-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
              <Link2 className="w-4 h-4 text-violet-600" />
            </div>
            <h2 className="text-sm font-bold text-violet-800">Criar Grupo de Checkboxes</h2>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-violet-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Pergunta do grupo</label>
            <input
              autoFocus
              type="text" value={question} onChange={e => onChangeQuestion(e.target.value)}
              placeholder="Ex: Existe registro das reclamações dos clientes finais?"
              className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-violet-300 rounded-xl outline-none text-slate-700 font-medium text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Máximo de seleções simultâneas</label>
            <select
              value={maxSelections}
              onChange={e => onChangeMax(parseInt(e.target.value) || 1)}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-violet-300 rounded-xl outline-none text-slate-700 font-medium text-sm"
            >
              {[...Array(indices.length)].map((_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n === 1 ? "1 (Única)" : `${n} opções`}</option>
              ))}
            </select>
          </div>
          {/* Responsável do grupo */}
          {recipients.length > 0 && (
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">
                Responsável <span className="text-rose-500">*</span>
              </label>
              <select
                value={recipientOrder ?? ""}
                onChange={e => onChangeRecipient(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-violet-300 rounded-xl outline-none font-medium text-sm"
                style={recipientOrder != null ? {
                  color: getRecipientColor(recipients, recipientOrder),
                  borderColor: getRecipientColor(recipients, recipientOrder) + "40",
                } : { color: "#64748b" }}
              >
                <option value="">— Nenhum —</option>
                {recipients.map(r => (
                  <option key={r.order} value={r.order}>R{r.order} · {r.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1 ml-1">
                Todos os campos do grupo terão o mesmo responsável.
              </p>
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 ml-1">Opções e pontuação</label>
            <div className="space-y-2">
              {indices.map((fieldIdx, pos) => {
                const f = fields[fieldIdx];
                return (
                  <div key={fieldIdx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="flex-1 text-xs font-semibold text-slate-700 truncate">{f?.label || `Campo ${pos + 1}`}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-slate-400 font-bold">Pts</span>
                      <input type="number" min={0} value={scores[pos] ?? 0} onChange={e => onChangeScore(pos, parseInt(e.target.value) || 0)}
                        className="w-14 px-2 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-xs text-center text-violet-700 font-bold outline-none focus:border-violet-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={!question.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 disabled:opacity-40 transition-all shadow-lg shadow-violet-200"
          >
            <Link2 className="w-4 h-4" /> Criar Grupo
          </button>
        </div>
      </div>
    </div>
  );
}
