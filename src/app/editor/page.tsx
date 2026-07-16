"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import rough from "roughjs/bin/rough";
import type { Options as RoughOptions } from "roughjs/bin/core";
import type { LocalCanvasStroke, LocalEditorState, LocalPageSnapshot } from "@/lib/local-document";
import {
  fetchSupabaseUser,
  getStoredSupabaseSession,
  signOutSupabaseSession,
  startGoogleSignIn,
  SupabaseAuthConfigError,
  storeSupabaseSession,
  type SupabaseSession,
  type SupabaseUser,
} from "@/lib/supabase-auth";
import {
  deleteDriveProjectFile,
  GoogleDriveConfigError,
  hasGoogleDriveToken,
  saveDriveProjectFile,
} from "@/lib/google-drive";
import {
  Highlighter, Pencil, Type, MessageSquare, Square,
  Download, Undo2, Redo2, FolderOpen, X,
  ChevronLeft, ChevronRight, Sun, Moon, Home,
  ZoomIn, ZoomOut, Trash2, FilePlus2, Files, Hash, PenLine,
  Hand, ArrowRight, Minus, Circle, Diamond, ImageIcon, CircleHelp,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline,
  List, ListOrdered
} from "lucide-react";

interface NoteItem {
  id: string;
  text: string;
  x: number;
  y: number;
}

interface TextHighlightRange {
  start: number;
  end: number;
  color: string;
}

interface TextAnnotationItem {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  lineHeight: number;
  color: string;
  align?: "left" | "center" | "right";
  listStyle?: ListStyle;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlights?: TextHighlightRange[];
  highlightColor?: string;
}

interface PictureItem {
  id: string;
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type StrokePoint = {
  x: number;
  y: number;
};

type HighlightStrokeBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  wobble: number;
};

type PencilStroke = {
  id: string;
  kind: "pencil";
  color: string;
  width: number;
  points: StrokePoint[];
};

type HighlightStroke = {
  id: string;
  kind: "highlight";
  color: string;
  boxes: HighlightStrokeBox[];
};

type CanvasStroke = PencilStroke | HighlightStroke;

interface PageState {
  baseImageData: ImageData;
  canvasWidth: number;
  canvasHeight: number;
  undoStack: DocumentSnapshot[];
  redoStack: DocumentSnapshot[];
  notes: NoteItem[];
  textAnnotations: TextAnnotationItem[];
  pictures: PictureItem[];
  strokes: CanvasStroke[];
}

interface DocumentSnapshot {
  baseImageData: ImageData;
  canvasWidth: number;
  canvasHeight: number;
  notes: NoteItem[];
  textAnnotations: TextAnnotationItem[];
  pictures: PictureItem[];
  strokes: CanvasStroke[];
}

interface PdfPageSource {
  doc: PdfDocument;
  pageNumber: number;
  name: string;
}

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfRenderTask {
  promise: Promise<void>;
}

interface PdfPage {
  getViewport: (options: { scale: number }) => PdfViewport;
  getTextContent: () => Promise<PdfTextContent>;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask;
}

interface PdfTextContent {
  items?: unknown[];
}

interface PdfDocument {
  numPages: number;
  getPage: (num: number) => Promise<PdfPage>;
}

interface PdfTextLayer {
  render: () => Promise<void>;
  cancel: () => void;
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  TextLayer?: new (options: {
    textContentSource: unknown;
    container: HTMLDivElement;
    viewport: PdfViewport;
  }) => PdfTextLayer;
  getDocument: (data: Uint8Array) => { promise: Promise<PdfDocument> };
}

const PALETTE = [
  { hex: "#E5D4FF", name: "Lavender" },
  { hex: "#CDEAC0", name: "Mint" },
  { hex: "#FFD8C2", name: "Peach" },
  { hex: "#D6EFFF", name: "Sky Blue" },
  { hex: "#F9D5E5", name: "Blush" },
  { hex: "#FFF3B0", name: "Yellow" },
  { hex: "#B8E0D2", name: "Seafoam" },
  { hex: "#F7C8D0", name: "Rose" },
];

const HIGHLIGHT_PALETTE = [
  { hex: "#FFF200", name: "Neon Yellow" },
  { hex: "#FF9F1C", name: "Neon Orange" },
  { hex: "#FF4FD8", name: "Neon Pink" },
  { hex: "#39FF14", name: "Neon Green" },
  { hex: "#00D4FF", name: "Neon Blue" },
];

const TEXT_PALETTE = [
  { hex: "#111827", name: "Black" },
  { hex: "#25324A", name: "Navy" },
  { hex: "#4A2E5C", name: "Plum" },
  { hex: "#8A2442", name: "Berry" },
  { hex: "#0F5B5F", name: "Teal" },
  { hex: "#2F5D45", name: "Forest" },
  { hex: "#6E4B2E", name: "Brown" },
  { hex: "#5E5D6A", name: "Graphite" },
];

const INK_COLOR = "#8E8D9B";
const TEXT_COLOR = "#25324A";
const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_PALETTE[0].hex;
const NO_FILL = "transparent";
const SHAPE_FILL_ALPHA = 0.38;
const BLANK_PAGE_WIDTH = 800;
const BLANK_PAGE_HEIGHT = 1060;
const SUPPORTED_FILE_TYPES = "application/pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp";
const NOTE_PLACEHOLDER = "Click to edit...";
const LOCAL_LATEST_DRAFT_KEY = "colora-editor-state";
const LOCAL_DOC_ID_KEY = "colora-current-doc-id";
const localDraftKey = (docId: string) => `colora-editor-state:${docId}`;
const localRecentKey = (accountKey: string) => `colora-recent-docs:${accountKey}`;
const DRIVE_RECENT_FILE_NAME = "colora-recent-documents.json";
const drivePdfFileName = (title: string) => `${(title || "document").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-").toLowerCase() || "document"}.pdf`;
type ViewMode = "fit-width" | "fit-page" | "actual";
type ShapeTool = "rect" | "ellipse" | "diamond" | "line" | "arrow";
type ShapeFillStyle = "hachure" | "cross-hatch" | "solid";
type ListStyle = "none" | "bullet" | "number" | "alpha";
type LocalDraftMeta = {
  docId: string;
  title: string;
  subtitle: string;
  savedAt: number;
  pageCount: number;
  previewDataUrl?: string;
};
type SelectedObject =
  | { kind: "text"; id: string }
  | { kind: "note"; id: string }
  | { kind: "picture"; id: string }
  | { kind: "page" };
type KeyboardActions = {
  clearActiveTool: () => void;
  undo: () => void;
  redo: () => void;
  openFile: () => void;
  addBlankPage: () => void;
  exportPDF: () => void;
  selectTool: (tool: string) => void;
  addNote: () => void;
  addPicture: () => void;
  deleteCurrentPage: () => void;
  goPage: (dir: "prev" | "next") => void;
  changeZoom: (next: number) => void;
  changeViewMode: (mode: ViewMode) => void;
};

const SHAPE_TOOLS = new Set<string>(["rect", "ellipse", "diamond", "line", "arrow"]);

const isShapeTool = (tool: string): tool is ShapeTool => SHAPE_TOOLS.has(tool);

function EraserTrailIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 17.5c3.6 2.1 7.3 2.1 11.2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <path d="M7.1 12.4 13.5 6a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3l-6.4 6.4a2.4 2.4 0 0 1-1.7.7H6.8a1.1 1.1 0 0 1-1.1-1.1v-2.4c0-.6.2-1.2.7-1.7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m11.2 8.3 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BlankPageIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4.5h6.5L17.5 8V18a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13.5 4.5V8H17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11.8h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.55" />
      <path d="M8 14.6h5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

function LocalUploadIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.5 14.5v3A1.5 1.5 0 0 0 7 19h10a1.5 1.5 0 0 0 1.5-1.5v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.5 11.5 12 8l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6.5 6.5h3l1.4-1.7h2.6l1.4 1.7h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}

const stripListMarkers = (text: string) =>
  text
    .split("\n")
    .map(line => line.replace(/^(\s*)(?:•\s+|\d+\.\s+|[A-Z]\.\s+)/, "$1"))
    .join("\n");

const listMarkerFor = (style: ListStyle, index: number) => {
  if (style === "bullet") return "• ";
  if (style === "number") return `${index + 1}. `;
  if (style === "alpha") return `${String.fromCharCode(65 + (index % 26))}. `;
  return "";
};

const applyListStyleToText = (text: string, style: ListStyle) => {
  const clean = stripListMarkers(text);
  if (style === "none") return clean;
  if (!clean.trim()) return listMarkerFor(style, 0);
  let itemIndex = 0;
  return clean
    .split("\n")
    .map(line => {
      if (!line.trim()) return line;
      const next = `${listMarkerFor(style, itemIndex)}${line.trimStart()}`;
      itemIndex += 1;
      return next;
    })
    .join("\n");
};

const textHasListMarker = (text: string) =>
  text.split("\n").some(line => /^(?:\s*)(?:•\s+|\d+\.\s+|[A-Z]\.\s+)/.test(line));

const displayTextForListStyle = (text: string, style?: ListStyle) => {
  if (!style || style === "none" || textHasListMarker(text)) return text || " ";
  return applyListStyleToText(text, style) || " ";
};

const renderInlineFormattedText = (text: string, style?: ListStyle) => {
  const rendered = displayTextForListStyle(text, style);
  const boldRe = /\*\*([\s\S]+?)\*\*/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(rendered)) !== null) {
    if (match.index > lastIndex) nodes.push(rendered.slice(lastIndex, match.index));
    nodes.push(
      <span key={`${match.index}-b`} style={{ fontWeight: 800 }}>
        {match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (!nodes.length) return rendered;
  if (lastIndex < rendered.length) nodes.push(rendered.slice(lastIndex));
  return nodes;
};

const visibleIndexToRawIndex = (text: string, visibleIndex: number) => {
  let visible = 0;
  for (let raw = 0; raw < text.length; raw += 1) {
    if (text.slice(raw, raw + 2) === "**") {
      raw += 1;
      continue;
    }
    if (visible >= visibleIndex) return raw;
    visible += 1;
  }
  return text.length;
};

const selectedTextOffsetsInElement = (root: HTMLElement, range: Range) => {
  let total = 0;
  let start: number | null = null;
  let end: number | null = null;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walk.nextNode();

  while (current) {
    const textLength = current.textContent?.length ?? 0;
    if (textLength > 0 && range.intersectsNode(current)) {
      const localStart = current === range.startContainer ? range.startOffset : 0;
      const localEnd = current === range.endContainer ? range.endOffset : textLength;
      const nextStart = total + Math.max(0, Math.min(textLength, localStart));
      const nextEnd = total + Math.max(0, Math.min(textLength, localEnd));
      start = start === null ? nextStart : Math.min(start, nextStart);
      end = end === null ? nextEnd : Math.max(end, nextEnd);
    }
    total += textLength;
    current = walk.nextNode();
  }

  return start === null || end === null ? null : { start, end };
};

const mergeHighlightRanges = (ranges: TextHighlightRange[] = [], next: TextHighlightRange) => {
  const normalized = [
    ...ranges.filter(range => range.end <= next.start || range.start >= next.end),
    next,
  ]
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: TextHighlightRange[] = [];

  normalized.forEach(range => {
    const last = merged[merged.length - 1];
    if (last && last.color === range.color && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  });

  return merged;
};

const removeHighlightRanges = (ranges: TextHighlightRange[] = [], start?: number, end?: number) => {
  if (start === undefined || end === undefined || start === end) return [];
  const removeStart = Math.min(start, end);
  const removeEnd = Math.max(start, end);

  return ranges.flatMap(range => {
    if (range.end <= removeStart || range.start >= removeEnd) return [range];
    const next: TextHighlightRange[] = [];
    if (range.start < removeStart) next.push({ ...range, end: removeStart });
    if (range.end > removeEnd) next.push({ ...range, start: removeEnd });
    return next;
  });
};

const highlightMarkerStyle = (color: string): React.CSSProperties => ({
  display: "inline",
  padding: "0.05em 0.42em 0.17em",
  borderRadius: "0.35em 0.85em 0.42em 0.78em",
  transform: "rotate(-3.2deg) skewX(-6deg)",
  transformOrigin: "left center",
  background: `
    linear-gradient(164deg, ${hexToRgba(color, 0)} 0%, ${hexToRgba(color, 0.18)} 13%, ${hexToRgba(color, 0.02)} 88%, ${hexToRgba(color, 0)} 100%),
    linear-gradient(171deg, ${hexToRgba(color, 0.22)} 5%, ${hexToRgba(color, 0.43)} 48%, ${hexToRgba(color, 0.26)} 94%)
  `,
  boxShadow: `
    inset -10px 2px 0 ${hexToRgba(color, 0.05)},
    inset 8px -2px 0 ${hexToRgba(color, 0.08)},
    0 0 0 1px ${hexToRgba(color, 0.06)}
  `,
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
  filter: "saturate(1.04)",
});
const renderHighlightedFormattedText = (
  text: string,
  style?: ListStyle,
  highlights: TextHighlightRange[] = []
) => {
  const cleanRanges = highlights
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  if (!cleanRanges.length) return renderInlineFormattedText(text, style);
  if (style && style !== "none") return renderInlineFormattedText(text, style);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  cleanRanges.forEach((range, index) => {
    const start = Math.max(0, Math.min(text.length, range.start));
    const end = Math.max(start, Math.min(text.length, range.end));
    if (start > cursor) {
      nodes.push(<React.Fragment key={`plain-${index}`}>{renderInlineFormattedText(text.slice(cursor, start))}</React.Fragment>);
    }
    nodes.push(
      <span key={`highlight-${index}`} style={highlightMarkerStyle(range.color)}>
        {renderInlineFormattedText(text.slice(start, end))}
      </span>
    );
    cursor = end;
  });

  if (cursor < text.length) {
    nodes.push(<React.Fragment key="plain-tail">{renderInlineFormattedText(text.slice(cursor))}</React.Fragment>);
  }

  return nodes;
};

const roughSeed = (...values: number[]) => {
  const raw = values.reduce((acc, value, index) => acc + Math.round(value) * (index + 11), 97);
  return Math.max(1, Math.abs(raw) % 2147483647);
};

const toShapeFill = (hex: string, alpha: number) => {
  if (!hex || hex === NO_FILL) return undefined;
  const safe = hex.replace("#", "");
  const normalized = safe.length === 3 ? safe.split("").map(ch => ch + ch).join("") : safe;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value) || normalized.length !== 6) return hex;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const hexToRgba = (hex: string, alpha: number) => {
  if (!hex) return `rgba(229, 212, 255, ${alpha})`;
  const safe = hex.replace("#", "");
  const normalized = safe.length === 3 ? safe.split("").map(ch => ch + ch).join("") : safe;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value) || normalized.length !== 6) return hex;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

function drawRoughShape(
  ctx: CanvasRenderingContext2D,
  tool: ShapeTool,
  x: number,
  y: number,
  cx: number,
  cy: number,
  color: string,
  fillColor: string,
  fillStyle: ShapeFillStyle,
) {
  const w = cx - x;
  const h = cy - y;
  const absW = Math.abs(w);
  const absH = Math.abs(h);
  const left = w < 0 ? cx : x;
  const top = h < 0 ? cy : y;
  const right = left + absW;
  const bottom = top + absH;
  const seed = roughSeed(x, y, cx, cy, tool.length);
  const rc = rough.canvas(ctx.canvas);
  const shapeSize = Math.max(absW, absH, Math.hypot(cx - x, cy - y));
  const options: RoughOptions = {
    seed,
    stroke: color,
    fill: toShapeFill(fillColor, SHAPE_FILL_ALPHA),
    strokeWidth: 1.7,
    fillWeight: 1.6,
    roughness: 0.92,
    bowing: 0.42,
    hachureAngle: -41,
    hachureGap: 10,
    maxRandomnessOffset: Math.max(1.6, Math.min(2.8, shapeSize / 260)),
    curveFitting: 0.9,
    curveStepCount: 11,
    fillStyle,
    disableMultiStroke: false,
    preserveVertices: true,
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.94;

  if (tool === "rect") {
    rc.rectangle(left, top, absW, absH, options);
  } else if (tool === "diamond") {
    rc.polygon([
      [left + absW / 2, top],
      [right, top + absH / 2],
      [left + absW / 2, bottom],
      [left, top + absH / 2],
    ], options);
  } else if (tool === "ellipse") {
    rc.ellipse(left + absW / 2, top + absH / 2, Math.max(8, absW), Math.max(8, absH), options);
  } else {
    rc.line(x, y, cx, cy, options);
    if (tool === "arrow") {
      const angle = Math.atan2(cy - y, cx - x);
      const len = Math.max(13, Math.min(26, Math.hypot(cx - x, cy - y) * 0.18));
      const leftHead: [number, number] = [
        cx - len * Math.cos(angle - Math.PI / 6),
        cy - len * Math.sin(angle - Math.PI / 6),
      ];
      const rightHead: [number, number] = [
        cx - len * Math.cos(angle + Math.PI / 6),
        cy - len * Math.sin(angle + Math.PI / 6),
      ];
      rc.line(cx, cy, leftHead[0], leftHead[1], { ...options, seed: seed + 31 });
      rc.line(cx, cy, rightHead[0], rightHead[1], { ...options, seed: seed + 47 });
    }
  }

  ctx.restore();
}

function drawNaturalHighlightRects(
  ctx: CanvasRenderingContext2D,
  rects: DOMRectList,
  containerRect: DOMRect,
  scaleX: number,
  scaleY: number,
  color: string,
) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (rect.width < 2 || rect.height < 2) continue;

    const x = (rect.left - containerRect.left - 2) * scaleX;
    const y = (rect.top - containerRect.top + rect.height * 0.12) * scaleY;
    const w = (rect.width + 4) * scaleX;
    const h = Math.max(8, (rect.height + 5) * scaleY);
    const tilt = ((i % 2 === 0 ? -1 : 1) * Math.min(5, Math.max(2, w * 0.018))) * scaleX;
    const wobble = Math.min(2.2, Math.max(0.8, h * 0.08));

    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.moveTo(x + tilt, y + wobble);
    ctx.lineTo(x + w + tilt * 0.35, y - wobble);
    ctx.lineTo(x + w - tilt, y + h + wobble);
    ctx.lineTo(x - tilt * 0.4, y + h - wobble);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.moveTo(x + 1 - tilt * 0.2, y + h * 0.24);
    ctx.lineTo(x + w - 1 + tilt * 0.2, y + h * 0.08);
    ctx.lineTo(x + w - 2 - tilt * 0.2, y + h * 0.72);
    ctx.lineTo(x + 2 + tilt * 0.2, y + h * 0.86);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

const createNaturalHighlightStroke = (
  rects: DOMRectList,
  containerRect: DOMRect,
  scaleX: number,
  scaleY: number,
  color: string,
): HighlightStroke => ({
  id: crypto.randomUUID(),
  kind: "highlight",
  color,
  boxes: Array.from(rects).flatMap((rect, index) => {
    if (rect.width < 2 || rect.height < 2) return [];
    const x = (rect.left - containerRect.left - 2) * scaleX;
    const y = (rect.top - containerRect.top + rect.height * 0.12) * scaleY;
    const w = (rect.width + 4) * scaleX;
    const h = Math.max(8, (rect.height + 5) * scaleY);
    const tilt = ((index % 2 === 0 ? -1 : 1) * Math.min(5, Math.max(2, w * 0.018))) * scaleX;
    const wobble = Math.min(2.2, Math.max(0.8, h * 0.08));
    return [{ x, y, w, h, tilt, wobble }];
  }),
});

type TextDropdownProps<T extends string | number> = {
  value: T;
  width: string;
  label: string;
  options: T[];
  onChange: (next: T) => void;
  formatOption?: (option: T) => string;
  theme: {
    headerBorder: string;
    panelBg: string;
    toolActive: string;
    toolActiveTxt: string;
    docText: string;
  };
  darkMode: boolean;
};

function TextDropdown<T extends string | number>({
  value,
  width,
  label,
  options,
  onChange,
  formatOption,
  theme,
  darkMode,
}: TextDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const updateAnchor = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom + 6, left: rect.left });
    };
    updateAnchor();
    const onResize = () => updateAnchor();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", updateAnchor, true);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (target.closest("[data-text-dropdown-menu]")) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", updateAnchor, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  const buttonStyle: React.CSSProperties = {
    width,
    height: "30px",
    borderRadius: "10px",
    border: `1px solid ${theme.headerBorder}`,
    color: theme.docText,
    fontFamily: "inherit",
    fontSize: "11px",
    fontWeight: 800,
    padding: "0 10px",
    outline: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    textAlign: "left",
    background: open ? (darkMode ? "#232A39" : "#F3ECFF") : (darkMode ? "#171B24" : "#FFFFFF"),
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
        onClick={() => setOpen(v => !v)}
        title={label}
        style={buttonStyle}
      >
        <span style={{ flex: 1 }}>{formatOption ? formatOption(value) : String(value)}</span>
        <ChevronRight size={12} style={{ transform: "rotate(90deg)", opacity: 0.8 }} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          data-text-toolbar
          data-text-dropdown-menu
          style={{
            position: "fixed",
            top: anchor.top,
            left: anchor.left,
            zIndex: 9999,
            width,
            minWidth: width,
            maxWidth: width,
            borderRadius: "10px",
            border: `1px solid ${theme.headerBorder}`,
            background: theme.panelBg,
            boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
            padding: "3px",
            maxHeight: "none",
            overflowY: "hidden",
          }}
        >
          {options.map(option => {
            const selected = option === value;
            return (
              <button
                key={String(option)}
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(option);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  border: "none",
                  background: selected ? theme.toolActive : "transparent",
                  color: selected ? theme.toolActiveTxt : theme.docText,
                  borderRadius: "7px",
                  padding: "7px 9px",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: "11px",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  cursor: "pointer",
                }}
              >
                {formatOption ? formatOption(option) : String(option)}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

function createBlankPdfDocument(): PdfDocument {
  const blankPage: PdfPage = {
    getViewport: ({ scale }) => ({ width: BLANK_PAGE_WIDTH * scale, height: BLANK_PAGE_HEIGHT * scale }),
    getTextContent: async () => ({ items: [] }),
    render: ({ canvasContext, viewport }) => {
      canvasContext.save();
      canvasContext.fillStyle = "#FFFFFF";
      canvasContext.fillRect(0, 0, viewport.width, viewport.height);
      canvasContext.restore();
      return { promise: Promise.resolve() };
    },
  };

  return {
    numPages: 1,
    getPage: async () => blankPage,
  };
}

const loadImageElement = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("Could not load image"));
  };
  image.src = url;
});

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Could not read file"));
  reader.readAsDataURL(file);
});

