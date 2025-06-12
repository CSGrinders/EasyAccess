import type React from "react";
import { CloudType } from "./cloudType";

export const MIN_BOX_WIDTH = 400;
export const MIN_BOX_HEIGHT = 360;

export const WINDOW_SIZES = {
    medium: {width: 480, height: 360},
    large: {width: 640, height: 480},
    xl: {width: 800, height: 600},
}

export const WINDOW_TYPES = ["local", "cloud"]


export interface StorageBoxProps {
    box: StorageBoxData
    onClose?: (id: number) => void
    onFocus?: (id: number) => void
    viewportSize: { width: number; height: number };
    viewportRef: React.RefObject<HTMLDivElement>;
    canvasZoom: number;
    canvasPan: { x: number; y: number };
    isMaximized: boolean;
    setIsMaximized: (isMaximized: boolean) => void;
    // tempPostFile: (cloudType: CloudType, accountId: string, parentPath: string) => void;
    // tempGetFile: (fileContent: FileContent) => void;
    tempPostFile?: (parentPath: string, cloudType?: CloudType, accountId?: string) => void
    tempGetFile?: (filePaths: string[], cloudType?: CloudType, accountId?: string) => void
    onBoxTransfer?: (sourceItems: any[], targetBoxId: number, targetPath?: string) => void;
}

export interface StorageBoxData {
    id: number
    title: string
    type: string
    position: { x: number; y: number }
    size: { width: number; height: number }
    icon?: React.ReactNode
    zIndex?: number
    cloudType?: CloudType
    accountId?: string
}

export interface StorageWideWindowProps {
    show: boolean
    addStorage: (type: string, title: string, icon: React.ReactNode, cloudType?: CloudType, accountId?: string) => void
    onAccountDeleted?: (cloudType: CloudType, accountId: string) => void
}


