import React from "react";

interface NavItemProps {
    icon: React.ReactNode
    label: string
    active?: boolean
    onClick?: () => void; // Add onClick prop
}

export function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
    return (
        <div className="relative group" onClick={onClick}>
            <div
                className={`
          flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200
          ${
                    active
                        ? "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }
        `}
            >
                {icon}
                <span className="text-xs mt-1 font-medium">{label}</span>
            </div>

            {active && (
                <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r-full" />
            )}
        </div>
    )
}