// src/renderer/components/FileExplorer.tsx
import React, { useEffect, useState } from 'react'
import type { FileSystemItem } from '../../types/fileSystem'

export function FileExplorer() {
    const [items, setItems] = useState<FileSystemItem[]>([])

    const [cwd, setCwd] = useState<string>(window.fsApi.getHome())

    useEffect(() => {
        window.fsApi.readDirectory(cwd)
            .then(files => {
                console.log('Got', files)
                setItems(files)
            })
            .catch(console.error)
    }, [cwd])

    return (
        <div className="file-explorer">
            <div className="toolbar">
                <button onClick={() => setCwd(process.env.HOME || '/')}>Home</button>
            </div>
            <ul>
                {items.map(item => (
                    <li key={item.path} onDoubleClick={() => {
                        if (item.isDirectory) setCwd(item.path)
                    }}>
                        {item.isDirectory ? '📁' : '📄'} {item.name}
                    </li>
                ))}
            </ul>
        </div>
    )
}
