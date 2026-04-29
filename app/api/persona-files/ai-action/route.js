import { NextResponse } from "next/server";
import {
  loadFileSystem,
  saveFileSystem,
  createFileOrFolder,
  readFile,
  updateFile,
  deleteFileOrFolder,
  getFileTree,
} from "../store.js";

/**
 * POST /api/persona-files/ai-action
 * Allows AI to perform file operations programmatically during conversation.
 * Supports: create, read, update, delete, list
 */

export async function POST(request) {
  try {
    const { personaId, aiAction } = await request.json();

    if (!personaId || !aiAction) {
      return NextResponse.json(
        { error: "Missing personaId or aiAction" },
        { status: 400 }
      );
    }

    const root = await loadFileSystem(personaId);
    let result;
    let mutated = false;

    switch (aiAction.action) {
      case "create":
        result = createFileOrFolder(root, aiAction.path || "/", aiAction.name, aiAction.type || "file", aiAction.content || "");
        mutated = !!result.success;
        break;
      case "read":
        result = readFile(root, aiAction.path);
        break;
      case "update":
        result = updateFile(root, aiAction.path, aiAction.content || "");
        mutated = !!result.success;
        break;
      case "delete":
        result = deleteFileOrFolder(root, aiAction.path);
        mutated = !!result.success;
        break;
      case "list": {
        const tree = getFileTree(root);
        result = { success: true, tree: tree.join("\n") };
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${aiAction.action}` }, { status: 400 });
    }

    if (mutated) {
      await saveFileSystem(personaId, root);
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action: aiAction.action,
      path: aiAction.path,
      message: generateAIActionMessage(aiAction),
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Server error" },
      { status: 500 }
    );
  }
}

const generateAIActionMessage = (aiAction) => {
  switch (aiAction.action) {
    case "create":
      return `Created ${aiAction.type === "folder" ? "folder" : "file"} "${aiAction.name}" in ${aiAction.path}`;
    case "update":
      return `Updated file "${aiAction.path}"`;
    case "delete":
      return `Deleted "${aiAction.path}"`;
    default:
      return `Performed ${aiAction.action} action`;
  }
};
