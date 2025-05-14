import React from "react";

interface CloudItem {
    icon: React.ReactNode
    label: string
    onClick?: () => void; // Add onClick prop
}

export function CloudItem({ icon, label, onClick }: CloudItem) {
    return (
        <div className="relative group" onClick={onClick}>
            <div
                className=
          "flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                
            >
                {icon}
                <span className="text-xs mt-1 font-medium">{label}</span>
            </div>
        </div>
    )
}