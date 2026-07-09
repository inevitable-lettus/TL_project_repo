import type { JSX, ReactNode } from "react";
import type { FileInfo, TipTapDoc, TipTapNode } from "@/lib/types";

// Server-side renderer for the whitelisted TipTap document (the backend
// validates nodes/marks on save — anything else was rejected there).

export function collectMediaFileIds(doc: TipTapDoc): string[] {
  const ids = new Set<string>();
  const walk = (node: TipTapNode) => {
    if (node.type === "media") {
      const id = node.attrs?.fileId;
      if (typeof id === "string") ids.add(id);
    }
    node.content?.forEach(walk);
  };
  doc.content?.forEach(walk);
  return [...ids];
}

type MediaContext = {
  urls: Record<string, string>;
  files: Map<string, FileInfo>;
};

function renderText(node: TipTapNode, key: number): ReactNode {
  let element: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "strike":
        element = <s>{element}</s>;
        break;
      case "underline":
        element = <u>{element}</u>;
        break;
      case "code":
        element = (
          <code className="rounded-sm bg-code-bg px-1 py-0.5 font-mono text-[13px] text-code-text">
            {element}
          </code>
        );
        break;
      case "link":
        element = (
          <a
            href={String(mark.attrs?.href ?? "")}
            className="font-medium text-fg-brand underline hover:no-underline"
            rel="noopener noreferrer"
          >
            {element}
          </a>
        );
        break;
    }
  }
  return <span key={key}>{element}</span>;
}

function renderMedia(node: TipTapNode, ctx: MediaContext, key: number) {
  const fileId = String(node.attrs?.fileId ?? "");
  const url = ctx.urls[fileId];
  const file = ctx.files.get(fileId);
  if (!url || !file) return null;
  return (
    <figure key={key} className="my-5">
      {file.mime_type.startsWith("video/") ? (
        <video
          src={url}
          controls
          className="w-full rounded-base border border-border-default"
        />
      ) : (
        // Presigned URL — must not go through the Next image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={file.filename}
          className="w-full rounded-base border border-border-default"
        />
      )}
    </figure>
  );
}

function renderNode(
  node: TipTapNode,
  ctx: MediaContext,
  key: number,
): ReactNode {
  const children = node.content?.map((child, i) => renderNode(child, ctx, i));
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return (
        <p key={key} className="my-3 text-[15px] leading-[1.65]">
          {children}
        </p>
      );
    case "heading": {
      const level = Math.min(Number(node.attrs?.level ?? 1) + 1, 6);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={key} className="mb-3 mt-8">
          {children}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul
          key={key}
          className="my-3 list-disc space-y-2 pl-6 text-[15px] leading-[1.65]"
        >
          {children}
        </ul>
      );
    case "orderedList":
      return (
        <ol
          key={key}
          className="my-3 list-decimal space-y-2 pl-6 text-[15px] leading-[1.65]"
        >
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-4 border-l-2 border-border-default pl-4 italic text-body-subtle"
        >
          {children}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre
          key={key}
          className="my-4 overflow-x-auto rounded-base border border-border-default bg-code-bg p-4 font-mono text-[13px] leading-relaxed text-code-text"
        >
          <code>{children}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} className="my-8 border-border-default-subtle" />;
    case "hardBreak":
      return <br key={key} />;
    case "media":
      return renderMedia(node, ctx, key);
    default:
      return null;
  }
}

export function TipTapRender({
  doc,
  mediaUrls,
  files,
}: {
  doc: TipTapDoc;
  mediaUrls: Record<string, string>;
  files: FileInfo[];
}) {
  const ctx: MediaContext = {
    urls: mediaUrls,
    files: new Map(files.map((f) => [f.id, f])),
  };
  return <>{doc.content?.map((node, i) => renderNode(node, ctx, i))}</>;
}
