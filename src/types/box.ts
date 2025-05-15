import type React from "react";

export const WINDOW_SIZES = {
    small: {width: 320, height: 240},
    medium: {width: 480, height: 360},
    large: {width: 640, height: 480},
    xl: {width: 800, height: 600},
}

export const WINDOW_TYPES = ["local", "cloud"]

export interface StorageBoxProps {
    box: StorageBoxData
    onClose?: (id: number) => void
    onFocus: (id: number) => void
}

export interface StorageBoxData {
    id: number
    title: string
    type: string
    position: { x: number; y: number }
    size: { width: number; height: number }
    content: {
        folders: string[]
        files: string[]
    }
    icon?: React.ReactNode
    zIndex: number
}

export interface StorageWideWindowProps {
    show: boolean
}


