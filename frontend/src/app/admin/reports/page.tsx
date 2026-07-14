"use client";

import {
  BarChart3, Download, FileEdit, CheckCircle, Loader2, FileText,
  Search, Settings2, X, Mail, Clock, AlertCircle,
  ChevronUp, ChevronDown, ChevronsUpDown, MousePointer2,
  GripVertical, FileSpreadsheet, Printer,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { DepartmentSelector } from "@/components/DepartmentSelector";

/* ─── Status maps ─── */
const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  docx_generated: "Gerando DOCX",
  document_created: "Enviado",
  signer_created: "Configurando",
  sent_to_sign: "Aguardando Assinatura",
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

/* ─── Types ─── */
type ColKey =
  | "date" | "department" | "template" | "client" | "email" | "status"
  | "batch" | "createdBy" | "expiresAt" | "accessCount" | "emailSent"
  | "lastError" | "token";

type ColDef = { key: ColKey; label: string; visible: boolean; sortable: boolean };

type ReportItem = {
  id: string;
  date: string;
  client: string;
  clientEmail: string | null;
  template: string;
  department: string | null;
  status: string;
  batch: string | null;
  createdBy: string | null;
  expiresAt: string | null;
  accessCount: number;
  emailSent: string | null;
  lastError: string | null;
  token: string | null;
  documentUUID: string | null;
};

/* ─── Column definitions ─── */
const INITIAL_COLS: ColDef[] = [
  { key: "date",        label: "Data",           visible: true,  sortable: true  },
  { key: "department",  label: "Departamento",   visible: true,  sortable: true  },
  { key: "template",    label: "Modelo",         visible: true,  sortable: true  },
  { key: "client",      label: "Cliente",        visible: true,  sortable: true  },
  { key: "email",       label: "E-mail",         visible: true,  sortable: true  },
  { key: "status",      label: "Status",         visible: true,  sortable: true  },
  { key: "batch",       label: "Lote",           visible: false, sortable: true  },
  { key: "createdBy",   label: "Criado por",     visible: false, sortable: true  },
  { key: "expiresAt",   label: "Expira em",      visible: false, sortable: true  },
  { key: "accessCount", label: "Acessos",        visible: false, sortable: true  },
  { key: "emailSent",   label: "E-mail enviado", visible: false, sortable: true  },
  { key: "lastError",   label: "Erro",           visible: false, sortable: false },
  { key: "token",       label: "Token",          visible: false, sortable: false },
];

/* ─── Helpers ─── */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function getCellText(key: ColKey, item: ReportItem): string {
  switch (key) {
    case "date":        return fmtDate(item.date);
    case "department":  return item.department || "—";
    case "template":    return item.template;
    case "client":      return item.client;
    case "email":       return item.clientEmail || "—";
    case "status":      return STATUS_LABELS[item.status] || item.status;
    case "batch":       return item.batch || "—";
    case "createdBy":   return item.createdBy || "—";
    case "expiresAt":   return fmtDate(item.expiresAt);
    case "accessCount": return String(item.accessCount);
    case "emailSent":   return fmtDate(item.emailSent);
    case "lastError":   return item.lastError || "—";
    case "token":       return item.token || "—";
  }
}

function getSortValue(key: ColKey, item: ReportItem): string | number {
  if (key === "accessCount") return item.accessCount;
  if (key === "date" || key === "expiresAt" || key === "emailSent")
    return item[key] ? new Date(item[key] as string).getTime() : 0;
  return getCellText(key, item).toLowerCase();
}

function renderCell(key: ColKey, item: ReportItem) {
  switch (key) {
    case "date":
      return <span className="text-sm text-slate-600 whitespace-nowrap">{fmtDate(item.date)}</span>;
    case "department":
      return item.department
        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">{item.department}</span>
        : <span className="text-slate-300 text-xs">—</span>;
    case "template":
      return <span className="text-sm text-slate-700 font-medium whitespace-nowrap">{item.template}</span>;
    case "client":
      return <span className="text-sm font-semibold text-slate-900">{item.client}</span>;
    case "email":
      return <span className="text-xs text-slate-500">{item.clientEmail || <span className="text-slate-300">—</span>}</span>;
    case "status":
      return (
        <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight whitespace-nowrap",
          STATUS_COLORS[item.status] || "bg-slate-100 text-slate-500")}>
          {STATUS_LABELS[item.status] || item.status}
        </span>
      );
    case "batch":
      return item.batch
        ? <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-[10px] font-bold whitespace-nowrap">{item.batch}</span>
        : <span className="text-slate-300 text-xs">—</span>;
    case "createdBy":
      return <span className="text-xs text-slate-600">{item.createdBy || <span className="text-slate-300">—</span>}</span>;
    case "expiresAt": {
      if (!item.expiresAt) return <span className="text-slate-300 text-xs">—</span>;
      const expired = new Date(item.expiresAt) < new Date();
      return <span className={cn("text-xs whitespace-nowrap", expired ? "text-rose-500 font-semibold" : "text-slate-600")}>{fmtDate(item.expiresAt)}</span>;
    }
    case "accessCount":
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold",
          item.accessCount > 0 ? "bg-indigo-50 text-indigo-600" : "bg-slate-50 text-slate-400")}>
          <MousePointer2 className="w-3 h-3" />{item.accessCount}
        </span>
      );
    case "emailSent":
      return item.emailSent
        ? <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium whitespace-nowrap"><Mail className="w-3 h-3" />{fmtDate(item.emailSent)}</span>
        : <span className="text-xs text-slate-300">Não enviado</span>;
    case "lastError":
      return <span className={cn("text-xs", item.lastError ? "text-rose-500 font-medium" : "text-slate-300")}>{item.lastError || "—"}</span>;
    case "token":
      return <span className="text-[10px] font-mono text-slate-400 block max-w-[100px] truncate" title={item.token || ""}>{item.token || "—"}</span>;
  }
}

