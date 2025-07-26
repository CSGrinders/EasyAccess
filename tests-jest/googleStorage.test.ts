import { GoogleDriveStorage } from '../src/main/cloud/googleStorage';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { error } from 'console';
import { google } from 'googleapis';
import { drive_v3 } from 'googleapis/build/src/apis/drive/v3'; // import types


let storage: GoogleDriveStorage;


const mockFileSystem = {
    root: [
        { id: 'folder1', name: 'Folder 1', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] },
        { id: 'file1', name: 'File 1.txt', mimeType: 'text/plain', parents: ['root'], size: '100', modifiedTime: '2023-01-01T00:00:00Z' },
        { id: 'fileGoogleDoc', name: 'File Google Doc', mimeType: 'application/vnd.google-apps.document', parents: ['root'], size: '300', modifiedTime: '2023-01-03T00:00:00Z' }
    ],
    folder1: [
        { id: 'file2', name: 'File 2.txt', mimeType: 'text/plain', parents: ['folder1'], size: '200', modifiedTime: '2023-01-02T00:00:00Z' }
    ]
};
const mockFileData = {
    file1: Buffer.from('File 1 content'),
    file2: Buffer.from('File 2 content'),
    fileGoogleDoc: Buffer.from('File Google Doc content'),
};

const mockDrive = {
    files: {
        list: jest.fn(({ q }) => {
            // Extract folderId from the query string
            const match = q.match(/'(.+)' in parents/);
            const search = q.match(/name='([^']+)'/); //name='${folderName}'
            const mimeTypeMatch = q.match(/mimeType='([^']+)'/);
            console.log('Mock Drive List Query:', q);
            console.log('Extracted Folder ID:', match ? match[1] : 'root');
            console.log('Search Pattern:', search ? search[1] : 'none');
            console.log('MIME Type Pattern:', mimeTypeMatch ? mimeTypeMatch[1] : 'none');
            const folderId: keyof typeof mockFileSystem = match ?
                (match[1] as keyof typeof mockFileSystem) : 'root';
            let files = mockFileSystem[folderId] || [];

            // Apply name filter if present
            if (search) {
                const fileName = search[1];
                files = files.filter(file => file.name === fileName);
            }

            // Apply mime type filter if present
            if (mimeTypeMatch) {
                files = files.filter(file => file.mimeType === mimeTypeMatch[1]);
            }

            return Promise.resolve({
                data: {
                    files
                } as drive_v3.Schema$FileList
            });
        }),
        get: jest.fn(({ fileId, alt }: { fileId: keyof typeof mockFileData, alt?: string }) => {
            const allFiles = Object.values(mockFileSystem).flat();
            const file = allFiles.find(f => f.id === fileId);
            if (!file) return Promise.reject(new Error('File not found'));
            if (alt === 'media') {
                return Promise.resolve({ data: mockFileData[fileId] });
            }
            return Promise.resolve({ data: file });
        }),
        export: jest.fn(({ fileId }) => {
            // Simulate export for Google Docs
            return Promise.resolve({ data: Buffer.from('exported content') });
        }),
        create: jest.fn().mockImplementation(() => {
            return Promise.resolve({ data: { id: 'newid' } } as unknown as any);
        }),
        delete: jest.fn()
    }
};

jest.mock('googleapis', () => ({
    google: {
        drive: jest.fn(() => {
            return mockDrive;
        }),
    },
}));

beforeEach(() => {
    jest.clearAllMocks();
    storage = new GoogleDriveStorage();


    storage.AuthToken = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600 * 1000, // 1 hour from now
    };
    storage.accountId = 'test-account-id';

    // Create mock OAuth2Client
    const mockOAuth2Client = {
        setCredentials: jest.fn(),
        getAccessToken: jest.fn().mockImplementation(() => {
            return Promise.resolve({
                credentials: { access_token: 'mock-token' }
            });
        }),
        generateAuthUrl: jest.fn().mockReturnValue('http://mock-auth-url'),
        getToken: jest.fn().mockImplementation(() => {
            return Promise.resolve({
                tokens: { access_token: 'mock-token', refresh_token: 'mock-refresh' }
            });
        }),
    };

    // Mock the private oauth2Client property
    (storage as any).oauth2Client = mockOAuth2Client;

    jest.spyOn(storage as any, 'refreshOAuthClientIfNeeded').mockImplementation(() => Promise.resolve());

});


