import { NextResponse } from "next/server";
import { loadFileSystem, navigateToFolder } from "../store.js";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const personaId = searchParams.get("personaId");
    const path = searchParams.get("path") || "/";

    if (!personaId) {
      return NextResponse.json({ error: "Missing personaId" }, { status: 400 });
    }

    const root = await loadFileSystem(personaId);
    const folderContents = navigateToFolder(root, path);

    if (folderContents === null) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const items = Object.entries(folderContents).map(([name, item]) => ({
      name,
      type: item.type,
      path: path === "/" ? `/${name}` : `${path}/${name}`,
      ...(item.type === "file" && {
        content: item.content,
        created: item.created,
        modified: item.modified,
        size: (item.content || "").length,
      }),
    }));

    return NextResponse.json({
      success: true,
      path,
      items: items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
