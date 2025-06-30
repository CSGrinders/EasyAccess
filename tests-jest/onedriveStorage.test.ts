import { OneDriveStorage } from '../src/main/cloud/onedriveStorage';
import { FileSystemItem } from '../src/types/fileSystem';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

type MockFileSystemFolder = {
    id: string;
    children: Map<string, any>;
    name?: string;
    folder?: {};
    size?: number;
    lastModifiedDateTime?: string;
    parentReference?: { path: string };
    file?: { mimeType: string };
    content?: Buffer;
};

// Create a fresh mock file system for each test
const createFreshMockFileSystem = (): { [key: string]: MockFileSystemFolder } => ({
    root: {
        id: 'root',
        children: new Map([
            ['Documents', {
                id: 'folder1',
                name: 'Documents',
                folder: {},
                size: 200,
                lastModifiedDateTime: '2025-06-26T10:00:00Z',
                parentReference: { path: '/drive/root:' }
            }],
            ['test.txt', {
                id: 'file1',
                name: 'test.txt',
                file: { mimeType: 'text/plain' },
                size: 100,
                content: Buffer.from('Test file content'),
                lastModifiedDateTime: '2025-06-26T10:00:00Z',
                parentReference: { path: '/drive/root:' }
            }]
        ]),
        size: 300,
    },
    Documents: {
        id: 'folder1',
        children: new Map([
            ['file2.txt', {
                id: 'file2',
                name: 'file2.txt',
                file: { mimeType: 'text/plain' },
                size: 200,
                content: Buffer.from('File 2 content'),
                lastModifiedDateTime: '2025-06-26T10:00:00Z',
                parentReference: { path: '/drive/root:/Documents' }
            }]
        ])
    }
});

let mockFileSystem: { [key: string]: MockFileSystemFolder };

export const createMockGraphClient = () => ({
    api: (path: string) => ({
        get: jest.fn().mockImplementation(async () => {
            // Handle different API paths
            if (path === '/me/drive/root/children') {
                return {
                    value: Array.from(mockFileSystem.root.children.values()),
                    size: mockFileSystem.root.size
                };
            }

            if (path.endsWith('/content')) {
                const filePath = path.replace('/me/drive/root:/', '').replace(':/content', '');
                const file = mockFileSystem.root.children.get(filePath);
                if (!file || !file.content) {
                    throw new Error('File not found or empty');
                }
                return file.content;
            }

            // /me/drive/root:/Documents:/children
            const match = path.match(/\/me\/drive\/root:\/(.*):\/children/);
            if (match) {
                const folderPath = match[1];
                const folder = mockFileSystem[folderPath];
                if (!folder) {
                    const err = new Error('folder not found');
                    (err as any).statusCode = 404;
                    (err as any).code = 'folderNotFound';
                    throw err;
                }
                return {
                    value: Array.from(folder.children.values())
                };
            }

            // Handle individual file/folder metadata
            const itemPath = path.replace('/me/drive/root:/', '');
            const item = mockFileSystem.root.children.get(itemPath);
            if (!item) {
                const err = new Error('Item not found');
                (err as any).statusCode = 404;
                (err as any).code = 'itemNotFound';
                throw err;
            }
            return item;
        }),
        put: jest.fn().mockImplementation(async (content: unknown) => {
            // create a file at the path
            const match = path.match(/\/me\/drive\/root:\/(.*):\/content/);
            if (!match) {
                throw new Error('Invalid path for PUT operation');
            }
            const filePath = match[1];
            const pathParts = filePath.split('/').filter(Boolean);
            const fileName = pathParts[pathParts.length - 1];
            const folderPath = pathParts.slice(0, -1).join('/');

            // Get the target folder from mockFileSystem
            let targetFolder = mockFileSystem.root;
            if (folderPath) {
                targetFolder = mockFileSystem[folderPath];
                if (!targetFolder) {
                    throw new Error(`Folder not found: ${folderPath}`);
                }
            }
            const bufferContent = content as Buffer;
            const newFile = {
                id: 'newfileid',
                name: fileName || 'newfile.txt',
                file: { mimeType: 'text/plain' },
                size: bufferContent.length,
                content: bufferContent,
                lastModifiedDateTime: new Date().toISOString(),
                // parentReference: { path: '/drive/root:' + folderPath }
            };
            if (!fileName.includes('/')) {
                mockFileSystem.root.children.set(fileName, newFile);
            }
            return newFile;
        }),
        post: jest.fn().mockImplementation(async (data: any) => {
            // create a folder to the path
            const folderName = data.name || 'New Folder';
            const newFolder = {
                id: 'newfolderid',
                name: folderName,
                folder: {},
                size: 0,
                lastModifiedDateTime: new Date().toISOString(),
                parentReference: { path: '/drive/root:' },
                children: new Map()
            };
            if (path === '/me/drive/root/children') {
                mockFileSystem.root.children.set(folderName, newFolder);
                mockFileSystem[folderName] = newFolder;
            }
            return newFolder;
        }),
        delete: jest.fn().mockImplementation(async () => {
            // delete a file or folder at the path
            const match = path.match(/\/me\/drive\/root:\/(.*)/);
            if (!match) {
                throw new Error('Invalid path for DELETE operation');
            }
            const itemPath = match[1];
            const item = mockFileSystem.root.children.get(itemPath);
            if (!item) {
                throw Error('Item not found');
            }
            mockFileSystem.root.children.delete(itemPath);
        }),
        responseType: (type: string) => ({
            get: jest.fn().mockImplementation(async () => Buffer.from('Test file content'))
        })
    })
});

