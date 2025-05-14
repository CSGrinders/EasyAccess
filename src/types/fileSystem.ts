
// FileSystem API
export interface FileSystemItem {
    name: string
    isDirectory: boolean
    path: string
    size?: number
    modifiedTime?: number
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