describe('GoogleDriveStorage working cases', () => {
    test('getFileInfo returns file information', async () => {
        await storage.getFileInfo('File 1.txt').then((fileInfo) => {
            expect(fileInfo.id).toEqual('file1');
            expect(fileInfo.name).toEqual('File 1.txt');
        });
    });

    test('readDir returns files in root directory', async () => {
        const files = await storage.readDir('/');
        expect(files.length).toBe(mockFileSystem.root.length);
        expect(files[0].name).toBe('Folder 1');
        expect(files[1].name).toBe('File 1.txt');
        expect(files[2].name).toBe('File Google Doc');
    });

    test('readFile returns file content', async () => {
        const content = await storage.readFile('File 1.txt');
        expect(content).toBe('File 1 content');
    });

    test('readFile returns file content for google native files', async () => {
        const content = await storage.readFile('File Google Doc');
        expect(content).toBe('exported content');
    });

    test('connect sets AuthToken and accountId on success', async () => {
        const mockToken = { access_token: 'a', refresh_token: 'r', expiry_date: Date.now() + 10000 };
        const mockEmail = 'user@example.com';
        (storage as any).authenticateGoogle = jest.fn().mockImplementation(() => {
            return Promise.resolve({ token: mockToken, email: mockEmail } as unknown as any);
        });
        await storage.connect();
        expect(storage.AuthToken).toEqual(mockToken);
        expect(storage.accountId).toBe(mockEmail);
    });

    test('connect throws on authentication failure', async () => {
        (storage as any).authenticateGoogle = jest.fn().mockImplementation(() => {
            return Promise.resolve(null as unknown as any);
        });
        await expect(storage.connect()).rejects.toThrow('Authentication failed');
    });

    test('getFile returns FileContent for binary file', async () => {
        const file = await storage.getFile('File 1.txt');
        expect(file.content!.toString()).toBe('File 1 content');
        expect(file.type).toBe('text/plain');
    });

    test('getFile returns FileContent for Google Docs file', async () => {
        const file = await storage.getFile('File Google Doc');
        expect(file.content!.toString()).toBe('exported content');
        expect(file.type).toBe('application/pdf'); // Google Docs export type
    });

    test('postFile uploads file to Google Drive', async () => {
        (storage as any).getFolderId = jest.fn().mockImplementation(() => {
            return Promise.resolve('parentid' as unknown as any);
        });
        await storage.postFile('new.txt', '/', 'text/plain', Buffer.from('data'));
        expect(mockDrive.files.create).toHaveBeenCalled();
    });

    test('createDirectory creates nested folders', async () => {
        await storage.createDirectory('/foo/bar');
        expect(mockDrive.files.create).toHaveBeenCalledTimes(2);
    });

    test('getAccountId and getAuthToken return correct values', () => {
        expect(storage.getAccountId()).toBe('test-account-id');
        expect(storage.getAuthToken()).toEqual(storage.AuthToken);
    });

    test('deleteFile deletes file by path', async () => {
        await storage.deleteFile('File 1.txt');
        expect(mockDrive.files.delete).toHaveBeenCalledWith({ fileId: 'file1' });
    });

    test('getDirectoryInfo returns folder info with size', async () => {
        const folderInfo = await storage.getDirectoryInfo('/Folder 1');
        console.log('Folder Info:', folderInfo);
        expect(folderInfo.name).toBe('Folder 1');
        expect(folderInfo.isDirectory).toBe(true);
        expect(folderInfo.size).toBe(200); // size of File 2.txt
    });

    test('searchFiles finds files matching pattern and excludes', async () => {
        // Recursively call search for subfolder
        (storage as any).search = jest.fn();
        const files = await storage.searchFiles('/', 'File 2.txt', []);
        expect(files.some(f => f.name === 'File 2.txt')).toBe(true);
    });

    test('getDirectoryTree returns recursive tree', async () => {
        const folderTreeNodes = await storage.getDirectoryTree('/');
        console.log('Folder Tree Nodes:', folderTreeNodes);
        expect(folderTreeNodes.length).toBe(mockFileSystem['root'].length + mockFileSystem['folder1'].length);
    });

    test('calculateFolderSize sums file sizes recursively', async () => {
        (storage as any).getFolderId = jest.fn().mockImplementation(() => {
            return Promise.resolve('root');
        });
        const size = await storage.calculateFolderSize('/');
        expect(size).toBe(600);
    });
});

describe('GoogleDriveStorage error cases', () => {
    test('readFile throws error for non-existent file', async () => {
        await expect(storage.readFile('/non-existent.txt')).rejects.toBeInstanceOf(Error);
    });

    test('getFile throws error for non-existent file', async () => {
        await expect(storage.getFile('/non-existent.txt')).rejects.toBeInstanceOf(Error);
    });

    test('postFile throws error for non-existent parent folder', async () => {
        await expect(storage.postFile('new.txt', '/non-existent-folder', 'text/plain', Buffer.from('data')))
            .rejects.toBeInstanceOf(Error);
    });
    test('deleteFile throws error for non-existent file', async () => {
        await expect(storage.deleteFile('/non-existent.txt')).rejects.toBeInstanceOf(Error);
    });
    test('getDirectoryInfo throws error for non-existent directory', async () => {
        await expect(storage.getDirectoryInfo('/non-existent-folder')).rejects.toBeInstanceOf(Error);
    });
    test('getDirectoryTree throws error for non-existent directory', async () => {
        await expect(storage.getDirectoryTree('/non-existent-folder')).rejects.toBeInstanceOf(Error);
    });
    test('getFileInfo throws error for non-existent file', async () => {
        await expect(storage.getFileInfo('/non-existent.txt')).rejects.toBeInstanceOf(Error);
    });
});
/*
    connect(): Promise<void | any>;
    readDir(dir: string): Promise<FileSystemItem[]>;
    readFile(filePath: string): Promise<string>;
    getFile(filePath: string): Promise<FileContent>;
    postFile(fileName: string, folderPath: string, type: string, data: Buffer): Promise<void>;
    createDirectory(dirPath: string): Promise<void>; // Create a new directory
    getAccountId(): string;
    getAuthToken(): AuthTokens | null;
    deleteFile(filePath: string): Promise<void>;

    getDirectoryInfo(dirPath: string): Promise<FileSystemItem>; // Get information about a directory
    searchFiles(rootPath: string, pattern: string, excludePatterns: string[]): Promise<FileSystemItem[]>;
    getFileInfo(filePath: string): Promise<FileSystemItem>;
    getDirectoryTree(dir: string): Promise<FileSystemItem[]>;
    calculateFolderSize(folderPath: string): Promise<number>; // Calculate total size of a folder recursively
*/