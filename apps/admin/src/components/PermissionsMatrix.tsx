"use client";

import { type Permission } from "@/lib/api";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"];
const MODULE_LABELS: Record<string, string> = {
  finance: "Finance",
  inventory: "Inventory",
  procurement: "Procurement",
  sales: "Sales",
  manufacturing: "Manufacturing",
  crm: "CRM",
  hr: "Human Resources",
  eam: "Asset Management",
  fsm: "Field Service",
  quality: "Quality",
  ehs: "EHS",
  projects: "Projects",
};

interface Props {
  permissions: Permission[];
  selected: string[];
  onChange: (codes: string[]) => void;
  readonly?: boolean;
}

export function PermissionsMatrix({ permissions, selected, onChange, readonly }: Props) {
  const modules = [...new Set(permissions.map((p) => p.module))].sort();

  const isSelected = (code: string) => selected.includes(code);

  const toggle = (code: string) => {
    if (readonly) return;
    onChange(isSelected(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  const toggleModule = (module: string) => {
    if (readonly) return;
    const moduleCodes = permissions.filter((p) => p.module === module).map((p) => p.code);
    const allSelected = moduleCodes.every((c) => selected.includes(c));
    if (allSelected) {
      onChange(selected.filter((c) => !moduleCodes.includes(c)));
    } else {
      const toAdd = moduleCodes.filter((c) => !selected.includes(c));
      onChange([...selected, ...toAdd]);
    }
  };

  const toggleAction = (action: string) => {
    if (readonly) return;
    const actionCodes = permissions.filter((p) => p.action === action).map((p) => p.code);
    const allSelected = actionCodes.every((c) => selected.includes(c));
    if (allSelected) {
      onChange(selected.filter((c) => !actionCodes.includes(c)));
    } else {
      const toAdd = actionCodes.filter((c) => !selected.includes(c));
      onChange([...selected, ...toAdd]);
    }
  };

  const isModuleAllSelected = (module: string) => {
    const codes = permissions.filter((p) => p.module === module).map((p) => p.code);
    return codes.length > 0 && codes.every((c) => selected.includes(c));
  };

  const isActionAllSelected = (action: string) => {
    const codes = permissions.filter((p) => p.action === action).map((p) => p.code);
    return codes.length > 0 && codes.every((c) => selected.includes(c));
  };

  const getPermCode = (module: string, action: string) =>
    permissions.find((p) => p.module === module && p.action === action)?.code;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="text-left px-4 py-3 bg-slate-50 border border-slate-200 rounded-tl-lg font-medium text-slate-600 w-44">Module</th>
            {ACTIONS.map((action, i) => (
              <th key={action} className={cn(
                "px-3 py-3 bg-slate-50 border-t border-b border-r border-slate-200 font-medium text-slate-600 text-center",
                i === ACTIONS.length - 1 && "rounded-tr-lg"
              )}>
                <button
                  type="button"
                  onClick={() => toggleAction(action)}
                  className={cn(
                    "flex flex-col items-center gap-1 mx-auto transition-colors",
                    !readonly && "hover:text-brand-700"
                  )}
                  disabled={readonly}
                >
                  <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center",
                    isActionAllSelected(action) ? "bg-brand-600 border-brand-600" : "border-slate-300"
                  )}>
                    {isActionAllSelected(action) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="capitalize text-xs">{action}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((module, mi) => (
            <tr key={module} className="group">
              <td className={cn(
                "px-4 py-2.5 border-b border-l border-r border-slate-200 bg-white",
                mi === modules.length - 1 && "rounded-bl-lg"
              )}>
                <button
                  type="button"
                  onClick={() => toggleModule(module)}
                  className={cn(
                    "flex items-center gap-2 w-full text-left transition-colors",
                    !readonly && "hover:text-brand-700"
                  )}
                  disabled={readonly}
                >
                  <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                    isModuleAllSelected(module) ? "bg-brand-600 border-brand-600" : "border-slate-300"
                  )}>
                    {isModuleAllSelected(module) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="text-slate-800 font-medium text-xs">
                    {MODULE_LABELS[module] ?? module}
                  </span>
                </button>
              </td>
              {ACTIONS.map((action, ai) => {
                const code = getPermCode(module, action);
                const active = code ? isSelected(code) : false;
                return (
                  <td
                    key={action}
                    className={cn(
                      "border-b border-r border-slate-200 text-center p-0",
                      mi === modules.length - 1 && ai === ACTIONS.length - 1 && "rounded-br-lg",
                      active ? "bg-brand-50" : "bg-white",
                      !readonly && code && "cursor-pointer hover:bg-brand-50/50",
                    )}
                    onClick={() => code && toggle(code)}
                  >
                    {code ? (
                      <div className="flex items-center justify-center h-10">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          active ? "bg-brand-600 border-brand-600" : "border-slate-200 group-hover:border-slate-300"
                        )}>
                          {active && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-10">
                        <span className="text-slate-200 text-xs">—</span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 mt-2">
        {selected.length} of {permissions.length} permissions selected
      </p>
    </div>
  );
}
