/**
 * Redis-backed file system store for persona MyComputer.
 * Falls back to an in-memory Map when Redis env vars are not set (local dev).
 *
 * Requires: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * (same credentials used by the /api/history route)
 */

const FS_PREFIX = "mycomputer:";
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90-day TTL

// In-memory fallback for local development
const memStore = new Map();

const getRedis = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = require("@upstash/redis");
    return new Redis({ url, token });
  } catch {
    return null;
  }
};

/**
 * Load the file-system root object from Redis (or memory fallback).
 * Always returns a plain object (never null).
 */
export const loadFileSystem = async (personaId) => {
  const redis = getRedis();
  if (redis) {
    try {
      const data = await redis.get(`${FS_PREFIX}${personaId}`);
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }
  return memStore.get(personaId) || {};
};

/**
 * Persist the file-system root object to Redis (or memory fallback).
 */
export const saveFileSystem = async (personaId, root) => {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`${FS_PREFIX}${personaId}`, root, { ex: TTL_SECONDS });
    } catch {}
  } else {
    memStore.set(personaId, root);
  }
};

// ---------------------------------------------------------------------------
// Legacy synchronous helper kept for backward-compatibility with chat/route.js
// Use loadFileSystem / saveFileSystem in all new code.
// ---------------------------------------------------------------------------
const fileSystemsStore = new Map();

export const getOrCreateFileSystem = (personaId, meta = {}) => {
  if (!fileSystemsStore.has(personaId)) {
    fileSystemsStore.set(personaId, { root: {} });
  }
  return fileSystemsStore.get(personaId);
};

/**
 * Navigate to a folder within the file tree.
 */
export const navigateToFolder = (root, folderPath) => {
  if (folderPath === "/") return root;
  const parts = folderPath.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (!current[part] || current[part].type !== "folder") {
      return null;
    }
    current = current[part].children;
  }
  return current;
};

/**
 * Parse a path into parent path + name.
 */
export const getParentAndName = (path) => {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop();
  return { parentPath: "/" + parts.join("/"), name };
};

/**
 * Create a file or folder.
 */
export const createFileOrFolder = (root, path, name, type, content = "") => {
  const folder = navigateToFolder(root, path);
  if (!folder) return { error: "Parent folder not found" };
  if (folder[name]) return { error: "Item already exists" };
  if (!name || name.trim().length === 0) return { error: "Invalid name" };

  if (type === "folder") {
    folder[name] = { type: "folder", children: {} };
  } else {
    // Validate that file content is not empty or just whitespace
    const trimmedContent = (content || "").trim();
    if (trimmedContent.length === 0) {
      return { error: "File content cannot be empty" };
    }
    folder[name] = {
      type: "file",
      content: content,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    };
  }
  return { success: true, item: folder[name] };
};

/**
 * Read file content.
 */
export const readFile = (root, path) => {
  const { parentPath, name } = getParentAndName(path);
  const parentFolder = navigateToFolder(root, parentPath);
  if (!parentFolder || !parentFolder[name]) return { error: "File not found" };
  if (parentFolder[name].type !== "file") return { error: "Not a file" };
  return { success: true, content: parentFolder[name].content };
};

/**
 * Update file content.
 */
export const updateFile = (root, path, content) => {
  const { parentPath, name } = getParentAndName(path);
  const parentFolder = navigateToFolder(root, parentPath);
  if (!parentFolder || !parentFolder[name]) return { error: "File not found" };
  if (parentFolder[name].type !== "file") return { error: "Not a file" };
  parentFolder[name].content = content;
  parentFolder[name].modified = new Date().toISOString();
  return { success: true };
};

/**
 * Delete file or folder.
 */
export const deleteFileOrFolder = (root, path) => {
  const { parentPath, name } = getParentAndName(path);
  const parentFolder = navigateToFolder(root, parentPath);
  if (!parentFolder || !parentFolder[name]) return { error: "Item not found" };
  delete parentFolder[name];
  return { success: true };
};

/**
 * List the full file tree recursively (for AI context).
 */
export const getFileTree = (root, prefix = "/") => {
  const lines = [];
  const getIcon = (name) => {
    const ext = (name || "").split(".").pop()?.toLowerCase();
    if (ext === "svg") return "🖼️";
    if (["js","jsx","ts","tsx","py","cs","java","cpp","go","rs"].includes(ext)) return "⚡";
    if (["html","css"].includes(ext)) return "🌐";
    if (["json","xml","yaml","yml"].includes(ext)) return "📋";
    return "📄";
  };
  for (const [name, item] of Object.entries(root)) {
    const fullPath = prefix === "/" ? `/${name}` : `${prefix}/${name}`;
    if (item.type === "folder") {
      lines.push(`📁 ${fullPath}/`);
      lines.push(...getFileTree(item.children, fullPath));
    } else {
      const size = item.content ? item.content.length : 0;
      lines.push(`${getIcon(name)} ${fullPath} (${size} chars)`);
    }
  }
  return lines;
};

export default fileSystemsStore;
