import { jest, describe, beforeAll, beforeEach, test, expect, afterEach } from '@jest/globals';
import { DropboxStorage } from '../src/main/cloud/dropboxStorage';

const mockFileSystem = {
    entries: [
        {
            '.tag': 'folder',
            name: 'temp1',
            path_lower: '/temp1',
            path_display: '/temp1',
            id: 'id:iErhtecd8ycAAAAAAAAABg'
        },
        {
            '.tag': 'folder',
            name: 'test1',
            path_lower: '/test1',
            path_display: '/test1',
            id: 'id:iErhtecd8ycAAAAAAAAAQA'
        },
        {
            '.tag': 'folder',
            name: 'test2',
            path_lower: '/test1/test2',
            path_display: '/test1/test2',
            id: 'id:iErhtecd8ycAAAAAAAAAQQ'
        },
        {
            '.tag': 'folder',
            name: 'test3',
            path_lower: '/test1/test2/test3',
            path_display: '/test1/test2/test3',
            id: 'id:iErhtecd8ycAAAAAAAAAPw'
        },
        {
            '.tag': 'folder',
            name: 'test3',
            path_lower: '/test1/test3',
            path_display: '/test1/test3',
            id: 'id:iErhtecd8ycAAAAAAAAAQw'
        },
        {
            '.tag': 'folder',
            name: 'test3',
            path_lower: '/test1/test3/test3',
            path_display: '/test1/test3/test3',
            id: 'id:iErhtecd8ycAAAAAAAAAQg'
        },
        {
            '.tag': 'folder',
            name: 'test4',
            path_lower: '/test1/test2/test3/test4',
            path_display: '/test1/test2/test3/test4',
            id: 'id:iErhtecd8ycAAAAAAAAARA'
        },
        {
            '.tag': 'folder',
            name: 'new_for_hello',
            path_lower: '/new_for_hello',
            path_display: '/new_for_hello',
            id: 'id:iErhtecd8ycAAAAAAAAARQ'
        },
        {
            '.tag': 'folder',
            name: 'test-see',
            path_lower: '/test-see',
            path_display: '/test-see',
            id: 'id:iErhtecd8ycAAAAAAAAATA'
        },
        {
            '.tag': 'folder',
            name: 'my-resume',
            path_lower: '/my-resume',
            path_display: '/my-resume',
            id: 'id:iErhtecd8ycAAAAAAAAATQ'
        },
        {
            '.tag': 'file',
            name: 'aseem.jpg',
            path_lower: '/aseem.jpg',
            path_display: '/aseem.jpg',
            id: 'id:iErhtecd8ycAAAAAAAAAOw',
            client_modified: '2025-06-14T03:44:10Z',
            server_modified: '2025-06-14T03:44:10Z',
            rev: '016377ff9c109d900000002eadb4303',
            size: 38124,
            is_downloadable: true,
            content_hash: 'bb8cc95ed1c27e1f2a2e4981010bfefe9799316f38e50e3f0aa0815531373f8a'
        },
        {
            '.tag': 'file',
            name: 'loss_512.png',
            path_lower: '/temp1/loss_512.png',
            path_display: '/temp1/loss_512.png',
            id: 'id:iErhtecd8ycAAAAAAAAAPA',
            client_modified: '2025-06-17T23:19:11Z',
            server_modified: '2025-06-17T23:19:11Z',
            rev: '01637ccbd7032c100000002eadb4303',
            size: 18225,
            is_downloadable: true,
            content_hash: '3c24d2b49fd2d03b6c1ed9e771080e5dc4217e34f982405d5cda957024d2ab4a'
        },
        {
            '.tag': 'file',
            name: 'loss.png',
            path_lower: '/temp1/loss.png',
            path_display: '/temp1/loss.png',
            id: 'id:iErhtecd8ycAAAAAAAAAPQ',
            client_modified: '2025-06-18T04:42:49Z',
            server_modified: '2025-06-18T04:42:50Z',
            rev: '01637d142e14a1e00000002eadb4303',
            size: 21875,
            is_downloadable: true,
            content_hash: '9af27f4eeac903a99183aeacc56cf0af0f37e9fcfed575ddc60953e81a359658'
        },
        {
            '.tag': 'file',
            name: 'aseem.jpg',
            path_lower: '/temp1/aseem.jpg',
            path_display: '/temp1/aseem.jpg',
            id: 'id:iErhtecd8ycAAAAAAAAAPg',
            client_modified: '2025-06-18T19:02:55Z',
            server_modified: '2025-06-18T19:02:55Z',
            rev: '01637dd46ce058600000002eadb4303',
            size: 38124,
            is_downloadable: true,
            content_hash: 'bb8cc95ed1c27e1f2a2e4981010bfefe9799316f38e50e3f0aa0815531373f8a'
        },
        {
            '.tag': 'file',
            name: 'helloworld_from_local.py',
            path_lower: '/new_for_hello/helloworld_from_local.py',
            path_display: '/new_for_hello/helloworld_from_local.py',
            id: 'id:iErhtecd8ycAAAAAAAAARg',
            client_modified: '2025-06-18T20:25:24Z',
            server_modified: '2025-06-18T20:25:25Z',
            rev: '01637de6dd3fab700000002eadb4303',
            size: 22,
            is_downloadable: true,
            content_hash: 'f321201d7bf5ef7105e236b32da7cb31b488c38bb81bdd1d1ec1e4ca46d52310'
        },
        {
            '.tag': 'file',
            name: '20210805_150528.jpg',
            path_lower: '/new_for_hello/20210805_150528.jpg',
            path_display: '/new_for_hello/20210805_150528.jpg',
            id: 'id:iErhtecd8ycAAAAAAAAARw',
            client_modified: '2025-06-18T22:51:28Z',
            server_modified: '2025-06-18T22:51:28Z',
            rev: '01637e07828ee9e00000002eadb4303',
            size: 5124363,
            is_downloadable: true,
            content_hash: '9c1179e5678dd26c32426887c3a0adcd279c5e0567e71e3f482fe48afc82beac'
        },
        {
            '.tag': 'file',
            name: '251hw1-5.jpg',
            path_lower: '/temp1/251hw1-5.jpg',
            path_display: '/temp1/251hw1-5.jpg',
            id: 'id:iErhtecd8ycAAAAAAAAASA',
            client_modified: '2025-06-19T16:52:56Z',
            server_modified: '2025-06-19T16:52:56Z',
            rev: '01637ef93caa70400000002eadb4303',
            size: 119312,
            is_downloadable: true,
            content_hash: '45a037ccfaac7d408bd1b7b02deb955754fb4cbf121a68d11f2496a675ea25d6'
        },
        {
            '.tag': 'file',
            name: 'shuffle_cnn_acc.png',
            path_lower: '/shuffle_cnn_acc.png',
            path_display: '/shuffle_cnn_acc.png',
            id: 'id:iErhtecd8ycAAAAAAAAASQ',
            client_modified: '2025-06-19T16:57:50Z',
            server_modified: '2025-06-19T16:57:50Z',
            rev: '01637efa554c50c00000002eadb4303',
            size: 30206,
            is_downloadable: true,
            content_hash: '7523eeb95e2ebbb88eec91ac6851fbce352e9c9fe3618e528b37934dc5ad8f86'
        },
        {
            '.tag': 'file',
            name: 'numpy_results.png',
            path_lower: '/temp1/numpy_results.png',
            path_display: '/temp1/numpy_results.png',
            id: 'id:iErhtecd8ycAAAAAAAAASg',
            client_modified: '2025-06-19T16:57:59Z',
            server_modified: '2025-06-19T16:57:59Z',
            rev: '01637efa5dd793300000002eadb4303',
            size: 46798,
            is_downloadable: true,
            content_hash: 'd0f9ba99537783f9cef3cb153e6aaac0ee9fcea9d24dfe7513c1b87d691349f1'
        },
        {
            '.tag': 'file',
            name: 'helloworld_from_local.py',
            path_lower: '/helloworld_from_local.py',
            path_display: '/helloworld_from_local.py',
            id: 'id:iErhtecd8ycAAAAAAAAAUw',
            client_modified: '2025-06-22T03:57:06Z',
            server_modified: '2025-06-22T03:57:06Z',
            rev: '016382116b4616c00000002eadb4303',
            size: 22,
            is_downloadable: true,
            content_hash: 'f321201d7bf5ef7105e236b32da7cb31b488c38bb81bdd1d1ec1e4ca46d52310'
        },
        {
            '.tag': 'file',
            name: 'helloworld_from_local (1).py',
            path_lower: '/new_for_hello/helloworld_from_local (1).py',
            path_display: '/new_for_hello/helloworld_from_local (1).py',
            id: 'id:iErhtecd8ycAAAAAAAAAVA',
            client_modified: '2025-06-22T17:11:58Z',
            server_modified: '2025-06-22T17:11:58Z',
            rev: '016382c3163251400000002eadb4303',
            size: 50,
            is_downloadable: true,
            content_hash: 'c72988b5e67ddbbd91e95b9c902088ed8d6de48924e803e20ba66fb6054fd058'
        },
        {
            '.tag': 'file',
            name: 'Resume.txt',
            path_lower: '/my-resume/resume.txt',
            path_display: '/my-resume/Resume.txt',
            id: 'id:iErhtecd8ycAAAAAAAAATg',
            client_modified: '2025-06-22T03:34:45Z',
            server_modified: '2025-06-24T20:29:26Z',
            rev: '01638572f3f159700000002eadb4303',
            size: 0,
            is_downloadable: true,
            content_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        },
        {
            '.tag': 'file',
            name: 'Intern',
            path_lower: '/intern',
            path_display: '/Intern',
            id: 'id:iErhtecd8ycAAAAAAAAAVQ',
            client_modified: '2025-06-26T00:24:36Z',
            server_modified: '2025-06-26T00:24:36Z',
            rev: '016386e962604d100000002eadb4303',
            size: 23833,
            is_downloadable: true,
            content_hash: 'ea656cde8114966df20b21eec861b8be198aa754ab4a2c3d5bf986e83ccf7dcb'
        }
    ],
};

