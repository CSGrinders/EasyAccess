
// FileSystem API
export interface FileSystemItem {
    id: string // Unique identifier for the item (duplicate can be possible in google drive)
    name: string
    isDirectory: boolean
    path: string
    size?: number
    modifiedTime?: number
}

export interface FileContent {
    name: string
    content: Buffer
    type: string
}

declare global {
    interface Window {
        fsApi: {
            getHome: () => string
            readDirectory: (dir: string) => Promise<FileSystemItem[]>
            readFile: (file: string) => Promise<string>
        }
    }
}
export {}