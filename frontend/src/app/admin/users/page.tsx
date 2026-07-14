"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Users, Shield, UserCircle, Loader2, X, Check, Building2, RotateCcw, ChevronLeft, ChevronRight, Mail, Clock, RefreshCw, Ban } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";

interface User {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  canViewBalance?: boolean;
  createdAt: string;
  deletedAt?: string | null;
  _count: { createdLinks: number };
  departments?: { department: { name: string } }[];
}

interface Department {
  id: string;
  name: string;
  safeUuid?: string | null;
  safeName?: string | null;
  deletedAt?: string | null;
  _count?: { users: number };
}

interface Safe {
  uuid: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
}

interface PendingInvite {
  id: string;
  email: string;
  inviteName?: string | null;
  inviteRole?: string | null;
  inviteDepts?: string | null;
  expiresAt: string;
  createdAt: string;
}

function cn(...c: unknown[]) { return (c.filter(Boolean) as string[]).join(" "); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("pt-BR"); }

function SimplePagination({ current, total, totalItems, onPage }: { current: number; total: number; totalItems: number; onPage: (p: number) => void }) {
  if (total <= 1 && totalItems === 0) return null;
  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto shrink-0">
      <div className="text-xs text-slate-400 font-medium">
        Mostrando <strong>{totalItems}</strong> {totalItems === 1 ? 'item' : 'itens'} no total
      </div>
      <div className="flex items-center gap-2">
        <button disabled={current === 1} onClick={() => onPage(Math.max(1, current - 1))} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-1">
          <span className="px-3 py-1.5 text-xs font-bold text-slate-600">Página {current} de {total}</span>
        </div>
        <button disabled={current === total || total === 0} onClick={() => onPage(Math.min(total, current + 1))} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-all disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

/* ─── Delete Confirm Modal ─── */
function DeleteModal({
  title,
  subtitle,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  subtitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [typed, setTyped] = useState("");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Esta ação é irreversível. Digite <strong>sim</strong> para confirmar.
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-rose-300"
          placeholder="sim"
        />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={typed.toLowerCase() !== "sim" || loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Reactivate Confirm Modal ─── */
function ReactivateModal({
  title,
  subtitle,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string;
  subtitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [typed, setTyped] = useState("");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <RotateCcw className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Esta ação restaurará o acesso. Digite <strong>sim</strong> para confirmar.
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          placeholder="sim"
        />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={typed.toLowerCase() !== "sim" || loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Reativar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Department Form Modal ─── */
function DepartmentModal({
  editDept,
  onClose,
}: {
  editDept?: Department | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(editDept?.name || "");
  const [safeUuid, setSafeUuid] = useState(editDept?.safeUuid || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const { showToast } = useToast();

  // Lista de cofres da D4Sign — normaliza os dois formatos de chave (com hífen na API real, underscore no dry-run)
  const { data: safes = [], isLoading: loadingSafes, isError: safesError } = useQuery<Safe[]>({
    queryKey: ["d4sign-safes"],
    queryFn: () =>
      api.get("/d4sign/safes").then((r) =>
        (Array.isArray(r.data) ? r.data : [])
          .map((s: any) => ({
            uuid: s["uuid-safe"] ?? s.uuid_safe ?? s.uuid ?? "",
            name: s["name-safe"] ?? s.name_safe ?? s.name ?? "",
          }))
          .filter((s: Safe) => s.uuid),
      ),
  });

  async function handleSubmit() {
    if (!name.trim()) { setError("Nome obrigatório"); return; }
    if (!safeUuid) { setError("Selecione um cofre D4Sign"); return; }
    setSaving(true);
    try {
      const safeName = safes.find((s) => s.uuid === safeUuid)?.name;
      const payload = { name, safeUuid, safeName };
      if (editDept) {
        await api.patch(`/departments/${editDept.id}`, payload);
      } else {
        await api.post("/departments", payload);
      }
      qc.invalidateQueries({ queryKey: ["departments"] });
      showToast(editDept ? "Departamento atualizado!" : "Departamento criado com sucesso!");
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao salvar departamento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">
            {editDept ? "Editar Departamento" : "Novo Departamento"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Nome do Departamento</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 font-medium text-sm"
              placeholder="Ex: Recursos Humanos"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Cofre D4Sign</label>
            <select
              value={safeUuid}
              onChange={(e) => setSafeUuid(e.target.value)}
              disabled={loadingSafes || safesError}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-xl outline-none transition-all text-slate-700 font-medium text-sm disabled:opacity-60"
            >
              <option value="">
                {loadingSafes ? "Carregando cofres…" : "Selecione um cofre"}
              </option>
              {safes.map((s) => (
                <option key={s.uuid} value={s.uuid}>{s.name}</option>
              ))}
              {/* Mantém o cofre salvo selecionável mesmo que não venha na lista atual */}
              {editDept?.safeUuid && !safes.some((s) => s.uuid === editDept.safeUuid) && (
                <option value={editDept.safeUuid}>{editDept.safeName || editDept.safeUuid}</option>
              )}
            </select>
            {safesError && (
              <p className="text-xs text-amber-600 px-1 mt-1.5">Não foi possível carregar os cofres da D4Sign. Verifique as credenciais.</p>
            )}
            <p className="text-[11px] text-slate-400 px-1 mt-1.5">Documentos deste departamento serão enviados para este cofre.</p>
          </div>
          {error && <p className="text-xs text-rose-600 px-1">{error}</p>}
        </div>
        <div className="flex gap-3 pt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── User Form Modal (edição apenas) ─── */
function UserModal({
  editUser,
  templates,
  onClose,
  onSaved,
}: {
  editUser: User;
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: editUser.name || "",
    email: editUser.email || "",
    password: "",
    role: editUser.role || "ADMIN",
  });
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [canViewBalance, setCanViewBalance] = useState(!!editUser.canViewBalance);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = useToast();

  const qc = useQueryClient();

  const { data: allDepartments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => api.get("/departments").then((r) => r.data),
  });

  // Carrega acesso a templates e departamentos ao abrir
  useState(() => {
    api.get(`/users/${editUser.id}/templates`).then((res) => {
      setSelectedTemplates(res.data.map((a: any) => a.templateId));
    }).finally(() => {
      setLoadingAccess(false);
    });

    api.get(`/users/${editUser.id}`).then((res) => {
      const depts = res.data.departments?.map((d: any) => d.departmentId) || [];
      setSelectedDepartments(depts);
    });
  });

  function toggleTemplate(id: string) {
    setSelectedTemplates((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  function toggleDepartment(id: string) {
    setSelectedDepartments((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    setError("");
    if (!form.email) { setError("E-mail obrigatório"); return; }

    setSaving(true);
    try {
      const payload: any = { ...form, departmentIds: selectedDepartments, canViewBalance };
      if (!form.password) delete payload.password;
      await api.patch(`/users/${editUser.id}`, payload);

      if (form.role === "OPERATOR") {
        await api.put(`/users/${editUser.id}/templates`, { templateIds: selectedTemplates });
      }

      qc.invalidateQueries({ queryKey: ["users"] });
      showToast("Usuário atualizado!");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao salvar usuário");
    } finally {
      setSaving(false);
    }
  }

  const isOperator = form.role === "OPERATOR";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-slate-800">Editar usuário</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="Nome completo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Perfil</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="ADMIN">Administrador</option>
                <option value="OPERATOR">Operador</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Departamentos Vinculados
            </label>
            <div className="grid grid-cols-2 gap-2">
              {allDepartments.map((dept: any) => {
                const checked = selectedDepartments.includes(dept.id);
                return (
                  <label
                    key={dept.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all",
                      checked ? "bg-primary/5 border-primary text-primary" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => toggleDepartment(dept.id)}
                    />
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center",
                      checked ? "bg-primary border-primary" : "border-slate-300"
                    )}>
                      {checked && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className="text-xs font-medium">{dept.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <span>
              <span className="block text-sm font-medium text-slate-700">Pode ver o saldo D4Sign</span>
              <span className="block text-xs text-slate-400">Exibe o saldo de créditos no painel de controle</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={canViewBalance}
              onClick={() => setCanViewBalance((v) => !v)}
              className={cn(
                "relative w-10 h-6 rounded-full transition-colors flex-shrink-0",
                canViewBalance ? "bg-primary" : "bg-slate-300"
              )}
            >
              <span className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                canViewBalance ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="usuario@empresa.com"
            />
          </div>

          {isOperator && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Modelos com acesso
              </label>
              {loadingAccess ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando...
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhum modelo disponível</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {templates.map((t) => {
                    const checked = selectedTemplates.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-100 last:border-0",
                          checked ? "bg-primary/5" : "hover:bg-slate-50"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded flex items-center justify-center border transition-colors flex-shrink-0",
                          checked ? "bg-primary border-primary" : "border-slate-300"
                        )}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleTemplate(t.id)}
                        />
                        <span className="text-sm text-slate-700">{t.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Invite Modal ─── */
function InviteModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ email: "", name: "", role: "ADMIN" });
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data: allDepartments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => api.get("/departments").then((r) => r.data),
  });

  function toggleDepartment(id: string) {
    setSelectedDepartments((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSubmit() {
    setError("");
    if (!form.email) { setError("E-mail obrigatório"); return; }
    setSaving(true);
    try {
      await api.post("/users/invite", {
        email: form.email,
        name: form.name || undefined,
        role: form.role,
        departmentIds: selectedDepartments,
      });
      setSent(true);
      qc.invalidateQueries({ queryKey: ["user-invites"] });
      showToast("Convite enviado com sucesso!");
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao enviar convite");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-slate-800">Convidar usuário</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-7 h-7 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-slate-800 mb-2">Convite enviado!</h3>
            <p className="text-sm text-slate-500 mb-1">
              Um e-mail foi enviado para <strong>{form.email}</strong>.
            </p>
            <p className="text-xs text-slate-400 mb-6">O link de convite é válido por 72 horas.</p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome (opcional)</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="ADMIN">Administrador</option>
                  <option value="OPERATOR">Operador</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
              <input
                type="email"
                autoFocus
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="usuario@empresa.com"
              />
            </div>

            {allDepartments.filter((d: any) => !d.deletedAt).length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Departamentos</label>
                <div className="grid grid-cols-2 gap-2">
                  {allDepartments.filter((d: any) => !d.deletedAt).map((dept: any) => {
                    const checked = selectedDepartments.includes(dept.id);
                    return (
                      <label
                        key={dept.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all",
                          checked ? "bg-primary/5 border-primary text-primary" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleDepartment(dept.id)} />
                        <div className={cn("w-3.5 h-3.5 rounded border flex items-center justify-center", checked ? "bg-primary border-primary" : "border-slate-300")}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-xs font-medium">{dept.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Enviar convite
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════ */
export default function UsersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"users" | "departments" | "trash">("users");
  const [pageUsers, setPageUsers] = useState(1);
  const [pageDepts, setPageDepts] = useState(1);
  const pageSize = 10;

  // Modals state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [reactivateUser, setReactivateUser] = useState<User | null>(null);

  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deleteDept, setDeleteDept] = useState<Department | null>(null);
  const [reactivateDept, setReactivateDept] = useState<Department | null>(null);

  const isSuper = user?.role === "SUPER_ADMIN";

  if (user && !isSuper) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400">
        <Shield className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-xl font-bold text-slate-600">Acesso Restrito</h2>
        <p className="text-sm">Esta página é exclusiva para Super Administradores.</p>
      </div>
    );
  }

  // Queries
  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
  });

  const { data: pendingInvites = [] } = useQuery<PendingInvite[]>({
    queryKey: ["user-invites"],
    queryFn: () => api.get("/users/invites").then((r) => r.data),
  });

  // Inclui deletados para a aba Lixeira; queryKey própria para não afetar os
  // dropdowns de atribuição (que usam ["departments"] e só veem ativos).
  const { data: departments = [], isLoading: loadingDepts } = useQuery<Department[]>({
    queryKey: ["departments", "all"],
    queryFn: () => api.get("/departments?includeDeleted=true").then((r) => r.data),
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates-all"],
    queryFn: () => api.get("/templates").then((r) => r.data),
  });

  // Mutations
  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteUser(null);
      showToast("Usuário movido para a lixeira.");
    },
    onError: () => showToast("Erro ao excluir usuário.", "error"),
  });

  const deleteDeptMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setDeleteDept(null);
      showToast("Departamento movido para a lixeira.");
    },
    onError: () => showToast("Erro ao excluir departamento.", "error"),
  });

  const reactivateUserMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setReactivateUser(null);
      showToast("Usuário reativado com sucesso!");
    },
    onError: () => showToast("Erro ao reativar usuário.", "error"),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/invites/${id}/resend`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-invites"] });
      showToast("Convite reenviado com sucesso!");
    },
    onError: () => showToast("Erro ao reenviar convite.", "error"),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/invites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-invites"] });
      showToast("Convite cancelado.");
    },
    onError: () => showToast("Erro ao cancelar convite.", "error"),
  });

  const reactivateDeptMutation = useMutation({
    mutationFn: (id: string) => api.post(`/departments/${id}/reactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setReactivateDept(null);
      showToast("Departamento reativado com sucesso!");
    },
    onError: () => showToast("Erro ao reativar departamento.", "error"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestão de Acesso</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie usuários e departamentos do portal</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "users" ? (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Mail className="w-4 h-4" />
              Convidar por e-mail
            </button>
          ) : activeTab === "departments" ? (
            <button
              onClick={() => setShowDeptModal(true)}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Novo departamento
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      {isSuper && (
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
          <button
            onClick={() => setActiveTab("users")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "users" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Users className="w-4 h-4" />
            Usuários
          </button>
          <button
            onClick={() => setActiveTab("departments")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "departments" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Building2 className="w-4 h-4" />
            Departamentos
          </button>
          <button
            onClick={() => setActiveTab("trash")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "trash" ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Trash2 className="w-4 h-4" />
            Lixeira
          </button>
        </div>
      )}

      {activeTab === "users" ? (
        <>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : users.filter(u => !u.deletedAt).length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum usuário cadastrado</p>
            </div>
          ) : (() => {
            const activeUsers = users.filter(u => !u.deletedAt);
            const totalPages = Math.max(1, Math.ceil(activeUsers.length / pageSize));
            const currentData = activeUsers.slice((pageUsers - 1) * pageSize, pageUsers * pageSize);
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[740px]">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 sticky top-0 bg-white z-10 shadow-sm">
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Usuário</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Perfil</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Departamentos</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Links criados</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cadastro</th>
                        <th className="px-6 py-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.map((u) => (
                        <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <UserCircle className="w-5 h-5 text-slate-400" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{u.name || "—"}</p>
                                <p className="text-xs text-slate-500">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {u.role === "SUPER_ADMIN" ? (
                                <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs text-center font-medium border border-amber-200">
                                  Superadmin
                                </span>
                              ) : u.role === "ADMIN" ? (
                                <span className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full text-xs font-medium border border-violet-200">
                                  Admin
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200">
                                  Operador
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {u.departments && u.departments.length > 0 ? (
                                <>
                                  {u.departments.slice(0, 2).map((d) => (
                                    <span key={d.department.name} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100 truncate max-w-[140px]" title={d.department.name}>
                                      {d.department.name}
                                    </span>
                                  ))}
                                  {u.departments.length > 2 && (
                                    <span className="bg-slate-50 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200 cursor-help" title={u.departments.slice(2).map(d => d.department.name).join(", ")}>
                                      +{u.departments.length - 2}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-400 italic text-xs">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{u._count.createdLinks}</td>
                          <td className="px-6 py-4 text-slate-500">{fmtDate(u.createdAt)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 justify-end">
                              {u.role !== "SUPER_ADMIN" && (
                                <>
                                  <button
                                    onClick={() => { setEditUser(u); setShowUserModal(true); }}
                                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                    title="Editar"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteUser(u)}
                                    className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}

                      {/* ── Convites Pendentes ── */}
                      {pendingInvites.length > 0 && (
                        <>
                          <tr>
                            <td colSpan={6} className="px-6 py-2 bg-amber-50 border-y border-amber-100">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">
                                  Convites pendentes ({pendingInvites.length})
                                </span>
                              </div>
                            </td>
                          </tr>
                          {pendingInvites.map((invite) => {
                            const deptIds: string[] = invite.inviteDepts ? JSON.parse(invite.inviteDepts) : [];
                            const inviteDeptNames = deptIds
                              .map((id) => departments.find((d) => d.id === id)?.name)
                              .filter(Boolean) as string[];
                            const expiresAt = new Date(invite.expiresAt);
                            const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 3600000));
                            return (
                              <tr key={invite.id} className="border-b border-amber-50 last:border-0 bg-amber-50/40 hover:bg-amber-50/70 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                                      <Mail className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-slate-700">{invite.inviteName || <span className="text-slate-400 italic text-xs">Nome não informado</span>}</p>
                                      <p className="text-xs text-slate-500">{invite.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {invite.inviteRole === "ADMIN" ? (
                                    <span className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full text-xs font-medium border border-violet-200">Admin</span>
                                  ) : (
                                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-200">Operador</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1">
                                    {inviteDeptNames.length > 0 ? inviteDeptNames.slice(0, 2).map((n) => (
                                      <span key={n} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">{n}</span>
                                    )) : <span className="text-slate-400 italic text-xs">—</span>}
                                    {inviteDeptNames.length > 2 && (
                                      <span className="bg-slate-50 text-slate-500 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">+{inviteDeptNames.length - 2}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                                    <Clock className="w-2.5 h-2.5" />
                                    Aguardando aceite
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-400">
                                  expira em {hoursLeft}h
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-1 justify-end">
                                    <button
                                      onClick={() => resendInviteMutation.mutate(invite.id)}
                                      disabled={resendInviteMutation.isPending}
                                      title="Reenviar convite"
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      Reenviar
                                    </button>
                                    <button
                                      onClick={() => cancelInviteMutation.mutate(invite.id)}
                                      disabled={cancelInviteMutation.isPending}
                                      title="Cancelar convite"
                                      className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"
                                    >
                                      <Ban className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
                <SimplePagination current={pageUsers} total={totalPages} totalItems={activeUsers.length} onPage={setPageUsers} />
              </div>
            );
          })()}
        </>
      ) : activeTab === "departments" ? (
        <>
          {loadingDepts ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : departments.filter(d => !d.deletedAt).length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum departamento cadastrado</p>
            </div>
          ) : (() => {
            const activeDepts = departments.filter(d => !d.deletedAt);
            const totalPages = Math.max(1, Math.ceil(activeDepts.length / pageSize));
            const currentData = activeDepts.slice((pageDepts - 1) * pageSize, pageDepts * pageSize);
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[740px]">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 sticky top-0 bg-white z-10 shadow-sm">
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome</th>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cofre D4Sign</th>
                        <th className="px-6 py-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.map((d) => (
                        <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-800">{d.name}</td>
                          <td className="px-6 py-4">
                            {d.safeName || d.safeUuid ? (
                              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg text-xs font-semibold border border-blue-100">
                                <Building2 className="w-3 h-3" />
                                {d.safeName || d.safeUuid}
                              </span>
                            ) : (
                              <span className="text-xs text-amber-600 font-medium">Sem cofre vinculado</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => { setEditDept(d); setShowDeptModal(true); }}
                                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                title="Editar"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteDept(d)}
                                className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <SimplePagination current={pageDepts} total={totalPages} totalItems={activeDepts.length} onPage={setPageDepts} />
              </div>
            );
          })()}
        </>
      ) : (
        <div className="space-y-6">
          {/* Lixeira: Usuários Deletados */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" /> Usuários na Lixeira
              </h3>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {users.filter(u => !!u.deletedAt).map(u => (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-800">{u.name || "—"}</p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setReactivateUser(u)}
                        className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold text-xs transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reativar
                      </button>
                    </td>
                  </tr>
                ))}
                {users.filter(u => !!u.deletedAt).length === 0 && (
                  <tr><td className="px-6 py-10 text-center text-slate-400 text-xs italic">Nenhum usuário deletado</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Lixeira: Departamentos Deletados */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" /> Departamentos na Lixeira
              </h3>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {departments.filter(d => !!d.deletedAt).map(d => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-800">{d.name}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setReactivateDept(d)}
                        className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold text-xs transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reativar
                      </button>
                    </td>
                  </tr>
                ))}
                {departments.filter(d => !!d.deletedAt).length === 0 && (
                  <tr><td className="px-6 py-10 text-center text-slate-400 text-xs italic">Nenhum departamento deletado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} />
      )}

      {/* User Modals */}
      {showUserModal && editUser && (
        <UserModal
          editUser={editUser}
          templates={templates}
          onClose={() => { setShowUserModal(false); setEditUser(null); }}
          onSaved={() => { }}
        />
      )}
      {deleteUser && (
        <DeleteModal
          title="Excluir usuário"
          subtitle={deleteUser.email}
          loading={deleteUserMutation.isPending}
          onConfirm={() => deleteUserMutation.mutate(deleteUser.id)}
          onCancel={() => setDeleteUser(null)}
        />
      )}
      {reactivateUser && (
        <ReactivateModal
          title="Reativar usuário"
          subtitle={reactivateUser.email}
          loading={reactivateUserMutation.isPending}
          onConfirm={() => reactivateUserMutation.mutate(reactivateUser.id)}
          onCancel={() => setReactivateUser(null)}
        />
      )}

      {/* Department Modals */}
      {showDeptModal && (
        <DepartmentModal
          editDept={editDept}
          onClose={() => { setShowDeptModal(false); setEditDept(null); }}
        />
      )}
      {deleteDept && (
        <DeleteModal
          title="Excluir departamento"
          subtitle={deleteDept.name}
          loading={deleteDeptMutation.isPending}
          onConfirm={() => deleteDeptMutation.mutate(deleteDept.id)}
          onCancel={() => setDeleteDept(null)}
        />
      )}
      {reactivateDept && (
        <ReactivateModal
          title="Reativar departamento"
          subtitle={reactivateDept.name}
          loading={reactivateDeptMutation.isPending}
          onConfirm={() => reactivateDeptMutation.mutate(reactivateDept.id)}
          onCancel={() => setReactivateDept(null)}
        />
      )}
    </div>
  );
}