const existingFolderPaths = [
    '',
    '/temp1',
    '/test1',
    '/test1/test2',
    '/test1/test2/test3',
    '/test1/test3',
    '/test1/test3/test3',
    '/test1/test2/test3/test4',
    '/new_for_hello',
    '/test-see',
    '/my-resume'
];


const mockDropbox = {
    filesListFolder: jest.fn(({ path, recursive = false, include_media_info = false, include_deleted = false }) => {
        console.log('Mocked filesListFolder called with path:', path, 'recursive:', recursive);
        if (!existingFolderPaths.includes(path)) {
            return Promise.reject(new Error('Folder not found'));
        }
        let response;
        if (recursive) {
            response = {
                result: {
                    entries: mockFileSystem.entries.filter(entry => {
                        if (path === '' || path === '/') {
                            return true; // Root path
                        }
                        return entry.path_lower.startsWith(path.toLowerCase());
                    }),
                    has_more: false,
                    cursor: '',
                }
            };
        } else {
            response = {
                result: {
                    entries: mockFileSystem.entries.filter(entry => {
                        // get immediate children of the specified path
                        return entry.path_lower.startsWith(path.toLowerCase()) && entry.path_lower.split('/').length === path.split('/').length + 1;
                    }),
                    has_more: false,
                    cursor: '',
                }
            };
        }
        return Promise.resolve(response);
    }),
    filesGetMetadata: jest.fn(({ path }) => {
        return Promise.resolve({
            result: mockFileSystem.entries.find(entry => entry.path_lower === path.toLowerCase()) || null
        });
    }),
    filesDeleteV2: jest.fn(({ path }) => {
        // remove the file or folder from the mock file system
        // check if the path exists
        const entry = mockFileSystem.entries.find(entry => entry.path_lower === path.toLowerCase());
        if (!entry) {
            return Promise.reject(new Error('File not found'));
        }
        mockFileSystem.entries = mockFileSystem.entries.filter(entry => entry.path_lower !== path.toLowerCase());
        return Promise.resolve({
            result: {
                result: mockFileSystem.entries.some(entry => entry.path_lower === path.toLowerCase()) ? "deleted" : "not_found"
            }
        });
    }),
    filesUpload: jest.fn(({ path, contents }) => {
        return Promise.resolve({
            result: {
                name: path.split('/').pop(),
                path_lower: path.toLowerCase(),
                id: `id:iErhtecd8yc${Math.random().toString(36).substring(2, 15)}`,
                client_modified: new Date().toISOString(),
                server_modified: new Date().toISOString(),
                size: contents.length,
                is_downloadable: true,
                content_hash: 'mocked_content_hash'
            }
        });
    }),
    filesCreateFolderV2: jest.fn(({ path, autorename }) => {
        // implement
        const newFolder = {
            '.tag': 'folder',
            name: path.split('/').pop(),
            path_lower: path.toLowerCase(),
            path_display: path,
            id: `id:iErhtecd8yc${Math.random().toString(36).substring(2, 15)}`
        };
        mockFileSystem.entries.push(newFolder);
        return Promise.resolve({
            result: newFolder
        });
    }),
    usersGetCurrentAccount: jest.fn(),
}

