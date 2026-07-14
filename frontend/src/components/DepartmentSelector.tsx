import React, { useState, useRef, useEffect } from "react";
import { Filter, ChevronDown, Check, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface Department {
  id: string;
  name: string;
}

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}

export function DepartmentSelector({ selectedIds, onChange, compact = false }: Props) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { data: allDepartments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => api.get("/departments").then((r) => r.data),
  });

  const availableDepartments = user?.role === "SUPER_ADMIN" 
    ? allDepartments 
    : allDepartments.filter(d => user?.departmentIds?.includes(d.id));

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (availableDepartments.length === 0 && user?.role !== "SUPER_ADMIN") return null;

  const selectedNames = availableDepartments
    .filter(d => selectedIds.includes(d.id))
    .map(d => d.name);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-xl border-2 transition-all duration-200 ${
          compact ? "px-3 py-1.5" : "px-4 py-2.5"
        } ${
          isOpen || selectedIds.length > 0
            ? "bg-white border-primary/20 text-primary shadow-sm"
            : "bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100"
        }`}
      >
        <Filter className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        <span className={`${compact ? "text-xs" : "text-sm"} font-semibold whitespace-nowrap`}>
          {selectedIds.length === 0
            ? "Departamentos"
            : selectedIds.length === 1
            ? selectedNames[0]
            : `${selectedIds.length} Departamentos`}
        </span>
        <ChevronDown className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 5, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute left-0 top-full z-[100] w-64 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
          >
            <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">
                Selecionar Áreas
              </span>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => onChange([])}
                  className="text-[10px] font-bold text-rose-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {availableDepartments.map((dept) => {
                const isSelected = selectedIds.includes(dept.id);
                return (
                  <button
                    key={dept.id}
                    onClick={() => toggle(dept.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                      isSelected
                        ? "bg-primary/5 text-primary"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                      isSelected 
                        ? "bg-primary border-primary shadow-sm shadow-primary/20" 
                        : "bg-white border-slate-200"
                    }`}>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />}
                    </div>
                    <span className="text-sm font-medium">{dept.name}</span>
                  </button>
                );
              })}
            </div>
            
            {availableDepartments.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs">Nenhum departamento encontrado.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
