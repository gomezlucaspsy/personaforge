import { NextResponse } from "next/server";
import {
  loadFileSystem,
  saveFileSystem,
  createFileOrFolder,
  readFile,
  updateFile,
  deleteFileOrFolder,
} from "./store.js";

export async function POST(request) {
  try {
    const { action, personaId, path, content, name, type } = await request.json();

    if (!personaId) {
      return NextResponse.json({ error: "Missing personaId" }, { status: 400 });
    }

    const root = await loadFileSystem(personaId);

    if (action === "create") {
      if (!name || name.trim().length === 0) {
        return NextResponse.json({ error: "Invalid name: cannot be empty" }, { status: 400 });
      }
      if (type === "file" && (!content || content.trim().length === 0)) {
        return NextResponse.json({ error: "File content cannot be empty" }, { status: 400 });
      }
      const result = createFileOrFolder(root, path || "/", name, type, content);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      await saveFileSystem(personaId, root);
      return NextResponse.json({ success: true, item: result.item });
    }

    if (action === "read") {
      const result = readFile(root, path);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({ success: true, content: result.content });
    }

    if (action === "update") {
      if (!content || content.trim().length === 0) {
        return NextResponse.json({ error: "File content cannot be empty" }, { status: 400 });
      }
      const result = updateFile(root, path, content);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      await saveFileSystem(personaId, root);
      return NextResponse.json({ success: true, updated: true });
    }

    if (action === "delete") {
      const result = deleteFileOrFolder(root, path);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      await saveFileSystem(personaId, root);
      return NextResponse.json({ success: true, deleted: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
