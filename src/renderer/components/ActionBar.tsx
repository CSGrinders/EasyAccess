import React, { useState } from "react";
import {Button} from "@Components/ui/button";
import {CloudIcon, Download, Home, LayoutDashboard, Plus, SettingsIcon, Brain} from "lucide-react";
import {NavItem} from "@Components/ui/navItem";
import { CloudItem } from "./ui/cloudItem";
import { FaDropbox, FaGoogleDrive } from "react-icons/fa";
import { SiIcloud } from "react-icons/si";

interface ActionBarProps {
    action: string
    setAction: React.Dispatch<React.SetStateAction<string>>
    toggleShowSideWindow: () => void
    toggleShowAgentWindow: () => void
}

const ActionBar = ({action, setAction, toggleShowSideWindow, toggleShowAgentWindow}: ActionBarProps) => {

    return (
        <>
            <div
                className="w-20 select-none bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center py-6">
                <div className="flex flex-col items-center space-y-6">
                    <div className={`relative group`}>
                        <Button
                            disabled={action !== "dashboard"}
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-700"
                            onClick={() => toggleShowSideWindow()}
                        >
                            <Plus className="h-6 w-6 text-blue-600 dark:text-blue-400"/>
                        </Button>
                        <span
                            className="z-1 select-none absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                Add Storage
              </span>
                    </div>

                    <div className="w-full px-2 space-y-4">
                        {action === "dashboard" && (
                            <>
                                <NavItem icon={<LayoutDashboard className="h-5 w-5"/>} label="Dashboard" active/>
                                <NavItem icon={<Download className="h-5 w-5"/>} label="Downloads"
                                         onClick={() => setAction("downloads")}/>
                                <NavItem icon={<SettingsIcon className="h-5 w-5"/>} label="Settings"
                                         onClick={() => setAction("settings")}/>
                            </>

                        )}
                        {action === "downloads" && (
                            <>
                                <NavItem icon={<LayoutDashboard className="h-5 w-5"/>} label="Dashboard"
                                         onClick={() => setAction("dashboard")}/>
                                <NavItem icon={<Download className="h-5 w-5"/>} label="Downloads" active/>
                                <NavItem icon={<SettingsIcon className="h-5 w-5"/>} label="Settings"
                                         onClick={() => setAction("settings")}/>
                            </>
                        )}
                        {action === "settings" && (
                            <>
                                <NavItem icon={<LayoutDashboard className="h-5 w-5"/>} label="Dashboard"
                                         onClick={() => setAction("dashboard")}/>
                                <NavItem icon={<Download className="h-5 w-5"/>} label="Downloads"
                                         onClick={() => setAction("downloads")}/>
                                <NavItem icon={<SettingsIcon className="h-5 w-5"/>} label="Settings" active/>
                            </>
                        )}
                    </div>
                        <Button onClick={() => toggleShowAgentWindow()}
                            variant="outline"
                            disabled={action !== "dashboard"}
                            size="icon"
                            className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-700"
                            >
                            <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </Button>
                </div>
                <div className="mt-auto py-5">
                    <div
                        className="">
                        <h4 className="text-sm text-gray-600 dark:text-gray-300">v0.1</h4>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ActionBar;