/* ════════════════════════════════════════════ */

export default function ReportsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [isStatusPanelOpen, setIsStatusPanelOpen] = useState(false);
  const [statusPanelPos, setStatusPanelPos] = useState({ top: 0, right: 0 });
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const statusPanelRef = useRef<HTMLDivElement>(null);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [columns, setColumns] = useState<ColDef[]>(INITIAL_COLS);
  const [sortConfig, setSortConfig] = useState<{ key: ColKey; dir: "asc" | "desc" } | null>(null);
  const [isColPanelOpen, setIsColPanelOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [colPanelPos, setColPanelPos] = useState({ top: 0, right: 0 });
  const [exportPanelPos, setExportPanelPos] = useState({ top: 0, right: 0 });
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragIdx = useRef<number | null>(null);
  const colBtnRef = useRef<HTMLButtonElement>(null);
  const colPanelRef = useRef<HTMLDivElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const exportPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!colBtnRef.current?.contains(t) && !colPanelRef.current?.contains(t))
        setIsColPanelOpen(false);
      if (!exportBtnRef.current?.contains(t) && !exportPanelRef.current?.contains(t))
        setIsExportOpen(false);
      if (!statusBtnRef.current?.contains(t) && !statusPanelRef.current?.contains(t))
        setIsStatusPanelOpen(false);
    }
    function handleScroll() {
      setIsColPanelOpen(false);
      setIsExportOpen(false);
      setIsStatusPanelOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  /* ─── Queries ─── */
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ["reports-stats", selectedDepts],
    queryFn: async () => {
      const params = new URLSearchParams();
      selectedDepts.forEach(id => params.append("departmentIds", id));
      return (await api.get(`/reports/stats?${params.toString()}`)).data;
    },
  });

  const { data: items = [], isLoading: isItemsLoading } = useQuery<ReportItem[]>({
    queryKey: ["reports-items", selectedDepts],
    queryFn: async () => {
      const params = new URLSearchParams();
      selectedDepts.forEach(id => params.append("departmentIds", id));
      return (await api.get(`/reports/items?${params.toString()}`)).data;
    },
  });

  /* ─── Derived ─── */
  const funnelData = [
    { label: "Links Gerados",           value: stats?.funnel?.generated ?? 0, icon: FileText,    color: "bg-blue-500"    },
    { label: "Formulários Preenchidos", value: stats?.funnel?.filled    ?? 0, icon: FileEdit,    color: "bg-amber-500"   },
    { label: "Documentos Assinados",    value: stats?.funnel?.signed    ?? 0, icon: CheckCircle, color: "bg-emerald-500" },
  ];

  const visibleCols = columns.filter(c => c.visible);

  const processedItems = useMemo(() => {
    let result = [...items];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(item =>
        [item.client, item.template, item.department, item.clientEmail, item.batch, item.createdBy]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    if (statusFilter.length > 0) result = result.filter(i => statusFilter.includes(i.status));
    if (sortConfig) {
      result.sort((a, b) => {
        const av = getSortValue(sortConfig.key, a);
        const bv = getSortValue(sortConfig.key, b);
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
        return sortConfig.dir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [items, searchTerm, statusFilter, sortConfig]);

  /* ─── Sort ─── */
  function toggleSort(key: ColKey) {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  /* ─── Drag reorder ─── */
  function handleDragStart(visIdx: number) { dragIdx.current = visIdx; }
  function handleDragOver(e: React.DragEvent, visIdx: number) {
    e.preventDefault();
    setDragOverIdx(visIdx);
  }
  function handleDragEnd() { setDragOverIdx(null); dragIdx.current = null; }
  function handleDrop(dstVisIdx: number) {
    const src = dragIdx.current;
    if (src === null || src === dstVisIdx) { handleDragEnd(); return; }
    const srcKey = visibleCols[src].key;
    const dstKey = visibleCols[dstVisIdx].key;
    const srcFull = columns.findIndex(c => c.key === srcKey);
    const dstFull = columns.findIndex(c => c.key === dstKey);
    const next = [...columns];
    const [moved] = next.splice(srcFull, 1);
    next.splice(dstFull, 0, moved);
    setColumns(next);
    handleDragEnd();
  }

  /* ─── Column panel ─── */
  function toggleColVisible(key: ColKey) {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  }

  /* ─── Status filter ─── */
  function toggleStatus(val: string) {
    setStatusFilter(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]);
  }

  /* ─── Exports ─── */
  function exportCSV() {
    if (!processedItems.length) return;
    const headers = visibleCols.map(c => `"${c.label}"`).join(",");
    const rows = processedItems.map(item =>
      visibleCols.map(c => `"${getCellText(c.key, item).replace(/"/g, '""')}"`).join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `relatorio_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    setIsExportOpen(false);
  }

  function exportXLSX() {
    if (!processedItems.length) return;
    const data = [
      visibleCols.map(c => c.label),
      ...processedItems.map(item => visibleCols.map(c => getCellText(c.key, item))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = visibleCols.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    XLSX.writeFile(wb, `relatorio_${new Date().toISOString().split("T")[0]}.xlsx`);
    setIsExportOpen(false);
  }

  function exportPDF() {
    if (!processedItems.length) return;
    const ths = visibleCols.map(c => `<th>${c.label}</th>`).join("");
    const trs = processedItems.map(item =>
      `<tr>${visibleCols.map(c => `<td>${getCellText(c.key, item)}</td>`).join("")}</tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:10px;margin:24px;color:#1e293b}
        h2{font-size:15px;font-weight:700;margin-bottom:2px}
        p{font-size:9px;color:#94a3b8;margin-bottom:14px}
        table{width:100%;border-collapse:collapse}
        th{background:#f8fafc;border:1px solid #e2e8f0;padding:6px 8px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700}
        td{border:1px solid #e2e8f0;padding:5px 8px;vertical-align:middle}
        tr:nth-child(even) td{background:#f8fafc}
      </style></head><body>
      <h2>Análise Detalhada</h2>
      <p>Exportado em ${new Date().toLocaleString("pt-BR")} · ${processedItems.length} registros</p>
      <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
      </body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
    setIsExportOpen(false);
  }

  /* ─── Loading ─── */
  if (isStatsLoading || isItemsLoading) {
    return (
      <div className="flex items-center justify-center p-20 text-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  /* ─── Render ─── */
  return (
    <div className="space-y-6 pb-12">

      {/* Header */}
      <header>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-primary" />
          Relatórios e Performance
        </h1>
        <p className="text-slate-500 mt-1">Análise detalhada de conversão e uso do sistema.</p>
        <div className="mt-4">
          <DepartmentSelector selectedIds={selectedDepts} onChange={setSelectedDepts} />
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {funnelData.map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-4">
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0", item.color)}>
              <item.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{item.label}</p>
              <p className="text-3xl font-bold text-slate-900 mt-0.5">{item.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Usage by Template */}
      {stats?.byTemplate?.length > 0 && (() => {
        const sorted: any[] = stats.byTemplate.slice().sort((a: any, b: any) => b.count - a.count);
        const displayed = showAllTemplates ? sorted : sorted.slice(0, 5);
        const remaining = sorted.length - 5;
        const maxCount = sorted[0]?.count || 1;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 px-6 pt-5 pb-4">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Uso por Modelo</p>
              {sorted.length > 5 && (
                <button onClick={() => setShowAllTemplates(v => !v)} className="text-xs font-semibold text-primary hover:text-primary/70 transition-colors">
                  {showAllTemplates ? "Ver menos" : `+${remaining} modelo${remaining !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
            <div className="flex items-end gap-3 h-36">
              {displayed.map((item: any, i: number) => (
                <div key={`${item.name}-${item.department}`} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-xs font-bold text-slate-600">{item.count}</span>
                  <div className="w-full flex items-end" style={{ height: "88px" }}>
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(item.count / maxCount) * 100}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                      className="w-full rounded-t-lg bg-gradient-to-t from-primary to-primary/40" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2">
              {displayed.map((item: any) => (
                <div key={`label-${item.name}-${item.department}`} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-slate-600 truncate w-full text-center" title={item.name}>{item.name}</span>
                  {item.department && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary truncate max-w-full">{item.department}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Main Analysis Table */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">

        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Análise Detalhada</h2>
            <p className="text-sm text-slate-400">{processedItems.length} de {items.length} registros</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-44" />
            </div>

            {/* Status filter */}
            <div>
              <button
                ref={statusBtnRef}
                onClick={() => {
                  if (!isStatusPanelOpen && statusBtnRef.current) {
                    const r = statusBtnRef.current.getBoundingClientRect();
                    setStatusPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                  }
                  setIsStatusPanelOpen(v => !v);
                }}
                className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all whitespace-nowrap",
                  statusFilter.length > 0
                    ? "bg-primary/10 text-primary border-primary/30 font-semibold"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                )}>
                {statusFilter.length === 0 ? "Todos os Status" : `${statusFilter.length} status`}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isStatusPanelOpen && "rotate-180")} />
              </button>
              <AnimatePresence>
                {isStatusPanelOpen && (
                  <>
                    <div className="fixed inset-0 z-[199]" onClick={() => setIsStatusPanelOpen(false)} />
                    <motion.div
                    ref={statusPanelRef}
                    initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    style={{ top: statusPanelPos.top, right: statusPanelPos.right }}
                    className="fixed w-52 bg-white border border-slate-200 shadow-2xl rounded-2xl z-[200] p-2">
                    <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-slate-100 px-2">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Status</span>
                      {statusFilter.length > 0 && (
                        <button onClick={() => setStatusFilter([])} className="text-[10px] font-bold text-slate-400 hover:text-primary transition-colors">
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {Object.entries(STATUS_LABELS).map(([val, label]) => (
                        <label key={val} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                          <input type="checkbox" checked={statusFilter.includes(val)} onChange={() => toggleStatus(val)}
                            className="w-3.5 h-3.5 rounded text-primary focus:ring-primary" />
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", STATUS_COLORS[val] || "bg-slate-100 text-slate-500")}>
                            {label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Column panel */}
            <div>
              <button
                ref={colBtnRef}
                onClick={() => {
                  if (!isColPanelOpen && colBtnRef.current) {
                    const r = colBtnRef.current.getBoundingClientRect();
                    setColPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                  }
                  setIsColPanelOpen(v => !v);
                }}
                title="Configurar colunas"
                className={cn("p-2 rounded-xl border transition-all",
                  isColPanelOpen ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
                <Settings2 className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {isColPanelOpen && (
                  <motion.div
                    ref={colPanelRef}
                    initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    style={{ top: colPanelPos.top, right: colPanelPos.right }}
                    className="fixed w-60 bg-white border border-slate-200 shadow-2xl rounded-2xl z-[200] p-3">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Colunas</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setColumns(INITIAL_COLS)} className="text-[10px] font-bold text-slate-400 hover:text-primary transition-colors">
                          Resetar
                        </button>
                        <button onClick={() => setIsColPanelOpen(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-2 px-1">Arraste os headers da tabela para reordenar.</p>
                    <div className="space-y-0.5 max-h-72 overflow-y-auto">
                      {columns.map(col => (
                        <label key={col.key} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                          <input type="checkbox" checked={col.visible} onChange={() => toggleColVisible(col.key)}
                            className="w-3.5 h-3.5 rounded text-primary focus:ring-primary" />
                          <span className="text-xs text-slate-700">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Export dropdown */}
            <div>
              <button
                ref={exportBtnRef}
                onClick={() => {
                  if (!isExportOpen && exportBtnRef.current) {
                    const r = exportBtnRef.current.getBoundingClientRect();
                    setExportPanelPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                  }
                  setIsExportOpen(v => !v);
                }}
                className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all",
                  isExportOpen ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")}>
                <Download className="w-4 h-4" />
                Exportar
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExportOpen && "rotate-180")} />
              </button>
              <AnimatePresence>
                {isExportOpen && (
                  <>
                    <div className="fixed inset-0 z-[199]" onClick={() => setIsExportOpen(false)} />
                    <motion.div
                      ref={exportPanelRef}
                      initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      style={{ top: exportPanelPos.top, right: exportPanelPos.right }}
                      className="fixed w-44 bg-white border border-slate-200 shadow-2xl rounded-2xl z-[200] p-1.5">
                      <button onClick={exportCSV} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">CSV</p>
                          <p className="text-[10px] text-slate-400">Dados brutos</p>
                        </div>
                      </button>
                      <button onClick={exportXLSX} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">Excel (XLSX)</p>
                          <p className="text-[10px] text-slate-400">Planilha formatada</p>
                        </div>
                      </button>
                      <button onClick={exportPDF} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left">
                        <Printer className="w-4 h-4 text-rose-400" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">PDF</p>
                          <p className="text-[10px] text-slate-400">Via impressão</p>
                        </div>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {visibleCols.map((col, visIdx) => {
                  const isOver = dragOverIdx === visIdx;
                  const isSorted = sortConfig?.key === col.key;
                  return (
                    <th key={col.key} draggable
                      onDragStart={() => handleDragStart(visIdx)}
                      onDragOver={e => handleDragOver(e, visIdx)}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={() => handleDrop(visIdx)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none transition-colors",
                        "cursor-grab active:cursor-grabbing",
                        isOver && "bg-primary/10 text-primary border-l-2 border-primary"
                      )}
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <GripVertical className="w-3 h-3 opacity-25 shrink-0" />
                        {col.sortable ? (
                          <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
                            {col.label}
                            {isSorted
                              ? sortConfig!.dir === "asc"
                                ? <ChevronUp className="w-3 h-3" />
                                : <ChevronDown className="w-3 h-3" />
                              : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
                          </button>
                        ) : col.label}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!processedItems.length ? (
                <tr>
                  <td colSpan={visibleCols.length + 1} className="px-8 py-20 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-10 h-10 opacity-20" />
                      <p className="text-sm">Nenhum registro encontrado.</p>
                    </div>
                  </td>
                </tr>
              ) : processedItems.map((item, i) => (
                <motion.tr key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.008, 0.15) }}
                  className="hover:bg-slate-50/60 transition-colors">
                  {visibleCols.map(col => (
                    <td key={col.key} className="px-4 py-3">{renderCell(col.key, item)}</td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>{processedItems.length} de {items.length} registros</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Tempo real</span>
            <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Sandbox</span>
          </div>
        </div>
      </section>
    </div>
  );
}
