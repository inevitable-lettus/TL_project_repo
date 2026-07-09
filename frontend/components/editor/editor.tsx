"use client";

import StarterKit from "@tiptap/starter-kit";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { FileInfo, ProjectDetail, TipTapDoc } from "@/lib/types";
import {
  uploadErrorMessage,
  uploadProjectFile,
  type UploadState,
} from "@/lib/upload";
import { Button, Field, inputClass, Window } from "@/components/ui";
import { Media } from "./media-extension";
import { UploadMeter } from "./upload-meter";

const toolbarButton = (active: boolean) =>
  "rounded-base border px-2 py-1 font-mono text-[12px] transition-colors duration-[120ms] " +
  (active
    ? "border-border-default-strong bg-neutral-secondary-strong text-heading shadow-press"
    : "border-border-default bg-neutral-primary-soft text-heading hover:bg-neutral-secondary-medium");

function Toolbar({
  editor,
  onPickMedia,
}: {
  editor: Editor;
  onPickMedia: () => void;
}) {
  // Re-renders on selection/content change so active states stay current.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
    }),
  });

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL (http, https or mailto)", previous);
    if (href === null) return;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href === "") {
      chain.unsetLink().run();
    } else if (/^(https?:\/\/|mailto:)/.test(href)) {
      chain.setLink({ href }).run();
    }
  };

  const items: [string, boolean, () => void][] = [
    ["B", active.bold, () => editor.chain().focus().toggleBold().run()],
    ["I", active.italic, () => editor.chain().focus().toggleItalic().run()],
    [
      "U",
      active.underline,
      () => editor.chain().focus().toggleUnderline().run(),
    ],
    ["S", active.strike, () => editor.chain().focus().toggleStrike().run()],
    ["<>", active.code, () => editor.chain().focus().toggleCode().run()],
    [
      "H2",
      active.h2,
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    ],
    [
      "H3",
      active.h3,
      () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    ],
    [
      "•—",
      active.bulletList,
      () => editor.chain().focus().toggleBulletList().run(),
    ],
    [
      "1.",
      active.orderedList,
      () => editor.chain().focus().toggleOrderedList().run(),
    ],
    [
      "❝",
      active.blockquote,
      () => editor.chain().focus().toggleBlockquote().run(),
    ],
    [
      "{ }",
      active.codeBlock,
      () => editor.chain().focus().toggleCodeBlock().run(),
    ],
    ["HR", false, () => editor.chain().focus().setHorizontalRule().run()],
    ["LINK", active.link, setLink],
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-border-default bg-menu-bar px-2 py-1.5">
      {items.map(([label, isActive, run]) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          aria-pressed={isActive}
          onMouseDown={(e) => e.preventDefault()} // keep editor focus
          onClick={run}
          className={toolbarButton(isActive)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        data-testid="insert-media"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPickMedia}
        className={toolbarButton(false)}
      >
        +IMG/VID
      </button>
    </div>
  );
}

export function ProjectEditor({
  project,
  onMediaAdded,
}: {
  project: ProjectDetail;
  onMediaAdded?: (file: FileInfo) => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaState, setMediaState] = useState<UploadState | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false },
      }),
      Media,
    ],
    content: project.content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "editor-prose min-h-[320px] px-5 py-4 text-[15px] leading-[1.65] focus:outline-none",
        "data-testid": "editor-content",
      },
    },
  });

  const embedMedia = async (file: File) => {
    setMediaError(null);
    try {
      const ready = await uploadProjectFile(
        project.id,
        file,
        "media",
        setMediaState,
      );
      editor
        ?.chain()
        .focus()
        .insertContent({ type: "media", attrs: { fileId: ready.id } })
        .run();
      onMediaAdded?.(ready);
    } catch (error) {
      setMediaError(uploadErrorMessage(error));
    } finally {
      setMediaState(null);
    }
  };

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    setStatus(null);
    try {
      await api.updateProject(project.id, {
        title,
        description: description || null,
        content: editor.getJSON() as TipTapDoc,
      });
      setStatus("saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Window
      title={`${project.title}.EDIT`}
      floating
      bodyClassName="flex flex-col gap-4 p-5 md:p-6"
      titleBarExtra={
        <span className="flex items-center gap-2">
          {status && (
            <span
              data-testid="save-status"
              className={`font-mono text-[12px] tracking-[0.4px] ${
                status === "saved" ? "text-fg-success" : "text-fg-danger"
              }`}
            >
              {status.toUpperCase()}
            </span>
          )}
          <Button
            data-testid="save-project"
            onClick={save}
            disabled={saving || !editor}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </span>
      }
    >
      <Field id="project-title" label="Title">
        <input
          id="project-title"
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field id="project-description" label="Short description">
        <textarea
          id="project-description"
          className={`${inputClass} min-h-[64px] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </Field>

      <div className="rounded-base border border-border-default bg-neutral-secondary-soft">
        {editor && (
          <Toolbar
            editor={editor}
            onPickMedia={() => mediaInput.current?.click()}
          />
        )}
        <EditorContent editor={editor} />
      </div>
      <UploadMeter state={mediaState} error={mediaError} />

      <input
        ref={mediaInput}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        data-testid="media-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void embedMedia(file);
        }}
      />
    </Window>
  );
}
