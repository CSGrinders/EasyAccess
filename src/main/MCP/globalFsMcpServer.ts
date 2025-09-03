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
import { getFile, readDirectory, getConnectedCloudAccounts, getDirectoryInfo, searchFilesFromStorageAccount, createDirectory, postFile, getFileInfo, getDirectoryTree, readFile } from "../cloud/cloudManager"
import { CloudType } from "../../types/cloudType";
import { FileContent, FileSystemItem } from "../../types/fileSystem";
import { createServerMemory } from "./serverMemory";
import { createDirectoryLocal, getDirectoryInfoLocal, getFileLocal, postFileLocal, readFileLocal } from "../local/localFileSystem";
import { triggerChangeDirectoryOnAccountWindow, triggerGetFileOnRenderer, triggerOpenAccountWindow, triggerPostFileOnRenderer, triggerRequestClarification, triggerTransferFileOnRenderer } from "../main";
import { CLOUD_HOME } from "../../types/cloudType";


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

  const MoveFileBatchArgsSchema = z.object({
    sources: z.array(z.string()).describe("Array of source file's full paths"),
    destination: z.string().describe("Destination folder path where files will be moved to"),
    source_provider: z.string().optional().describe('For only google, onedrive, dropbox. Must leave empty if local'), // Optional provider for cloud storage
    source_accountId: z.string().optional().describe('Must leave empty if local'), // Optional account ID for cloud storage
    destination_provider: z.string().optional().describe('For only google, onedrive, dropbox. Must leave empty if local'), // Optional provider for cloud storage
    destination_accountId: z.string().optional().describe('Must leave empty if local'), // Optional account ID for cloud storage
  });

  const SearchFilesArgsSchema = z.object({
    path: z.string(),
    patterns: z.array(z.string()).describe("Use wildcards like *.txt or specific names like 'report'"),
    excludePatterns: z.array(z.string()).optional().default([]),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const GetFileInfoArgsSchema = z.object({
    path: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const GetFolderInfoArgsSchema = z.object({
    path: z.string(),
    provider: z.string().optional(), // Optional provider for cloud storage
    accountId: z.string().optional(), // Optional account ID for cloud storage
  });

  const GetConnectedAccountArgsSchema = z.object({
    provider: z.string() // Optional provider for cloud storage
  });

  const RequestClarificationArgsSchema = z.object({
    question: z.string().describe('Question to ask the user'),
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
            "the contents of a single file. Only works within allowed directories. Should not " +
            "be used for large files or binary data such as images or videos.",
          inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
        },
        {
          name: "read_multiple_files",
          description:
            "Read the contents of multiple files simultaneously. This is more " +
            "efficient than reading files one by one when you need to analyze " +
            "or compare multiple files. Each file's content is returned with its " +
            "path as a reference. Failed reads for individual files won't stop " +
            "the entire operation. Only works within allowed directories. Should not " +
            "be used for large files or binary data such as images or videos.",
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
        // {
        //   name: "edit_file",
        //   description:
        //     "Make line-based edits to a text file. Each edit replaces exact line sequences " +
        //     "with new content. Returns a git-style diff showing the changes made. " +
        //     "Only works within allowed directories. Only supports local storage.",
        //   inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
        // },
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
            "and rename them in a single operation. Check if the destination folder exists first before calling this tool." +
            "If the destination file exists, the operation will fail. Works across different directories and can be used " +
            "for simple renaming within the same directory. Both source and destination must be within allowed directories." +
            "Can also move files between cloud storage accounts and local storage.",
          inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
        },
        {
          name: "move_file_batch",
          description:
            "Moves multiple files in a batch. Each source file must be specified by its full path. " +
            "All source files must come from the same provider and account (or from local storage). Mixing files from different accounts or mixing cloud and local storage is not allowed. " +
            "The destination must be a single folder within one target provider/account (or local storage).",
          inputSchema: zodToJsonSchema(MoveFileBatchArgsSchema) as ToolInput,
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
          name: "get_folder_info",
          description:
            "Retrieve detailed metadata about a folder. Returns comprehensive " +
            "information including size, creation time, last modified time, permissions, " +
            "and type. This tool is perfect for understanding folder characteristics " +
            "without reading the actual content. Only works within allowed directories.",
          inputSchema: zodToJsonSchema(GetFolderInfoArgsSchema) as ToolInput,
        },
        // this schema is not accessible from the claude api as injected in system prompt
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
        // Injected in system prompt so no need to define here
        // {
        //   name: "list_connected_cloud_accounts",
        //   description:
        //     "Retrieve all connected cloud accounts (Google Drive, OneDrive, Dropbox) for the current user. " +
        //     "Use this tool when you need to identify which accounts are available before performing any cloud file operations. " +
        //     "This should be called proactively if a user requests an action involving cloud storage but has not specified an account.",
        //   inputSchema: zodToJsonSchema(GetConnectedAccountArgsSchema) as ToolInput,
        // },    
        {
          name: "get_information_from_user",
          description:
            "Use this tool to ask the user for clarification — specifically when the request is ambiguous, incomplete, or cannot be resolved using available data and tools. " +
            "Do NOT use this tool if the information can be inferred or retrieved through tool calls (e.g., connected accounts, folder listings, file searches). " +
            "If clarification is truly needed, this tool **must be used instead of ending the conversation with a question or failing to act**.",
          inputSchema: zodToJsonSchema(RequestClarificationArgsSchema) as ToolInput
        }
      ],
    };
  });

  async function handleReadFileTool(args: any) {
    const parsed = ReadFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
    }
    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;
    // local storage
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
      const validPath = await validatePath(parsed.data.path);
      const content = await readFileLocal(validPath);
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
    try {
      const content = await readFile(cloudType, accountId, filePath);

      if (!content) {
        throw new Error(`File not found: ${filePath}`);
      }

      return {
        content: [{ type: "text", text: content || '' }],
      };
    } catch (error) {
      console.error('Error reading file from cloud storage:', error);
      throw new Error(`Failed to read file ${filePath} from cloud storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async function handleReadMultipleFilesTool(args: any) {
    const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
    }

    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;
    // local storage
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
      const results = await Promise.all(
        parsed.data.paths.map(async (filePath: string) => {
          try {
            const validPath = await validatePath(filePath);
            const content = await readFileLocal(validPath);
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
    const fileContents: string[] = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const content = await readFile(cloudType, accountId, filePath);
          if (!content) {
            throw new Error(`File not found: ${filePath}`);
          }
          return content;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return `${filePath}: Error - ${errorMessage}`;
        }
      })
    );

    return {
      content: [{ type: "text", text: fileContents.join("\n---\n") }],
    };
  }
  async function handleWriteFileTool(args: any) {
    const parsed = WriteFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
    }

    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;

    // local storage
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
      const validPath = await validatePath(parsed.data.path);
      await fs.writeFile(validPath, parsed.data.content, "utf-8");
      return {
        content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
      };
    }

    // cloud storage
    const filePath = parsed.data.path;
    if (!filePath) {
      throw new Error("File path is required for cloud storage operations");
    }

    const cloudType = await validateProvider(provider);
    const fileName = path.basename(filePath);
    const folderPath = path.dirname(filePath);
    const data = Buffer.from(parsed.data.content, 'utf-8');

    try {
      await postFile(cloudType, accountId, fileName, folderPath, data);
      return {
        content: [{ type: "text", text: `Successfully wrote to ${filePath} in cloud storage` }],
      };
    } catch (error) {
      console.error('Error writing file to cloud storage:', error);
      throw new Error(`Failed to write file ${filePath} to cloud storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async function handleCreateDirectoryTool(args: any) {
    const parsed = CreateDirectoryArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
    }
    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;
    // local storage
    // need to change this to use createDirectoryLocal? TODO
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
      const validPath = await validatePath(parsed.data.path);
      await createDirectoryLocal(validPath);
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

  async function handleListConnectedCloudAccountsTool(args: any) {
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

  async function handleListAllowedDirectoriesTool(args: any) {
    return {
      content: [{
        type: "text",
        text: `Allowed directories:\n${allowedDirectories.join('\n')}`
      }],
    };
  }

  async function handleListDirectoryTool(args: any) {
    const parsed = ListDirectoryArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
    }
    const provider = await parsed.data.provider;
    const accountId = await parsed.data.accountId;
    // local storage
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
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

  async function handleDirectoryTreeTool(args: any) {
    const parsed = DirectoryTreeArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
    }

    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;

    // local storage
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
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

    // cloud storage
    const directoryPath = parsed.data.path;
    if (!directoryPath) {
      throw new Error("Directory path is required for cloud storage operations");
    }

    const cloudType = await validateProvider(provider);
    const fileSystemItems: FileSystemItem[] = await getDirectoryTree(cloudType, accountId, directoryPath);

    if (!fileSystemItems) {
      throw new Error(`Directory not found or empty: ${directoryPath}`);
    }

    console.log("fileSystemItems", fileSystemItems);

    // Convert FileSystemItem[] to tree structure
    interface TreeEntry {
      name: string;
      type: 'file' | 'directory';
      children?: TreeEntry[];
    }

    function buildTreeFromItems(items: FileSystemItem[], basePath: string): TreeEntry[] {
      const tree: TreeEntry[] = [];
      const itemMap = new Map<string, FileSystemItem>();

      // Create a map of items by their full path
      for (const item of items) {
        const relativePath = item.path.replace(CLOUD_HOME + basePath, '').replace(/^\//, '');
        if (relativePath) {
          itemMap.set(relativePath, item);
        }
      }

      // Build tree structure
      for (const item of items) {
        const relativePath = item.path.replace(CLOUD_HOME + basePath, '').replace(/^\//, '');
        if (!relativePath) continue;

        const pathParts = relativePath.split('/');
        let currentLevel = tree;
        let currentPath = '';

        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          currentPath = currentPath ? `${currentPath}/${part}` : part;

          let existingNode = currentLevel.find(node => node.name === part);
          if (!existingNode) {
            const item = itemMap.get(currentPath);
            if (item) {
              existingNode = {
                name: part,
                type: item.isDirectory ? 'directory' : 'file',
                children: item.isDirectory ? [] : undefined
              };
              currentLevel.push(existingNode);
            }
          }

          if (existingNode && existingNode.children && i < pathParts.length - 1) {
            currentLevel = existingNode.children;
          }
        }
      }

      return tree;
    }

    const treeData = buildTreeFromItems(fileSystemItems, directoryPath);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(treeData, null, 2)
      }],
    };
  }

  async function handleMoveFileBatchTool(args: any) {
    const parsed = MoveFileBatchArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for move_file_batch: ${parsed.error}`);
    }

    const sources = parsed.data.sources;
    const destinationParent = parsed.data.destination;

    for (const source of sources) {
      console.log('Source:', source);
    }
    console.log('Destination Parent:', destinationParent);

    // move files within local storage
    if (!parsed.data.source_provider && !parsed.data.destination_provider) {
      for (const source of sources) {
        const validSourcePath = await validatePath(source);
        const validDestParentPath = await validatePath(destinationParent);
        const validDestPath = path.join(validDestParentPath, path.basename(source));
        await fs.rename(validSourcePath, validDestPath);
      }
      return {
        content: [{ type: "text", text: `Successfully moved ${sources.join(", ")} to ${destinationParent}` }],
      };
    }

    // move files include at least one cloud storage
    let sourceProvider = parsed.data.source_provider;
    let destinationProvider = parsed.data.destination_provider;
    let sourceCloudType: CloudType | undefined;
    let destinationCloudType: CloudType | undefined;
    let sourceAccountId = parsed.data.source_accountId;
    let destinationAccountId = parsed.data.destination_accountId;

    if (sourceProvider) {
      if (!sourceAccountId) {
        throw new Error("Source account ID is required for cloud storage operations");
      }
      sourceCloudType = await validateProvider(sourceProvider);
    }

    if (destinationProvider) {
      if (!destinationAccountId) {
        throw new Error("Destination account ID is required for cloud storage operations");
      }
      destinationCloudType = await validateProvider(destinationProvider);
      const validDestParentPath = await validatePath(parsed.data.destination);
      try {
        await createDirectory(destinationCloudType, destinationAccountId, validDestParentPath); // Ensure the destination directory exists
      } catch (error) {
        console.log('Error creating directory in cloud storage:', error);
      }
    } else {
      // destination is local storage
      const validDestParentPath = await validatePath(parsed.data.destination);
      try {
        await createDirectoryLocal(validDestParentPath); // Ensure the destination directory exists
      } catch (error) {
        if (error instanceof Error && error.message.includes("Directory already exists")) {
          // Directory already exists, no action needed
          console.log(`Directory already exists: ${validDestParentPath}. No creation needed.`);
        }
      }
    }

    // Invoke the file transfer function in the renderering part
    for (const source of sources) {
      const destination = path.join(destinationParent, path.basename(source));
      triggerTransferFileOnRenderer(
        sourceCloudType,
        destinationCloudType,
        sourceAccountId,
        destinationAccountId,
        source,
        destination
      );
    }

    return {
      content: [{ type: "text", text: `Successfully start moving ${sources.join(", ")} from ${sourceProvider}:${sourceAccountId} to ${destinationParent}:${destinationProvider}:${destinationAccountId}. Might take a while depending on the file size.` }],
    };
  }

  async function handleMoveFileTool(args: any) {
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
    let sourceProvider = parsed.data.source_provider;
    let destinationProvider = parsed.data.destination_provider;
    let sourceCloudType: CloudType | undefined;
    let destinationCloudType: CloudType | undefined;
    let sourceAccountId = parsed.data.source_accountId;
    let destinationAccountId = parsed.data.destination_accountId;

    if (sourceProvider) {
      if (!sourceAccountId) {
        throw new Error("Source account ID is required for cloud storage operations");
      }
      sourceCloudType = await validateProvider(sourceProvider);
    }

    if (destinationProvider) {
      if (!destinationAccountId) {
        throw new Error("Destination account ID is required for cloud storage operations");
      }
      destinationCloudType = await validateProvider(destinationProvider);
      const destFolder = path.dirname(parsed.data.destination);
      try {
        await createDirectory(destinationCloudType, destinationAccountId, destFolder); // Ensure the destination directory exists
      } catch (error) {
        console.log('Error creating directory in cloud storage:', error);
      }
    } else {
      // destination is local storage
      const validDestPath = await validatePath(parsed.data.destination);
      const destFolder = path.dirname(validDestPath);
      try {
        await createDirectoryLocal(destFolder); // Ensure the destination directory exists
      } catch (error) {
        if (error instanceof Error && error.message.includes("Directory already exists")) {
          // Directory already exists, no action needed
          console.log(`Directory already exists: ${destFolder}. No creation needed.`);
        }
      }
    }

    // Invoke the file transfer function in the renderering part
    triggerTransferFileOnRenderer(
      sourceCloudType,
      destinationCloudType,
      sourceAccountId,
      destinationAccountId,
      parsed.data.source,
      parsed.data.destination
    );

    return {
      content: [{ type: "text", text: `Successfully start moving ${parsed.data.source} from ${sourceProvider}:${parsed.data.source_accountId} to ${parsed.data.destination} on ${destinationProvider}:${parsed.data.destination_accountId}. Might take a while depending on the file size.` }],
    };
  }

  async function handleSearchFileTool(args: any) {
    const parsed = SearchFilesArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
    }
    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;
    const patterns = parsed.data.patterns || [];
    const excludePatterns = parsed.data.excludePatterns || [];
    if (patterns.length === 0) {
      throw new Error("At least one pattern is required for local file search");
    }
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
      // local storage
      const validPath = await validatePath(parsed.data.path);
      // Exclude patterns are optional
      const results: string[] = [];
      for (const pattern of patterns) {
        const matches = await searchFiles(validPath, pattern, excludePatterns);
        results.push(...matches);
      }
      // const results = await searchFiles(validPath, parsed.data.pattern, parsed.data.excludePatterns);
      return {
        content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
      };
    }

    const directoryPath = parsed.data.path;
    const cloudType = await validateProvider(provider);
    // search files in the cloud storage
    const cloudResults: FileSystemItem[] = [];
    for (const pattern of parsed.data.patterns) {
      const matches = await searchFilesFromStorageAccount(cloudType, accountId, directoryPath, pattern, excludePatterns);
      cloudResults.push(...matches);
    }
    // const cloudResults: FileSystemItem[] = await searchFilesFromStorageAccount(cloudType, accountId, directoryPath, parsed.data.pattern, parsed.data.excludePatterns);
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

  async function handleGetFileInfoTool(args: any) {
    const parsed = GetFileInfoArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
    }

    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;

    // local storage
    if (!provider || !accountId || provider.toLowerCase() === 'local') {
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

    // cloud storage
    const filePath = parsed.data.path;
    if (!filePath) {
      throw new Error("File path is required for cloud storage operations");
    }

    const cloudType = await validateProvider(provider);
    const fileInfo: FileSystemItem = await getFileInfo(cloudType, accountId, filePath);

    if (!fileInfo) {
      throw new Error(`File not found: ${filePath}`);
    }

    const infoText = Object.entries({
      name: fileInfo.name,
      path: fileInfo.path,
      isDirectory: fileInfo.isDirectory,
      size: fileInfo.size || 'N/A',
      modifiedTime: fileInfo.modifiedTime ? new Date(fileInfo.modifiedTime).toISOString() : 'N/A',
      id: fileInfo.id
    })
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    return {
      content: [{
        type: "text", text: infoText
      }],
    };
  }

  async function handleGetFolderInfoTool(args: any) {
    const parsed = GetFolderInfoArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for get_folder_info: ${parsed.error}`);
    }

    const provider = parsed.data.provider;
    const accountId = parsed.data.accountId;

    if (!provider || !accountId || provider.toLowerCase() === 'local') {
      // local storage
      const validPath = await validatePath(parsed.data.path);
      const info = await getDirectoryInfoLocal(validPath);
      return {
        content: [{
          type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n")
        }],
      };
    }
    // cloud storage
    const cloudType = await validateProvider(provider);
    const folderPath = parsed.data.path;
    if (!folderPath) {
      throw new Error("Folder path is required for cloud storage operations");
    }
    const folderInfo: FileSystemItem = await getDirectoryInfo(cloudType, accountId, folderPath);
    if (!folderInfo) {
      throw new Error(`Folder not found: ${folderPath}`);
    }
    // If folderInfo is found, you can use it
    return {
      content: [{
        type: "text", text: Object.entries({
          name: folderInfo.name,
          path: folderInfo.path,
          isDirectory: folderInfo.isDirectory,
          size: folderInfo.size || 0,
          modifiedTime: folderInfo.modifiedTime ? new Date(folderInfo.modifiedTime).toISOString() : 'N/A',
          // id: folderInfo.id // id is not useful for folders
        }).map(([key, value]) => `${key}: ${value}`).join("\n")
      }],
    };
  }

  async function handleRequestClarificationTool(args: any): Promise<string> {
    const parsed = RequestClarificationArgsSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for get_information_from_user: ${parsed.error}`);
    } else {
      // This tool is used to ask for clarification from the user
      
      return await triggerRequestClarification(parsed.data.question);
    }
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      switch (name) {

        // TODO implement
        case "read_file": {
          return await handleReadFileTool(args);
        }
        // TODO: implement read_multiple_files for cloud storage
        case "read_multiple_files": {
          return await handleReadMultipleFilesTool(args);
        }

        // TODO: implement write_multiple_files for cloud storage
        case "write_file": {
          return await handleWriteFileTool(args);
        }

        // case "edit_file": {
        //   const parsed = EditFileArgsSchema.safeParse(args);
        //   if (!parsed.success) {
        //     throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        //   }
        //   const validPath = await validatePath(parsed.data.path);
        //   const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
        //   return {
        //     content: [{ type: "text", text: result }],
        //   };
        // }

        // TODO: implement create_directory for cloud storage
        case "create_directory": {
          return await handleCreateDirectoryTool(args);
        }

        // DONE
        case "list_directory": {
          return await handleListDirectoryTool(args);
        }

        // TODO: implement directory_tree for cloud storage
        case "directory_tree": {
          return await handleDirectoryTreeTool(args);
        }

        // TODO implement
        case "move_file": {
          return await handleMoveFileTool(args);
        }

        // TODO implement
        case "move_file_batch": {
          return await handleMoveFileBatchTool(args);
        }

        // TODO implement the case when pattern is given as regex...
        case "search_files": {
          return await handleSearchFileTool(args);
        }

        // TODO: implement
        case "get_file_info": {
          return await handleGetFileInfoTool(args);
        }

        case "get_folder_info": {
          return await handleGetFolderInfoTool(args);
        }

        case "list_allowed_directories": {
          return await handleListAllowedDirectoriesTool(args);
        }

        // DONE
        case "list_connected_cloud_accounts": {
          return await handleListConnectedCloudAccountsTool(args);
        }

        case "get_information_from_user": {
          // Always return a value, even if the handler does not return anything
          const result = await handleRequestClarificationTool(args);
          return {
            content: [{ type: "text", text: result }],
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
