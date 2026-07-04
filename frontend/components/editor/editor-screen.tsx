"use client";

import { useState } from "react";
import type { FileInfo, ProjectDetail } from "@/lib/types";
import { ProjectEditor } from "./editor";
import { AttachmentsPanel, CoverPicker } from "./files-panel";

// Composes the editor windows and shares the file list, so an image embedded
// just now is immediately offered as a cover.
export function EditorScreen({ project }: { project: ProjectDetail }) {
  const [mediaFiles, setMediaFiles] = useState<FileInfo[]>(
    project.files.filter((f) => f.kind === "media"),
  );

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-8">
      <ProjectEditor
        project={project}
        onMediaAdded={(file) => setMediaFiles((current) => [...current, file])}
      />
      <CoverPicker
        projectId={project.id}
        mediaFiles={mediaFiles}
        initialCoverId={project.cover_file_id}
      />
      <AttachmentsPanel projectId={project.id} initialFiles={project.files} />
    </div>
  );
}
