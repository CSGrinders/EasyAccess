const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('@playwright/test');

test.describe('MCP Tools for Local File System Access', () => {
  let electronApp: any;
  let window: any;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({ args: ['dist/main/main.js'] });
    // Get the first window
    window = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('list_directory', async () => {

    // Verify the window loads the correct localhost URL
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          //processQueryTest: (toolName: string, toolArgs: { [x: string]: unknown })
          window.mcpApi.processQueryTest('list_directory', { path: '/Users/hojinsohn/Documents' }).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

  test('read_file', async () => {

    // Verify the window loads the correct localhost URL
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          //processQueryTest: (toolName: string, toolArgs: { [x: string]: unknown })
          window.mcpApi.processQueryTest('read_file', { path: '/Users/hojinsohn/Documents/knn.py' }).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

  test('search_files', async () => {
    // Verify the window loads the correct localhost URL
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          //processQueryTest: (toolName: string, toolArgs: { [x: string]: unknown })
          window.mcpApi.processQueryTest('search_files', { path: '/Users/hojinsohn/Documents', pattern: 'knn' }).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

  test('create_directory', async () => {
    // Verify the window loads the correct localhost URL
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          //processQueryTest: (toolName: string, toolArgs: { [x: string]: unknown })
          window.mcpApi.processQueryTest('create_directory', { path: '/Users/hojinsohn/Documents/yeyeTest' }).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

  test('list_connected_cloud_accounts', async () => {
    // Verify the window loads the correct localhost URL
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          //processQueryTest: (toolName: string, toolArgs: { [x: string]: unknown })
          window.mcpApi.processQueryTest('list_connected_cloud_accounts', {provider: 'google'}).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });
  test('directory_tree', async () => {
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          window.mcpApi.processQueryTest('directory_tree', {
            path: '/Users/hojinsohn/Documents',
            depth: 2
          }).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

  test('get_folder_info', async () => {
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          window.mcpApi.processQueryTest('get_folder_info', {
            path: '/Users/hojinsohn/Documents'
          }).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

  test('get_file_info', async () => {
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          window.mcpApi.processQueryTest('get_file_info', {
            path: '/Users/hojinsohn/Documents/knn.py'
          }).then((response: any) => {
            resolve(response);
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

  test('move_file', async () => {
    await expect(window).toHaveURL('http://localhost:3000/');

    const ipcResult = await window.evaluate(() => {
      return new Promise((resolve) => {
        try {
          window.mcpApi.processQueryTest('move_file', {
            source: '/Users/hojinsohn/Documents/EasyAccess-test/presentation.pdf',
            destination: '/Users/hojinsohn/Documents/EasyAccess-test2/presentation.pdf',
          }).then((response: any) => {
            window.mcpApi.processQueryTest('move_file', {
              source: '/Users/hojinsohn/Documents/EasyAccess-test2/presentation.pdf',
              destination: '/Users/hojinsohn/Documents/EasyAccess-test/presentation.pdf',
            }).then((response: any) => {
              resolve(response);
            });
          });
        } catch (error) {
          console.error("Error in IPC call:", error);
          resolve({ isError: true, error: error });
        }
      });
    });

    console.log('IPC Result:', ipcResult);
    expect(ipcResult.isError).toBe(undefined, `IPC call failed: ${ipcResult.error || 'Unknown error'}`);
  });

});
