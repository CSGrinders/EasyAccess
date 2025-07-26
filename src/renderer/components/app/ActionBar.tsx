/**
 * ActionBar component 
 *
 * Vertical sidebar for primary navigation and actions
 * Provides access to dashboard, settings, and AI agent features
 */

import React, { useState } from "react";
import {Button} from "@Components/ui/button";
import {LayoutDashboard, Plus, SettingsIcon, Brain, Package} from "lucide-react";
import {NavItem} from "@Components/ui/navItem";

/**
 * Props for the ActionBar component
 */
interface ActionBarProps {
    action: string                                              // Current active action/page
    setAction: React.Dispatch<React.SetStateAction<string>>     // Function to change the current action/page
    toggleShowSideWindow: () => void                            // Function to toggle the storage side window
}

const ActionBar = ({action, setAction, toggleShowSideWindow}: ActionBarProps) => {

    return (
        <>
            {/* Main sidebar container */}
            <div
                className="w-20 select-none bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center py-6">
                <div className="flex flex-col items-center space-y-6">
                    
                    {/* Button to add new storage - only works on main page */}
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
                        {/* Tooltip for add storage button */}
                        {/* Text that shows when you hover over the button */}
                        <span
                            className="z-1 select-none absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                            Add Storage
                        </span>
                    </div>

                    {/* Menu items that change based on what page you're on */}
                    <div className="w-full px-2 space-y-4">

                        {/* If you're on the main page */}
                        {action === "dashboard" && (
                            <>
                                <NavItem icon={<LayoutDashboard className="h-5 w-5"/>} label="Dashboard" active/>
                                <NavItem icon={<Package className="h-5 w-5"/>} label="Transfers"
                                         onClick={() => setAction("transfers")}/>
                                <NavItem icon={<SettingsIcon className="h-5 w-5"/>} label="Settings"
                                         onClick={() => setAction("settings")}/>
                            </>

                        )}

                        {/* If you're on transfers page */}
                        {action === "transfers" && (
                            <>
                                <NavItem icon={<LayoutDashboard className="h-5 w-5"/>} label="Dashboard"
                                         onClick={() => setAction("dashboard")}/>
                                <NavItem icon={<Package className="h-5 w-5"/>} label="Transfers" active/>
                                <NavItem icon={<SettingsIcon className="h-5 w-5"/>} label="Settings"
                                         onClick={() => setAction("settings")}/>
                            </>
                        )}

                        {/* If you're on settings page */}
                        {action === "settings" && (
                            <>
                                <NavItem icon={<LayoutDashboard className="h-5 w-5"/>} label="Dashboard"
                                         onClick={() => setAction("dashboard")}/>
                                <NavItem icon={<Package className="h-5 w-5"/>} label="Transfers"
                                         onClick={() => setAction("transfers")}/>
                                <NavItem icon={<SettingsIcon className="h-5 w-5"/>} label="Settings" active/>
                            </>
                        )}
                    </div>
                </div>

                {/* App version number at the bottom */}
                <div className="mt-auto py-5">
                    <div className="">
                        <h4 className="text-sm text-gray-600 dark:text-gray-300">v0.1</h4>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ActionBar;