const loadImageFromDataUrl = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Could not load image"));
  image.src = src;
});

const imageDataToDataUrl = (imageData: ImageData) => {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d")?.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
};

const dataUrlToImageData = async (src: string, width: number, height: number) => {
  const image = await loadImageFromDataUrl(src);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare canvas");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
};

const cloneImageData = (imageData: ImageData) =>
  new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);

const fitImageDataToSize = (imageData: ImageData, width: number, height: number) => {
  if (imageData.width === width && imageData.height === height) {
    return cloneImageData(imageData);
  }

  const source = document.createElement("canvas");
  source.width = imageData.width;
  source.height = imageData.height;
  source.getContext("2d")?.putImageData(imageData, 0, 0);

  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  const targetCtx = target.getContext("2d");
  if (!targetCtx) return cloneImageData(imageData);
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.drawImage(source, 0, 0, width, height);
  return targetCtx.getImageData(0, 0, width, height);
};

const cloneCanvasStroke = (stroke: CanvasStroke): CanvasStroke =>
  stroke.kind === "pencil"
    ? { ...stroke, points: stroke.points.map(point => ({ ...point })) }
    : { ...stroke, boxes: stroke.boxes.map(box => ({ ...box })) };

const createEmptyImageData = (width: number, height: number) =>
  new ImageData(width, height);

const drawPencilStroke = (ctx: CanvasRenderingContext2D, stroke: PencilStroke) => {
  if (!stroke.points.length) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.9;
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  if (stroke.points.length === 1) {
    ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
  } else {
    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index];
      const previous = stroke.points[index - 1];
      const midX = (previous.x + point.x) / 2;
      const midY = (previous.y + point.y) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, midX, midY);
    }
    const tail = stroke.points[stroke.points.length - 1];
    ctx.lineTo(tail.x, tail.y);
  }
  ctx.stroke();
  ctx.restore();
};

const drawHighlightStroke = (ctx: CanvasRenderingContext2D, stroke: HighlightStroke) => {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = stroke.color;

  stroke.boxes.forEach(box => {
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.moveTo(box.x + box.tilt, box.y + box.wobble);
    ctx.lineTo(box.x + box.w + box.tilt * 0.35, box.y - box.wobble);
    ctx.lineTo(box.x + box.w - box.tilt, box.y + box.h + box.wobble);
    ctx.lineTo(box.x - box.tilt * 0.4, box.y + box.h - box.wobble);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.moveTo(box.x + 1 - box.tilt * 0.2, box.y + box.h * 0.24);
    ctx.lineTo(box.x + box.w - 1 + box.tilt * 0.2, box.y + box.h * 0.08);
    ctx.lineTo(box.x + box.w - 2 - box.tilt * 0.2, box.y + box.h * 0.72);
    ctx.lineTo(box.x + 2 + box.tilt * 0.2, box.y + box.h * 0.86);
    ctx.closePath();
    ctx.fill();
  });

  ctx.restore();
};

const drawCanvasStrokes = (ctx: CanvasRenderingContext2D, strokes: CanvasStroke[]) => {
  strokes.forEach(stroke => {
    if (stroke.kind === "pencil") drawPencilStroke(ctx, stroke);
    else drawHighlightStroke(ctx, stroke);
  });
};

function createImagePdfDocument(image: HTMLImageElement): PdfDocument {
  const maxEdge = 1600;
  const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const pageWidth = Math.max(1, Math.round(image.naturalWidth * ratio));
  const pageHeight = Math.max(1, Math.round(image.naturalHeight * ratio));

  const imagePage: PdfPage = {
    getViewport: ({ scale }) => ({ width: pageWidth * scale, height: pageHeight * scale }),
    getTextContent: async () => ({ items: [] }),
    render: ({ canvasContext, viewport }) => {
      canvasContext.save();
      canvasContext.fillStyle = "#FFFFFF";
      canvasContext.fillRect(0, 0, viewport.width, viewport.height);
      canvasContext.drawImage(image, 0, 0, viewport.width, viewport.height);
      canvasContext.restore();
      return { promise: Promise.resolve() };
    },
  };

  return {
    numPages: 1,
    getPage: async () => imagePage,
  };
}

