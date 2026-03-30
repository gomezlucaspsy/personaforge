/**
 * Shared in-memory file system store for all persona-files routes.
 * In production, replace with a database.
 */

const fileSystemsStore = new Map();

/**
 * Generate character-specific default folder structure based on their role/archetype.
 * Now returns empty root - characters start from 0
 */
const generateDefaultFolders = (personaId, meta = {}) => {
  // Return empty file system - characters start with nothing
  return {};
};

/**
 * Initialize or get file system for a persona.
 * @param {string} personaId
 * @param {object} meta - Optional character metadata for scaffolding { name, title, archetype, systemPrompt }
 */
export const getOrCreateFileSystem = (personaId, meta = {}) => {
  if (!fileSystemsStore.has(personaId)) {
    const root = generateDefaultFolders(personaId, meta);
    fileSystemsStore.set(personaId, { root });
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

  if (type === "folder") {
    folder[name] = { type: "folder", children: {} };
  } else {
    folder[name] = {
      type: "file",
      content: content || "",
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
