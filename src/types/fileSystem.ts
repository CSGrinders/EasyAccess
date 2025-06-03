import { CloudType } from "./cloudType"

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
    content?: Buffer // Content of the file as a Buffer (Google Doc content is not available as a Buffer / url is provided instead) 
    type: string // mime type of the file (e.g., 'text/plain', 'application/pdf')
    url?: string // Optional URL for the file if available
    path: string // Path to the file in the source file system
    sourceCloudType: CloudType | null // Optional cloud type if the file is from a cloud storage
    sourceAccountId: string | null // Optional cloud type if the file is from a cloud storage
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