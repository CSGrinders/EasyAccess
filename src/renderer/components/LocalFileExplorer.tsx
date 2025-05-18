"use client"

import React, {useEffect, useState, useRef, useCallback} from "react"
import {
    ChevronLeft,
    ChevronRight,
    Home,
    FolderIcon,
    FileIcon,
    ArrowUp,
    RefreshCw,
    Search,
    EyeOff,
    Eye,
    Copy,
    Trash,
    Move,
} from "lucide-react"
import type {FileSystemItem} from "@Types/fileSystem"
import {Input} from "@/components/ui/input"
import {ScrollArea} from "@/components/ui/scroll-area"
import {Button} from "@/components/ui/button"
import {cn} from "@/lib/utils"

export function LocalFileExplorer() {
    const [items, setItems] = useState<FileSystemItem[]>([])
    const [cwd, setCwd] = useState<string>("")
    const [history, setHistory] = useState<string[]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)
    const [searchQuery, setSearchQuery] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [currentPath, setCurrentPath] = useState<string[]>([])
    const [showHidden, setShowHidden] = useState(false)
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
    const [lastSelectedItem, setLastSelectedItem] = useState<string | null>(null)
    const [isSelecting, setIsSelecting] = useState(false)
    const [selectionStart, setSelectionStart] = useState({x: 0, y: 0})
    const [selectionEnd, setSelectionEnd] = useState({x: 0, y: 0})
    const [selectionBox, setSelectionBox] = useState({left: 0, top: 0, width: 0, height: 0})
    const [isAdditiveDrag, setIsAdditiveDrag] = useState(false);
    const selectionSnapshotRef = useRef<Set<string>>(new Set());

    const containerRef = useRef<HTMLDivElement>(null)
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

    const filteredItems = searchQuery
        ? items.filter(
            (item) =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) && (showHidden || !item.name.startsWith(".")),
        )
        : items.filter((item) => showHidden || !item.name.startsWith("."))

    const sortedItems = [...filteredItems].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
    })

    useEffect(() => {
        const fetchHome = async () => {
            const homePath = window.fsApi.getHome()
            setCwd(homePath)
            setHistory([homePath])
            setHistoryIndex(0)
        }

        fetchHome().then(r => console.log("Directory fetched"))
    }, [])

    useEffect(() => {
        if (!cwd) return

        setIsLoading(true)
        window.fsApi
            .readDirectory(cwd)
            .then((files) => {
                setItems(files)
                updatePathSegments(cwd)
                setIsLoading(false)
                setSelectedItems(new Set())
                setLastSelectedItem(null)
            })
            .catch((err) => {
                console.error(err)
                setIsLoading(false)
            })
    }, [cwd])

    const updatePathSegments = (path: string) => {
        // Split path into segments
        const segments = path.split(/[/\\]/).filter(Boolean)
        setCurrentPath(segments)
    }

    const navigateTo = (path: string) => {
        // Add to history
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push(path)
        setHistory(newHistory)
        setHistoryIndex(newHistory.length - 1)
        setCwd(path)
    }

    const navigateBack = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1)
            setCwd(history[historyIndex - 1])
        }
    }

    const navigateForward = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1)
            setCwd(history[historyIndex + 1])
        }
    }

    const goToHome = async () => {
        const homePath = await window.fsApi.getHome()
        navigateTo(homePath)
    }

    const navigateUp = () => {
        const parentPath = cwd.split("/").slice(0, -1).join("/") || "/"
        navigateTo(parentPath)
    }

    const refreshDirectory = () => {
        if (cwd) {
            setIsLoading(true)
            window.fsApi
                .readDirectory(cwd)
                .then((files) => {
                    setItems(files)
                    setIsLoading(false)
                })
                .catch((err) => {
                    console.error(err)
                    setIsLoading(false)
                })
        }
    }


    const handleItemClick = (e: React.MouseEvent, item: FileSystemItem) => {

        // Double click to navigate into directory
        if (e.detail === 2 && item.isDirectory) {
            navigateTo(item.path)
            return
        }

        const ctrlOrMeta = e.ctrlKey || e.metaKey;

        if (e.shiftKey && lastSelectedItem) {
            const itemsPathList = sortedItems.map((i) => i.path);
            const currentIndex = itemsPathList.indexOf(item.path);
            const lastIndex = itemsPathList.indexOf(lastSelectedItem);

            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);
                const newSelectedItemsUpdate = ctrlOrMeta ? new Set(selectedItems) : new Set<string>();

                for (let i = start; i <= end; i++) {
                    newSelectedItemsUpdate.add(itemsPathList[i]);
                }

                if (ctrlOrMeta) {
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    setSelectedItems(prev => new Set([...prev, ...rangeSelection]));
                } else {
                    const rangeSelection = new Set<string>();
                    for (let i = start; i <= end; i++) {
                        rangeSelection.add(itemsPathList[i]);
                    }
                    setSelectedItems(rangeSelection);
                }

            }
        } else if (ctrlOrMeta) {
            const newSelectedItemsUpdate = new Set(selectedItems);
            if (newSelectedItemsUpdate.has(item.path)) {
                newSelectedItemsUpdate.delete(item.path);
            } else {
                newSelectedItemsUpdate.add(item.path);
            }
            setSelectedItems(newSelectedItemsUpdate);
            setLastSelectedItem(item.path);
        } else {
            setSelectedItems(new Set([item.path]));
            setLastSelectedItem(item.path);
        }
    }


    const handleMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest(".file-item") || e.button !== 0) {
            return;
        }

        const scrollArea = containerRef.current;
        if (scrollArea) {
            if (e.clientX >= scrollArea.clientWidth + scrollArea.offsetLeft ||
                e.clientY >= scrollArea.clientHeight + scrollArea.offsetTop) {
                return;
            }
        }


        const additive = e.ctrlKey || e.metaKey;
        setIsAdditiveDrag(additive);

        if (!additive) {
            setSelectedItems(new Set());
            selectionSnapshotRef.current = new Set();
        } else {
            selectionSnapshotRef.current = new Set(selectedItems);
        }

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsSelecting(true);
        setSelectionStart({x, y});
        setSelectionEnd({x, y});
        setSelectionBox({left: x, top: y, width: 0, height: 0});
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isSelecting || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        setSelectionEnd({x: currentX, y: currentY});

        const newSelectionBox = {
            left: Math.min(selectionStart.x, currentX),
            top: Math.min(selectionStart.y, currentY),
            width: Math.abs(currentX - selectionStart.x),
            height: Math.abs(currentY - selectionStart.y),
        };
        setSelectionBox(newSelectionBox);
        updateSelectedItemsFromBox(newSelectionBox);
    }


    const handleMouseUp = () => {
        if (isSelecting) {
            setIsSelecting(false);
        }
    }


    const updateSelectedItemsFromBox = useCallback((box: {
        left: number;
        top: number;
        width: number;
        height: number
    }) => {
        if (!isSelecting || !containerRef.current) return;

        const itemsCurrentlyInBox = new Set<string>();
        const containerRect = containerRef.current.getBoundingClientRect();

        itemRefs.current.forEach((element, path) => {
            if (!element) return;

            const itemRect = element.getBoundingClientRect();

            const itemLeft = itemRect.left - containerRect.left;
            const itemTop = itemRect.top - containerRect.top;
            const itemRight = itemLeft + itemRect.width;
            const itemBottom = itemTop + itemRect.height;

            // Check for intersection
            if (itemLeft < box.left + box.width &&
                itemRight > box.left &&
                itemTop < box.top + box.height &&
                itemBottom > box.top) {
                itemsCurrentlyInBox.add(path);
            }
        });

        if (isAdditiveDrag) {
            const combinedSelection = new Set([...selectionSnapshotRef.current, ...itemsCurrentlyInBox]);
            setSelectedItems(combinedSelection);
        } else {
            setSelectedItems(itemsCurrentlyInBox);
        }
    }, [isSelecting, isAdditiveDrag, selectionSnapshotRef]);

    useEffect(() => {
        const globalMouseMove = (e: MouseEvent) => {
            if (isSelecting && containerRef.current) {
                const event = e as unknown as React.MouseEvent;
                handleMouseMove(event);
            }
        };

        const globalMouseUp = () => {
            if (isSelecting) {
                handleMouseUp();
            }
        };

        if (isSelecting) {
            document.addEventListener('mousemove', globalMouseMove);
            document.addEventListener('mouseup', globalMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', globalMouseMove);
            document.removeEventListener('mouseup', globalMouseUp);
        };
    }, [isSelecting, handleMouseMove, handleMouseUp]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl+A or Cmd+A:
            if ((e.ctrlKey || e.metaKey) && e.key === "a") {
                e.preventDefault()
                const allItems = new Set(sortedItems.map((item) => item.path))
                setSelectedItems(allItems)
            }

            if (e.key === "Escape") {
                setSelectedItems(new Set())
                setLastSelectedItem(null)
            }

            // Delete
            if (e.key === "Delete" && selectedItems.size > 0) {
                console.log("Delete selected items:", Array.from(selectedItems))

            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [selectedItems])


    const selectedCount = selectedItems.size

    return (
        <div className="flex h-full flex-col text-white rounded-lg overflow-hidden select-none">
            <div className="pl-4 pt-4 bg-white dark:bg-slate-800">
                <div className="flex items-center space-x-1 text-sm text-gray-400">
                    {currentPath.map((segment, index) => (
                        <React.Fragment key={index}>
                            {index !== 0 && ( <ChevronRight className="h-3 w-3 mx-1 text-gray-500"/>)}
                            <span
                                className="text-blue-400 cursor-pointer hover:underline"
                                onClick={() => {
                                    const path = "/" + currentPath.slice(0, index + 1).join("/")
                                    navigateTo(path)
                                }}
                            >
                {segment}
              </span>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Navigation and search */}
            <div className="flex items-center gap-1 p-4 bg-white dark:bg-slate-800">
                <Button
                    onClick={goToHome}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 "
                >
                    <Home className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={navigateUp}
                    className="p-2 rounded-md hover:bg-slate-100 text-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 "
                >
                    <ArrowUp className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={navigateBack}
                    disabled={historyIndex <= 0}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={navigateForward}
                    disabled={historyIndex >= history.length - 1}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200  disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={refreshDirectory}
                    className={`p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 ${isLoading ? "animate-spin" : ""}`}
                >
                    <RefreshCw className="h-5 w-5"/>
                </Button>

                <Button
                    onClick={() => setShowHidden(!showHidden)}
                    className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    title={showHidden ? "Hide hidden files" : "Show hidden files"}
                >
                    {showHidden ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
                </Button>

                <div className="relative ml-auto flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500"/>
                    <Input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 text-slate-800 dark:text-slate-200 h-10 placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0 focus-visible:border-blue-500"
                    />
                </div>
            </div>


            {isSelecting || selectedCount > 0 && (
                <div
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-y border-blue-100 dark:border-blue-800">
          <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
            {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
          </span>
                    <div className="ml-auto flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={selectedCount === 0}
                            className="flex items-center gap-1 text-xs"
                            onClick={() => console.log("Copy selected items:", Array.from(selectedItems))}
                        >
                            <Copy className="h-3.5 w-3.5"/>
                            Copy
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={selectedCount === 0}
                            className="flex items-center gap-1 text-xs"
                            onClick={() => console.log("Move selected items:", Array.from(selectedItems))}
                        >
                            <Move className="h-3.5 w-3.5"/>
                            Move
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={selectedCount === 0}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => console.log("Delete selected items:", Array.from(selectedItems))}
                        >
                            <Trash className="h-3.5 w-3.5"/>
                            Delete
                        </Button>
                    </div>
                </div>
            )}

            <ScrollArea>
                <div
                    ref={containerRef}
                    className="relative h-full min-h-full bg-black pt-2 pl-4 pr-4 pb-4"
                    onMouseDown={handleMouseDown}
                    //onMouseMove={handleMouseMove}
                    //onMouseUp={handleMouseUp}
                    //onMouseLeave={handleMouseUp}
                >
                    {isSelecting && (
                        <div
                            className="box-selecting"
                            style={{
                                left: `${selectionBox.left}px`,
                                top: `${selectionBox.top}px`,
                                width: `${selectionBox.width}px`,
                                height: `${selectionBox.height}px`,
                            }}
                        />
                    )}
                    {isLoading ? (
                        <div className="flex justify-center items-center h-32">
                            <RefreshCw className="h-8 w-8 text-blue-400 animate-spin"/>
                        </div>
                    ) : sortedItems.length > 0 ? (
                        <div
                            className="grid grid-cols-[repeat(auto-fit,_minmax(120px,_1fr))]
 gap-4">
                            {sortedItems.map((item) => (
                                <div
                                    key={item.path}
                                    ref={(el) => {
                                        if (el) itemRefs.current.set(item.path, el)
                                        else itemRefs.current.delete(item.path)
                                    }}
                                    onClick={(e) => handleItemClick(e, item)}
                                    onDoubleClick={(e) => {
                                        if (item.isDirectory) {
                                            navigateTo(item.path);
                                        }
                                        e.stopPropagation();
                                    }}
                                    className={cn(
                                        "file-item flex flex-col items-center justify-center p-3 rounded-md cursor-pointer transition-colors",
                                        selectedItems.has(item.path)
                                            ? "bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700"
                                            : "hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent",
                                    )}
                                >
                                    <div className="w-16 h-16 flex items-center justify-center mb-2">
                                        {item.isDirectory ? (
                                            <FolderIcon
                                                className={cn("w-14 h-14", selectedItems.has(item.path) ? "text-blue-500" : "text-blue-400")}
                                            />
                                        ) : (
                                            <FileIcon
                                                className={cn("w-14 h-14", selectedItems.has(item.path) ? "text-blue-500" : "text-gray-400")}
                                            />
                                        )}
                                    </div>
                                    <span
                                        className={cn(
                                            "text-sm text-center truncate w-full",
                                            selectedItems.has(item.path)
                                                ? "text-blue-700 dark:text-blue-300 font-medium"
                                                : "text-slate-800 dark:text-slate-200",
                                        )}
                                        title={item.name}
                                    >
                    {item.name}
                  </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-slate-800 dark:text-slate-200">
                            <FolderIcon className="w-16 h-16 mb-4 opacity-30"/>
                            <p>This folder is empty</p>
                        </div>
                    )}

                </div>
            </ScrollArea>
        </div>
    )
}
