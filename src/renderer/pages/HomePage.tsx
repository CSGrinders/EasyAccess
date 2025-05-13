import React, {useState} from 'react';
import {
    CloudIcon,
    Download,
    HardDrive,
    Home,
    Plus,
    Search, User,
} from "lucide-react"
import {Input} from "@Components/ui/input";
import {Button} from '@/components/ui/button';
import {NavItem} from "@Components/ui/navItem";

const HomePage = () => {

    const [storageBoxes, setStorageBoxes] = useState([
        {
            id: 1,
            name: "Local Directory",
            type: "local",
            content: "",
            width: 100,
            height: 300,
        },
    ])

    return (
        <div className="flex flex-col h-screen  bg-white dark:bg-gray-900 text-black dark:text-white">

            <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md">
                <div className="container mx-5 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center">
                                <div
                                    className="bg-gradient-to-r from-blue-500 to-indigo-600 p-2 rounded-lg shadow-md mr-3">
                                    <HardDrive className="h-6 w-6 text-white"/>
                                </div>
                                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                    Easy Access
                                </h1>
                            </div>

                        </div>

                    </div>
                </div>

            </header>
            <div className="flex-1 flex overflow-hidden">
                <div
                    className="w-20 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center py-6">
                    <div className="flex flex-col items-center space-y-6">
                        <div className="relative group">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-700"
                            >
                                <Plus className="h-6 w-6 text-blue-600 dark:text-blue-400"/>
                            </Button>
                            <span
                                className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                Add Storage
              </span>
                        </div>

                        <div className="w-full px-2 space-y-4">
                            <NavItem icon={<Home className="h-5 w-5"/>} label="Home" active/>
                            <NavItem icon={<CloudIcon className="h-5 w-5"/>} label="Clouds"/>
                            <NavItem icon={<Download className="h-5 w-5"/>} label="Downloads"/>
                        </div>
                    </div>
                    <div className="mt-auto py-5">
                        <div
                            className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center text-white font-medium shadow-sm">
                            <User className="h-4 w-4"/>
                        </div>
                    </div>
                </div>
                <div className="flex-1 flex flex-col items-center mt-5">
                    <div className="relative w-96">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search files..."
                            className="pl-8 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:ring-blue-500"
                        />
                    </div>
                    <div
                        className="flex-1 flex flex-wrap gap-4 overflow-auto p-4"
                    >
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomePage;