jest.mock('dropbox', () => ({
    Dropbox: jest.fn(() => mockDropbox),
}));


jest.mock('node-fetch', () => ({
    __esModule: true,
    default: jest.fn((url, options: any) => {

        const content = Buffer.from('Test file content');
        if (url === 'https://content.dropboxapi.com/2/files/download') {
            // check if the path provided in options matches any file in the mock file system
            const path = options.headers['Dropbox-API-Arg'] ? JSON.parse(options.headers['Dropbox-API-Arg']).path : '';
            const file = mockFileSystem.entries.find(entry => entry.path_lower === path.toLowerCase());
            if (!file) {
                return Promise.reject(new Error('File not found'));
            }
            console.log('Mocked fetch for download');
            return Promise.resolve({
                ok: true,
                arrayBuffer: () => Promise.resolve(content.buffer),
            });
        }
        if (url === 'https://api.dropboxapi.com/2/files/get_metadata') {
            console.log('Mocked fetch for get_metadata');
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ name: 'test.txt', path_lower: '/test.txt' }),
            });
        }
        if (url === 'https://content.dropboxapi.com/2/files/upload') {
            console.log('Mocked fetch for upload');
            // add file into mock file system
            const filePath = options.headers['Dropbox-API-Arg'].match(/"path":"([^"]+)"/)[1];
            const fileName = filePath.split('/').pop();
            // check if the folder path exists
            const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
            console.log('Mocked fetch for upload:', filePath, folderPath, fileName);
            const folderExists = folderPath.length === 0 || existingFolderPaths.includes(folderPath);
            if (!folderExists) {
                return Promise.reject(new Error('Folder does not exist'));
            }
            const fileContent = options.body;
            mockFileSystem.entries.push({
                '.tag': 'file',
                name: filePath.split('/').pop(),
                path_lower: filePath.toLowerCase(),
                path_display: fileName,
                id: `id:iErhtecd8yc${Math.random().toString(36).substring(2, 15)}`,
                client_modified: new Date().toISOString(),
                server_modified: new Date().toISOString(),
                rev: 'mocked_rev',
                size: fileContent.length,
                is_downloadable: true,
                content_hash: 'mocked_content_hash',
            });
            console.log('Mocked fetch for upload:', fileName, fileContent);
            return Promise.resolve({
                ok: true,
                text: "Test file Uploaded",
            });
        }
        return Promise.reject(new Error('Unknown API endpoint'));
    }),
}));