jest.mock('@azure/msal-node', () => ({
    PublicClientApplication: jest.fn().mockImplementation(() => ({
        acquireTokenSilent: jest.fn().mockImplementation(() => ({
            accessToken: 'mock-token'
        })),
        getAllAccounts: jest.fn().mockImplementation(() => [{
            username: 'test@example.com'
        }]),
        initialize: jest.fn(),
    })),
    LogLevel: {
        Error: 0,
        Warning: 1,
        Info: 2,
        Verbose: 3
    }
}));

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('OneDriveStorage', () => {
    let storage: OneDriveStorage;

    beforeEach(async () => {
        // Reset mock file system for each test
        mockFileSystem = createFreshMockFileSystem();

        console.log = jest.fn();
        console.error = jest.fn();
        console.warn = jest.fn();

        storage = new OneDriveStorage();
        storage.accountId = 'test@example.com';
        // Mock the graph client
        storage.graphClient = createMockGraphClient();
        jest.spyOn(storage as any, 'initClient').mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
        // Restore console output
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
    });

    test('readDir returns directory contents', async () => {
        const files = await storage.readDir('/');
        expect(files).toHaveLength(2); // Only Documents and test.txt
        expect(files.find(f => f.name === 'test.txt')).toBeDefined();
        expect(files.find(f => f.name === 'Documents')).toBeDefined();
    });

    test('readFile returns file content', async () => {
        const content = await storage.readFile('/test.txt');
        expect(content).toBe('Test file content');
    });

    test('createDirectory creates new folder', async () => {
        await storage.createDirectory('/NewFolder');

        // Verify the folder was created
        const files = await storage.readDir('/');
        expect(files.find(f => f.name === 'NewFolder')).toBeDefined();
    });

    test('getFile returns file content', async () => {
        const file = await storage.getFile('/test.txt');
        expect(file.content!.toString()).toBe('Test file content');
        expect(file.type).toBe('text/plain');
    });

    test('postFile uploads new file', async () => {
        const newFileName = 'newfile.txt';
        const newFileContent = Buffer.from('New file content');
        await storage.postFile(newFileName, '/', 'text/plain', newFileContent);

        const files = await storage.readDir('/');
        console.log('Files after postFile:', files);
        expect(files.find(f => f.name === newFileName)).toBeDefined();
    });

    test('getFileInfo returns file metadata', async () => {
        const fileInfo = await storage.getFileInfo('/test.txt');
        expect(fileInfo.name).toBe('test.txt');
        expect(fileInfo.size).toBe(100);
        expect(fileInfo.id).toBe('file1');
    });

    test('getDirectoryTree returns directory structure', async () => {
        const tree = await storage.getDirectoryTree('/');

        expect(tree).toHaveLength(3);
        expect(tree.find(f => f.name === 'Documents')).toBeDefined();
        expect(tree.find(f => f.name === 'test.txt')).toBeDefined();
        expect(tree.find(f => f.name === 'file2.txt')).toBeDefined();
    });

    test('calculateFolderSize returns total size of folder', async () => {
        const size = await storage.calculateFolderSize('/');
        // Should be 100 (test.txt) + 200 (Documents folder content)
        expect(size).toBe(300);
    });

    test('getDirectoryInfo returns folder info with size', async () => {
        const folderInfo = await storage.getDirectoryInfo('/Documents');
        expect(folderInfo.name).toBe('Documents');
        expect(folderInfo.isDirectory).toBe(true);
        expect(folderInfo.size).toBe(200); // size of Documents folder
    });

    test('deleteFile removes file', async () => {
        await storage.deleteFile('/test.txt');

        const files = await storage.readDir('/');
        expect(files.find(f => f.name === 'test.txt')).toBeUndefined();
        // Should still have Documents folder
        expect(files.find(f => f.name === 'Documents')).toBeDefined();
    });

    // Group tests that modify state to run in isolation
    describe('isolated tests', () => {
        test('createDirectory and getDirectoryTree work together', async () => {
            await storage.createDirectory('/NewFolder');
            const tree = await storage.getDirectoryTree('/');

            expect(tree.find(f => f.name === 'NewFolder')).toBeDefined();
        });

        test('postFile and getDirectoryTree work together', async () => {
            await storage.postFile('newfile.txt', '/', 'text/plain', Buffer.from('content'));
            const tree = await storage.getDirectoryTree('/');

            expect(tree.find(f => f.name === 'newfile.txt')).toBeDefined();
        });
    });

    // test search files
    test('searchFiles finds files matching pattern', async () => {
        const files = await storage.searchFiles('/', 'file2.txt', []);
        expect(files.some(f => f.name === 'file2.txt')).toBe(true);
    });

    describe('error handling', () => {
        beforeEach(async () => {
            // Reset mock file system for each test
            mockFileSystem = createFreshMockFileSystem();

            console.log = jest.fn();
            console.error = jest.fn();
            console.warn = jest.fn();

            storage = new OneDriveStorage();
            storage.accountId = 'test@example.com';
            // Mock the graph client
            storage.graphClient = createMockGraphClient();
            jest.spyOn(storage, 'initClient').mockImplementation(() => Promise.resolve());
        });
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
});