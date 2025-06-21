#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import { getFile, readDirectory, getConnectedCloudAccounts, searchFilesFromStorageAccount, createDirectory, postFile } from "../cloud/cloudManager"
import { CloudType } from "../../types/cloudType";
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { createServerMemory } from "./serverMemory";
import { getFileLocal, postFileLocal } from "../local/localFileSystem";
import { triggerChangeDirectoryOnAccountWindow, triggerGetFileOnRenderer, triggerOpenAccountWindow, triggerPostFileOnRenderer } from "../main";


export const createFsServer = async (allowedDirs: string[]) => {
  // Normalize all paths
  const allowedDirectories = allowedDirs.map(dir =>
    normalizePath(path.resolve(expandHome(dir)))
  );

  // Validate directories
  await Promise.all(allowedDirs.map(async (dir) => {
    try {
      const stats = await fs.stat(expandHome(dir));
      if (!stats.isDirectory()) {
        throw new Error(`${dir} is not a directory`);
      }
    } catch (error) {
      throw new Error(`Error accessing directory ${dir}: ${error}`);
    }
  }));

  // Server setup
  const server = new Server(
    {
      name: "secure-filesystem-server",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Server Memory setup
  const serverMemory = createServerMemory();

  // Normalize all paths consistently
  function normalizePath(p: string): string {
    return path.normalize(p);
  }

  function expandHome(filepath: string): string {
    if (filepath.startsWith('~/') || filepath === '~') {
      return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
  }

  // Security utilities
  async function validatePath(requestedPath: string): Promise<string> {
    const expandedPath = expandHome(requestedPath);
    const absolute = path.isAbsolute(expandedPath)
      ? path.resolve(expandedPath)
      : path.resolve(process.cwd(), expandedPath);

    const normalizedRequested = normalizePath(absolute);

    // Check if path is within allowed directories
    const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
    if (!isAllowed) {
      throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
    }

    // Handle symlinks by checking their real path
    try {
      const realPath = await fs.realpath(absolute);
      const normalizedReal = normalizePath(realPath);
      const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
      if (!isRealPathAllowed) {
        throw new Error("Access denied - symlink target outside allowed directories");
      }
      return realPath;
    } catch (error) {
      // For new files that don't exist yet, verify parent directory
      const parentDir = path.dirname(absolute);
      try {
        const realParentPath = await fs.realpath(parentDir);
        const normalizedParent = normalizePath(realParentPath);
        const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
        if (!isParentAllowed) {
          throw new Error("Access denied - parent directory outside allowed directories");
        }
        return absolute;
      } catch {
        throw new Error(`Parent directory does not exist: ${parentDir}`);
      }
    }
  }

  async function validateProvider(provider: string | undefined): Promise<CloudType> {
    if (!provider) {
      throw new Error("Provider is required for cloud storage operations");
    }
    
    if (provider.toLowerCase().includes('google')) {
      return CloudType.GoogleDrive;
    }
    if (provider.toLowerCase().includes('onedrive')) {
      return CloudType.OneDrive;
    }
    if (provider.toLowerCase().includes('dropbox')) {
      return CloudType.Dropbox;
    }
    throw new Error(`Invalid provider. Supported providers are: GoogleDrive, OneDrive, Dropbox`);
  }

  // Schema definitions
  const ReadFileArgsSchema = z.object({
    path: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const ReadMultipleFilesArgsSchema = z.object({
    paths: z.array(z.string()),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const WriteFileArgsSchema = z.object({
    path: z.string(),
    content: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const EditOperation = z.object({
    oldText: z.string().describe('Text to search for - must match exactly'),
    newText: z.string().describe('Text to replace with')
  });

  const EditFileArgsSchema = z.object({
    path: z.string(),
    edits: z.array(EditOperation),
    dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format')
  });

  const CreateDirectoryArgsSchema = z.object({
    path: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const ListDirectoryArgsSchema = z.object({
    path: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const DirectoryTreeArgsSchema = z.object({
    path: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const MoveFileArgsSchema = z.object({
    source: z.string(),
    destination: z.string(),
    source_provider: z.string().optional().describe('For only google, onedrive, dropbox. Must leave empty if local'), // Optional provider for cloud storage
    source_accountId: z.string().optional().describe('Must leave empty if local'), // Optional account ID for cloud storage
    destination_provider: z.string().optional().describe('For only google, onedrive, dropbox. Must leave empty if local'), // Optional provider for cloud storage
    destination_accountId: z.string().optional().describe('Must leave empty if local'), // Optional account ID for cloud storage
  });

  const SearchFilesArgsSchema = z.object({
    path: z.string(),
    pattern: z.string(),
    excludePatterns: z.array(z.string()).optional().default([]),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const GetFileInfoArgsSchema = z.object({
    path: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const GetConnectedAccountArgsSchema = z.object({
    provider: z.string() // Optional provider for cloud storage
  });

  const ToolInputSchema = ToolSchema.shape.inputSchema;
  type ToolInput = z.infer<typeof ToolInputSchema>;

  interface FileInfo {
    size: number;
    created: Date;
    modified: Date;
    accessed: Date;
    isDirectory: boolean;
    isFile: boolean;
    permissions: string;
  }



  // Tool implementations
  async function getFileStats(filePath: string): Promise<FileInfo> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      permissions: stats.mode.toString(8).slice(-3),
    };
  }

  async function searchFiles(
    rootPath: string,
    pattern: string,
    excludePatterns: string[] = []
  ): Promise<string[]> {
    const results: string[] = [];

    async function search(currentPath: string) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        try {
          // Validate each path before processing
          await validatePath(fullPath);

          // Check if path matches any exclude pattern
          const relativePath = path.relative(rootPath, fullPath);
          const shouldExclude = excludePatterns.some(pattern => {
            const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
            return minimatch(relativePath, globPattern, { dot: true });
          });

          if (shouldExclude) {
            continue;
          }

          if (pattern.includes('*')) {
            const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
            if (minimatch(entry.name, globPattern, { dot: true })) {
              results.push(fullPath);
            }
          } else if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
            results.push(fullPath);
          }

          if (entry.isDirectory()) {
            await search(fullPath);
          }
        } catch (error) {
          // Skip invalid paths during search
          continue;
        }
      }
    }

    await search(rootPath);
    return results;
  }

  // file editing and diffing utilities
  function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n');
  }

  function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
    // Ensure consistent line endings for diff
    const normalizedOriginal = normalizeLineEndings(originalContent);
    const normalizedNew = normalizeLineEndings(newContent);

    return createTwoFilesPatch(
      filepath,
      filepath,
      normalizedOriginal,
      normalizedNew,
      'original',
      'modified'
    );
  }

  async function applyFileEdits(
    filePath: string,
    edits: Array<{ oldText: string, newText: string }>,
    dryRun = false
  ): Promise<string> {
    // Read file content and normalize line endings
    const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));

    // Apply edits sequentially
    let modifiedContent = content;
    for (const edit of edits) {
      const normalizedOld = normalizeLineEndings(edit.oldText);
      const normalizedNew = normalizeLineEndings(edit.newText);

      // If exact match exists, use it
      if (modifiedContent.includes(normalizedOld)) {
        modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
        continue;
      }

      // Otherwise, try line-by-line matching with flexibility for whitespace
      const oldLines = normalizedOld.split('\n');
      const contentLines = modifiedContent.split('\n');
      let matchFound = false;

      for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
        const potentialMatch = contentLines.slice(i, i + oldLines.length);

        // Compare lines with normalized whitespace
        const isMatch = oldLines.every((oldLine, j) => {
          const contentLine = potentialMatch[j];
          return oldLine.trim() === contentLine.trim();
        });

        if (isMatch) {
          // Preserve original indentation of first line
          const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
          const newLines = normalizedNew.split('\n').map((line, j) => {
            if (j === 0) return originalIndent + line.trimStart();
            // For subsequent lines, try to preserve relative indentation
            const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
            const newIndent = line.match(/^\s*/)?.[0] || '';
            if (oldIndent && newIndent) {
              const relativeIndent = newIndent.length - oldIndent.length;
              return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
            }
            return line;
          });

          contentLines.splice(i, oldLines.length, ...newLines);
          modifiedContent = contentLines.join('\n');
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
      }
    }

    // Create unified diff
    const diff = createUnifiedDiff(content, modifiedContent, filePath);

    // Format diff with appropriate number of backticks
    let numBackticks = 3;
    while (diff.includes('`'.repeat(numBackticks))) {
      numBackticks++;
    }
    const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;

    if (!dryRun) {
      await fs.writeFile(filePath, modifiedContent, 'utf-8');
    }

    return formattedDiff;
  }

  // Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "read_file",
          description:
            "Read the complete contents of a file from the file system. " +
            "Handles various text encodings and provides detailed error messages " +
            "if the file cannot be read. Use this tool when you need to examine " +
            "the contents of a single file. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
        },
        {
          name: "read_multiple_files",
          description:
            "Read the contents of multiple files simultaneously. This is more " +
            "efficient than reading files one by one when you need to analyze " +
            "or compare multiple files. Each file's content is returned with its " +
            "path as a reference. Failed reads for individual files won't stop " +
            "the entire operation. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
        },
        {
          name: "write_file",
          description:
            "Create a new file or completely overwrite an existing file with new content. " +
            "Use with caution as it will overwrite existing files without warning. " +
            "Handles text content with proper encoding. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
        },
        {
          name: "edit_file",
          description:
            "Make line-based edits to a text file. Each edit replaces exact line sequences " +
            "with new content. Returns a git-style diff showing the changes made. " +
            "Only works within allowed directories.",
          inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
        },
        {
          name: "create_directory",
          description:
            "Create a new directory or ensure a directory exists. Can create multiple " +
            "nested directories in one operation. If the directory already exists, " +
            "this operation will succeed silently. Perfect for setting up directory " +
            "structures for projects or ensuring required paths exist. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
        },
        {
          name: "list_directory",
          description:
            "Get a detailed listing of all files and directories in a specified path. " +
            "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
            "prefixes. This tool is essential for understanding directory structure and " +
            "finding specific files within a directory. Only works within allowed directories" +
            "for local storage. If a provider and accountId are specified, " +
            "the home directory must be explicitly represented as a slash (/).",
          inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
        },
        {
          name: "directory_tree",
          description:
            "Get a recursive tree view of files and directories as a JSON structure. " +
            "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
            "Files have no children array, while directories always have a children array (which may be empty). " +
            "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
        },
        {
          name: "move_file",
          description:
            "Move or rename files and directories. Can move files between directories " +
            "and rename them in a single operation. If the destination exists, the " +
            "operation will fail. Works across different directories and can be used " +
            "for simple renaming within the same directory. Both source and destination must be within allowed directories." +
            "Can also move files between cloud storage accounts and local storage.",
          inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
        },
        {
          name: "search_files",
          description:
            "Recursively search for files and directories matching a pattern. " +
            "Searches through all subdirectories from the starting path. The search " +
            "is case-insensitive and matches partial names. Returns full paths to all " +
            "matching items. Great for finding files when you don't know their exact location. " +
            "Only searches within allowed directories.",
          inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
        },
        {
          name: "get_file_info",
          description:
            "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
            "information including size, creation time, last modified time, permissions, " +
            "and type. This tool is perfect for understanding file characteristics " +
            "without reading the actual content. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
        },
        {
          name: "list_allowed_directories",
          description:
            "Returns the list of directories that this server is allowed to access. " +
            "Use this to understand which directories are available before trying to access files.",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        {
          name: "list_connected_cloud_accounts",
          description:
            "Returns the list of connected cloud accounts for the current user." +
            "Use this to find an account to perform operations on cloud files." +
            "This includes accounts for Google Drive, OneDrive, and Dropbox.",
          inputSchema: zodToJsonSchema(GetConnectedAccountArgsSchema) as ToolInput,
        },
      ],
    };
  });


  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      switch (name) {

        // TODO implement
        case "read_file": {
          const parsed = ReadFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
          }
          const provider = parsed.data.provider;
          const accountId = parsed.data.accountId;
          // local storage
          if (!provider || !accountId) {
            const validPath = await validatePath(parsed.data.path);
            const content = await fs.readFile(validPath, "utf-8");
            return {
              content: [{ type: "text", text: content }],
            };
          }

          const filePath = parsed.data.path;
          if (!filePath) {
            throw new Error("File path is required for cloud storage operations");
          }

          // convert provider to cloud type
          const cloudType = await validateProvider(provider);

          // read file from the cloud storage
          const response = await getFile(cloudType, accountId, filePath);

          if (!response) {
            throw new Error(`File not found: ${filePath}`);
          }
          
          return {
            content: [{ type: "text", text: response.content?.toString('utf-8') || '' }],
          };
        }
        // TODO: implement read_multiple_files for cloud storage
        case "read_multiple_files": {
          const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
          }

          const provider = parsed.data.provider;
          const accountId = parsed.data.accountId;
          // local storage
          if (!provider || !accountId) {
            const results = await Promise.all(
              parsed.data.paths.map(async (filePath: string) => {
                try {
                  const validPath = await validatePath(filePath);
                  const content = await fs.readFile(validPath, "utf-8");
                  return `${filePath}:\n${content}\n`;
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  return `${filePath}: Error - ${errorMessage}`;
                }
              }),
            );
            return {
              content: [{ type: "text", text: results.join("\n---\n") }],
            };
          }

          // cloud storage
          const filePaths = parsed.data.paths;
          if (!filePaths || filePaths.length === 0) {
            throw new Error("File paths are required for cloud storage operations");
          }
          // convert provider to cloud type
          const cloudType = await validateProvider(provider);
          // read multiple files from the cloud storage
          const fileContents: FileContent[] = await Promise.all(
            filePaths.map(async (filePath) => {
              const response = await getFile(cloudType, accountId, filePath);
              if (!response) {
                throw new Error(`File not found: ${filePath}`);
              }
              return {
                name: response.name,
                content: response.content,
                type: response.type,
                url: response.url,
                path: filePath,
                sourceCloudType: cloudType,
                sourceAccountId: accountId,
              };
            })
          );

          return {
            content: [{ type: "text", text: (fileContents.map(file =>
              `${file.name}:\n${file.content?.toString('utf-8') || ''}\n`
            )).join("\n---\n") }],
          };
        }

        // TODO: implement write_multiple_files for cloud storage
        case "write_file": {
          const parsed = WriteFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
          }
          const validPath = await validatePath(parsed.data.path);
          await fs.writeFile(validPath, parsed.data.content, "utf-8");
          return {
            content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
          };
        }

        case "edit_file": {
          const parsed = EditFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
          }
          const validPath = await validatePath(parsed.data.path);
          const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
          return {
            content: [{ type: "text", text: result }],
          };
        }

        // TODO: implement create_directory for cloud storage
        case "create_directory": {
          const parsed = CreateDirectoryArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
          }
          const provider = parsed.data.provider;
          const accountId = parsed.data.accountId;
          // local storage
          if (!provider || !accountId) {
            const validPath = await validatePath(parsed.data.path);
            await fs.mkdir(validPath, { recursive: true });
            return {
              content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
            };
          }

          // cloud storage
          const directoryPath = parsed.data.path;
          if (!directoryPath) {
            throw new Error("Directory path is required for cloud storage operations");
          }
          // convert provider to cloud type
          const cloudType = await validateProvider(provider);
          // create directory in the cloud storage
          try {
            await createDirectory(cloudType, accountId, directoryPath); // This will create the directory if it doesn't exist
            return {
              content: [{ type: "text", text: `Successfully created directory ${directoryPath}` }],
            };
          } catch (error) {
            console.error('Error creating directory in cloud storage:', error);
            throw new Error(`Failed to create directory ${directoryPath} in cloud storage: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // DONE
        case "list_directory": {
          const parsed = ListDirectoryArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
          }
          const provider = await parsed.data.provider;
          const accountId = await parsed.data.accountId;
          // local storage
          if (!provider || !accountId) {
            const validPath = await validatePath(parsed.data.path);
            const entries = await fs.readdir(validPath, { withFileTypes: true });
            const formatted = entries
              .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
              .join("\n");
            return {
              content: [{ type: "text", text: formatted }],
            };
          }

          // cloud storage
          const directoryPath = parsed.data.path;
          if (!directoryPath) {
            throw new Error("File path is required for cloud storage operations");
          }
          // convert provider to cloud type
          const cloudType = await validateProvider(provider);
          // list directory from the cloud storage
          const fileSystemItems: FileSystemItem[] = await readDirectory(cloudType, accountId, directoryPath);

          if (!fileSystemItems) {
            throw new Error(`Directory not found or empty: ${directoryPath}`);
          }

          const formatted = fileSystemItems
            .map((item) => `${item.isDirectory ? "[DIR]" : "[FILE]"} ${item.name}`)
            .join("\n");
          return {
            content: [{ type: "text", text: formatted }],
          };
        }

        // TODO: implement directory_tree for cloud storage
        case "directory_tree": {
          const parsed = DirectoryTreeArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
          }

          interface TreeEntry {
            name: string;
            type: 'file' | 'directory';
            children?: TreeEntry[];
          }

          async function buildTree(currentPath: string): Promise<TreeEntry[]> {
            const validPath = await validatePath(currentPath);
            const entries = await fs.readdir(validPath, { withFileTypes: true });
            const result: TreeEntry[] = [];

            for (const entry of entries) {
              const entryData: TreeEntry = {
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file'
              };

              if (entry.isDirectory()) {
                const subPath = path.join(currentPath, entry.name);
                entryData.children = await buildTree(subPath);
              }

              result.push(entryData);
            }

            return result;
          }

          const treeData = await buildTree(parsed.data.path);
          return {
            content: [{
              type: "text",
              text: JSON.stringify(treeData, null, 2)
            }],
          };
        }

        // TODO implement
        case "move_file": {
          const parsed = MoveFileArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
          }
          // move files within local storage
          if (!parsed.data.source_provider && !parsed.data.destination_provider) {
            const validSourcePath = await validatePath(parsed.data.source);
            const validDestPath = await validatePath(parsed.data.destination);
            await fs.rename(validSourcePath, validDestPath);
            return {
              content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
            };
          }

          // move files include at least one cloud storage
          const sourceProvider = parsed.data.source_provider;
          const destinationProvider = parsed.data.destination_provider;
          let dataToMove: FileContent | null;
          if (!sourceProvider) {
            // source is local storage
            const validSourcePath = await validatePath(parsed.data.source);
            // dataToMove = await getFileLocal(validSourcePath);
            await triggerGetFileOnRenderer([parsed.data.source]);
          } else {
            // source is cloud storage
            const cloudType = await validateProvider(sourceProvider);
            if (!parsed.data.source_accountId) {
              throw new Error("Source account ID is required for cloud storage operations");
            }
            console.log(`Fetching file from cloud storage: ${parsed.data.source} on ${sourceProvider}:${parsed.data.source_accountId}`);
            await triggerGetFileOnRenderer([parsed.data.source], cloudType, parsed.data.source_accountId);
            // dataToMove = await getFile(cloudType, parsed.data.source_accountId, parsed.data.source);
          }

          // if (!dataToMove || !dataToMove.content) {
          //   throw new Error(`File not found: ${parsed.data.source}`);
          // }

          // Now we have the data to move, we can proceed with the destination
          if (!destinationProvider) {
            // destination is local storage
            const validDestPath = await validatePath(parsed.data.destination);
            const destFolder = path.dirname(validDestPath);
            const destFileName = path.basename(validDestPath);
            // const response = await postFileLocal(destFileName, destFolder, dataToMove.content);
            await triggerPostFileOnRenderer(destFolder, undefined, undefined, destFileName);
            await triggerChangeDirectoryOnAccountWindow(destFolder, undefined, undefined);
            if (!sourceProvider) {
              return {
                content: [{ type: "text", text: `Successfully moved ${parsed.data.source} from local storage to ${parsed.data.destination}` }],
              };
            } else {
              return {
                content: [{ type: "text", text: `Successfully moved ${parsed.data.source} from ${sourceProvider}:${parsed.data.source_accountId} to ${parsed.data.destination}` }],
              };
            }
          } else {
            // destination is cloud storage
            if (!parsed.data.destination_accountId) {
              throw new Error("Destination account ID is required for cloud storage operations");
            }
            const cloudType = await validateProvider(destinationProvider);
            const destFolder = path.dirname(parsed.data.destination);
            const destFileName = path.basename(parsed.data.destination);
            // post file to the cloud storage
            await createDirectory(cloudType, parsed.data.destination_accountId, destFolder); // Ensure the destination directory exists
            // await postFile(cloudType, parsed.data.destination_accountId, destFileName, destFolder, dataToMove.content);
            await triggerPostFileOnRenderer(destFolder, cloudType, parsed.data.destination_accountId, destFileName);

            // await triggerChangeDirectoryOnAccountWindow(destFolder, cloudType, parsed.data.destination_accountId);
            if (!sourceProvider) {
              return {
                content: [{ type: "text", text: `Successfully moved ${parsed.data.source} from local storage to ${parsed.data.destination} on ${destinationProvider}:${parsed.data.destination_accountId}` }],
              };
            } else {
              return {
                content: [{ type: "text", text: `Successfully moved ${parsed.data.source} from ${sourceProvider}:${parsed.data.source_accountId} to ${parsed.data.destination} on ${destinationProvider}:${parsed.data.destination_accountId}` }],
              };
            }
          }
        }

        // TODO implement the case when pattern is given as regex...
        case "search_files": {
          const parsed = SearchFilesArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
          }
          const provider = parsed.data.provider;
          const accountId = parsed.data.accountId;
          if (!provider || !accountId) {
            // local storage
            const validPath = await validatePath(parsed.data.path);
            const results = await searchFiles(validPath, parsed.data.pattern, parsed.data.excludePatterns);
            return {
              content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
            };
          }

          const directoryPath = parsed.data.path;
          const cloudType = await validateProvider(provider);
          // search files in the cloud storage
          const cloudResults: FileSystemItem[] = await searchFilesFromStorageAccount(cloudType, accountId, directoryPath, parsed.data.pattern, parsed.data.excludePatterns);
          if (!cloudResults || cloudResults.length === 0) {
            return {
              content: [{ type: "text", text: "No matches found" }],
            };
          }
          // get the paths of the files
          const formattedResults = cloudResults
            .map(item => `${item.path}`)
            .join("\n");
          return {
            content: [{ type: "text", text: formattedResults }],
          };
        }

        // TODO: implement
        case "get_file_info": {
          const parsed = GetFileInfoArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
          }
          const validPath = await validatePath(parsed.data.path);
          const info = await getFileStats(validPath);
          return {
            content: [{
              type: "text", text: Object.entries(info)
                .map(([key, value]) => `${key}: ${value}`)
                .join("\n")
            }],
          };
        }

        case "list_allowed_directories": {
          return {
            content: [{
              type: "text",
              text: `Allowed directories:\n${allowedDirectories.join('\n')}`
            }],
          };
        }

        // DONE
        case "list_connected_cloud_accounts": {
          const parsed = GetConnectedAccountArgsSchema.safeParse(args);
          if (!parsed.success) {
            throw new Error(`Invalid arguments for list_connected_cloud_accounts: ${parsed.error}`);
          }
          const cloudType = await validateProvider(parsed.data.provider);
          const connectedAccounts = await getConnectedCloudAccounts(cloudType);
          if (!connectedAccounts || connectedAccounts.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No connected cloud accounts found for provider: ${parsed.data.provider}`
              }],
            };
          }
          return {
            content: [{
              type: "text",
              text: `Connected cloud accounts:\n${connectedAccounts.join('\n')}`
            }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  return server;
};