const initialMockFileSystem = {
    entries: [...mockFileSystem.entries.map(entry => ({ ...entry }))]
};

describe('DropboxStorage', () => {
    let storage: DropboxStorage;

    beforeEach(async () => {
        mockFileSystem.entries = [...initialMockFileSystem.entries.map(entry => ({ ...entry }))];

        storage = new DropboxStorage();
        storage.accountId = '<ACCOUNT_ID>';
        storage.client = mockDropbox as any;

        jest.spyOn(storage, 'initClient').mockImplementation(() => {
            return Promise.resolve();
        });

    });

    afterEach(() => {
        // Reset mock file system again if needed
        mockFileSystem.entries = [...initialMockFileSystem.entries.map(entry => ({ ...entry }))];
        // Clear all mocks
        jest.clearAllMocks();
    });

    test('readDir returns directory contents', async () => {
        const files = await storage.readDir('/');
        expect(files).toHaveLength(9); // Adjust based on mock data
        expect(files.some(f => f.name === 'temp1')).toBe(true);
    });

    test('readFile returns file content', async () => {
        const content = await storage.readFile('/helloworld_from_local.py');
        expect(content).toContain('Test file content');
    });

    test('createDirectory creates new folder', async () => {
        await storage.createDirectory('/NewFolder');

        // Verify the folder was created
        const files = await storage.readDir('/');
        expect(files.find(f => f.name === 'NewFolder')).toBeDefined();
    });

    test('getFile returns file content', async () => {
        const file = await storage.getFile('/aseem.jpg');
        expect(file.content!.toString()).toContain('Test file content');
        expect(file.type).toBe('image/jpeg');
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
        const fileInfo = await storage.getFileInfo('/aseem.jpg');
    });

    test('getDirectoryTree returns directory structure', async () => {
        const tree = await storage.getDirectoryTree('/');

        expect(tree).toBeDefined();
        expect(tree).toHaveLength(mockFileSystem.entries.length);
        expect(tree.some(f => f.name === 'temp1')).toBe(true);
        expect(tree.some(f => f.name === 'test1')).toBe(true);
        expect(tree.some(f => f.name === 'test2')).toBe(true);
        expect(tree.some(f => f.name === 'test3')).toBe(true);
    });

    test('calculateFolderSize returns total size of folder', async () => {
        const size = await storage.calculateFolderSize('/');
        // Should be 100 (test.txt) + 200 (Documents folder content)
        expect(size).toBe(5460954);
    });

    test('getDirectoryInfo returns folder info', async () => {
        const folderInfo = await storage.getDirectoryInfo('/test1');
        expect(folderInfo).toBeDefined();
        expect(folderInfo.name).toBe('test1');
    });

    test('deleteFile removes file', async () => {
        await storage.deleteFile('/aseem.jpg');

        const files = await storage.readDir('/');
        expect(files.find(f => f.name === 'aseem.jpg')).toBeUndefined();
    });

    test('deleteFile removes file in test1', async () => {
        await storage.deleteFile('/temp1/numpy_results.png');

        const files = await storage.readDir('/temp1');
        expect(files.find(f => f.name === 'numpy_results.png')).toBeUndefined();
    });

    // test search files
    test('searchFiles finds files matching pattern', async () => {
        const files = await storage.searchFiles('/', 'numpy_results.png', []);
        expect(files.some(f => f.name === 'numpy_results.png')).toBe(true);
    });

    describe('error handling', () => {
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