export default function EditorPage() {
  const accountSignInEnabled = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [activeTool, setActiveTool] = useState("select");
  const [activeColor, setActiveColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [brushWidth, setBrushWidth] = useState(22);
  const [docTitle, setDocTitle] = useState("Untitled PDF");
  const [docSubtitle, setDocSubtitle] = useState("");
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotationItem[]>([]);
  const [pictures, setPictures] = useState<PictureItem[]>([]);
  const [isPdfLoaded, setIsPdfLoaded] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toastMsg, setToastMsg] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("fit-width");
  const [zoomLevel, setZoomLevel] = useState(0.7);
  const [includePageNumbers, setIncludePageNumbers] = useState(false);
  const [signatureText, setSignatureText] = useState("");
  const [textFontSize, setTextFontSize] = useState(18);
  const [textLineHeight, setTextLineHeight] = useState(1.35);
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textListStyle, setTextListStyleState] = useState<ListStyle>("none");
  const [shapeFillColor, setShapeFillColor] = useState<string>(NO_FILL);
  const [shapeFillStyle, setShapeFillStyle] = useState<ShapeFillStyle>("hachure");
  const [showBrushWidthMenu, setShowBrushWidthMenu] = useState(false);
  const [showTextSizeMenu, setShowTextSizeMenu] = useState(false);
  const [showTextSpaceMenu, setShowTextSpaceMenu] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showToolTips, setShowToolTips] = useState(false);
  const [toolTipText, setToolTipText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedLabel, setLastSavedLabel] = useState("Not saved yet");
  const [localSaveVersion, setLocalSaveVersion] = useState(0);
  const [currentDocId, setCurrentDocId] = useState(() => crypto.randomUUID());
  const [recentLocalDrafts, setRecentLocalDrafts] = useState<LocalDraftMeta[]>([]);
  const [authSession, setAuthSession] = useState<SupabaseSession | null>(null);
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [isAuthWorking, setIsAuthWorking] = useState(false);
  const [showWorkspacePanel, setShowWorkspacePanel] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);

  const annotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);
  const insertPdfInputRef = useRef<HTMLInputElement | null>(null);
  const mergePdfInputRef = useRef<HTMLInputElement | null>(null);
  const blankDocRef = useRef<PdfDocument | null>(null);
  const undoListRef = useRef<DocumentSnapshot[]>([]);
  const redoListRef = useRef<DocumentSnapshot[]>([]);
  const isDrawingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const shapeStartXRef = useRef(0);
  const shapeStartYRef = useRef(0);
  const pdfDocRef = useRef<PdfDocument | null>(null);
  const pageRenderingRef = useRef(false);
  const pageNumPendingRef = useRef<number | null>(null);
  const pdfjsLibRef = useRef<PdfJsLib | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const preserveRedoOnceRef = useRef(false);
  const activeToolRef = useRef("select");
  const activeColorRef = useRef(DEFAULT_HIGHLIGHT_COLOR);
  const brushWidthRef = useRef(22);
  const textAlignRef = useRef<"left" | "center" | "right">("left");
  const textBoldRef = useRef(false);
  const textItalicRef = useRef(false);
  const textUnderlineRef = useRef(false);
  const textListStyleRef = useRef<ListStyle>("none");
  const activeTextIdRef = useRef<string | null>(null);
  const shapeFillColorRef = useRef(NO_FILL);
  const shapeFillStyleRef = useRef<ShapeFillStyle>("hachure");
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const textLayerInstanceRef = useRef<PdfTextLayer | null>(null);
  const continuingTextRef = useRef(false);
  const pageStoreRef = useRef<Map<number, PageState>>(new Map());
  const pagesRef = useRef<PdfPageSource[]>([]);
  const renderPageRef = useRef<(num: number) => void>(() => {});
  const helpHideTimerRef = useRef<number | null>(null);
  const pageNumRef = useRef(1);
  const notesRef = useRef<NoteItem[]>([]);
  const textAnnotationsRef = useRef<TextAnnotationItem[]>([]);
  const picturesRef = useRef<PictureItem[]>([]);
  const selectedObjectRef = useRef<SelectedObject | null>(null);
  const isPdfLoadedRef = useRef(false);
  const darkModeRef = useRef(false);
  const viewModeRef = useRef<ViewMode>("fit-width");
  const zoomLevelRef = useRef(0.5);
  const includePageNumbersRef = useRef(false);
  const signatureTextRef = useRef("");
  const authSessionRef = useRef<SupabaseSession | null>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);
  const strokesRef = useRef<CanvasStroke[]>([]);
  const currentStrokeRef = useRef<PencilStroke | null>(null);
  const keyboardActionsRef = useRef<KeyboardActions>({
    clearActiveTool: () => {},
    undo: () => {},
    redo: () => {},
    openFile: () => {},
    addBlankPage: () => {},
    exportPDF: () => {},
    selectTool: () => {},
    addNote: () => {},
    addPicture: () => {},
    deleteCurrentPage: () => {},
    goPage: () => {},
    changeZoom: () => {},
    changeViewMode: () => {},
  });

  // Keep refs in sync with state (for event handlers)
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { brushWidthRef.current = brushWidth; }, [brushWidth]);
  useEffect(() => { textBoldRef.current = textBold; }, [textBold]);
  useEffect(() => { textItalicRef.current = textItalic; }, [textItalic]);
  useEffect(() => { textUnderlineRef.current = textUnderline; }, [textUnderline]);
  useEffect(() => { textListStyleRef.current = textListStyle; }, [textListStyle]);
  useEffect(() => {
    activeTextIdRef.current = editingTextId ?? (selectedObject?.kind === "text" ? selectedObject.id : null);
  }, [editingTextId, selectedObject]);
  useEffect(() => { shapeFillColorRef.current = shapeFillColor; }, [shapeFillColor]);
  useEffect(() => { shapeFillStyleRef.current = shapeFillStyle; }, [shapeFillStyle]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { textAnnotationsRef.current = textAnnotations; }, [textAnnotations]);
  useEffect(() => { picturesRef.current = pictures; }, [pictures]);
  useEffect(() => { selectedObjectRef.current = selectedObject; }, [selectedObject]);
  useEffect(() => { isPdfLoadedRef.current = isPdfLoaded; }, [isPdfLoaded]);
  useEffect(() => { pageNumRef.current = pageNum; }, [pageNum]);
  useEffect(() => { darkModeRef.current = darkMode; }, [darkMode]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);
  useEffect(() => { includePageNumbersRef.current = includePageNumbers; }, [includePageNumbers]);
  useEffect(() => { signatureTextRef.current = signatureText; }, [signatureText]);
  useEffect(() => { authSessionRef.current = authSession; }, [authSession]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }, []);

  useEffect(() => {
    if (!accountSignInEnabled) return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token") ?? undefined;
    if (accessToken) {
      const session: SupabaseSession = {
        access_token: accessToken,
        refresh_token: refreshToken,
        provider_token: hash.get("provider_token") ?? undefined,
        provider_refresh_token: hash.get("provider_refresh_token") ?? undefined,
        token_type: hash.get("token_type") ?? undefined,
        expires_in: hash.get("expires_in") ? Number(hash.get("expires_in")) : undefined,
      };
      storeSupabaseSession(session);
      setAuthSession(session);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setLastSavedLabel("Signed in");
    } else {
      const stored = getStoredSupabaseSession();
      if (stored) setAuthSession(stored);
    }
  }, [accountSignInEnabled]);

  useEffect(() => {
    if (!authSession?.access_token) {
      setAuthUser(null);
      return;
    }
    let cancelled = false;
    void fetchSupabaseUser(authSession.access_token).then(user => {
      if (cancelled) return;
      setAuthUser(user);
    }).catch(() => {
      if (cancelled) return;
      setAuthUser(null);
      setAuthSession(null);
      storeSupabaseSession(null);
    });
    return () => { cancelled = true; };
  }, [authSession]);

  const flashToolTips = useCallback((msg: string) => {
    if (helpHideTimerRef.current) window.clearTimeout(helpHideTimerRef.current);
    setToolTipText(msg);
    setShowToolTips(true);
    helpHideTimerRef.current = window.setTimeout(() => {
      setShowToolTips(false);
      setToolTipText("");
      helpHideTimerRef.current = null;
    }, 2800);
  }, []);

  const clearActiveTool = useCallback(() => {
    setActiveTool("select");
    activeToolRef.current = "select";
    isDrawingRef.current = false;
    setSelectedObject(null);
    selectedObjectRef.current = null;
    setShowHelpPanel(false);
    setShowBrushWidthMenu(false);
    setShowTextSizeMenu(false);
    setShowTextSpaceMenu(false);
    setShowShapeMenu(false);
    const canvas = annotCanvasRef.current;
    if (canvas) {
      canvas.style.pointerEvents = "none";
      canvas.style.cursor = "default";
    }
    window.getSelection()?.removeAllRanges();
    setEditingTextId(null);
    toast("Select active");
  }, [toast]);

  const redrawAnnotationLayer = useCallback((baseImageData?: ImageData | null, strokes?: CanvasStroke[]) => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const nextBase = baseImageData ?? baseImageDataRef.current;
    if (nextBase && nextBase.width === canvas.width && nextBase.height === canvas.height) {
      ctx.putImageData(nextBase, 0, 0);
    } else if (nextBase) {
      const tmp = document.createElement("canvas");
      tmp.width = nextBase.width;
      tmp.height = nextBase.height;
      tmp.getContext("2d")?.putImageData(nextBase, 0, 0);
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    }
    drawCanvasStrokes(ctx, strokes ?? strokesRef.current);
  }, []);

  const captureSnapshot = useCallback((): DocumentSnapshot | null => {
    const canvas = annotCanvasRef.current;
    if (!canvas || canvas.width === 0 || !baseImageDataRef.current) return null;
    return {
      baseImageData: fitImageDataToSize(baseImageDataRef.current, canvas.width, canvas.height),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      notes: notesRef.current.map(n => ({ ...n })),
      textAnnotations: textAnnotationsRef.current.map(t => ({ ...t })),
      pictures: picturesRef.current.map(p => ({ ...p })),
      strokes: strokesRef.current.map(cloneCanvasStroke),
    };
  }, []);

  const saveState = useCallback(() => {
    const snapshot = captureSnapshot();
    if (!snapshot) return;
    undoListRef.current.push(snapshot);
    if (undoListRef.current.length > 30) undoListRef.current.shift();
    if (preserveRedoOnceRef.current) {
      preserveRedoOnceRef.current = false;
    } else {
      redoListRef.current = [];
    }
    setLocalSaveVersion(version => version + 1);
  }, [captureSnapshot]);

  const restoreState = useCallback((snapshot: DocumentSnapshot) => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    canvas.width = snapshot.canvasWidth;
    canvas.height = snapshot.canvasHeight;
    baseImageDataRef.current = cloneImageData(snapshot.baseImageData);
    strokesRef.current = snapshot.strokes.map(cloneCanvasStroke);
    redrawAnnotationLayer(baseImageDataRef.current, strokesRef.current);
    setNotes(snapshot.notes.map(n => ({ ...n })));
    setTextAnnotations(snapshot.textAnnotations.map(t => ({ ...t })));
    setPictures(snapshot.pictures.map(p => ({ ...p })));
  }, [redrawAnnotationLayer]);

  const savePageState = useCallback((num: number) => {
    const annC = annotCanvasRef.current;
    if (!annC || annC.width === 0 || num <= 0 || !baseImageDataRef.current) return;
    pageStoreRef.current.set(num, {
      baseImageData: fitImageDataToSize(baseImageDataRef.current, annC.width, annC.height),
      canvasWidth: annC.width,
      canvasHeight: annC.height,
      undoStack: [...undoListRef.current],
      redoStack: [...redoListRef.current],
      notes: notesRef.current.map(n => ({ ...n })),
      textAnnotations: textAnnotationsRef.current.map(t => ({ ...t })),
      pictures: picturesRef.current.map(p => ({ ...p })),
      strokes: strokesRef.current.map(cloneCanvasStroke),
    });
  }, []);

  const restorePageState = useCallback((num: number) => {
    const stored = pageStoreRef.current.get(num);
    const annC = annotCanvasRef.current;
    if (!annC) return;
    const ctx = annC.getContext("2d");
    if (!ctx) return;

    if (stored) {
      baseImageDataRef.current = cloneImageData(stored.baseImageData);
      strokesRef.current = stored.strokes.map(cloneCanvasStroke);
      redrawAnnotationLayer(baseImageDataRef.current, strokesRef.current);
      undoListRef.current = stored.undoStack.length ? [...stored.undoStack] : [];
      redoListRef.current = [...stored.redoStack];
      if (!undoListRef.current.length) saveState();
      setNotes(stored.notes.map(n => ({ ...n })));
      setTextAnnotations(stored.textAnnotations.map(t => ({ ...t })));
      setPictures((stored.pictures ?? []).map(p => ({ ...p })));
    } else {
      ctx.clearRect(0, 0, annC.width, annC.height);
      baseImageDataRef.current = createEmptyImageData(annC.width, annC.height);
      strokesRef.current = [];
      undoListRef.current = [];
      redoListRef.current = [];
      saveState();
      setNotes([]);
      setTextAnnotations([]);
      setPictures([]);
    }
  }, [redrawAnnotationLayer, saveState]);

  const renderPageBackgroundDataUrl = useCallback(async (pageIndex: number) => {
    const source = pagesRef.current[pageIndex];
    if (!source) throw new Error("Page not found");
    const page = await source.doc.getPage(source.pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare background canvas");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  }, []);

  const serializeLocalState = useCallback(async (): Promise<LocalEditorState> => {
    savePageState(pageNumRef.current);
    const pages: LocalPageSnapshot[] = [];

    for (let index = 0; index < pagesRef.current.length; index += 1) {
      const source = pagesRef.current[index];
      const stored = pageStoreRef.current.get(index + 1);
      const background = await renderPageBackgroundDataUrl(index);
      const overlayDataUrl = stored ? imageDataToDataUrl(stored.baseImageData) : (() => {
        const blank = document.createElement("canvas");
        blank.width = background.width;
        blank.height = background.height;
        return blank.toDataURL("image/png");
      })();

      pages.push({
        pageNumber: index + 1,
        name: source.name,
        backgroundDataUrl: background.dataUrl,
        overlayDataUrl,
        canvasWidth: stored?.canvasWidth ?? background.width,
        canvasHeight: stored?.canvasHeight ?? background.height,
        notes: stored?.notes.map(note => ({ ...note })) ?? [],
        textAnnotations: stored?.textAnnotations.map(annotation => ({ ...annotation })) ?? [],
        pictures: stored?.pictures.map(picture => ({ ...picture })) ?? [],
        strokes: stored?.strokes.map(cloneCanvasStroke) ?? [],
      });
    }

    return {
      version: 1,
      docTitle,
      docSubtitle,
      totalPages: pages.length,
      pageNum: pageNumRef.current,
      includePageNumbers: includePageNumbersRef.current,
      darkMode: darkModeRef.current,
      viewMode: viewModeRef.current,
      zoomLevel: zoomLevelRef.current,
      pages,
    };
  }, [docSubtitle, docTitle, renderPageBackgroundDataUrl, savePageState]);

  const localAccountKey = useCallback(() => authUser?.email?.trim().toLowerCase() || "local-browser", [authUser?.email]);

  const readRecentLocalDrafts = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(localRecentKey(localAccountKey()));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(item => item?.docId).slice(0, 12) as LocalDraftMeta[] : [];
    } catch {
      return [];
    }
  }, [localAccountKey]);

  const refreshRecentLocalDrafts = useCallback(() => {
    setRecentLocalDrafts(readRecentLocalDrafts());
  }, [readRecentLocalDrafts]);

  const writeRecentLocalDraft = useCallback((meta: LocalDraftMeta) => {
    const key = localRecentKey(localAccountKey());
    const next = [
      meta,
      ...readRecentLocalDrafts().filter(item => item.docId !== meta.docId),
    ].slice(0, 12);
    window.localStorage.setItem(key, JSON.stringify(next));
    setRecentLocalDrafts(next);
  }, [localAccountKey, readRecentLocalDrafts]);

  const persistLocalDraft = useCallback((docId: string, payload: LocalEditorState) => {
    const savedAt = Date.now();
    const record = {
      version: 3,
      docId,
      title: payload.docTitle || "Untitled document",
      savedAt,
      payload,
    };
    window.localStorage.setItem(localDraftKey(docId), JSON.stringify(record));
    window.localStorage.setItem(LOCAL_LATEST_DRAFT_KEY, JSON.stringify(record));
    window.localStorage.setItem(LOCAL_DOC_ID_KEY, docId);
    writeRecentLocalDraft({
      docId,
      title: payload.docTitle || "Untitled document",
      subtitle: payload.docSubtitle || `${payload.totalPages || payload.pages.length} page${(payload.totalPages || payload.pages.length) === 1 ? "" : "s"}`,
      savedAt,
      pageCount: payload.totalPages || payload.pages.length || 1,
      previewDataUrl: payload.pages[0]?.backgroundDataUrl,
    });
    return savedAt;
  }, [writeRecentLocalDraft]);

  const syncLocalDraftToDrive = useCallback(async (docId: string, payload: LocalEditorState, savedAt: number) => {
    const token = authSessionRef.current?.provider_token;
    if (!hasGoogleDriveToken(token)) return false;

    void savedAt;
    await deleteDriveProjectFile(token, `colora-draft-${docId}.json`).catch(() => false);
    await deleteDriveProjectFile(token, DRIVE_RECENT_FILE_NAME).catch(() => false);
    if (pagesRef.current.length) {
      const pdfBlob = await buildCurrentPdfBlob();
      await saveDriveProjectFile(token, drivePdfFileName(payload.docTitle), pdfBlob, "application/pdf");
    }
    return true;
  }, []);

  const hydrateLocalState = useCallback(async (payload: LocalEditorState) => {
    const hydratedPages = await Promise.all(payload.pages.map(async page => ({
      doc: createImagePdfDocument(await loadImageFromDataUrl(page.backgroundDataUrl)),
      pageNumber: 1,
      name: page.name || `Page ${page.pageNumber}`,
    })));

    const hydratedStoreEntries = await Promise.all(payload.pages.map(async page => {
      const imageData = await dataUrlToImageData(page.overlayDataUrl, page.canvasWidth, page.canvasHeight);
      return [
        page.pageNumber,
        {
          baseImageData: imageData,
          canvasWidth: page.canvasWidth,
          canvasHeight: page.canvasHeight,
          undoStack: [],
          redoStack: [],
          notes: page.notes.map(note => ({ ...note })),
          textAnnotations: page.textAnnotations.map(annotation => ({ ...annotation })),
          pictures: page.pictures.map(picture => ({ ...picture })),
          strokes: (page.strokes ?? []).map(stroke => stroke.kind === "pencil"
            ? { ...stroke, points: stroke.points.map(point => ({ ...point })) }
            : { ...stroke, boxes: stroke.boxes.map(box => ({ ...box })) }),
        } satisfies PageState,
      ] as const;
    }));

    pagesRef.current = hydratedPages;
    pdfDocRef.current = hydratedPages[0]?.doc ?? null;
    pageStoreRef.current = new Map<number, PageState>(hydratedStoreEntries);
    undoListRef.current = [];
    redoListRef.current = [];
    setNotes([]);
    setTextAnnotations([]);
    setPictures([]);
    setDocTitle(payload.docTitle || "Untitled document");
    setDocSubtitle(payload.docSubtitle || "");
    setIncludePageNumbers(payload.includePageNumbers);
    setDarkMode(payload.darkMode);
    setViewMode(payload.viewMode);
    setZoomLevel(payload.zoomLevel);
    setTotalPages(payload.totalPages || hydratedPages.length || 1);
    setIsPdfLoaded(hydratedPages.length > 0);
    setSelectedObject(null);
    setEditingTextId(null);

    const nextPage = Math.max(1, Math.min(payload.pageNum || 1, hydratedPages.length || 1));
    requestAnimationFrame(() => {
      renderPageRef.current(nextPage);
      setLastSavedLabel("Loaded local draft");
    });
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    try {
      setIsAuthWorking(true);
      startGoogleSignIn();
      return { ok: true, message: "Redirecting to Google sign-in..." };
    } catch (error) {
      const message = error instanceof SupabaseAuthConfigError
        ? error.message
        : "Could not start Google sign-in. Check Supabase Google auth settings.";
      toast(message);
      setIsAuthWorking(false);
      return { ok: false, message };
    }
  }, [toast]);

  const signOutAccount = useCallback(async () => {
    try {
      setIsAuthWorking(true);
      if (authSessionRef.current?.access_token) {
        await signOutSupabaseSession(authSessionRef.current.access_token);
      }
    } catch {
      // ignore remote logout issues
    } finally {
      setAuthSession(null);
      setAuthUser(null);
      storeSupabaseSession(null);
      setIsAuthWorking(false);
      setLastSavedLabel("Signed out");
      toast("Signed out");
    }
  }, [toast]);

  const renderTextLayer = useCallback(async (page: PdfPage, vp: PdfViewport) => {
    const textLayerDiv = textLayerRef.current;
    const pdfjs = pdfjsLibRef.current;
    if (!textLayerDiv || !pdfjs?.TextLayer) {
      toast("Text selection unavailable");
      return;
    }

    if (textLayerInstanceRef.current) {
      textLayerInstanceRef.current.cancel();
      textLayerInstanceRef.current = null;
    }

    textLayerDiv.innerHTML = "";
    textLayerDiv.style.width = `${vp.width}px`;
    textLayerDiv.style.height = `${vp.height}px`;

    const textContent = await page.getTextContent();
    if (!textContent.items?.length) {
      return;
    }

    const textLayer = new pdfjs.TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: vp,
    });
    textLayerInstanceRef.current = textLayer;
    await textLayer.render();
  }, [toast]);

  // Setup canvas dimensions to match container
  const setupCanvas = useCallback(() => {
    requestAnimationFrame(() => {
      const canvas = annotCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || pdfDocRef.current) return;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (w === 0) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.lineCap = "round"; ctx.lineJoin = "round"; }
      baseImageDataRef.current = createEmptyImageData(w, h);
      strokesRef.current = [];
      undoListRef.current = [];
      redoListRef.current = [];
      saveState();
      setNotes([]);
    });
  }, [saveState]);

  // Load pdfjs
  useEffect(() => {
    const handleResize = () => {
      if (pdfDocRef.current) {
        savePageState(pageNumRef.current);
        renderPageRef.current(pageNumRef.current);
      } else {
        setupCanvas();
      }
    };

    const run = async () => {
      try {
        const pdfjs = await import("pdfjs-dist") as unknown as PdfJsLib;
        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
        pdfjsLibRef.current = pdfjs;
        setupCanvas();
        window.addEventListener("resize", handleResize);
      } catch (e) { console.error(e); }
    };
    run();
    return () => window.removeEventListener("resize", handleResize);
  }, [savePageState, setupCanvas]);

  // ─── TOOL SELECTION ───────────────────────────────────────────────
  const selectTool = (tool: string) => {
    setActiveTool(tool);
    activeToolRef.current = tool;
    setShowShapeMenu(false);
    const canvas = annotCanvasRef.current;
    if (!canvas) return;

    if (tool === "pencil" || isShapeTool(tool) || tool === "eraser" || tool === "text" || tool === "signature") {
      canvas.style.pointerEvents = "auto";
      canvas.style.cursor = tool === "pencil" ? "crosshair"
        : tool === "eraser" ? "cell"
        : isShapeTool(tool) ? "crosshair"
        : tool === "text" || tool === "signature" ? "text"
        : "crosshair";
    } else if (tool === "highlighter" || tool === "select") {
      // Allow text selection through canvas
      canvas.style.pointerEvents = "none";
      canvas.style.cursor = tool === "select" ? "default" : "text";
    } else {
      canvas.style.pointerEvents = "auto";
    }

    if (tool !== "select") {
      setEditingTextId(null);
      setSelectedObject(null);
      selectedObjectRef.current = null;
      activeTextIdRef.current = null;
    }

    // Adjust defaults per tool
    if (tool === "highlighter") { setActiveColor(DEFAULT_HIGHLIGHT_COLOR); activeColorRef.current = DEFAULT_HIGHLIGHT_COLOR; setBrushWidth(22); }
    if (tool === "pencil") { setActiveColor(INK_COLOR); activeColorRef.current = INK_COLOR; setBrushWidth(3); }
    if (isShapeTool(tool)) { setActiveColor(INK_COLOR); activeColorRef.current = INK_COLOR; setBrushWidth(2); }
    if (tool === "text" || tool === "signature") { setActiveColor(TEXT_COLOR); activeColorRef.current = TEXT_COLOR; }
    if (tool === "eraser") { setActiveColor("#FFFFFF"); activeColorRef.current = "#FFFFFF"; setBrushWidth(20); }
    const toolMessages: Record<string, string> = {
      select: "Select mode ready. Use ? for hotkeys.",
      highlighter: "Highlight mode ready. Use ? for hotkeys.",
      pencil: "Draw mode ready. Use ? for hotkeys.",
      rect: "Rectangle tool ready. Use ? for hotkeys.",
      ellipse: "Ellipse tool ready. Use ? for hotkeys.",
      diamond: "Diamond tool ready. Use ? for hotkeys.",
      line: "Line tool ready. Use ? for hotkeys.",
      arrow: "Arrow tool ready. Use ? for hotkeys.",
      text: "Text tool ready. Use ? for hotkeys.",
      signature: "Signature tool ready. Use ? for hotkeys.",
      eraser: "Eraser ready. Use ? for hotkeys.",
      "note-btn": "Note added. Use ? for hotkeys.",
    };
    flashToolTips(toolMessages[tool] ?? "Tool selected. Use ? for hotkeys.");
  };

  // ─── UNDO / REDO ──────────────────────────────────────────────────
  const undo = () => {
    if (undoListRef.current.length <= 1) { toast("Nothing to undo"); return; }
    const cur = undoListRef.current.pop()!;
    redoListRef.current.push(cur);
    restoreState(undoListRef.current[undoListRef.current.length - 1]);
    preserveRedoOnceRef.current = true;
    toast("Undo ✓");
  };

  const redo = () => {
    if (!redoListRef.current.length) { toast("Nothing to redo"); return; }
    const next = redoListRef.current.pop()!;
    undoListRef.current.push(next);
    restoreState(next);
    preserveRedoOnceRef.current = true;
    toast("Redo ✓");
  };

  // ─── NOTES ────────────────────────────────────────────────────────
  const addNote = () => {
    const id = crypto.randomUUID();
    setNotes(prev => [...prev, { id, text: "", x: 160, y: 220 + prev.length * 100 }]);
    setSelectedObject({ kind: "note", id });
    toast("Note added");
  };

  const removeNote = useCallback((id: string) => {
    saveState();
    setNotes(p => p.filter(n => n.id !== id));
    if (selectedObjectRef.current?.kind === "note" && selectedObjectRef.current.id === id) {
      setSelectedObject(null);
      selectedObjectRef.current = null;
    }
  }, [saveState]);
  const updateNote = (id: string, text: string) =>
    setNotes(p => p.map(n => n.id === id ? { ...n, text } : n));

  const dragNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const cr = container.getBoundingClientRect();
    const ox = e.clientX - cr.left - note.x;
    const oy = e.clientY - cr.top - note.y;
    const onMove = (ev: MouseEvent) => {
      setNotes(p => p.map(n => n.id === id ? {
        ...n,
        x: ev.clientX - cr.left - ox,
        y: ev.clientY - cr.top - oy
      } : n));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const dragText = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const annotation = textAnnotations.find(t => t.id === id);
    if (!annotation) return;
    const cr = container.getBoundingClientRect();
    const ox = e.clientX - cr.left - annotation.x;
    const oy = e.clientY - cr.top - annotation.y;
    const onMove = (ev: MouseEvent) => {
      setTextAnnotations(prev => prev.map(t => t.id === id ? {
        ...t,
        x: ev.clientX - cr.left - ox,
        y: ev.clientY - cr.top - oy,
      } : t));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handlePictureFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isPdfLoaded) return;
    try {
      const image = await loadImageElement(file);
      const src = await readFileAsDataUrl(file);
      const id = `${Date.now().toString(36)}-${file.name}`;
      const container = containerRef.current;
      const maxWidth = Math.min(320, (container?.clientWidth ?? 640) * 0.42);
      const ratio = image.naturalWidth ? image.naturalHeight / image.naturalWidth : 1;
      const width = Math.max(140, maxWidth);
      const height = Math.max(100, width * ratio);
      const x = Math.max(24, ((container?.clientWidth ?? width) - width) / 2);
      const y = Math.max(24, ((container?.clientHeight ?? height) - height) / 2);

      setPictures(prev => [...prev, {
        id,
        src,
        name: file.name,
        x,
        y,
        width,
        height,
      }]);
      setSelectedObject({ kind: "picture", id });
      toast("Picture added");
    } catch {
      toast("Could not add picture");
    } finally {
      e.target.value = "";
    }
  };

  const removePicture = useCallback((id: string) => {
    saveState();
    setPictures(p => p.filter(pic => pic.id !== id));
    if (selectedObjectRef.current?.kind === "picture" && selectedObjectRef.current.id === id) {
      setSelectedObject(null);
      selectedObjectRef.current = null;
    }
  }, [saveState]);

  const dragPicture = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const picture = pictures.find(pic => pic.id === id);
    if (!picture) return;
    const cr = container.getBoundingClientRect();
    const ox = e.clientX - cr.left - picture.x;
    const oy = e.clientY - cr.top - picture.y;
    const onMove = (ev: MouseEvent) => {
      setPictures(p => p.map(pic => pic.id === id ? {
        ...pic,
        x: ev.clientX - cr.left - ox,
        y: ev.clientY - cr.top - oy,
      } : pic));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const resizePicture = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const picture = pictures.find(pic => pic.id === id);
    if (!picture) return;
    const handle = (e.currentTarget as HTMLElement).dataset.handle ?? "se";
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { x: picture.x, y: picture.y, w: picture.width, h: picture.height };
    const aspect = picture.height / Math.max(1, picture.width);
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      const next = { ...start };

      if (handle.includes("e")) next.w = Math.max(120, start.w + dx);
      if (handle.includes("s")) next.h = Math.max(80, start.h + dy);
      if (handle.includes("w")) {
        next.w = Math.max(120, start.w - dx);
        next.x = start.x + (start.w - next.w);
      }
      if (handle.includes("n")) {
        next.h = Math.max(80, start.h - dy);
        next.y = start.y + (start.h - next.h);
      }

      // Keep the image from distorting too aggressively when only one axis moves.
      if (handle === "e" || handle === "w") next.h = Math.max(80, next.w * aspect);
      if (handle === "n" || handle === "s") next.w = Math.max(120, next.h / Math.max(0.01, aspect));

      const round = (value: number) => Math.round(value * 2) / 2;
      next.w = Math.max(120, next.w);
      next.h = Math.max(80, next.h);

      setPictures(p => p.map(pic => pic.id === id ? {
        ...pic,
        x: round(next.x),
        y: round(next.y),
        width: round(next.w),
        height: round(next.h),
      } : pic));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const resizeHandleStyle = (position: React.CSSProperties, cursor: React.CSSProperties["cursor"]): React.CSSProperties => ({
    position: "absolute",
    width: "18px",
    height: "18px",
    borderRadius: "6px",
    border: `1px solid ${dm ? "rgba(255,255,255,0.3)" : "rgba(94,93,106,0.22)"}`,
    background: c.panelBg,
    boxShadow: "0 8px 18px rgba(37,50,74,0.18)",
    cursor,
    zIndex: 3,
    ...position,
  });

  const selectPictureAtPoint = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const hit = [...pictures].reverse().find(p =>
      x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height
    );
    if (hit) {
      setSelectedObject({ kind: "picture", id: hit.id });
      selectedObjectRef.current = { kind: "picture", id: hit.id };
    }
  };

  const hitInteractiveObjectAtPoint = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const textHit = textAnnotationsRef.current.some(annotation =>
      x >= annotation.x &&
      x <= annotation.x + Math.max(24, annotation.fontSize * (annotation.text.length * 0.45 + 0.5)) &&
      y >= annotation.y - 6 &&
      y <= annotation.y + Math.max(38, annotation.fontSize * annotation.lineHeight + 12)
    );
    if (textHit) return true;
    return picturesRef.current.some(picture =>
      x >= picture.x &&
      x <= picture.x + picture.width &&
      y >= picture.y &&
      y <= picture.y + picture.height
    );
  };

  const eraseObjectsAtPoint = useCallback((x: number, y: number, radius: number) => {
    const container = containerRef.current;
    const canvas = annotCanvasRef.current;
    if (!container || !canvas) return;

    const containerRect = container.getBoundingClientRect();
    const scaleX = canvas.width / containerRect.width;
    const scaleY = canvas.height / containerRect.height;
    const circleIntersectsRect = (left: number, top: number, width: number, height: number) => {
      const nearestX = Math.max(left, Math.min(x, left + width));
      const nearestY = Math.max(top, Math.min(y, top + height));
      return Math.hypot(x - nearestX, y - nearestY) <= radius;
    };
    const elementHit = (selector: string, fallback: { x: number; y: number; width: number; height: number }) => {
      const el = container.querySelector<HTMLElement>(selector);
      if (!el) return circleIntersectsRect(fallback.x, fallback.y, fallback.width, fallback.height);
      const rect = el.getBoundingClientRect();
      return circleIntersectsRect(
        (rect.left - containerRect.left) * scaleX,
        (rect.top - containerRect.top) * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
      );
    };

    const nextText = textAnnotationsRef.current.filter(annotation => {
      const width = Math.max(80, annotation.fontSize * Math.max(3, annotation.text.length * 0.58));
      const height = Math.max(38, annotation.fontSize * annotation.lineHeight * Math.max(1, annotation.text.split("\n").length) + 12);
      return !elementHit(`[data-text-id="${CSS.escape(annotation.id)}"]`, {
        x: annotation.x,
        y: annotation.y,
        width,
        height,
      });
    });
    if (nextText.length !== textAnnotationsRef.current.length) {
      textAnnotationsRef.current = nextText;
      setTextAnnotations(nextText);
      const selected = selectedObjectRef.current;
      if (selected?.kind === "text" && !nextText.some(item => item.id === selected.id)) {
        setSelectedObject(null);
        selectedObjectRef.current = null;
        setEditingTextId(null);
      }
    }

    const nextNotes = notesRef.current.filter(note => !elementHit(`[data-note-id="${CSS.escape(note.id)}"]`, {
      x: note.x,
      y: note.y,
      width: 190,
      height: 110,
    }));
    if (nextNotes.length !== notesRef.current.length) {
      notesRef.current = nextNotes;
      setNotes(nextNotes);
      const selected = selectedObjectRef.current;
      if (selected?.kind === "note" && !nextNotes.some(item => item.id === selected.id)) {
        setSelectedObject(null);
        selectedObjectRef.current = null;
      }
    }

    const nextPictures = picturesRef.current.filter(picture => !elementHit(`[data-picture-id="${CSS.escape(picture.id)}"]`, picture));
    if (nextPictures.length !== picturesRef.current.length) {
      picturesRef.current = nextPictures;
      setPictures(nextPictures);
      const selected = selectedObjectRef.current;
      if (selected?.kind === "picture" && !nextPictures.some(item => item.id === selected.id)) {
        setSelectedObject(null);
        selectedObjectRef.current = null;
      }
    }
  }, []);

  const eraseStrokesAtPoint = useCallback((x: number, y: number, radius: number) => {
    const nextStrokes = strokesRef.current.filter(stroke => {
      if (stroke.kind === "pencil") {
        return !stroke.points.some(point => Math.hypot(point.x - x, point.y - y) <= radius);
      }
      return !stroke.boxes.some(box => {
        const nearestX = Math.max(box.x, Math.min(x, box.x + box.w));
        const nearestY = Math.max(box.y, Math.min(y, box.y + box.h));
        return Math.hypot(x - nearestX, y - nearestY) <= radius;
      });
    });
    const changed = nextStrokes.length !== strokesRef.current.length;
    if (changed) {
      strokesRef.current = nextStrokes;
    }
    return changed;
  }, []);

  // ─── CANVAS DRAWING ───────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const tool = activeToolRef.current;
    if (!tool) return;
    if (tool === "text") { insertTextAt(e.clientX, e.clientY); return; }
    if (tool === "signature") { insertSignatureAt(e.clientX, e.clientY); return; }
    if (tool === "highlighter" || tool === "select") return; // handled by selection

    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    // Scale for device pixel ratio if canvas size differs from CSS size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    lastXRef.current = x; lastYRef.current = y;
    shapeStartXRef.current = x; shapeStartYRef.current = y;

    saveState();
    if (tool === "pencil") {
      currentStrokeRef.current = {
        id: crypto.randomUUID(),
        kind: "pencil",
        color: activeColorRef.current,
        width: brushWidthRef.current,
        points: [{ x, y }],
      };
    }
    if (tool === "eraser") {
      eraseObjectsAtPoint(x, y, brushWidthRef.current);
      if (baseImageDataRef.current) {
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        const tmpCtx = tmp.getContext("2d");
        if (tmpCtx) {
          tmpCtx.putImageData(baseImageDataRef.current, 0, 0);
          tmpCtx.globalCompositeOperation = "destination-out";
          tmpCtx.beginPath();
          tmpCtx.arc(x, y, brushWidthRef.current, 0, Math.PI * 2);
          tmpCtx.fill();
          baseImageDataRef.current = tmpCtx.getImageData(0, 0, canvas.width, canvas.height);
        }
      }
      eraseStrokesAtPoint(x, y, brushWidthRef.current);
      redrawAnnotationLayer();
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const tool = activeToolRef.current;
    const color = activeColorRef.current;
    const width = brushWidthRef.current;

    if (tool === "pencil") {
      if (currentStrokeRef.current) {
        currentStrokeRef.current.points.push({ x: cx, y: cy });
        redrawAnnotationLayer(baseImageDataRef.current, [...strokesRef.current, currentStrokeRef.current]);
      }
    } else if (tool === "eraser") {
      if (baseImageDataRef.current) {
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        const tmpCtx = tmp.getContext("2d");
        if (tmpCtx) {
          tmpCtx.putImageData(baseImageDataRef.current, 0, 0);
          tmpCtx.globalCompositeOperation = "destination-out";
          tmpCtx.fillStyle = "rgba(0,0,0,1)";
          tmpCtx.beginPath();
          tmpCtx.arc(cx, cy, width, 0, Math.PI * 2);
          tmpCtx.fill();
          baseImageDataRef.current = tmpCtx.getImageData(0, 0, canvas.width, canvas.height);
        }
      }
      eraseObjectsAtPoint(cx, cy, width);
      eraseStrokesAtPoint(cx, cy, width);
      redrawAnnotationLayer();
    } else if (isShapeTool(tool)) {
      redrawAnnotationLayer();
      const x = shapeStartXRef.current;
      const y = shapeStartYRef.current;
      drawRoughShape(ctx, tool, x, y, cx, cy, color, shapeFillColorRef.current, shapeFillStyleRef.current);
    }

    lastXRef.current = cx; lastYRef.current = cy;
  };

  const onMouseUp = () => {
    if (!isDrawingRef.current) return;
    const canvas = annotCanvasRef.current;
    isDrawingRef.current = false;
    if (activeToolRef.current === "pencil" && currentStrokeRef.current) {
      strokesRef.current = [...strokesRef.current, cloneCanvasStroke(currentStrokeRef.current)];
      currentStrokeRef.current = null;
      redrawAnnotationLayer();
    } else if (isShapeTool(activeToolRef.current) && canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        baseImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        redrawAnnotationLayer();
      }
    }
    saveState();
  };

  // ─── TEXT ANNOTATION ──────────────────────────────────────────────
  const finishTextEdit = (textId: string, nextText: string) => {
    saveState();
    const clean = nextText.replace(/\r/g, "").trimEnd();
    if (!clean) {
      setTextAnnotations(prev => prev.filter(t => t.id !== textId));
    } else {
      setTextAnnotations(prev => prev.map(t => t.id === textId ? { ...t, text: clean } : t));
    }
    setEditingTextId(null);
    setTextListStyle("none");
  };

  const wrapTextLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const hardLines = text.split("\n");
    const wrapped: string[] = [];

    for (const hardLine of hardLines) {
      if (!hardLine.trim()) {
        wrapped.push("");
        continue;
      }

      const words = hardLine.split(/\s+/);
      let current = "";

      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width <= maxWidth || !current) {
          current = next;
        } else {
          wrapped.push(current);
          current = word;
        }
      }

      if (current) wrapped.push(current);
    }

    return wrapped;
  };

  const getWrappedTextLayout = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    const lines = wrapTextLines(ctx, text, maxWidth);
    const layout: Array<{ text: string; start: number; end: number }> = [];
    let cursor = 0;

    lines.forEach(line => {
      if (!line) {
        const newlineIndex = text.indexOf("\n", cursor);
        const start = newlineIndex >= 0 ? newlineIndex : cursor;
        layout.push({ text: line, start, end: start });
        cursor = newlineIndex >= 0 ? newlineIndex + 1 : cursor;
        return;
      }

      const nextIndex = text.indexOf(line, cursor);
      const start = nextIndex >= 0 ? nextIndex : cursor;
      const end = start + line.length;
      layout.push({ text: line, start, end });
      cursor = end;
    });

    return layout;
  };

  const insertTextAt = (clientX: number, clientY: number) => {
    const canvas = annotCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    const id = Date.now().toString(36);
    setTextAnnotations(prev => [...prev, {
      id,
      text: "",
      x,
      y,
      fontSize: textFontSize,
      lineHeight: textLineHeight,
      color: activeColorRef.current,
      align: textAlignRef.current,
      listStyle: "none",
      bold: textBoldRef.current,
      italic: textItalicRef.current,
      underline: textUnderlineRef.current,
    }]);
    setTextListStyle("none");
    setEditingTextId(id);
    saveState();
  };

  const insertSignatureAt = (clientX: number, clientY: number) => {
    const canvas = annotCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    let text = signatureTextRef.current.trim();
    if (!text) {
      text = window.prompt("Signature text", "")?.trim() ?? "";
      if (!text) return;
      setSignatureText(text);
      signatureTextRef.current = text;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    saveState();
    ctx.save();
    ctx.fillStyle = activeColorRef.current;
    ctx.font = `34px "Brush Script MT", "Segoe Script", cursive`;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x * scaleX, y * scaleY);
    ctx.restore();
    saveState();
    toast("Signature added");
  };

  const onTextPointerDown = (annotation: TextAnnotationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeToolRef.current === "highlighter") return;
    const isSelected = selectedObjectRef.current?.kind === "text" && selectedObjectRef.current.id === annotation.id;
    if (!isSelected || activeToolRef.current !== "select") {
      setSelectedObject({ kind: "text", id: annotation.id });
      selectedObjectRef.current = { kind: "text", id: annotation.id };
    }
    activeTextIdRef.current = annotation.id;
    textAlignRef.current = annotation.align ?? "left";
    setTextListStyle(annotation.listStyle ?? "none");
    dragText(annotation.id, e);
  };

  const onTextDoubleClick = (annotation: TextAnnotationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeToolRef.current !== "select") return;
    setSelectedObject({ kind: "text", id: annotation.id });
    selectedObjectRef.current = { kind: "text", id: annotation.id };
    activeTextIdRef.current = annotation.id;
    setTextFontSize(annotation.fontSize);
    setTextLineHeight(annotation.lineHeight);
    setActiveColor(annotation.color);
    activeColorRef.current = annotation.color;
    textAlignRef.current = annotation.align ?? "left";
    setTextBold(Boolean(annotation.bold));
    setTextItalic(Boolean(annotation.italic));
    setTextUnderline(Boolean(annotation.underline));
    setTextListStyle(annotation.listStyle ?? "none");
    setEditingTextId(annotation.id);
  };

  const setTextAlign = (align: "left" | "center" | "right") => {
    textAlignRef.current = align;
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
    if (targetId) {
      setTextAnnotations(prev => prev.map(t => t.id === targetId ? { ...t, align } : t));
    }
  };

  const setTextStyle = (key: "bold" | "italic" | "underline", value: boolean) => {
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
    if (key === "bold" && targetId) {
      const input = document.querySelector<HTMLTextAreaElement>(`.text-annotation-input[data-text-id="${CSS.escape(targetId)}"]`);
      const selectionStart = input?.selectionStart ?? null;
      const selectionEnd = input?.selectionEnd ?? null;
      if (input && selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
        const raw = input.value;
        const hasBoldMarkers =
          raw.slice(Math.max(0, selectionStart - 2), selectionStart) === "**" &&
          raw.slice(selectionEnd, selectionEnd + 2) === "**";
        const nextText = hasBoldMarkers
          ? `${raw.slice(0, selectionStart - 2)}${raw.slice(selectionStart, selectionEnd)}${raw.slice(selectionEnd + 2)}`
          : `${raw.slice(0, selectionStart)}**${raw.slice(selectionStart, selectionEnd)}**${raw.slice(selectionEnd)}`;
        const nextStart = hasBoldMarkers ? Math.max(0, selectionStart - 2) : selectionStart + 2;
        const nextEnd = hasBoldMarkers ? Math.max(0, selectionEnd - 2) : selectionEnd + 2;
        setTextAnnotations(prev => prev.map(t => t.id === targetId ? { ...t, text: nextText } : t));
        requestAnimationFrame(() => {
          const nextInput = document.querySelector<HTMLTextAreaElement>(`.text-annotation-input[data-text-id="${CSS.escape(targetId)}"]`);
          if (!nextInput) return;
          nextInput.focus();
          nextInput.setSelectionRange(nextStart, nextEnd);
        });
        return;
      }
    }
    if (key === "bold") {
      setTextBold(value);
      textBoldRef.current = value;
    }
    if (key === "italic") {
      setTextItalic(value);
      textItalicRef.current = value;
    }
    if (key === "underline") {
      setTextUnderline(value);
      textUnderlineRef.current = value;
    }
    if (targetId) {
      setTextAnnotations(prev => prev.map(t => t.id === targetId ? { ...t, [key]: value } : t));
    }
  };

  const updateCurrentTextAnnotation = (patch: Partial<TextAnnotationItem>) => {
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
    if (!targetId) return;
    setTextAnnotations(prev => prev.map(t => t.id === targetId ? { ...t, ...patch } : t));
  };

  const syncActiveTextEditorStyle = (patch: { fontSize?: number; lineHeight?: number; color?: string; align?: "left" | "center" | "right" }) => {
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
    if (!targetId) return;
    const input = document.querySelector<HTMLTextAreaElement>(`.text-annotation-input[data-text-id="${targetId}"]`);
    if (!input) return;
    const currentFontSize = patch.fontSize ?? Number.parseFloat(input.style.fontSize || "18");
    const currentLineHeight = patch.lineHeight ?? (Number.parseFloat(input.style.lineHeight || `${currentFontSize * 1.35}`) / currentFontSize);
    const linePx = Math.max(1, currentFontSize * currentLineHeight);
    if (patch.fontSize) input.style.fontSize = `${patch.fontSize}px`;
    if (patch.lineHeight || patch.fontSize) {
      input.style.lineHeight = `${linePx}px`;
      input.style.backgroundSize = `100% ${linePx}px`;
      input.style.minHeight = `${Math.max(48, linePx + 24)}px`;
      input.style.height = `${Math.max(48, linePx + 24)}px`;
    }
    if (patch.color) input.style.color = patch.color;
    if (patch.align) input.style.textAlign = patch.align;
    requestAnimationFrame(() => {
      input.style.height = "auto";
      input.style.height = `${Math.max(48, input.scrollHeight + 4)}px`;
    });
  };

  const setTextFontSizeForCurrent = (size: number) => {
    setTextFontSize(size);
    updateCurrentTextAnnotation({ fontSize: size });
    syncActiveTextEditorStyle({ fontSize: size });
  };

  const setTextLineHeightForCurrent = (lineHeight: number) => {
    setTextLineHeight(lineHeight);
    updateCurrentTextAnnotation({ lineHeight });
    syncActiveTextEditorStyle({ lineHeight });
  };

  const currentTextListStyle = (): ListStyle => {
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObject?.kind === "text" ? selectedObject.id : null);
    if (targetId) {
      return textAnnotations.find(t => t.id === targetId)?.listStyle ?? "none";
    }
    return "none";
  };

  const currentTextHasHighlight = () => {
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObject?.kind === "text" ? selectedObject.id : null);
    if (!targetId) return false;
    return Boolean(textAnnotations.find(t => t.id === targetId)?.highlights?.length);
  };

  const clearCurrentTextHighlight = () => {
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
    if (!targetId) {
      toast("Select a text box first");
      return;
    }

    const input = document.querySelector<HTMLTextAreaElement>(`.text-annotation-input[data-text-id="${CSS.escape(targetId)}"]`);
    const selectionStart = input?.selectionStart;
    const selectionEnd = input?.selectionEnd;
    const hasSelection = typeof selectionStart === "number" && typeof selectionEnd === "number" && selectionStart !== selectionEnd;
    let removedAny = false;

    setTextAnnotations(prev => prev.map(t => {
      if (t.id !== targetId) return t;
      const nextHighlights = hasSelection
        ? removeHighlightRanges(t.highlights, selectionStart, selectionEnd)
        : [];
      removedAny = (t.highlights?.length ?? 0) !== nextHighlights.length;
      return {
        ...t,
        highlightColor: undefined,
        highlights: nextHighlights,
      };
    }));
    toast(removedAny ? (hasSelection ? "Highlight removed" : "Text highlights cleared") : "No highlight on selected text");
    requestAnimationFrame(() => {
      input?.focus();
      if (hasSelection) input?.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const setTextListStyle = (listStyle: ListStyle) => {
    setTextListStyleState(listStyle);
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
    if (targetId) {
      setTextAnnotations(prev => prev.map(t => t.id === targetId ? { ...t, listStyle, text: applyListStyleToText(t.text, listStyle) } : t));
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>(`.text-annotation-input[data-text-id="${CSS.escape(targetId)}"]`);
        if (!input) return;
        const nextValue = applyListStyleToText(input.value, listStyle);
        input.value = nextValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
  };

  const onDocumentMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((activeToolRef.current !== "text" && activeToolRef.current !== "signature") || !isPdfLoaded) return;
    const target = e.target as HTMLElement;
    if (target.closest(".text-annotation-item, input, textarea, button, [contenteditable='true']")) return;
    e.preventDefault();
    e.stopPropagation();
    if (activeToolRef.current === "signature") insertSignatureAt(e.clientX, e.clientY);
    else insertTextAt(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const canvasArea = containerRef.current;
      if (!target) return;
      if (canvasArea?.contains(target)) return;
      if (target.closest("button, select, input, textarea, [contenteditable='true'], a")) return;
      clearActiveTool();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [clearActiveTool]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
        e.preventDefault();
        setShowHelpPanel(v => !v);
      }
      if (e.key === "Escape") {
        setShowHelpPanel(false);
        setShowBrushWidthMenu(false);
        setShowTextSizeMenu(false);
        setShowTextSpaceMenu(false);
        setShowShapeMenu(false);
        if (!editingTextId) {
          keyboardActionsRef.current.clearActiveTool();
        }
        return;
      }
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement?.closest('[contenteditable="true"], input, textarea')) return;
      if ((e.key === "Backspace" || e.key === "Delete") && selectedObjectRef.current) {
        const current = selectedObjectRef.current;
        if (current.kind === "note") removeNote(current.id);
        if (current.kind === "picture") removePicture(current.id);
        if (current.kind === "text") setTextAnnotations(prev => prev.filter(t => t.id !== current.id));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removeNote, removePicture, clearActiveTool, editingTextId]);

  // ─── SELECTION HIGHLIGHTER ────────────────────────────────────────
  useEffect(() => {
    const onUp = () => {
      if (activeToolRef.current !== "highlighter") return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const txt = sel.toString().trim();
      if (!txt) return;
      const range = sel.getRangeAt(0);
      const container = containerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) return;
      const ancestorNode = range.commonAncestorContainer;
      const ancestorElement =
        ancestorNode.nodeType === Node.ELEMENT_NODE
          ? (ancestorNode as HTMLElement)
          : ancestorNode.parentElement;
      const textHost = ancestorElement?.closest?.(".text-annotation-item") as HTMLElement | null;
      const textId = textHost?.dataset?.textId;
      if (textId) {
        const offsets = selectedTextOffsetsInElement(textHost, range);
        if (!offsets || offsets.start === offsets.end) return;
        setTextAnnotations(prev =>
          prev.map(t => {
            if (t.id !== textId) return t;
            const start = visibleIndexToRawIndex(t.text, Math.min(offsets.start, offsets.end));
            const end = visibleIndexToRawIndex(t.text, Math.max(offsets.start, offsets.end));
            return {
              ...t,
              highlightColor: undefined,
              highlights: mergeHighlightRanges(t.highlights, { start, end, color: activeColorRef.current }),
            };
          })
        );
        saveState();
        sel.removeAllRanges();
        return;
      }
      const rects = range.getClientRects();
      const canvas = annotCanvasRef.current;
      if (!canvas || !rects.length) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const cr = container.getBoundingClientRect();
      const scaleX = canvas.width / cr.width;
      const scaleY = canvas.height / cr.height;
      saveState();
      const stroke = createNaturalHighlightStroke(rects, cr, scaleX, scaleY, activeColorRef.current);
      if (stroke.boxes.length) {
        strokesRef.current = [...strokesRef.current, stroke];
        redrawAnnotationLayer();
      }
      saveState();
      sel.removeAllRanges();
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [saveState]);

  // ─── PDF PAGE OPERATIONS ─────────────────────────────────────────
  const readDocumentFiles = async (files: FileList | File[]): Promise<PdfPageSource[]> => {
    const pdfjs = pdfjsLibRef.current;
    if (!pdfjs) return [];
    const nextPages: PdfPageSource[] = [];

    for (const file of Array.from(files)) {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjs.getDocument(bytes).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          nextPages.push({ doc: pdf, pageNumber: i, name: file.name });
        }
      } else if (file.type.startsWith("image/")) {
        const image = await loadImageElement(file);
        const doc = createImagePdfDocument(image);
        nextPages.push({ doc, pageNumber: 1, name: file.name });
      }
    }

    return nextPages;
  };

  const shiftStoredPages = (startPage: number, delta: number) => {
    const shifted = new Map<number, PageState>();
    pageStoreRef.current.forEach((state, key) => {
      shifted.set(key >= startPage ? key + delta : key, state);
    });
    pageStoreRef.current = shifted;
  };

  const deleteCurrentPage = () => {
    if (!isPdfLoaded || !pagesRef.current.length) return;
    if (pagesRef.current.length <= 1) {
      toast("Keep at least one page");
      return;
    }

    pagesRef.current.splice(pageNum - 1, 1);
    const shifted = new Map<number, PageState>();
    pageStoreRef.current.forEach((state, key) => {
      if (key < pageNum) shifted.set(key, state);
      if (key > pageNum) shifted.set(key - 1, state);
    });
    pageStoreRef.current = shifted;

    const nextTotal = pagesRef.current.length;
    const nextPage = Math.min(pageNum, nextTotal);
    setTotalPages(nextTotal);
    renderPage(nextPage);
    toast("Page deleted");
  };

  const handleInsertPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !isPdfLoaded) return;
    try {
      savePageState(pageNum);
      const insertedPages = await readDocumentFiles(files);
      if (!insertedPages.length) return;
      shiftStoredPages(pageNum + 1, insertedPages.length);
      pagesRef.current.splice(pageNum, 0, ...insertedPages);
      setTotalPages(pagesRef.current.length);
      renderPage(pageNum + 1);
      toast(`Inserted ${insertedPages.length} page${insertedPages.length === 1 ? "" : "s"}`);
    } catch {
      toast("Could not insert file");
    } finally {
      e.target.value = "";
    }
  };

  const handleMergePdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !isPdfLoaded) return;
    try {
      savePageState(pageNum);
      const mergedPages = await readDocumentFiles(files);
      if (!mergedPages.length) return;
      pagesRef.current.push(...mergedPages);
      setTotalPages(pagesRef.current.length);
      toast(`Merged ${mergedPages.length} page${mergedPages.length === 1 ? "" : "s"}`);
    } catch {
      toast("Could not merge file");
    } finally {
      e.target.value = "";
    }
  };

  // ─── PDF LOAD ─────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    toast("Loading file...");
    try {
      const loadedPages = await readDocumentFiles(files);
      if (!loadedPages.length) return;
      pagesRef.current = loadedPages;
      pdfDocRef.current = loadedPages[0].doc;
      pageStoreRef.current.clear();
      undoListRef.current = [];
      redoListRef.current = [];
      setNotes([]);
      setTextAnnotations([]);
      setPictures([]);
      setEditingTextId(null);
      const firstName = loadedPages[0].name.replace(/\.[^/.]+$/, "") || "Untitled";
      setCurrentDocId(crypto.randomUUID());
      setDocTitle(firstName);
      setDocSubtitle(`${loadedPages.length} page${loadedPages.length === 1 ? "" : "s"}`);
      setTotalPages(loadedPages.length);
      setIsPdfLoaded(true);
      renderPage(1);
      toast("File loaded");
    } catch {
      toast("Error loading file");
    } finally {
      e.target.value = "";
    }
  };

  const startBlankPage = () => {
    const blankDoc = createBlankPdfDocument();
    blankDocRef.current = blankDoc;
    pdfDocRef.current = blankDoc;
    pagesRef.current = [{ doc: blankDoc, pageNumber: 1, name: "Untitled document" }];
    setCurrentDocId(crypto.randomUUID());
    pageStoreRef.current.clear();
    undoListRef.current = [];
    redoListRef.current = [];
    setNotes([]);
    setTextAnnotations([]);
    setPictures([]);
    setEditingTextId(null);
    setDocTitle("Untitled document");
    setDocSubtitle("");
    setTotalPages(1);
    setPageNum(1);
    setIsPdfLoaded(true);
    requestAnimationFrame(() => renderPageRef.current(1));
    toast("Blank page started");
  };

  const addBlankPage = () => {
    if (!isPdfLoaded) {
      startBlankPage();
      return;
    }

    savePageState(pageNum);
    const blankDoc = blankDocRef.current ?? createBlankPdfDocument();
    blankDocRef.current = blankDoc;
    shiftStoredPages(pageNum + 1, 1);
    pagesRef.current.splice(pageNum, 0, { doc: blankDoc, pageNumber: 1, name: "Blank page" });
    const nextPage = pageNum + 1;
    setTotalPages(pagesRef.current.length);
    renderPage(nextPage);
    toast("Blank page added");
  };

  const continueTextOnNewPage = (annotation: TextAnnotationItem) => {
    const annC = annotCanvasRef.current;
    const ctx = annC?.getContext("2d");
    if (!isPdfLoaded || !annC || !ctx || continuingTextRef.current) return;

    continuingTextRef.current = true;
    savePageState(pageNum);
    const blankDoc = blankDocRef.current ?? createBlankPdfDocument();
    blankDocRef.current = blankDoc;
    shiftStoredPages(pageNum + 1, 1);
    pagesRef.current.splice(pageNum, 0, { doc: blankDoc, pageNumber: 1, name: "Blank page" });

    const nextPage = pageNum + 1;
    const nextId = crypto.randomUUID();
    const nextAnnotation: TextAnnotationItem = {
      ...annotation,
      id: nextId,
      text: "",
      y: 64,
      highlights: [],
      highlightColor: undefined,
    };

    pageStoreRef.current.set(nextPage, {
      baseImageData: ctx.createImageData(annC.width, annC.height),
      canvasWidth: annC.width,
      canvasHeight: annC.height,
      undoStack: [],
      redoStack: [],
      notes: [],
      textAnnotations: [nextAnnotation],
      pictures: [],
      strokes: [],
    });

    setTotalPages(pagesRef.current.length);
    activeTextIdRef.current = nextId;
    selectedObjectRef.current = { kind: "text", id: nextId };
    renderPage(nextPage);
    requestAnimationFrame(() => {
      setEditingTextId(nextId);
      setSelectedObject({ kind: "text", id: nextId });
      continuingTextRef.current = false;
    });
    toast("Continued on a new page");
  };

  const renderPage = (num: number) => {
    const source = pagesRef.current[num - 1];
    if (!source) return;
    pageRenderingRef.current = true;
    source.doc.getPage(source.pageNumber).then((page: PdfPage) => {
      const container = containerRef.current;
      const main = mainRef.current;
      const pdfC = pdfCanvasRef.current;
      const annC = annotCanvasRef.current;
      if (!container || !pdfC || !annC) return;
      const pdfCtx = pdfC.getContext("2d");
      const annCtx = annC.getContext("2d");
      if (!pdfCtx || !annCtx) return;
      const baseVp = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, (main?.clientWidth ?? 900) - 176);
      const availableHeight = Math.max(360, (main?.clientHeight ?? window.innerHeight) - 96);
      const fitWidthScale = availableWidth / baseVp.width;
      const fitPageScale = Math.min(fitWidthScale, availableHeight / baseVp.height);
      const baseScale = viewModeRef.current === "actual"
        ? 1
        : viewModeRef.current === "fit-page"
          ? fitPageScale
          : fitWidthScale;
      const scale = Math.max(0.2, Math.min(4, baseScale * zoomLevelRef.current));
      const vp = page.getViewport({ scale });
      pdfC.width = vp.width; pdfC.height = vp.height;
      annC.width = vp.width; annC.height = vp.height;
      container.style.width = `${vp.width}px`;
      container.style.maxWidth = "none";
      container.style.height = `${vp.height}px`;
      container.style.minHeight = `${vp.height}px`;
      annCtx.lineCap = "round"; annCtx.lineJoin = "round";
      page.render({ canvasContext: pdfCtx, viewport: vp }).promise.then(() => {
        pageRenderingRef.current = false;
        renderTextLayer(page, vp).catch(() => toast("Text selection unavailable"));
        restorePageState(num);
        if (pageNumPendingRef.current !== null) {
          renderPage(pageNumPendingRef.current);
          pageNumPendingRef.current = null;
        }
      });
      annCtx.clearRect(0, 0, annC.width, annC.height);
    });
    setPageNum(num);
  };

  useEffect(() => {
    renderPageRef.current = renderPage;
  });

  useEffect(() => {
    if (!isPdfLoaded) return;
    savePageState(pageNumRef.current);
    renderPageRef.current(pageNumRef.current);
  }, [isPdfLoaded, savePageState, viewMode, zoomLevel]);

  const changeZoom = (next: number) => {
    const clamped = Math.max(0.5, Math.min(2.5, Math.round(next * 10) / 10));
    setZoomLevel(clamped);
    toast(`Zoom ${Math.round(clamped * 100)}%`);
  };

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    toast(mode === "fit-width" ? "Fit width" : mode === "fit-page" ? "Fit page" : "Actual size");
  };

  const goPage = (dir: "prev" | "next") => {
    const next = dir === "prev" ? pageNum - 1 : pageNum + 1;
    if (next < 1 || next > totalPages) return;
    savePageState(pageNum);
    if (pageRenderingRef.current) { pageNumPendingRef.current = next; return; }
    renderPage(next);
  };

  // ─── EXPORT ───────────────────────────────────────────────────────
  const drawPageNumber = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    page: number,
    total: number
  ) => {
    ctx.save();
    ctx.fillStyle = "rgba(37,50,74,0.78)";
    ctx.font = "24px 'Instrument Sans', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${page} / ${total}`, width / 2, height - 28);
    ctx.restore();
  };

  const drawNotesForExport = (
    ctx: CanvasRenderingContext2D,
    pageState: PageState,
    scaleX: number,
    scaleY: number
  ) => {
    pageState.notes.forEach(note => {
      const x = note.x * scaleX;
      const y = note.y * scaleY;
      const w = 170 * scaleX;
      const padX = 12 * scaleX;
      const padY = 12 * scaleY;
      const lineHeight = 24 * scaleY;
      ctx.save();
      ctx.font = `${18 * scaleY}px 'Excalifont', 'Instrument Sans', Arial, sans-serif`;
      ctx.textBaseline = "top";
      const words = note.text.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      const maxWidth = w - padX * 2;
      words.forEach(word => {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      });
      if (line) lines.push(line);

      const h = Math.max(80 * scaleY, padY * 2 + Math.max(1, lines.length) * lineHeight);
      ctx.fillStyle = "#FEFCEC";
      ctx.strokeStyle = "#D1B84F";
      ctx.lineWidth = 2 * Math.max(scaleX, scaleY);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12 * Math.max(scaleX, scaleY));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6F663A";
      lines.forEach((textLine, index) => {
        ctx.fillText(textLine, x + padX, y + padY + index * lineHeight);
      });
      ctx.restore();
    });
  };

  const drawTextAnnotationsForExport = (
    ctx: CanvasRenderingContext2D,
    pageState: PageState,
    scaleX: number,
    scaleY: number
  ) => {
    pageState.textAnnotations.forEach(annotation => {
      ctx.save();
      ctx.fillStyle = annotation.color ?? TEXT_COLOR;
      ctx.font = `${annotation.italic ? "italic " : ""}${annotation.bold ? "700 " : ""}${annotation.fontSize * scaleY}px 'Excalifont', 'Instrument Sans', Arial, sans-serif`;
      ctx.textBaseline = "top";
      ctx.textAlign = annotation.align ?? "left";
      const maxWidth = Math.max(80, (pageState.canvasWidth - annotation.x - 24) * scaleX);
      const lines = getWrappedTextLayout(ctx, annotation.text, maxWidth);
      const xBase = annotation.align === "center"
        ? annotation.x * scaleX + maxWidth / 2 + 6 * scaleX
        : annotation.align === "right"
          ? annotation.x * scaleX + maxWidth + 6 * scaleX
          : annotation.x * scaleX + 6 * scaleX;
      const lineHeightPx = annotation.fontSize * annotation.lineHeight * scaleY;
      lines.forEach((line, index) => {
        const lineY = annotation.y * scaleY + 4 * scaleY + index * lineHeightPx;
        const lineText = line.text;
        const lineWidth = ctx.measureText(lineText).width;
        const lineLeft = annotation.align === "center"
          ? xBase - lineWidth / 2
          : annotation.align === "right"
            ? xBase - lineWidth
            : xBase;

        (annotation.highlights ?? []).forEach((range) => {
          const overlapStart = Math.max(range.start, line.start);
          const overlapEnd = Math.min(range.end, line.end);
          if (overlapEnd <= overlapStart || !lineText) return;

          const prefix = lineText.slice(0, overlapStart - line.start);
          const segment = lineText.slice(overlapStart - line.start, overlapEnd - line.start);
          const prefixWidth = ctx.measureText(prefix).width;
          const segmentWidth = Math.max(8 * scaleX, ctx.measureText(segment).width);
          const markerX = lineLeft + prefixWidth - 3 * scaleX;
          const markerY = lineY + annotation.fontSize * scaleY * 0.12;
          const markerHeight = Math.max(10 * scaleY, annotation.fontSize * scaleY * 0.92);

          ctx.save();
          ctx.fillStyle = hexToRgba(range.color, 0.34);
          ctx.beginPath();
          ctx.roundRect(markerX, markerY, segmentWidth + 6 * scaleX, markerHeight, 6 * scaleY);
          ctx.fill();
          ctx.restore();
        });

        ctx.fillText(
          lineText,
          xBase,
          lineY
        );
      });
      ctx.restore();
    });
  };

  const drawPicturesForExport = async (
    ctx: CanvasRenderingContext2D,
    pageState: PageState,
    scaleX: number,
    scaleY: number
  ) => {
    for (const picture of pageState.pictures ?? []) {
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          ctx.drawImage(
            image,
            picture.x * scaleX,
            picture.y * scaleY,
            picture.width * scaleX,
            picture.height * scaleY
          );
          resolve();
        };
        image.onerror = () => resolve();
        image.src = picture.src;
      });
    }
  };

  type PdfImagePage = { width: number; height: number; image: Uint8Array; filter?: string };

  const compressBytes = async (bytes: Uint8Array) => {
    if (typeof CompressionStream === "undefined") return bytes;
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream("deflate"));
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  };

  const canvasToLosslessPdfImage = async (canvas: HTMLCanvasElement): Promise<PdfImagePage> => {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { width: canvas.width, height: canvas.height, image: new Uint8Array() };
    }

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let src = 0, dst = 0; src < data.length; src += 4, dst += 3) {
      rgb[dst] = data[src];
      rgb[dst + 1] = data[src + 1];
      rgb[dst + 2] = data[src + 2];
    }

    const image = await compressBytes(rgb);
    return { width: canvas.width, height: canvas.height, image, filter: typeof CompressionStream === "undefined" ? undefined : "/FlateDecode" };
  };

  const buildImagePdf = (pages: PdfImagePage[]) => {
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets: number[] = [];
    let position = 0;

    const addBytes = (bytes: Uint8Array) => {
      parts.push(bytes);
      position += bytes.length;
    };
    const addString = (text: string) => addBytes(encoder.encode(text));
    const writeObject = (id: number, writeBody: () => void) => {
      offsets[id] = position;
      addString(`${id} 0 obj\n`);
      writeBody();
      addString("\nendobj\n");
    };

    addString("%PDF-1.4\n");
    writeObject(1, () => addString("<< /Type /Catalog /Pages 2 0 R >>"));
    writeObject(2, () => {
      const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
      addString(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
    });

    pages.forEach((page, i) => {
      const pageObj = 3 + i * 3;
      const contentObj = pageObj + 1;
      const imageObj = pageObj + 2;
      writeObject(pageObj, () => {
        addString(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
      });
      const stream = `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im0 Do\nQ\n`;
      writeObject(contentObj, () => {
        addString(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
      });
      writeObject(imageObj, () => {
        addString(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${page.filter ? ` /Filter ${page.filter}` : ""} /Length ${page.image.length} >>\nstream\n`);
        addBytes(page.image);
        addString("\nendstream");
      });
    });

    const xrefOffset = position;
    const objectCount = 3 + pages.length * 3;
    addString(`xref\n0 ${objectCount}\n`);
    addString("0000000000 65535 f \n");
    for (let i = 1; i < objectCount; i++) {
      addString(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    addString(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    parts.forEach(part => {
      output.set(part, offset);
      offset += part.length;
    });
    return new Blob([output], { type: "application/pdf" });
  };

  async function buildCurrentPdfBlob() {
    savePageState(pageNumRef.current);
    const exportedPages: PdfImagePage[] = [];
    for (let i = 0; i < pagesRef.current.length; i++) {
      const source = pagesRef.current[i];
      const page = await source.doc.getPage(source.pageNumber);
      const baseVp = page.getViewport({ scale: 1 });
      const state = pageStoreRef.current.get(i + 1);
      const editorWidth = state?.canvasWidth ?? baseVp.width;
      const editorScale = editorWidth / baseVp.width;
      const exportScale = Math.min(3, Math.max(1.5, 2200 / editorWidth));
      const scale = editorScale * exportScale;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      if (state) {
        const ann = document.createElement("canvas");
        ann.width = state.canvasWidth;
        ann.height = state.canvasHeight;
        const annCtx = ann.getContext("2d");
        if (annCtx) {
          annCtx.putImageData(fitImageDataToSize(state.baseImageData, state.canvasWidth, state.canvasHeight), 0, 0);
          drawCanvasStrokes(annCtx, state.strokes);
        }
        ctx.drawImage(ann, 0, 0, canvas.width, canvas.height);
        await drawPicturesForExport(ctx, state, canvas.width / state.canvasWidth, canvas.height / state.canvasHeight);
        drawTextAnnotationsForExport(ctx, state, canvas.width / state.canvasWidth, canvas.height / state.canvasHeight);
        drawNotesForExport(ctx, state, canvas.width / state.canvasWidth, canvas.height / state.canvasHeight);
      }
      if (includePageNumbersRef.current) {
        drawPageNumber(ctx, canvas.width, canvas.height, i + 1, pagesRef.current.length);
      }
      exportedPages.push(await canvasToLosslessPdfImage(canvas));
    }
    return buildImagePdf(exportedPages);
  }

  const exportPDF = async () => {
    if (!isPdfLoaded || !pagesRef.current.length) {
      toast("Upload a PDF first");
      return;
    }

    try {
      toast("Building PDF...");
      const blob = await buildCurrentPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `${docTitle.replace(/\s+/g, "-").toLowerCase() || "document"}.pdf`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      toast("PDF exported");
    } catch {
      toast("Could not export PDF");
    }
  };

  useEffect(() => {
    keyboardActionsRef.current = {
      clearActiveTool,
      undo,
      redo,
      openFile: () => setShowStartDialog(true),
      addBlankPage,
      exportPDF: () => { void exportPDF(); },
      selectTool,
      addNote,
      addPicture: () => pictureInputRef.current?.click(),
      deleteCurrentPage,
      goPage,
      changeZoom,
      changeViewMode,
    };
  });

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el?.closest("input, textarea, select, [contenteditable='true']");
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      const command = ev.ctrlKey || ev.metaKey;
      const editing = isEditableTarget(ev.target);
      const actions = keyboardActionsRef.current;
      const loaded = isPdfLoadedRef.current;

      if (key === "escape") {
        ev.preventDefault();
        actions.clearActiveTool();
        return;
      }

      if (command) {
        if (key === "z") {
          ev.preventDefault();
          if (ev.shiftKey) actions.redo();
          else actions.undo();
          return;
        }
        if (key === "y") {
          ev.preventDefault();
          actions.redo();
          return;
        }
        if (key === "o") {
          ev.preventDefault();
          actions.openFile();
          return;
        }
        if (key === "n") {
          ev.preventDefault();
          actions.addBlankPage();
          return;
        }
        if (key === "s") {
          ev.preventDefault();
          actions.exportPDF();
          return;
        }
      }

      if (editing) return;

      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;

      const toolShortcuts: Record<string, string> = {
        h: "highlighter",
        v: "select",
        p: "pencil",
        d: "pencil",
        t: "text",
        s: "signature",
        e: "eraser",
        r: "rect",
        l: "line",
        a: "arrow",
        m: "diamond",
        o: "ellipse",
      };

      if (key in toolShortcuts && loaded) {
        ev.preventDefault();
        actions.selectTool(toolShortcuts[key]);
        return;
      }

      if (key === "n" && loaded) {
        ev.preventDefault();
        actions.addNote();
        return;
      }
      if (key === "i" && loaded) {
        ev.preventDefault();
        actions.addPicture();
        return;
      }
      if (key === "delete" && loaded) {
        ev.preventDefault();
        actions.deleteCurrentPage();
        return;
      }
      if ((key === "arrowleft" || key === "pageup") && loaded) {
        ev.preventDefault();
        actions.goPage("prev");
        return;
      }
      if ((key === "arrowright" || key === "pagedown") && loaded) {
        ev.preventDefault();
        actions.goPage("next");
        return;
      }
      if ((key === "+" || key === "=") && loaded) {
        ev.preventDefault();
        actions.changeZoom(zoomLevelRef.current + 0.1);
        return;
      }
      if ((key === "-" || key === "_") && loaded) {
        ev.preventDefault();
        actions.changeZoom(zoomLevelRef.current - 0.1);
        return;
      }
      if (key === "0" && loaded) {
        ev.preventDefault();
        actions.changeViewMode("fit-width");
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    if (!isPdfLoaded) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setIsSaving(true);
      setLastSavedLabel("Saving locally...");
      void serializeLocalState().then(payload => {
        const savedAt = persistLocalDraft(currentDocId, payload);
        setLastSavedLabel(`Local saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      }).catch(() => {
        setLastSavedLabel("Local save failed");
      }).finally(() => {
        setIsSaving(false);
      });
    }, 250);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [
    docTitle,
    docSubtitle,
    notes,
    textAnnotations,
    pictures,
    includePageNumbers,
    darkMode,
    viewMode,
    zoomLevel,
    pageNum,
    totalPages,
    selectedObject,
    localSaveVersion,
    isPdfLoaded,
    currentDocId,
    persistLocalDraft,
    serializeLocalState,
  ]);

  const loadLocalDraft = useCallback(async (): Promise<boolean> => {
    const latestDocId = window.localStorage.getItem(LOCAL_DOC_ID_KEY);
    const raw = (latestDocId ? window.localStorage.getItem(localDraftKey(latestDocId)) : null)
      ?? window.localStorage.getItem(LOCAL_LATEST_DRAFT_KEY);
    if (!raw) {
      toast("No local draft found");
      return false;
    }

    try {
      const saved = JSON.parse(raw) as { savedAt?: number; payload?: LocalEditorState };
      if (!saved.payload?.pages?.length) throw new Error("Missing local draft");
      if ("docId" in saved && typeof saved.docId === "string") setCurrentDocId(saved.docId);
      await hydrateLocalState(saved.payload);
      const savedAt = typeof saved.savedAt === "number" ? new Date(saved.savedAt) : new Date();
      setLastSavedLabel(`Recovered ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      toast("Last local draft opened");
      return true;
    } catch {
      toast("Could not open local draft");
      return false;
    }
  }, [hydrateLocalState, toast]);

  const saveLocalDraftNow = useCallback(async (): Promise<boolean> => {
    if (!isPdfLoadedRef.current) {
      toast("Open or create a document first");
      return false;
    }

    try {
      setIsSaving(true);
      const payload = await serializeLocalState();
      const savedAt = persistLocalDraft(currentDocId, payload);
      const driveSynced = await syncLocalDraftToDrive(currentDocId, payload, savedAt);
      setLastSavedLabel(`${driveSynced ? "Drive" : "Local"} saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      toast(driveSynced ? "Saved to Google Drive" : "Saved locally");
      return true;
    } catch (error) {
      const message = error instanceof GoogleDriveConfigError ? error.message : "Could not save draft";
      toast(message);
      setLastSavedLabel("Save failed");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [currentDocId, persistLocalDraft, serializeLocalState, syncLocalDraftToDrive, toast]);

  const clearLocalDraft = useCallback(() => {
    window.localStorage.removeItem(localDraftKey(currentDocId));
    window.localStorage.removeItem(LOCAL_LATEST_DRAFT_KEY);
    window.localStorage.removeItem(LOCAL_DOC_ID_KEY);
    const next = readRecentLocalDrafts().filter(item => item.docId !== currentDocId);
    window.localStorage.setItem(localRecentKey(localAccountKey()), JSON.stringify(next));
    setRecentLocalDrafts(next);
    toast("Local draft cleared");
    setLastSavedLabel("Local draft cleared");
  }, [currentDocId, localAccountKey, readRecentLocalDrafts, toast]);

  const loadLocalDraftById = useCallback(async (docId: string): Promise<boolean> => {
    try {
      let raw = window.localStorage.getItem(localDraftKey(docId));
      if (!raw) {
        toast("Could not find that draft");
        refreshRecentLocalDrafts();
        return false;
      }
      const saved = JSON.parse(raw) as { docId?: string; savedAt?: number; payload?: LocalEditorState };
      if (!saved.payload?.pages?.length) throw new Error("Missing local draft");
      setCurrentDocId(saved.docId || docId);
      window.localStorage.setItem(LOCAL_DOC_ID_KEY, saved.docId || docId);
      await hydrateLocalState(saved.payload);
      const savedAt = typeof saved.savedAt === "number" ? new Date(saved.savedAt) : new Date();
      setLastSavedLabel(`Recovered ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      setShowWorkspacePanel(false);
      toast("Document opened");
      return true;
    } catch {
      toast("Could not open document");
      return false;
    }
  }, [hydrateLocalState, refreshRecentLocalDrafts, toast]);

  useEffect(() => {
    refreshRecentLocalDrafts();
  }, [authUser?.email, refreshRecentLocalDrafts]);

  useEffect(() => {
    if (showWorkspacePanel) refreshRecentLocalDrafts();
  }, [refreshRecentLocalDrafts, showWorkspacePanel]);

  const confirmSaveBeforeReplace = useCallback(async (actionLabel: string) => {
    if (!isPdfLoadedRef.current) return true;
    const shouldSave = window.confirm(
      `Save this document locally before ${actionLabel}? Colora also keeps a local recovery copy for each document.`
    );
    if (!shouldSave) return false;
    return saveLocalDraftNow();
  }, [saveLocalDraftNow]);

  const requestOpenFile = useCallback(async () => {
    const ok = await confirmSaveBeforeReplace("opening another file");
    if (!ok) {
      toast("Open cancelled");
      return;
    }
    setShowStartDialog(false);
    fileInputRef.current?.click();
  }, [confirmSaveBeforeReplace, toast]);

  const requestNewProject = useCallback(async () => {
    const ok = await confirmSaveBeforeReplace("starting a new project");
    if (!ok) {
      toast("New project cancelled");
      return;
    }
    setShowStartDialog(false);
    startBlankPage();
  }, [confirmSaveBeforeReplace, toast]);

  // ─── THEME ────────────────────────────────────────────────────────
  const dm = darkMode;
  const c = {
    bg: dm ? "#10131A" : "#FBFAF8",
    headerBg: dm ? "#171B24" : "rgba(255,255,255,0.86)",
    headerBorder: dm ? "#2A3040" : "#EDECF4",
    sidebarBg: dm ? "#141923" : "#FFFFFF",
    sidebarBorder: dm ? "#252C3A" : "#ECEAF3",
    docBg: dm ? "#FFFFFF" : "#FFFFFF",
    docBorder: dm ? "#303746" : "#E6E3F0",
    docText: dm ? "#E7EAF2" : "#5E5D6A",
    docMuted: dm ? "#9BA3B4" : "#8E8D9B",
    toolActive: dm ? "#2B3142" : "#E5D4FF",
    toolActiveTxt: dm ? "#F3D7E4" : "#5E5D6A",
    toolInactive: "transparent",
    toolInactiveTxt: dm ? "#AAB2C2" : "#8E8D9B",
    panelBg: dm ? "#1C2230" : "#FFFFFF",
    panelBorder: dm ? "#333B4D" : "#ECEAF3",
    noteBg: dm ? "#2A2532" : "#FEFCEC",
    noteBorder: dm ? "#7A638B" : "#D1B84F",
    noteTxt: dm ? "#F6EAF2" : "#6F663A",
    inputColor: dm ? "#F2F4F8" : "#5E5D6A",
    shadow: dm
      ? "0 24px 70px rgba(0,0,0,0.42), 0 1px 0 rgba(255,255,255,0.05)"
      : "0 4px 28px rgba(142,141,155,0.14), 0 1px 4px rgba(142,141,155,0.08)",
  };
  const textControlsVisible = activeTool === "text" || activeTool === "signature" || selectedObject?.kind === "text" || Boolean(editingTextId);
  const activePalette = textControlsVisible
    ? TEXT_PALETTE
    : activeTool === "highlighter"
      ? HIGHLIGHT_PALETTE
      : PALETTE;
  const toolbarIconSize = 16;
  const sideIconSize = 16;
  const toolBtn = (id: string, icon: React.ReactNode, label: string, action?: () => void) => {
    const isActive = !action && activeTool === id;
    return (
      <button
        key={id}
        onClick={() => action ? action() : selectTool(id)}
        title={label}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: "4px", padding: "6px 4px", borderRadius: "14px", width: "100%",
          border: "none", cursor: "pointer", transition: "all 0.15s ease",
          background: isActive ? c.toolActive : "transparent",
          color: isActive ? c.toolActiveTxt : c.toolInactiveTxt,
          fontWeight: 700, fontSize: "10px", letterSpacing: "0.01em",
        }}
      >
        <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
        <span>{label}</span>
      </button>
    );
  };

  const shapeToolBtn = (id: string, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      onClick={() => {
        selectTool(id);
        setShowShapeMenu(false);
      }}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        padding: "9px 10px",
        borderRadius: "10px",
        border: "none",
        cursor: "pointer",
        background: activeTool === id ? c.toolActive : "transparent",
        color: activeTool === id ? c.toolActiveTxt : c.toolInactiveTxt,
        fontSize: "12px",
        fontWeight: 800,
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <span style={{ width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );

  const compactSelectStyle = (width: string): React.CSSProperties => ({
    width,
    height: "30px",
    borderRadius: "10px",
    border: `1px solid ${c.headerBorder}`,
    background: dm ? "#171B24" : "#FFFFFF",
    color: c.docText,
    fontFamily: "inherit",
    fontSize: "11px",
    fontWeight: 800,
    padding: "0 10px",
    outline: "none",
    cursor: "pointer",
  });

  const currentTextAlign = (): "left" | "center" | "right" => {
    const targetId = editingTextId ?? (selectedObject?.kind === "text" ? selectedObject.id : null);
    if (targetId) {
      return textAnnotations.find(t => t.id === targetId)?.align ?? textAlignRef.current;
    }
    return textAlignRef.current;
  };

  const alignBtnStyle = (active: boolean): React.CSSProperties => ({
    width: "30px",
    height: "30px",
    borderRadius: "10px",
    border: "none",
    background: active ? c.toolActive : "transparent",
    color: active ? c.toolActiveTxt : c.docMuted,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const activeShape = isShapeTool(activeTool) ? activeTool : null;
  const accountAvatarUrl = authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture || "";
  const accountPreviewLabel = (
    authUser?.email?.trim()?.[0] ||
    authUser?.user_metadata?.full_name?.trim()?.[0] ||
    authUser?.user_metadata?.name?.trim()?.[0] ||
    "G"
  ).toUpperCase();
  const workspaceOwnerName = (
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.email?.split("@")[0] ||
    "Local"
  ).trim();
  const activeShapeLabel = activeShape
    ? ({ rect: "Rect", ellipse: "Ellipse", diamond: "Diamond", line: "Line", arrow: "Arrow" } as Record<ShapeTool, string>)[activeShape]
    : "Shapes";
  const activeShapeIcon = activeShape
    ? ({
        rect: <Square size={toolbarIconSize} />,
        ellipse: <Circle size={toolbarIconSize} />,
        diamond: <Diamond size={toolbarIconSize} />,
        line: <Minus size={toolbarIconSize} />,
        arrow: <ArrowRight size={toolbarIconSize} />,
      } as Record<ShapeTool, React.ReactNode>)[activeShape]
    : <Square size={toolbarIconSize} />;

  const pageDockBtnStyle = (theme: typeof c, active = false): React.CSSProperties => ({
    width: "34px",
    height: "34px",
    border: `1px solid ${active ? "#E5D4FF" : theme.headerBorder}`,
    borderRadius: "9px",
    background: active ? theme.toolActive : "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: active ? theme.toolActiveTxt : theme.docMuted,
    transition: "all 0.15s",
  });

  const pictureControlsEnabled = activeTool === "select" || !activeTool || activeTool === "highlighter";
  const leftRailWidth = isPdfLoaded ? "80px" : "1fr";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isPdfLoaded ? `${leftRailWidth} 1fr` : "1fr",
      gridTemplateRows: "64px 1fr",
      height: "100dvh", width: "100%", overflow: "hidden",
      background: c.bg, color: c.docText,
      fontFamily: "'Instrument Sans','Geist',sans-serif",
      transition: "background 0.2s, color 0.2s",
    }}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header style={{
        gridColumn: "1 / -1", gridRow: "1",
        background: c.headerBg, borderBottom: `1px solid ${c.headerBorder}`,
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", gap: "12px", minWidth: 0, overflow: "hidden",
        transition: "background 0.2s",
      }}>
        {/* Doc title */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
          {isPdfLoaded ? (
            <>
              <input
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                style={{
                  background: "transparent", border: "none", outline: "none",
                  fontSize: "14px", fontWeight: 700, color: c.inputColor,
                  width: "200px", fontFamily: "inherit",
                }}
                placeholder="Untitled PDF"
              />
              {docSubtitle ? (
                <input
                  value={docSubtitle}
                  onChange={e => setDocSubtitle(e.target.value)}
                  style={{
                    background: "transparent", border: "none", outline: "none",
                    fontSize: "11px", fontWeight: 500, color: c.docMuted,
                    width: "200px", fontFamily: "inherit",
                  }}
                />
              ) : null}
            </>
          ) : (
            <span style={{ fontSize: "16px", fontWeight: 800, color: c.inputColor }}>Colora</span>
          )}
        </div>

        {/* Top color and size controls */}
        <div className="hide-scrollbar" style={{
          display: isPdfLoaded ? "flex" : "none", alignItems: "center", gap: "10px",
          background: c.sidebarBg, border: `1px solid ${c.sidebarBorder}`,
          borderRadius: "999px", padding: "7px 12px",
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 70,
          whiteSpace: "nowrap",
          maxWidth: "min(860px, calc(100vw - 560px))",
          overflowX: "auto",
          overflowY: "hidden",
        }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {activePalette.map(col => (
                  <button
                    key={col.hex}
                    onClick={() => {
                      setActiveColor(col.hex);
                      activeColorRef.current = col.hex;
                      updateCurrentTextAnnotation({ color: col.hex });
                    }}
                    title={col.name}
                style={{
                  width: "25px", height: "25px", borderRadius: "50%",
                  background: col.hex,
                  border: activeColor === col.hex
                    ? `3px solid ${activeTool === "text" ? "#E5D4FF" : INK_COLOR}`
                    : `1px solid ${dm ? "rgba(255,255,255,0.22)" : "rgba(142,141,155,0.25)"}`,
                  cursor: "pointer",
                  boxShadow: activeColor === col.hex
                    ? `0 0 0 2px ${dm ? "rgba(16,19,26,0.9)" : "rgba(255,255,255,0.9)"}`
                    : "none",
                }}
              />
            ))}
          </div>
          {(activeTool === "pencil" || activeTool === "eraser") && (
            <>
              <div style={{ width: "1px", height: "24px", background: c.headerBorder }} />
              {activeTool === "eraser" && (
                <div
                  title={`Eraser size: ${brushWidth}px`}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "10px",
                    border: `1px solid ${c.headerBorder}`,
                    background: dm ? "#171B24" : "#FFFFFF",
                    color: c.docMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: `${Math.max(6, Math.min(20, brushWidth / 2))}px`,
                      height: `${Math.max(6, Math.min(20, brushWidth / 2))}px`,
                      borderRadius: "50%",
                      border: `2px solid ${c.docMuted}`,
                      opacity: 0.72,
                    }}
                  />
                </div>
              )}
              <select
                value={brushWidth}
                onChange={e => {
                  const v = +e.target.value;
                  setBrushWidth(v);
                  brushWidthRef.current = v;
                  setShowBrushWidthMenu(false);
                }}
                title={activeTool === "eraser" ? "Eraser size" : "Brush size"}
                style={compactSelectStyle("74px")}
              >
                {(activeTool === "eraser" ? [8, 12, 16, 20, 28, 36, 48, 64] : [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16]).map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </>
          )}
          {textControlsVisible && (
            <div data-text-toolbar style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "1px", height: "24px", background: c.headerBorder }} />
              <TextDropdown
                value={textFontSize}
                width="74px"
                label="Font size"
                options={[12, 14, 16, 18, 20, 22, 24, 28, 32, 36]}
                onChange={setTextFontSizeForCurrent}
                formatOption={size => `${size}px`}
                theme={c}
                darkMode={dm}
              />
              <TextDropdown
                value={textLineHeight}
                width="84px"
                label="Line spacing"
                options={[1.05, 1.15, 1.25, 1.35, 1.5, 1.65, 1.8, 2]}
                onChange={setTextLineHeightForCurrent}
                formatOption={space => space.toFixed(2)}
                theme={c}
                darkMode={dm}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => setTextAlign("left")} title="Align left" style={alignBtnStyle(currentTextAlign() === "left")}>
                  <AlignLeft size={14} />
                </button>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => setTextAlign("center")} title="Align center" style={alignBtnStyle(currentTextAlign() === "center")}>
                  <AlignCenter size={14} />
                </button>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => setTextAlign("right")} title="Align right" style={alignBtnStyle(currentTextAlign() === "right")}>
                  <AlignRight size={14} />
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div
                  title="List style"
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "10px",
                    border: "none",
                    background: currentTextListStyle() !== "none" ? c.toolActive : "transparent",
                    color: currentTextListStyle() !== "none" ? c.toolActiveTxt : c.docMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {currentTextListStyle() === "number" ? <ListOrdered size={14} /> : <List size={14} />}
                </div>
                <TextDropdown
                  value={currentTextListStyle()}
                  width="112px"
                  label="List Style"
                  options={["none", "bullet", "number", "alpha"]}
                  onChange={setTextListStyle}
                  formatOption={style => style === "none" ? "No list" : style === "bullet" ? "• Bullets" : style === "number" ? "1. Numbers" : "A. Alpha"}
                  theme={c}
                  darkMode={dm}
                />
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => setTextStyle("bold", !textBold)} title="Bold" style={alignBtnStyle(textBold)}>
                  <Bold size={14} />
                </button>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => setTextStyle("italic", !textItalic)} title="Italic" style={alignBtnStyle(textItalic)}>
                  <Italic size={14} />
                </button>
                <button onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} onClick={() => setTextStyle("underline", !textUnderline)} title="Underline" style={alignBtnStyle(textUnderline)}>
                  <Underline size={14} />
                </button>
              </div>
            </div>
          )}
          {isShapeTool(activeTool) && (
            <>
              <div style={{ width: "1px", height: "24px", background: c.headerBorder }} />
              <select
                value={activeTool}
                onChange={e => selectTool(e.target.value)}
                title="Shape"
                style={compactSelectStyle("92px")}
              >
                <option value="rect">Rect</option>
                <option value="ellipse">Ellipse</option>
                <option value="diamond">Diamond</option>
                <option value="line">Line</option>
                <option value="arrow">Arrow</option>
              </select>
              <select
                value={brushWidth}
                onChange={e => {
                  const v = +e.target.value;
                  setBrushWidth(v);
                  brushWidthRef.current = v;
                }}
                title="Stroke width"
                style={compactSelectStyle("84px")}
              >
                {[1, 2, 3, 4, 6, 8, 10, 12].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
              <select
                value={activeColor}
                onChange={e => {
                  setActiveColor(e.target.value);
                  activeColorRef.current = e.target.value;
                }}
                title="Stroke color"
                style={compactSelectStyle("104px")}
              >
                {PALETTE.map(col => (
                  <option key={col.hex} value={col.hex}>{col.name}</option>
                ))}
              </select>
              <select
                value={shapeFillColor}
                onChange={e => {
                  setShapeFillColor(e.target.value);
                  shapeFillColorRef.current = e.target.value;
                }}
                title="Fill"
                style={compactSelectStyle("104px")}
              >
                <option value={NO_FILL}>No fill</option>
                {PALETTE.map(col => (
                  <option key={col.hex} value={col.hex}>{col.name}</option>
                ))}
              </select>
              <select
                value={shapeFillStyle}
                onChange={e => {
                  const next = e.target.value as ShapeFillStyle;
                  setShapeFillStyle(next);
                  shapeFillStyleRef.current = next;
                  if (shapeFillColorRef.current === NO_FILL) {
                    const fallbackFill = activeColorRef.current === NO_FILL ? PALETTE[0].hex : activeColorRef.current;
                    setShapeFillColor(fallbackFill);
                    shapeFillColorRef.current = fallbackFill;
                  }
                }}
                title="Fill style"
                style={compactSelectStyle("104px")}
              >
                <option value="hachure">Hachure</option>
                <option value="cross-hatch">Cross-hatch</option>
                <option value="solid">Solid</option>
              </select>
            </>
          )}
          {activeTool === "select" && selectedObject?.kind !== "text" && !editingTextId && (
            <>
              <div style={{ width: "1px", height: "24px", background: c.headerBorder }} />
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {[
                  { id: "fit-width" as ViewMode, label: "W" },
                  { id: "fit-page" as ViewMode, label: "P" },
                  { id: "actual" as ViewMode, label: "1:1" },
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => changeViewMode(mode.id)}
                    title={mode.id === "fit-width" ? "Fit width" : mode.id === "fit-page" ? "Fit page" : "Actual size"}
                    style={{
                      width: "38px",
                      height: "28px",
                      borderRadius: "10px",
                      border: "none",
                      background: viewMode === mode.id ? c.toolActive : "transparent",
                      color: viewMode === mode.id ? c.toolActiveTxt : c.docMuted,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "11px",
                      fontWeight: 900,
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div style={{ width: "1px", height: "24px", background: c.headerBorder }} />
              <button
                onClick={() => changeZoom(zoomLevel - 0.1)}
                title="Zoom out"
                style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  border: `1px solid ${c.headerBorder}`,
                  background: "transparent", color: c.docMuted,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ZoomOut size={15} />
              </button>
              <span style={{ fontSize: "11px", fontWeight: 900, color: c.docMuted, width: "38px", textAlign: "center" }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => changeZoom(zoomLevel + 0.1)}
                title="Zoom in"
                style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  border: `1px solid ${c.headerBorder}`,
                  background: "transparent", color: c.docMuted,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <ZoomIn size={15} />
              </button>
            </>
          )}
        </div>

        {/* Right actions */}
        <div style={{ display: isPdfLoaded ? "flex" : "none", alignItems: "center", gap: "8px" }}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "2px",
            marginRight: "6px",
            minWidth: "138px",
          }}>
            <span style={{ fontSize: "11px", fontWeight: 900, color: c.docMuted }}>
              {lastSavedLabel}
            </span>
            <span style={{ fontSize: "10px", color: c.docMuted, opacity: 0.82 }}>
              {authUser?.email ? `Signed in as ${authUser.email}` : "Local recovery ready"}
            </span>
          </div>
          <button onClick={undo} title="Undo" style={{
            width: "36px", height: "36px", border: `1px solid ${c.headerBorder}`,
            borderRadius: "9px", background: "transparent", cursor: "pointer",
            display: isPdfLoaded ? "flex" : "none", alignItems: "center", justifyContent: "center",
            color: c.docMuted, transition: "all 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = c.toolActive; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Undo2 size={16} />
          </button>
          <button onClick={redo} title="Redo" style={{
            width: "36px", height: "36px", border: `1px solid ${c.headerBorder}`,
            borderRadius: "9px", background: "transparent", cursor: "pointer",
            display: isPdfLoaded ? "flex" : "none", alignItems: "center", justifyContent: "center",
            color: c.docMuted, transition: "all 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = c.toolActive; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Redo2 size={16} />
          </button>
          <button
            onClick={() => setShowStartDialog(true)}
            style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "8px 16px", borderRadius: "20px",
              background: dm ? "#2B3142" : "#E5D4FF",
              color: dm ? "#F2F4F8" : "#5E5D6A",
              border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: "12px", fontFamily: "inherit",
            }}
          >
            <FilePlus2 size={15} />
            Open file
          </button>
          <input ref={fileInputRef} type="file" accept={SUPPORTED_FILE_TYPES} multiple onChange={handleFile} style={{ display: "none" }} />
          <input ref={pictureInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" onChange={handlePictureFile} style={{ display: "none" }} />
          <input ref={insertPdfInputRef} type="file" accept={SUPPORTED_FILE_TYPES} multiple onChange={handleInsertPdf} style={{ display: "none" }} />
          <input ref={mergePdfInputRef} type="file" accept={SUPPORTED_FILE_TYPES} multiple onChange={handleMergePdf} style={{ display: "none" }} />
        </div>
      </header>

      {showStartDialog && (
        <>
          <div
            onClick={() => setShowStartDialog(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(18, 22, 32, 0.20)",
              backdropFilter: "blur(4px)",
              zIndex: 100,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Start or open document"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(520px, calc(100vw - 36px))",
              borderRadius: "26px",
              border: `1px solid ${c.headerBorder}`,
              background: c.panelBg,
              boxShadow: "0 30px 90px rgba(28,30,38,0.22)",
              zIndex: 120,
              padding: "18px",
              color: c.docText,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.12em", color: c.docMuted, textTransform: "uppercase", marginBottom: "5px" }}>
                  Open file
                </div>
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 850, letterSpacing: "-0.03em", color: c.docText }}>
                  Start a document
                </h2>
                <p style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: 1.6, color: c.docMuted }}>
                  Choose a blank project or upload a PDF/image from your computer.
                </p>
              </div>
              <button
                onClick={() => setShowStartDialog(false)}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "12px",
                  border: "none",
                  background: c.toolActive,
                  color: c.toolActiveTxt,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
              <button
                onClick={() => void requestNewProject()}
                style={{
                  minHeight: "138px",
                  borderRadius: "20px",
                  border: `1px solid ${c.headerBorder}`,
                  background: dm ? "rgba(28,34,48,0.86)" : "linear-gradient(145deg, #FFFFFF 0%, #F8F2FF 100%)",
                  color: c.docText,
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "18px",
                  fontFamily: "inherit",
                  boxShadow: dm ? "none" : "0 14px 34px rgba(142,141,155,0.10)",
                }}
              >
                <div style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "14px",
                  background: c.toolActive,
                  color: c.toolActiveTxt,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "14px",
                }}>
                  <FilePlus2 size={18} />
                </div>
                <div style={{ fontSize: "15px", fontWeight: 850, marginBottom: "6px" }}>Blank project</div>
                <div style={{ fontSize: "12px", lineHeight: 1.55, color: c.docMuted }}>Start fresh with a clean page.</div>
              </button>

              <button
                onClick={() => void requestOpenFile()}
                style={{
                  minHeight: "138px",
                  borderRadius: "20px",
                  border: `1px solid ${c.headerBorder}`,
                  background: dm ? "rgba(28,34,48,0.86)" : "linear-gradient(145deg, #FFFFFF 0%, #FFF8E8 100%)",
                  color: c.docText,
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "18px",
                  fontFamily: "inherit",
                  boxShadow: dm ? "none" : "0 14px 34px rgba(142,141,155,0.10)",
                }}
              >
                <div style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "14px",
                  background: dm ? "#2B3142" : "#E5D4FF",
                  color: dm ? "#F2F4F8" : "#5E5D6A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "14px",
                }}>
                  <FolderOpen size={18} />
                </div>
                <div style={{ fontSize: "15px", fontWeight: 850, marginBottom: "6px" }}>Upload file</div>
                <div style={{ fontSize: "12px", lineHeight: 1.55, color: c.docMuted }}>Open a PDF or image locally.</div>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────── */}
      {showWorkspacePanel && (
        <>
          <div
            onClick={() => setShowWorkspacePanel(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(18, 22, 32, 0.18)",
              backdropFilter: "blur(3px)",
              zIndex: 95,
            }}
          />
          <aside
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(860px, calc(100vw - 36px))",
              maxWidth: "calc(100vw - 36px)",
              maxHeight: "calc(100dvh - 42px)",
              overflowY: "auto",
              background: c.panelBg,
              border: `1px solid ${c.headerBorder}`,
              borderRadius: "30px",
              boxShadow: "0 28px 80px rgba(28,30,38,0.18)",
              zIndex: 110,
              padding: "22px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "11px", fontWeight: 900, letterSpacing: "0.12em", color: c.docMuted, textTransform: "uppercase" }}>
                  Workspace
                </span>
                <span style={{ fontSize: "28px", fontWeight: 900, color: c.docText, letterSpacing: "-0.04em" }}>
                  {workspaceOwnerName}&apos;s workspace
                </span>
              </div>
              <button
                onClick={() => setShowWorkspacePanel(false)}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "12px",
                  border: "none",
                  background: c.toolActive,
                  color: c.toolActiveTxt,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{
              border: `1px solid ${c.headerBorder}`,
              borderRadius: "24px",
              padding: "14px",
              background: dm
                ? "linear-gradient(145deg, rgba(38,45,62,0.92), rgba(26,31,44,0.9))"
                : "linear-gradient(145deg, #FFFDFB 0%, #F6EFFF 58%, #FFF8E8 100%)",
              boxShadow: dm ? "0 18px 46px rgba(0,0,0,0.24)" : "0 18px 46px rgba(142,141,155,0.14)",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "14px",
              alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    flexShrink: 0,
                    border: `1px solid ${dm ? "rgba(255,255,255,0.16)" : "#DFCFFF"}`,
                    background: authUser
                      ? (dm ? "linear-gradient(180deg, #45516E 0%, #2E364A 100%)" : "linear-gradient(180deg, #F0E5FF 0%, #E1CFFF 100%)")
                      : (dm ? "#232938" : "#FFFFFF"),
                    color: authUser ? (dm ? "#FFFFFF" : "#6E63A8") : c.docMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                    fontWeight: 900,
                    }}
                  >
                  {accountAvatarUrl ? (
                    <img
                      src={accountAvatarUrl}
                      alt={authUser?.email || "Account avatar"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    "L"
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: c.docText, overflow: "hidden", textOverflow: "ellipsis" }}>
                    Local autosave
                  </span>
                  <span style={{ fontSize: "11px", color: c.docMuted }}>
                    Latest draft on this browser.
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  onClick={() => void loadLocalDraft()}
                  style={{
                    height: "38px",
                    padding: "0 16px",
                    borderRadius: "12px",
                    border: `1px solid ${c.headerBorder}`,
                    background: "transparent",
                    color: c.docText,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    fontWeight: 800,
                  }}
                >
                  Open last
                </button>
                <button
                  onClick={() => void saveLocalDraftNow()}
                  style={{
                    height: "38px",
                    padding: "0 16px",
                    borderRadius: "12px",
                    border: "none",
                    background: dm ? "#2B3142" : "#EDE1FF",
                    color: dm ? "#F2F4F8" : "#5E5D6A",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    fontWeight: 800,
                  }}
                >
                  {isSaving ? "Saving..." : "Save now"}
                </button>
              </div>
            </div>

            <div style={{
              border: `1px solid ${c.headerBorder}`,
              borderRadius: "24px",
              padding: "16px",
              background: dm ? "rgba(28,34,48,0.86)" : "#FFFFFF",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "18px", fontWeight: 900, color: c.docText }}>Recent documents</span>
                  <span style={{ fontSize: "11px", color: c.docMuted }}>
                    Local previews
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={() => clearLocalDraft()}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: c.docMuted,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "11px",
                    fontWeight: 800,
                  }}
                >
                  Clear current
                </button>
                <button
                  onClick={refreshRecentLocalDrafts}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: c.docMuted,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "11px",
                    fontWeight: 800,
                  }}
                >
                  Refresh
                </button>
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
              }}>
                {recentLocalDrafts.length ? recentLocalDrafts.map(item => (
                  <button
                    key={item.docId}
                    onClick={() => void loadLocalDraftById(item.docId)}
                    style={{
                      border: `1px solid ${c.headerBorder}`,
                      borderRadius: "18px",
                      padding: 0,
                      overflow: "hidden",
                      background: dm ? "rgba(20,25,35,0.72)" : "#FFFFFF",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                      boxShadow: item.docId === currentDocId
                        ? (dm ? "0 0 0 2px rgba(229,212,255,0.22)" : "0 0 0 2px rgba(229,212,255,0.62)")
                        : "0 10px 24px rgba(142,141,155,0.08)",
                    }}
                  >
                    <div style={{
                      height: "190px",
                      background: dm ? "#111722" : "#F8F6FD",
                      borderBottom: `1px solid ${c.headerBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      position: "relative",
                    }}>
                      {item.previewDataUrl ? (
                        <img
                          src={item.previewDataUrl}
                          alt=""
                          style={{
                            width: "82%",
                            height: "110%",
                            objectFit: "cover",
                            objectPosition: "top center",
                            borderRadius: "6px",
                            boxShadow: dm ? "0 10px 28px rgba(0,0,0,0.22)" : "0 10px 28px rgba(142,141,155,0.15)",
                          }}
                        />
                      ) : (
                        <div style={{
                          width: "70%",
                          height: "86%",
                          borderRadius: "6px",
                          background: dm ? "#1C2230" : "#FFFFFF",
                          border: `1px solid ${c.headerBorder}`,
                          boxShadow: dm ? "none" : "0 10px 28px rgba(142,141,155,0.12)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: c.docMuted,
                        }}>
                          <BlankPageIcon size={34} />
                        </div>
                      )}
                      {item.docId === currentDocId && (
                        <span style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                          borderRadius: "999px",
                          padding: "5px 8px",
                          background: c.toolActive,
                          color: c.toolActiveTxt,
                          fontSize: "9px",
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}>
                          Current
                        </span>
                      )}
                    </div>
                    <div style={{ padding: "13px", display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                      <span style={{ fontSize: "14px", fontWeight: 850, color: c.docText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.title || "Untitled document"}
                      </span>
                      <span style={{ fontSize: "10px", color: c.docMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {new Date(item.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span style={{ fontSize: "10px", color: c.docMuted }}>
                        {item.pageCount} page{item.pageCount === 1 ? "" : "s"} · Local
                      </span>
                    </div>
                  </button>
                )) : (
                  <div style={{ fontSize: "12px", color: c.docMuted, lineHeight: 1.6, padding: "8px 2px" }}>
                    No saved local documents yet. Save or edit a document and it will appear here.
                  </div>
                )}
              </div>
            </div>

            <div style={{
              border: `1px solid ${c.headerBorder}`,
              borderRadius: "18px",
              padding: "12px 14px",
              background: dm ? "rgba(28,34,48,0.7)" : "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                <span style={{ fontSize: "13px", fontWeight: 800, color: c.docText }}>
                  {authUser ? authUser.email || "Signed in" : "Sign in"}
                </span>
                <span style={{ fontSize: "11px", color: c.docMuted }}>
                  {authUser
                    ? hasGoogleDriveToken(authSession?.provider_token)
                      ? "Pastelle saves to Drive/colora-projects."
                      : "Sign in again to connect Google Drive."
                    : "Connect Pastelle to Google Drive/colora-projects."}
                </span>
              </div>
              <button
                onClick={() => authUser ? void signOutAccount() : void signInWithGoogle()}
                style={{
                  height: "34px",
                  padding: "0 12px",
                  borderRadius: "10px",
                  border: authUser ? `1px solid ${c.headerBorder}` : "none",
                  background: authUser ? "transparent" : (dm ? "#2B3142" : "#EDE1FF"),
                  color: dm ? "#F2F4F8" : "#5E5D6A",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "11px",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {isAuthWorking ? "..." : authUser ? "Sign out" : "Sign in"}
              </button>
            </div>
          </aside>
        </>
      )}

      <aside style={{
        gridColumn: "1", gridRow: "2",
        background: c.sidebarBg, borderRight: `1px solid ${c.sidebarBorder}`,
        display: isPdfLoaded ? "flex" : "none", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", padding: "12px 6px",
        width: leftRailWidth,
        minWidth: leftRailWidth,
        minHeight: 0,
        overflow: "hidden",
        transition: "background 0.2s",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", width: "100%", minHeight: 0, height: "100%" }}>
          <Link href="/" style={{ textDecoration: "none", marginBottom: "10px" }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "12px",
              background: c.toolActive, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer",
            }}>
              <Home size={15} color={c.toolActiveTxt} />
            </div>
          </Link>

          <div style={{ display: isPdfLoaded ? "block" : "none", width: "24px", height: "1px", background: c.sidebarBorder, margin: "6px 0 1px" }} />
          <div style={{ display: isPdfLoaded ? "flex" : "none", flexDirection: "column", alignItems: "stretch", gap: "4px", width: "100%", minHeight: 0, flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "100%", minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: "1px" }} className="hide-scrollbar">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", margin: "1px 0 2px", width: "100%" }}>
                <span style={{ fontSize: "8px", fontWeight: 900, letterSpacing: "0.12em", color: c.docMuted, textTransform: "uppercase", textAlign: "center", width: "100%" }}>TOOLS</span>
              </div>

              {toolBtn("highlighter", <Highlighter size={sideIconSize} />, "Highlight")}
              {toolBtn("select",      <Hand size={sideIconSize} />,        "Select")}
              {toolBtn("pencil",      <Pencil size={sideIconSize} />,      "Draw")}
              <button
                type="button"
                onClick={() => selectTool(activeShape ?? "rect")}
                title="Shapes"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 4px",
                  borderRadius: "14px",
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: [ "rect", "ellipse", "diamond", "line", "arrow" ].includes(activeTool) ? c.toolActive : "transparent",
                  color: [ "rect", "ellipse", "diamond", "line", "arrow" ].includes(activeTool) ? c.toolActiveTxt : c.toolInactiveTxt,
                  fontWeight: 700,
                  fontSize: "10px",
                  letterSpacing: "0.02em",
                }}
              >
                <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {activeShapeIcon}
                </div>
                <span>Shape</span>
              </button>
              {toolBtn("text",        <Type size={sideIconSize} />,        "Text")}
              {toolBtn("signature",   <PenLine size={sideIconSize} />,     "Sign")}
              <button
                type="button"
                onClick={() => selectTool("eraser")}
                title="Eraser"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  padding: "7px 4px 6px",
                  borderRadius: "16px",
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  background: activeTool === "eraser" ? c.toolActive : "transparent",
                  color: activeTool === "eraser" ? c.toolActiveTxt : c.toolInactiveTxt,
                  fontWeight: 800,
                  fontSize: "10px",
                  letterSpacing: "0.02em",
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "10px",
                    background: activeTool === "eraser" ? "rgba(255,255,255,0.28)" : "transparent",
                  }}
                >
                  <EraserTrailIcon size={21} />
                </div>
                <span>Eraser</span>
              </button>
              {toolBtn("note-btn",    <MessageSquare size={sideIconSize} />, "Note", addNote)}
            </div>

            <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px", width: "100%", paddingTop: "6px", flexShrink: 0 }}>
                <div style={{ width: "100%", height: "1px", background: c.sidebarBorder, opacity: 0.9 }} />
                <button
                  type="button"
                  onClick={() => setShowWorkspacePanel(true)}
                  title={authUser?.email || "Open account"}
                  style={{
                    width: "100%",
                    border: "none",
                    borderRadius: "14px",
                    background: showWorkspacePanel ? c.toolActive : (dm ? "#232938" : "#F4ECFF"),
                    color: showWorkspacePanel ? c.toolActiveTxt : c.docText,
                    padding: "8px 4px 7px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "10px",
                    fontWeight: 800,
                    boxShadow: showWorkspacePanel ? "0 10px 24px rgba(142,141,155,0.2)" : "0 8px 18px rgba(142,141,155,0.1)",
                  }}
                >
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: `1px solid ${dm ? "rgba(255,255,255,0.16)" : "#DFCFFF"}`,
                      background: authUser
                        ? (dm ? "linear-gradient(180deg, #45516E 0%, #2E364A 100%)" : "linear-gradient(180deg, #F0E5FF 0%, #E1CFFF 100%)")
                        : (dm ? "#232938" : "#FFFFFF"),
                      color: authUser ? (dm ? "#FFFFFF" : "#6E63A8") : c.docMuted,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 900,
                      boxShadow: "0 8px 18px rgba(142,141,155,0.16)",
                    }}
                  >
                    {accountAvatarUrl ? (
                      <img
                        src={accountAvatarUrl}
                        alt={authUser?.email || "Account avatar"}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      accountPreviewLabel
                    )}
                  </span>
                  <span>{authUser ? "Account" : "Sign in"}</span>
                </button>
              </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN CANVAS ─────────────────────────────────────────────── */}
      <main ref={mainRef} style={{
        gridColumn: isPdfLoaded ? "2" : "1", gridRow: "2",
        position: "relative",
        background: c.bg, overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column", alignItems: "center",
        minWidth: 0, minHeight: 0,
        padding: isPdfLoaded ? "32px 40px 80px 40px" : "0",
        transition: "background 0.2s",
      }} className="hide-scrollbar">

        {isPdfLoaded && (showToolTips || showToast) && (
          <div style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 120,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}>
            {showToolTips && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minHeight: "16px",
                maxWidth: "320px",
                padding: "6px 12px",
                borderRadius: "999px",
                background: dm ? "rgba(28,34,48,0.92)" : "rgba(255,255,255,0.9)",
                border: `1px solid ${dm ? "rgba(229,212,255,0.32)" : c.panelBorder}`,
                boxShadow: dm ? "0 10px 24px rgba(0,0,0,0.34)" : "0 8px 18px rgba(0,0,0,0.08)",
                backdropFilter: "blur(8px)",
              }}>
                <span style={{
                  fontSize: "11px",
                  color: dm ? "#F4F0FF" : c.docMuted,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.1,
                }}>
                  {toolTipText}
                </span>
              </div>
            )}
            {showToast && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                maxWidth: "320px",
                padding: "10px 16px",
                borderRadius: "999px",
                background: dm ? "#E5D4FF" : "#E5D4FF",
                color: dm ? "#312B3D" : "#5E5D6A",
                fontSize: "12px",
                fontWeight: 700,
                fontFamily: "'Instrument Sans',sans-serif",
                boxShadow: dm ? "0 10px 26px rgba(0,0,0,0.38)" : "0 4px 20px rgba(0,0,0,0.18)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {toastMsg}
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENT PAPER ── */}
        <div
          ref={containerRef}
          onMouseDownCapture={e => {
            selectPictureAtPoint(e.clientX, e.clientY);
            onDocumentMouseDownCapture(e);
          }}
          onClick={e => {
            const target = e.target as HTMLElement;
            if (target.closest(".text-annotation-item, [data-picture-hitbox], [data-picture-resize], input, textarea, button, [contenteditable='true']")) return;
            if (hitInteractiveObjectAtPoint(e.clientX, e.clientY)) return;
            setSelectedObject(null);
            selectedObjectRef.current = null;
          }}
          onDragOver={e => { e.preventDefault(); }}
          onDrop={async e => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files || []);
            if (!files.length) return;
            const accepted = files.filter(file => file.type === "application/pdf" || file.type.startsWith("image/"));
            if (!accepted.length) return;
            if (!isPdfLoaded) return;
            const imageFiles = accepted.filter(file => file.type.startsWith("image/"));
            if (imageFiles.length) {
              const file = imageFiles[0];
              const image = await loadImageElement(file);
              const src = await readFileAsDataUrl(file);
              const id = `${Date.now().toString(36)}-${file.name}`;
              setPictures(prev => [...prev, { id, src, name: file.name, x: 24, y: 24, width: Math.max(180, image.naturalWidth * 0.3), height: Math.max(120, image.naturalHeight * 0.3) }]);
              setSelectedObject({ kind: "picture", id });
              toast("Image embedded");
            }
          }}
          style={{
            position: "relative",
            background: isPdfLoaded ? c.docBg : "transparent",
            border: isPdfLoaded ? `1px solid ${c.docBorder}` : "none",
            borderRadius: isPdfLoaded ? "12px" : 0,
            width: "100%",
            maxWidth: isPdfLoaded ? "800px" : "none",
            minHeight: isPdfLoaded ? "1060px" : "100%",
            flex: isPdfLoaded ? "0 0 auto" : "1",
            boxShadow: isPdfLoaded ? c.shadow : "none",
            transition: "background 0.2s, border-color 0.2s",
          }}
        >
          {/* PDF canvas */}
          <canvas
            ref={pdfCanvasRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none", display: isPdfLoaded ? "block" : "none" }}
          />

          <div
            ref={textLayerRef}
            className="textLayer"
            style={{
              display: isPdfLoaded ? "block" : "none",
              zIndex: activeTool === "highlighter" || activeTool === "select" ? 6 : 3,
              pointerEvents: activeTool === "highlighter" || activeTool === "select" ? "auto" : "none",
            }}
          />

          {/* Annotation canvas */}
          <canvas
            ref={annotCanvasRef}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              display: isPdfLoaded ? "block" : "none",
              zIndex: 4,
              cursor: !activeTool ? "default"
                : activeTool === "select" ? "default"
                : activeTool === "pencil" ? "crosshair"
                : activeTool === "highlighter" ? "text"
                : activeTool === "text" || activeTool === "signature" ? "text"
                : activeTool === "eraser" ? "cell"
                : "crosshair",
              pointerEvents: !activeTool || activeTool === "highlighter" || activeTool === "select" ? "none" : "auto",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />

          {isPdfLoaded && textAnnotations.map(annotation => {
            const isEditing = editingTextId === annotation.id;
            if (isEditing) {
              return (
                <textarea
                  key={annotation.id}
                  className="text-annotation-input"
                  value={annotation.text}
                  wrap="off"
                  autoFocus
                  onFocus={e => {
                    const el = e.currentTarget;
                    requestAnimationFrame(() => {
                      el.style.width = "auto";
                      el.style.width = `${Math.max(180, el.scrollWidth + 18)}px`;
                      el.style.height = "auto";
                      el.style.height = `${Math.max(
                        annotation.fontSize * annotation.lineHeight + 24,
                        el.scrollHeight + 4
                      )}px`;
                    });
                  }}
                  onChange={e => {
                    const el = e.currentTarget;
                    const nextValue = e.target.value.replace(/\r/g, "");
                    setTextAnnotations(prev => prev.map(t => t.id === annotation.id ? { ...t, text: nextValue } : t));
                    requestAnimationFrame(() => {
                      el.style.width = "auto";
                      el.style.width = `${Math.max(180, el.scrollWidth + 18)}px`;
                      el.style.height = "auto";
                      el.style.height = `${Math.max(
                        annotation.fontSize * annotation.lineHeight + 24,
                        el.scrollHeight + 4
                      )}px`;
                      const pageHeight = containerRef.current?.clientHeight ?? 0;
                      const bottom = annotation.y + el.offsetHeight;
                      if (nextValue.trim() && pageHeight > 0 && bottom > pageHeight - 36) {
                        continueTextOnNewPage({ ...annotation, text: nextValue });
                      }
                    });
                  }}
                  onBlur={e => {
                    const nextTarget = e.relatedTarget as HTMLElement | null;
                    if (nextTarget?.closest("[data-text-toolbar]")) return;
                    finishTextEdit(annotation.id, e.currentTarget.value);
                  }}
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingTextId(null);
                      setSelectedObject({ kind: "text", id: annotation.id });
                      return;
                    }
                    if (e.key === "Enter") {
                      const style = annotation.listStyle ?? "none";
                      if (style !== "none") {
                        e.preventDefault();
                        const el = e.currentTarget;
                        const start = el.selectionStart ?? el.value.length;
                        const end = el.selectionEnd ?? start;
                        const before = el.value.slice(0, start);
                        const after = el.value.slice(end);
                        const itemIndex = before
                          .split("\n")
                          .filter(line => stripListMarkers(line).trim().length > 0).length;
                        const insert = `\n${listMarkerFor(style, itemIndex)}`;
                        const nextValue = `${before}${insert}${after}`;
                        setTextAnnotations(prev => prev.map(t => t.id === annotation.id ? { ...t, text: nextValue } : t));
                        requestAnimationFrame(() => {
                          const nextPos = start + insert.length;
                          el.selectionStart = nextPos;
                          el.selectionEnd = nextPos;
                          el.style.width = "auto";
                          el.style.width = `${Math.max(180, el.scrollWidth + 18)}px`;
                          el.style.height = "auto";
                          el.style.height = `${Math.max(
                            annotation.fontSize * annotation.lineHeight + 24,
                            el.scrollHeight + 4
                          )}px`;
                        });
                      }
                      return;
                    }
                  }}
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.width = "auto";
                    el.style.width = `${Math.max(180, el.scrollWidth + 18)}px`;
                    el.style.height = "auto";
                    el.style.height = `${Math.max(
                      annotation.fontSize * annotation.lineHeight + 24,
                      el.scrollHeight + 4
                    )}px`;
                  }}
                  data-text-id={annotation.id}
                  style={{
                    position: "absolute",
                    left: annotation.x,
                    top: annotation.y,
                    zIndex: 60,
                    minWidth: "180px",
                    width: "180px",
                    minHeight: `${Math.max(48, annotation.fontSize * annotation.lineHeight + 24)}px`,
                    height: `${Math.max(48, annotation.fontSize * annotation.lineHeight + 24)}px`,
                    padding: "10px 12px 14px",
                    borderRadius: "12px",
                    border: `1.5px solid ${darkMode ? "rgba(246,234,242,0.38)" : "rgba(94,93,106,0.24)"}`,
                    outline: "none",
                    color: darkMode ? "#FFFFFF" : (annotation.color ?? activeColor),
                    textAlign: annotation.align ?? "left",
                    background: darkMode
                      ? "linear-gradient(to bottom, transparent calc(100% - 1px), rgba(246,234,242,0.28) 1px), #202633"
                      : "linear-gradient(to bottom, transparent calc(100% - 1px), rgba(94,93,106,0.22) 1px), #FFFFFF",
                    backgroundSize: `100% ${annotation.fontSize * annotation.lineHeight}px`,
                    backgroundPosition: `0 ${10}px`,
                    fontFamily: "'Excalifont','Excalidraw',Quicksand,sans-serif",
                    fontSize: `${annotation.fontSize}px`,
                    fontWeight: annotation.bold ? 700 : 400,
                    fontStyle: annotation.italic ? "italic" : "normal",
                    textDecoration: annotation.underline ? "underline" : "none",
                    lineHeight: `${annotation.fontSize * annotation.lineHeight}px`,
                    resize: "none",
                    overflowX: "auto",
                    overflowY: "hidden",
                    whiteSpace: "pre",
                    boxShadow: darkMode
                      ? "0 14px 32px rgba(0,0,0,0.35), 0 0 0 4px rgba(246,234,242,0.08)"
                      : "0 14px 30px rgba(37,50,74,0.12), 0 0 0 4px rgba(229,212,255,0.2)",
                  }}
                />
              );
            }

            return (
              <div
                key={annotation.id}
                className="text-annotation-item"
                data-text-id={annotation.id}
                onMouseDown={e => onTextPointerDown(annotation, e)}
                onClick={e => {
                  e.stopPropagation();
                  if (activeToolRef.current === "highlighter") {
                    setSelectedObject({ kind: "text", id: annotation.id });
                    selectedObjectRef.current = { kind: "text", id: annotation.id };
                    activeTextIdRef.current = annotation.id;
                    setTextFontSize(annotation.fontSize);
                    setTextLineHeight(annotation.lineHeight);
                    setTextAlign(annotation.align ?? "left");
                    setTextBold(Boolean(annotation.bold));
                    setTextItalic(Boolean(annotation.italic));
                    setTextUnderline(Boolean(annotation.underline));
                    setTextListStyle(annotation.listStyle ?? "none");
                    return;
                  }
                  setActiveTool("select");
                  activeToolRef.current = "select";
                  setSelectedObject({ kind: "text", id: annotation.id });
                  selectedObjectRef.current = { kind: "text", id: annotation.id };
                  activeTextIdRef.current = annotation.id;
                  setTextFontSize(annotation.fontSize);
                  setTextLineHeight(annotation.lineHeight);
                  setTextAlign(annotation.align ?? "left");
                  setTextBold(Boolean(annotation.bold));
                  setTextItalic(Boolean(annotation.italic));
                  setTextUnderline(Boolean(annotation.underline));
                  setTextListStyle(annotation.listStyle ?? "none");
                  setEditingTextId(annotation.id);
                }}
                onDoubleClick={e => onTextDoubleClick(annotation, e)}
                style={{
                  position: "absolute",
                  left: annotation.x,
                  top: annotation.y,
                  zIndex: 19,
                  width: "auto",
                  maxWidth: `calc(100% - ${Math.max(180, annotation.x + 28)}px)`,
                  minHeight: `${Math.max(38, annotation.fontSize * annotation.lineHeight + 12)}px`,
                  padding: "4px 6px 6px",
                  borderRadius: "6px 6px 0 0",
                  color: annotation.color ?? activeColor,
                  fontFamily: "'Excalifont','Excalidraw',Quicksand,sans-serif",
                  fontSize: `${annotation.fontSize}px`,
                  fontWeight: annotation.bold ? 700 : 400,
                  fontStyle: annotation.italic ? "italic" : "normal",
                  textDecoration: annotation.underline ? "underline" : "none",
                  lineHeight: `${annotation.fontSize * annotation.lineHeight}px`,
                  textAlign: annotation.align ?? "left",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  background: selectedObject?.kind === "text" && selectedObject.id === annotation.id
                    ? (dm ? "rgba(229,212,255,0.12)" : "rgba(229,212,255,0.26)")
                    : "transparent",
                  boxShadow: selectedObject?.kind === "text" && selectedObject.id === annotation.id
                    ? `0 0 0 1px ${dm ? "rgba(229,212,255,0.7)" : "#E5D4FF"}`
                    : "none",
                  pointerEvents: activeTool === "select" || activeTool === "highlighter" ? "auto" : "none",
                  cursor: activeTool === "select" ? "move" : activeTool === "highlighter" ? "text" : "default",
                  userSelect: "text",
                }}
              >
                <div style={{ position: "relative", zIndex: 1 }}>
                  {renderHighlightedFormattedText(annotation.text, annotation.listStyle, annotation.highlights)}
                </div>
              </div>
            );
          })}

          {isPdfLoaded && includePageNumbers && (
            <div style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "22px",
              zIndex: 18,
              textAlign: "center",
              pointerEvents: "none",
              color: "rgba(37,50,74,0.78)",
              fontSize: "14px",
              fontWeight: 800,
              fontFamily: "'Instrument Sans','Geist',sans-serif",
            }}>
              {pageNum} / {totalPages}
            </div>
          )}

          {isPdfLoaded && pictures.map(picture => (
            <React.Fragment key={picture.id}>
              <div
                data-picture-hitbox
                data-picture-id={picture.id}
                onMouseDown={pictureControlsEnabled ? (e => {
                  e.stopPropagation();
                  const isSelected = selectedObjectRef.current?.kind === "picture" && selectedObjectRef.current.id === picture.id;
                  if (!isSelected || activeToolRef.current !== "select") {
                    setSelectedObject({ kind: "picture", id: picture.id });
                    selectedObjectRef.current = { kind: "picture", id: picture.id };
                    return;
                  }
                  dragPicture(picture.id, e);
                }) : undefined}
                style={{
                  position: "absolute",
                  left: picture.x,
                  top: picture.y,
                  width: picture.width,
                  height: picture.height,
                  zIndex: selectedObject?.kind === "picture" && selectedObject.id === picture.id ? 17 : 3,
                  cursor: pictureControlsEnabled ? "grab" : "default",
                  pointerEvents: activeTool === "eraser" ? "none" : "auto",
                }}
              >
                <img
                  src={picture.src}
                  alt={picture.name}
                  draggable={false}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                    borderRadius: "6px",
                    boxShadow: "0 10px 24px rgba(37,50,74,0.14)",
                    userSelect: "none",
                  }}
                />
              </div>
              {selectedObject?.kind === "picture" && selectedObject.id === picture.id && (
                <div
                  data-picture-resize
                  style={{
                    position: "absolute",
                    left: picture.x,
                    top: picture.y,
                    width: picture.width,
                    height: picture.height,
                    zIndex: 18,
                    pointerEvents: "none",
                    outline: `2px solid ${dm ? "#F9D5E5" : "#8E8D9B"}`,
                    outlineOffset: "4px",
                  }}
                >
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); removePicture(picture.id); }}
                    title="Remove picture"
                    style={{
                      position: "absolute",
                      top: "-38px",
                      right: "-8px",
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      border: "2px solid #FFFFFF",
                      background: "#EF4444",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      boxShadow: "0 10px 22px rgba(239,68,68,0.32)",
                      zIndex: 4,
                      pointerEvents: "auto",
                    }}
                  >
                    <X size={16} strokeWidth={2.8} />
                  </button>
                  <button
                    data-handle="nw"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize top left"
                    style={{ ...resizeHandleStyle({ left: "-9px", top: "-9px" }, "nwse-resize"), pointerEvents: "auto" }}
                  />
                  <button
                    data-handle="n"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize top"
                    style={{ ...resizeHandleStyle({ left: "50%", top: "-9px", transform: "translateX(-50%)" }, "ns-resize"), pointerEvents: "auto" }}
                  />
                  <button
                    data-handle="ne"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize top right"
                    style={{ ...resizeHandleStyle({ right: "-9px", top: "-9px" }, "nesw-resize"), pointerEvents: "auto" }}
                  />
                  <button
                    data-handle="w"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize left"
                    style={{ ...resizeHandleStyle({ left: "-9px", top: "50%", transform: "translateY(-50%)" }, "ew-resize"), pointerEvents: "auto" }}
                  />
                  <button
                    data-handle="e"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize right"
                    style={{ ...resizeHandleStyle({ right: "-9px", top: "50%", transform: "translateY(-50%)" }, "ew-resize"), pointerEvents: "auto" }}
                  />
                  <button
                    data-handle="sw"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize bottom left"
                    style={{ ...resizeHandleStyle({ left: "-9px", bottom: "-9px" }, "nesw-resize"), pointerEvents: "auto" }}
                  />
                  <button
                    data-handle="s"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize bottom"
                    style={{ ...resizeHandleStyle({ left: "50%", bottom: "-9px", transform: "translateX(-50%)" }, "ns-resize"), pointerEvents: "auto" }}
                  />
                  <button
                    data-handle="se"
                    onMouseDown={e => resizePicture(picture.id, e)}
                    title="Resize bottom right"
                    style={{ ...resizeHandleStyle({ right: "-9px", bottom: "-9px" }, "nwse-resize"), pointerEvents: "auto" }}
                  />
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Draggable speech notes */}
          {isPdfLoaded && notes.map(note => (
            <div
              key={note.id}
              data-note-id={note.id}
              onMouseDown={e => dragNote(note.id, e)}
              onClick={e => { e.stopPropagation(); setSelectedObject({ kind: "note", id: note.id }); }}
              style={{
                position: "absolute",
                left: note.x, top: note.y,
                zIndex: 20, cursor: "grab",
                pointerEvents: activeTool === "eraser" ? "none" : "auto",
                filter: selectedObject?.kind === "note" && selectedObject.id === note.id
                  ? "drop-shadow(0 0 0 1px rgba(37,50,74,0.14))"
                  : "none",
              }}
            >
              <div style={{
                width: "170px", minHeight: "80px",
                background: c.noteBg, border: `1.5px solid ${c.noteBorder}`,
                borderRadius: "12px", padding: "10px 12px",
                boxShadow: selectedObject?.kind === "note" && selectedObject.id === note.id
                  ? "0 10px 24px rgba(0,0,0,0.10)"
                  : "0 4px 16px rgba(0,0,0,0.12)",
                fontFamily: "'Excalifont','Excalidraw',Quicksand,sans-serif",
                position: "relative",
              }}>
                {/* tail */}
                <div style={{
                  position: "absolute", left: "-10px", top: "22px",
                  width: 0, height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderRight: `10px solid ${c.noteBorder}`,
                }} />
                <div style={{
                  position: "absolute", left: "-8px", top: "23px",
                  width: 0, height: 0,
                  borderTop: "5px solid transparent",
                  borderBottom: "5px solid transparent",
                  borderRight: `9px solid ${c.noteBg}`,
                }} />
                <button
                  onClick={e => { e.stopPropagation(); removeNote(note.id); }}
                  style={{
                    position: "absolute", top: "6px", right: "6px",
                    background: "none", border: "none", cursor: "pointer",
                    color: c.docMuted, padding: "2px",
                  }}
                >
                  <X size={12} />
                </button>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onFocus={e => {
                    const el = e.currentTarget;
                    const current = notes.find(n => n.id === note.id);
                    if (!current || current.text) return;
                    updateNote(note.id, "");
                    requestAnimationFrame(() => {
                      const sel = window.getSelection();
                      const range = document.createRange();
                      range.selectNodeContents(el);
                      range.collapse(true);
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    });
                  }}
                  onBlur={e => updateNote(note.id, e.currentTarget.innerText)}
                  style={{
                    fontSize: "18px", color: c.noteTxt,
                    outline: "none", minHeight: "52px",
                    marginTop: "4px", paddingRight: "16px",
                    lineHeight: "1.35", userSelect: "text",
                  }}
                >
                  {note.text || NOTE_PLACEHOLDER}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#CDEAC0", opacity: 0.85 }} />
                </div>
              </div>
            </div>
          ))}

          {/* Upload prompt (when no PDF loaded) */}
        {!isPdfLoaded && (
          <div style={{
            position: "relative",
            zIndex: 5,
            overflow: "hidden",
            minHeight: "calc(100dvh - 64px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 28px",
            color: c.docText,
            background: `
              radial-gradient(circle at 50% 0%, rgba(229,212,255,0.38), transparent 30%),
              radial-gradient(circle at 24% 16%, rgba(214,239,255,0.28), transparent 20%),
              radial-gradient(circle at 76% 22%, rgba(249,213,229,0.24), transparent 18%),
              linear-gradient(180deg, #FEFCFF 0%, #F8F6FD 100%)
            `,
          }}>
            <style jsx global>{`
              @keyframes pastelGlowFloatA {
                0% { transform: translate3d(-4%, -2%, 0) scale(1); }
                50% { transform: translate3d(5%, 4%, 0) scale(1.08); }
                100% { transform: translate3d(-4%, -2%, 0) scale(1); }
              }

              @keyframes pastelGlowFloatB {
                0% { transform: translate3d(3%, 0%, 0) scale(1); }
                50% { transform: translate3d(-5%, 5%, 0) scale(1.1); }
                100% { transform: translate3d(3%, 0%, 0) scale(1); }
              }

              @keyframes pastelGlowFloatC {
                0% { transform: translate3d(0%, 3%, 0) scale(1); }
                50% { transform: translate3d(4%, -4%, 0) scale(1.06); }
                100% { transform: translate3d(0%, 3%, 0) scale(1); }
              }
            `}</style>
            <div style={{
              position: "absolute",
              inset: "-8%",
              pointerEvents: "none",
              opacity: 0.95,
            }}>
              <div style={{
                position: "absolute",
                top: "4%",
                left: "6%",
                width: "34vw",
                minWidth: "280px",
                height: "34vw",
                minHeight: "280px",
                borderRadius: "999px",
                background: "radial-gradient(circle, rgba(210,224,255,0.65) 0%, rgba(210,224,255,0.24) 42%, rgba(210,224,255,0) 74%)",
                filter: "blur(22px)",
                animation: "pastelGlowFloatA 20s ease-in-out infinite",
              }} />
              <div style={{
                position: "absolute",
                top: "8%",
                right: "3%",
                width: "30vw",
                minWidth: "240px",
                height: "30vw",
                minHeight: "240px",
                borderRadius: "999px",
                background: "radial-gradient(circle, rgba(245,208,228,0.6) 0%, rgba(245,208,228,0.22) 44%, rgba(245,208,228,0) 74%)",
                filter: "blur(20px)",
                animation: "pastelGlowFloatB 18s ease-in-out infinite",
              }} />
              <div style={{
                position: "absolute",
                bottom: "4%",
                left: "18%",
                width: "28vw",
                minWidth: "220px",
                height: "28vw",
                minHeight: "220px",
                borderRadius: "999px",
                background: "radial-gradient(circle, rgba(255,233,182,0.52) 0%, rgba(255,233,182,0.18) 42%, rgba(255,233,182,0) 72%)",
                filter: "blur(24px)",
                animation: "pastelGlowFloatC 24s ease-in-out infinite",
              }} />
              <div style={{
                position: "absolute",
                right: "12%",
                bottom: "-2%",
                width: "26vw",
                minWidth: "210px",
                height: "26vw",
                minHeight: "210px",
                borderRadius: "999px",
                background: "radial-gradient(circle, rgba(196,234,220,0.58) 0%, rgba(196,234,220,0.18) 42%, rgba(196,234,220,0) 72%)",
                filter: "blur(24px)",
                animation: "pastelGlowFloatA 22s ease-in-out infinite reverse",
              }} />
            </div>
            <div style={{
              width: "100%",
              maxWidth: "860px",
              border: `1px solid ${c.panelBorder}`,
              borderRadius: "30px",
              background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.82) 100%)",
              backdropFilter: "blur(18px)",
              padding: "34px",
              boxShadow: "0 26px 80px rgba(142,141,155,0.14), 0 0 0 1px rgba(255,255,255,0.45) inset",
            }}>
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: "10px",
                marginBottom: "28px",
              }}>
                <h1 style={{ fontSize: "30px", fontWeight: 850, margin: 0, color: "#414256", letterSpacing: "-0.03em" }}>
                  Start a new document
                </h1>
                <p style={{ fontSize: "15px", lineHeight: "1.8", color: c.docMuted, margin: 0, maxWidth: "460px" }}>
                  Choose a blank page or open a local file to begin working with the same Colora tools and layout.
                </p>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "18px",
                alignItems: "stretch",
              }}>
                <button
                  onClick={startBlankPage}
                  style={{
                    border: `1px solid ${c.panelBorder}`,
                    borderRadius: "18px",
                    background: "#FFFFFF",
                    padding: "22px 18px 20px",
                    cursor: "pointer",
                    textAlign: "left",
                    boxShadow: "0 10px 28px rgba(142,141,155,0.08)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div style={{
                    width: "168px",
                    height: "168px",
                    margin: "0 auto 16px",
                    borderRadius: "8px",
                    border: `1px solid ${c.panelBorder}`,
                    background: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 18px rgba(37,50,74,0.06)",
                  }}>
                    <div style={{ color: "#E74B3B" }}>
                      <BlankPageIcon size={78} />
                    </div>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#414256", marginBottom: "4px" }}>Blank document</div>
                  <div style={{ fontSize: "13px", lineHeight: "1.6", color: c.docMuted }}>
                    Start from scratch with a clean page and open canvas.
                  </div>
                </button>

                <button
                  onClick={() => setShowStartDialog(true)}
                  style={{
                    border: `1px solid ${c.panelBorder}`,
                    borderRadius: "18px",
                    background: "#FFFFFF",
                    padding: "22px 18px 20px",
                    cursor: "pointer",
                    textAlign: "left",
                    boxShadow: "0 10px 28px rgba(142,141,155,0.08)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div style={{
                    width: "168px",
                    height: "168px",
                    margin: "0 auto 16px",
                    borderRadius: "8px",
                    border: `1px solid ${c.panelBorder}`,
                    background: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 6px 18px rgba(37,50,74,0.06)",
                  }}>
                    <div style={{ color: "#8E8D9B" }}>
                      <LocalUploadIcon size={72} />
                    </div>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#414256", marginBottom: "4px" }}>Upload from local</div>
                  <div style={{ fontSize: "13px", lineHeight: "1.6", color: c.docMuted }}>
                    Open a PDF or image from your computer and continue in Colora.
                  </div>
                </button>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Page controls */}
        {isPdfLoaded && (
          <div style={{
            position: "fixed",
            left: "50%",
            bottom: "24px",
            transform: "translateX(-50%)",
            zIndex: 55,
            background: c.panelBg,
            border: `1px solid ${c.panelBorder}`,
            borderRadius: "999px",
            padding: "8px 12px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "12px",
            boxShadow: "0 10px 30px rgba(142,141,155,0.18)",
          }}>
            <button
              onClick={() => goPage("prev")}
              disabled={pageNum <= 1}
              title="Previous page"
              style={{
                width: "34px", height: "34px", borderRadius: "50%",
                border: `1px solid ${c.panelBorder}`,
                background: "transparent", color: c.docMuted,
                cursor: pageNum <= 1 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: pageNum <= 1 ? 0.35 : 1,
              }}
            >
              <ChevronLeft size={17} />
            </button>
            <span style={{ fontSize: "12px", fontWeight: 800, color: c.docMuted, minWidth: "50px", textAlign: "center" }}>
              {pageNum} / {totalPages}
            </span>
            <button
              onClick={() => goPage("next")}
              disabled={pageNum >= totalPages}
              title="Next page"
              style={{
                width: "34px", height: "34px", borderRadius: "50%",
                border: `1px solid ${c.panelBorder}`,
                background: "transparent", color: c.docMuted,
                cursor: pageNum >= totalPages ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: pageNum >= totalPages ? 0.35 : 1,
              }}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        )}

      </main>

      {isPdfLoaded && (
        <aside
          className="hide-scrollbar"
          style={{
            position: "fixed",
            right: "0",
            top: "64px",
            bottom: "0",
            width: "68px",
            zIndex: 56,
            background: c.sidebarBg,
            borderLeft: `1px solid ${c.sidebarBorder}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: "10px 6px",
            overflowY: "auto",
          }}
        >
          <div style={{
            width: "100%",
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            paddingTop: "4px",
            paddingBottom: "8px",
            alignItems: "center",
          }}>
            <button onClick={exportPDF} title="Export PDF" style={pageDockBtnStyle(c)}>
              <Download size={16} />
            </button>
            <div style={{ width: "100%", height: "1px", background: c.headerBorder, opacity: 0.7 }} />
            <button onClick={() => pictureInputRef.current?.click()} title="Add picture to document" style={pageDockBtnStyle(c)}>
              <ImageIcon size={16} />
            </button>
            <button onClick={addBlankPage} title="Add blank page" style={pageDockBtnStyle(c)}>
              <Square size={16} />
            </button>
            <button onClick={() => insertPdfInputRef.current?.click()} title="Insert PDF or picture after current page" style={pageDockBtnStyle(c)}>
              <FilePlus2 size={16} />
            </button>
            <button onClick={() => mergePdfInputRef.current?.click()} title="Merge PDF or picture at end" style={pageDockBtnStyle(c)}>
              <Files size={16} />
            </button>
            <button onClick={() => setIncludePageNumbers(v => !v)} title="Toggle page numbers" style={pageDockBtnStyle(c, includePageNumbers)}>
              <Hash size={16} />
            </button>
            <div style={{ width: "100%", height: "1px", background: c.headerBorder, opacity: 0.7 }} />
            <button onClick={deleteCurrentPage} title="Delete page" style={pageDockBtnStyle(c)}>
              <Trash2 size={16} />
            </button>
          </div>
        </aside>
      )}

      {isPdfLoaded && (
        <div style={{
          position: "fixed",
          right: "16px",
          bottom: "18px",
          zIndex: 58,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          alignItems: "flex-end",
        }}>
          <button
            type="button"
            onClick={() => setShowHelpPanel(v => !v)}
            title="Hotkeys help"
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "14px",
              border: `1px solid ${showHelpPanel ? "#E5D4FF" : c.headerBorder}`,
              background: showHelpPanel ? c.toolActive : c.panelBg,
              color: showHelpPanel ? c.toolActiveTxt : c.docMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
            }}
          >
            <CircleHelp size={17} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setDarkMode(d => !d)}
            title="Toggle dark mode"
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "14px",
              border: `1px solid ${c.headerBorder}`,
              background: c.panelBg,
              color: c.docMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
            }}
          >
            {dm ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      )}

      {isPdfLoaded && showHelpPanel && (
        <div style={{
          position: "fixed",
          right: "16px",
          bottom: "132px",
          zIndex: 59,
          width: "280px",
          maxHeight: "320px",
          borderRadius: "14px",
          border: `1px solid ${c.panelBorder}`,
          background: c.panelBg,
          boxShadow: "0 16px 36px rgba(0,0,0,0.14)",
          padding: "10px",
          color: c.docMuted,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexShrink: 0 }}>
            <strong style={{ fontSize: "11px", color: c.docText, letterSpacing: "0.04em" }}>Hotkeys</strong>
            <button onClick={() => setShowHelpPanel(false)} style={pageDockBtnStyle(c)}>×</button>
          </div>
          <div style={{
            display: "grid",
            gap: "5px",
            fontSize: "10px",
            lineHeight: 1.35,
            overflowY: "auto",
            paddingRight: "4px",
            minHeight: 0,
          }}>
            <div><strong style={{ color: c.docText }}>Esc</strong> Clear or exit the active tool</div>
            <div><strong style={{ color: c.docText }}>Ctrl/Cmd + Z</strong> Undo</div>
            <div><strong style={{ color: c.docText }}>Ctrl/Cmd + Shift + Z</strong> Redo</div>
            <div><strong style={{ color: c.docText }}>Ctrl/Cmd + Y</strong> Redo</div>
            <div><strong style={{ color: c.docText }}>Ctrl/Cmd + O</strong> Open file</div>
            <div><strong style={{ color: c.docText }}>Ctrl/Cmd + N</strong> Add a blank page</div>
            <div><strong style={{ color: c.docText }}>Ctrl/Cmd + S</strong> Export as PDF</div>
            <div><strong style={{ color: c.docText }}>H</strong> Highlighter</div>
            <div><strong style={{ color: c.docText }}>V</strong> Hand / Select / Pan tool</div>
            <div><strong style={{ color: c.docText }}>P or D</strong> Draw tool</div>
            <div><strong style={{ color: c.docText }}>T</strong> Text tool</div>
            <div><strong style={{ color: c.docText }}>S</strong> Signature tool</div>
            <div><strong style={{ color: c.docText }}>E</strong> Eraser</div>
            <div><strong style={{ color: c.docText }}>R</strong> Rectangle</div>
            <div><strong style={{ color: c.docText }}>O</strong> Ellipse</div>
            <div><strong style={{ color: c.docText }}>M</strong> Diamond</div>
            <div><strong style={{ color: c.docText }}>L</strong> Line</div>
            <div><strong style={{ color: c.docText }}>A</strong> Arrow</div>
            <div><strong style={{ color: c.docText }}>N</strong> Note</div>
            <div><strong style={{ color: c.docText }}>I</strong> Insert picture</div>
            <div><strong style={{ color: c.docText }}>Delete</strong> Delete current page</div>
            <div><strong style={{ color: c.docText }}>← / Page Up</strong> Previous page</div>
            <div><strong style={{ color: c.docText }}>→ / Page Down</strong> Next page</div>
            <div><strong style={{ color: c.docText }}>+</strong> Zoom in</div>
            <div><strong style={{ color: c.docText }}>-</strong> Zoom out</div>
            <div><strong style={{ color: c.docText }}>0</strong> Fit page to width</div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {/* Toast rendered with the top notification stack */}
    </div>
  );
}
