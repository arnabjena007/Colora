"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import rough from "roughjs/bin/rough";
import type { Options as RoughOptions } from "roughjs/bin/core";
import {
  Highlighter, Pencil, Type, MessageSquare, Square,
  Download, Undo2, Redo2, FolderOpen, X,
  ChevronLeft, ChevronRight, Sun, Moon, Home, Eraser,
  ZoomIn, ZoomOut, Trash2, FilePlus2, Files, Hash, PenLine,
  Hand, ArrowRight, Minus, Circle, Diamond, ImageIcon, CircleHelp,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline
} from "lucide-react";

interface NoteItem {
  id: string;
  text: string;
  x: number;
  y: number;
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

interface PageState {
  imageData: ImageData;
  canvasWidth: number;
  canvasHeight: number;
  undoStack: DocumentSnapshot[];
  redoStack: DocumentSnapshot[];
  notes: NoteItem[];
  textAnnotations: TextAnnotationItem[];
  pictures: PictureItem[];
}

interface DocumentSnapshot {
  imageData: ImageData;
  canvasWidth: number;
  canvasHeight: number;
  notes: NoteItem[];
  textAnnotations: TextAnnotationItem[];
  pictures: PictureItem[];
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
type ViewMode = "fit-width" | "fit-page" | "actual";
type ShapeTool = "rect" | "ellipse" | "diamond" | "line" | "arrow";
type ShapeFillStyle = "hachure" | "cross-hatch" | "solid";
type ListStyle = "none" | "bullet" | "number" | "alpha";
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
    height: "24px",
    borderRadius: "8px",
    border: `1px solid ${theme.headerBorder}`,
    color: theme.docText,
    fontFamily: "inherit",
    fontSize: "9px",
    fontWeight: 800,
    padding: "0 6px 0 8px",
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
                  padding: "5px 7px",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: "9px",
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

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }, []);

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

  const captureSnapshot = useCallback((): DocumentSnapshot | null => {
    const canvas = annotCanvasRef.current;
    if (!canvas || canvas.width === 0) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return {
      imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      notes: notesRef.current.map(n => ({ ...n })),
      textAnnotations: textAnnotationsRef.current.map(t => ({ ...t })),
      pictures: picturesRef.current.map(p => ({ ...p })),
    };
  }, []);

  const saveState = useCallback(() => {
    const snapshot = captureSnapshot();
    if (!snapshot) return;
    undoListRef.current.push(snapshot);
    if (undoListRef.current.length > 30) undoListRef.current.shift();
    redoListRef.current = [];
  }, [captureSnapshot]);

  const restoreState = useCallback((snapshot: DocumentSnapshot) => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    canvas.width = snapshot.canvasWidth;
    canvas.height = snapshot.canvasHeight;
    canvas.getContext("2d")?.putImageData(snapshot.imageData, 0, 0);
    setNotes(snapshot.notes.map(n => ({ ...n })));
    setTextAnnotations(snapshot.textAnnotations.map(t => ({ ...t })));
    setPictures(snapshot.pictures.map(p => ({ ...p })));
  }, []);

  const savePageState = useCallback((num: number) => {
    const annC = annotCanvasRef.current;
    if (!annC || annC.width === 0 || num <= 0) return;
    const ctx = annC.getContext("2d");
    if (!ctx) return;
    pageStoreRef.current.set(num, {
      imageData: ctx.getImageData(0, 0, annC.width, annC.height),
      canvasWidth: annC.width,
      canvasHeight: annC.height,
      undoStack: [...undoListRef.current],
      redoStack: [...redoListRef.current],
      notes: notesRef.current.map(n => ({ ...n })),
      textAnnotations: textAnnotationsRef.current.map(t => ({ ...t })),
      pictures: picturesRef.current.map(p => ({ ...p })),
    });
  }, []);

  const restorePageState = useCallback((num: number) => {
    const stored = pageStoreRef.current.get(num);
    const annC = annotCanvasRef.current;
    if (!annC) return;
    const ctx = annC.getContext("2d");
    if (!ctx) return;

    if (stored) {
      ctx.clearRect(0, 0, annC.width, annC.height);
      if (stored.imageData.width === annC.width && stored.imageData.height === annC.height) {
        ctx.putImageData(stored.imageData, 0, 0);
      } else {
        const tmp = document.createElement("canvas");
        tmp.width = stored.imageData.width;
        tmp.height = stored.imageData.height;
        tmp.getContext("2d")!.putImageData(stored.imageData, 0, 0);
        ctx.drawImage(tmp, 0, 0, annC.width, annC.height);
      }
      undoListRef.current = stored.undoStack.length ? [...stored.undoStack] : [];
      redoListRef.current = [...stored.redoStack];
      if (!undoListRef.current.length) saveState();
      setNotes(stored.notes.map(n => ({ ...n })));
      setTextAnnotations(stored.textAnnotations.map(t => ({ ...t })));
      setPictures((stored.pictures ?? []).map(p => ({ ...p })));
    } else {
      ctx.clearRect(0, 0, annC.width, annC.height);
      undoListRef.current = [];
      redoListRef.current = [];
      saveState();
      setNotes([]);
      setTextAnnotations([]);
      setPictures([]);
    }
  }, [saveState]);

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
    toast("Undo ✓");
  };

  const redo = () => {
    if (!redoListRef.current.length) { toast("Nothing to redo"); return; }
    const next = redoListRef.current.pop()!;
    undoListRef.current.push(next);
    restoreState(next);
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
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.80 + Math.random() * 0.20;
      ctx.globalCompositeOperation = "source-over";

      // Quadratic bezier for smooth hand-drawn feel
      const midX = (lastXRef.current + cx) / 2 + (Math.random() - 0.5) * 1.5;
      const midY = (lastYRef.current + cy) / 2 + (Math.random() - 0.5) * 1.5;
      ctx.beginPath();
      ctx.moveTo(lastXRef.current, lastYRef.current);
      ctx.quadraticCurveTo(midX, midY, cx, cy);
      ctx.stroke();
      ctx.restore();
    } else if (tool === "eraser") {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.beginPath();
      ctx.arc(cx, cy, width, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (isShapeTool(tool)) {
      // Redraw from pre-drag snapshot then draw current shape
      if (undoListRef.current.length) {
        restoreState(undoListRef.current[undoListRef.current.length - 1]);
      }
      const x = shapeStartXRef.current;
      const y = shapeStartYRef.current;
      drawRoughShape(ctx, tool, x, y, cx, cy, color, shapeFillColorRef.current, shapeFillStyleRef.current);
    }

    lastXRef.current = cx; lastYRef.current = cy;
  };

  const onMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
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
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
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

  const setTextListStyle = (listStyle: ListStyle) => {
    setTextListStyleState(listStyle);
    const targetId = editingTextId ?? activeTextIdRef.current ?? (selectedObjectRef.current?.kind === "text" ? selectedObjectRef.current.id : null);
    if (targetId) {
      setTextAnnotations(prev => prev.map(t => t.id === targetId ? { ...t, listStyle } : t));
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
          actions.clearActiveTool();
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
      const rects = range.getClientRects();
      const canvas = annotCanvasRef.current;
      if (!canvas || !rects.length) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const cr = container.getBoundingClientRect();
      const scaleX = canvas.width / cr.width;
      const scaleY = canvas.height / cr.height;
      saveState();
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = activeColorRef.current;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        ctx.fillRect(
          (r.left - cr.left) * scaleX,
          (r.top - cr.top) * scaleY,
          r.width * scaleX,
          (r.height + 4) * scaleY
        );
      }
      ctx.restore();
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
      const h = Math.max(80, 56 + Math.ceil(note.text.length / 22) * 18) * scaleY;
      ctx.save();
      ctx.fillStyle = "#FEFCEC";
      ctx.strokeStyle = "#EDE5A0";
      ctx.lineWidth = 1.5 * Math.max(scaleX, scaleY);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12 * Math.max(scaleX, scaleY));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#777052";
      ctx.font = `${13 * Math.max(scaleX, scaleY)}px 'Instrument Sans', Arial, sans-serif`;
      ctx.textBaseline = "top";
      const words = note.text.split(/\s+/);
      let line = "";
      let lineY = y + 12 * scaleY;
      const maxWidth = w - 24 * scaleX;
      words.forEach(word => {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth && line) {
          ctx.fillText(line, x + 12 * scaleX, lineY);
          line = word;
          lineY += 18 * scaleY;
        } else {
          line = next;
        }
      });
      if (line) ctx.fillText(line, x + 12 * scaleX, lineY);
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
      const lines = wrapTextLines(ctx, annotation.text, maxWidth);
      const xBase = annotation.align === "center"
        ? annotation.x * scaleX + maxWidth / 2 + 6 * scaleX
        : annotation.align === "right"
          ? annotation.x * scaleX + maxWidth + 6 * scaleX
          : annotation.x * scaleX + 6 * scaleX;
      lines.forEach((line, index) => {
        ctx.fillText(
          line,
          xBase,
          annotation.y * scaleY + 4 * scaleY + index * annotation.fontSize * annotation.lineHeight * scaleY
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

  const exportPDF = async () => {
    if (!isPdfLoaded || !pagesRef.current.length) {
      toast("Upload a PDF first");
      return;
    }

    try {
      savePageState(pageNum);
      toast("Building PDF...");
      const exportedPages: PdfImagePage[] = [];
      for (let i = 0; i < pagesRef.current.length; i++) {
        const source = pagesRef.current[i];
        const page = await source.doc.getPage(source.pageNumber);
        const baseVp = page.getViewport({ scale: 1 });
        const scale = Math.min(3, Math.max(1.5, 2200 / baseVp.width));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const state = pageStoreRef.current.get(i + 1);
        if (state) {
          const ann = document.createElement("canvas");
          ann.width = state.canvasWidth;
          ann.height = state.canvasHeight;
          ann.getContext("2d")?.putImageData(state.imageData, 0, 0);
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

      const blob = buildImagePdf(exportedPages);
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
      openFile: () => fileInputRef.current?.click(),
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
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      setIsSaving(true);
      setLastSavedLabel("Saving...");
      const payload = {
        version: 1,
        savedAt: Date.now(),
        docTitle,
        docSubtitle,
        notes: notesRef.current,
        textAnnotations: textAnnotationsRef.current,
        pictures: picturesRef.current,
        includePageNumbers: includePageNumbersRef.current,
        darkMode: darkModeRef.current,
        viewMode: viewModeRef.current,
        zoomLevel: zoomLevelRef.current,
        pageNum: pageNumRef.current,
        totalPages,
        selectedObject: selectedObjectRef.current,
      };
      window.localStorage.setItem("pastelle-editor-state", JSON.stringify(payload));
      setIsSaving(false);
      setLastSavedLabel(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
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
  ]);

  useEffect(() => {
    const raw = window.localStorage.getItem("pastelle-editor-state");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      window.setTimeout(() => {
        if (saved.docTitle) setDocTitle(saved.docTitle);
        if (saved.docSubtitle) setDocSubtitle(saved.docSubtitle);
        if (Array.isArray(saved.notes)) setNotes(saved.notes);
        if (Array.isArray(saved.textAnnotations)) setTextAnnotations(saved.textAnnotations);
        if (Array.isArray(saved.pictures)) setPictures(saved.pictures);
        if (typeof saved.includePageNumbers === "boolean") setIncludePageNumbers(saved.includePageNumbers);
        if (typeof saved.viewMode === "string") setViewMode(saved.viewMode);
        if (typeof saved.zoomLevel === "number") setZoomLevel(saved.zoomLevel);
        if (typeof saved.pageNum === "number") setPageNum(saved.pageNum);
        setLastSavedLabel("Recovered local draft");
      }, 0);
    } catch {
      // Ignore malformed local state.
    }
  }, []);

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
    noteBorder: dm ? "#51445F" : "#EDE5A0",
    noteTxt: dm ? "#F6EAF2" : "#777052",
    inputColor: dm ? "#F2F4F8" : "#5E5D6A",
    shadow: dm
      ? "0 24px 70px rgba(0,0,0,0.42), 0 1px 0 rgba(255,255,255,0.05)"
      : "0 4px 28px rgba(142,141,155,0.14), 0 1px 4px rgba(142,141,155,0.08)",
  };
  const activePalette = activeTool === "text" || activeTool === "signature"
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
          gap: "6px", padding: "9px 6px", borderRadius: "14px", width: "100%",
          border: "none", cursor: "pointer", transition: "all 0.15s ease",
          background: isActive ? c.toolActive : "transparent",
          color: isActive ? c.toolActiveTxt : c.toolInactiveTxt,
          fontWeight: 700, fontSize: "11px", letterSpacing: "0.02em",
        }}
      >
        <div style={{ width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
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

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: isPdfLoaded ? "80px 1fr" : "1fr",
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
            <span style={{ fontSize: "16px", fontWeight: 800, color: c.inputColor }}>Pastelle</span>
          )}
        </div>

        {/* Top color and size controls */}
        <div style={{
          display: isPdfLoaded ? "flex" : "none", alignItems: "center", gap: "10px",
          background: c.sidebarBg, border: `1px solid ${c.sidebarBorder}`,
          borderRadius: "999px", padding: "7px 12px",
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 70,
          whiteSpace: "nowrap",
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
          {activeTool === "pencil" && (
            <>
              <div style={{ width: "1px", height: "24px", background: c.headerBorder }} />
              <select
                value={brushWidth}
                onChange={e => {
                  const v = +e.target.value;
                  setBrushWidth(v);
                  brushWidthRef.current = v;
                  setShowBrushWidthMenu(false);
                }}
                title="Brush size"
                style={compactSelectStyle("74px")}
              >
                {[1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </>
          )}
          {((activeTool === "text" || activeTool === "signature") || selectedObject?.kind === "text" || editingTextId) && (
            <div data-text-toolbar style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "1px", height: "24px", background: c.headerBorder }} />
              <TextDropdown
                value={textFontSize}
                width="66px"
                label="Font size"
                options={[12, 14, 16, 18, 20, 22, 24, 28, 32, 36]}
                onChange={setTextFontSizeForCurrent}
                formatOption={size => `${size}px`}
                theme={c}
                darkMode={dm}
              />
              <TextDropdown
                value={textLineHeight}
                width="72px"
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
              <TextDropdown
                value={currentTextListStyle()}
                width="100px"
                label="List Style"
                options={["none", "bullet", "number", "alpha"]}
                  onChange={setTextListStyle}
                  formatOption={style => style === "none" ? "None" : style === "bullet" ? "Bullets" : style === "number" ? "Numbers" : "Alpha"}
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
          {activeTool === "select" && (
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
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "8px 16px", borderRadius: "20px",
              background: dm ? "#2B3142" : "#E5D4FF",
              color: dm ? "#F2F4F8" : "#5E5D6A",
              border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: "12px", fontFamily: "inherit",
            }}
          >
            <FolderOpen size={15} />
            {isPdfLoaded ? "Open file" : "Open from Drive"}
          </button>
          <input ref={fileInputRef} type="file" accept={SUPPORTED_FILE_TYPES} multiple onChange={handleFile} style={{ display: "none" }} />
          <input ref={pictureInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" onChange={handlePictureFile} style={{ display: "none" }} />
          <input ref={insertPdfInputRef} type="file" accept={SUPPORTED_FILE_TYPES} multiple onChange={handleInsertPdf} style={{ display: "none" }} />
          <input ref={mergePdfInputRef} type="file" accept={SUPPORTED_FILE_TYPES} multiple onChange={handleMergePdf} style={{ display: "none" }} />
        </div>
      </header>

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────── */}
      <aside style={{
        gridColumn: "1", gridRow: "2",
        background: c.sidebarBg, borderRight: `1px solid ${c.sidebarBorder}`,
        display: isPdfLoaded ? "flex" : "none", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", padding: "14px 10px",
        transition: "background 0.2s",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", width: "100%" }}>
          <Link href="/" style={{ textDecoration: "none", marginBottom: "14px" }}>
            <div style={{
              width: "42px", height: "42px", borderRadius: "14px",
              background: c.toolActive, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer",
            }}>
              <Home size={16} color={c.toolActiveTxt} />
            </div>
          </Link>

          <div style={{ display: isPdfLoaded ? "block" : "none", width: "28px", height: "1px", background: c.sidebarBorder, margin: "8px 0 2px" }} />
          <div style={{ display: isPdfLoaded ? "flex" : "none", flexDirection: "column", alignItems: "stretch", gap: "6px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", margin: "2px 0 4px", width: "100%" }}>
            <span style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.12em", color: c.docMuted, textTransform: "uppercase", textAlign: "center", width: "100%" }}>TOOLS</span>
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
              gap: "6px",
              padding: "9px 6px",
              borderRadius: "14px",
              width: "100%",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: [ "rect", "ellipse", "diamond", "line", "arrow" ].includes(activeTool) ? c.toolActive : "transparent",
              color: [ "rect", "ellipse", "diamond", "line", "arrow" ].includes(activeTool) ? c.toolActiveTxt : c.toolInactiveTxt,
              fontWeight: 700,
              fontSize: "11px",
              letterSpacing: "0.02em",
            }}
          >
            <div style={{ width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {activeShapeIcon}
            </div>
            <span>Shape</span>
          </button>
          {toolBtn("text",        <Type size={sideIconSize} />,        "Text")}
          {toolBtn("signature",   <PenLine size={sideIconSize} />,     "Sign")}
          {toolBtn("eraser",      <Eraser size={sideIconSize} />,      "Eraser")}
          {toolBtn("note-btn",    <MessageSquare size={sideIconSize} />, "Note", addNote)}
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
                background: "rgba(255,255,255,0.82)",
                border: `1px solid ${c.panelBorder}`,
                boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                backdropFilter: "blur(8px)",
              }}>
                <span style={{
                  fontSize: "11px",
                  color: c.docMuted,
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
                background: "#E5D4FF",
                color: "#5E5D6A",
                fontSize: "12px",
                fontWeight: 700,
                fontFamily: "'Instrument Sans',sans-serif",
                boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
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
              zIndex: activeTool === "highlighter" ? 6 : 3,
              pointerEvents: activeTool === "highlighter" ? "auto" : "none",
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
              pointerEvents: !activeTool || activeTool === "highlighter" ? "none" : "auto",
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
                    const nextValue = e.target.value.replace(/\r/g, "");
                    setTextAnnotations(prev => prev.map(t => t.id === annotation.id ? { ...t, text: nextValue } : t));
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
                onMouseDown={e => onTextPointerDown(annotation, e)}
                onClick={e => {
                  e.stopPropagation();
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
                    pointerEvents: activeTool === "select" ? "auto" : "none",
                  cursor: activeTool === "select" ? "move" : "text",
                  userSelect: "text",
                }}
              >
                {annotation.listStyle === "bullet"
                  ? `• ${annotation.text || ""}`
                  : annotation.listStyle === "number"
                    ? `1. ${annotation.text || ""}`
                    : annotation.listStyle === "alpha"
                      ? `A. ${annotation.text || ""}`
                      : (annotation.text || " ")}
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
                  pointerEvents: "auto",
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
              onMouseDown={e => dragNote(note.id, e)}
              onClick={e => { e.stopPropagation(); setSelectedObject({ kind: "note", id: note.id }); }}
              style={{
                position: "absolute",
                left: note.x, top: note.y,
                zIndex: 20, cursor: "grab",
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
                    fontSize: "13px", color: c.noteTxt,
                    outline: "none", minHeight: "44px",
                    marginTop: "4px", paddingRight: "16px",
                    lineHeight: "1.55", userSelect: "text",
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
              position: "relative", zIndex: 5,
              minHeight: "calc(100dvh - 64px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "40px",
              color: c.docText,
              background: "radial-gradient(circle at 50% 0%, rgba(229,212,255,0.35), transparent 34%), #FAF9FB",
            }}>
              <div style={{
                width: "100%",
                maxWidth: "560px",
                border: `1px solid ${c.panelBorder}`,
                borderRadius: "22px",
                background: "#FFFFFF",
                padding: "44px 42px",
                textAlign: "center",
                boxShadow: "0 24px 70px rgba(142,141,155,0.16)",
              }}>
                <div style={{
                  width: "64px", height: "64px", borderRadius: "18px",
                  background: "#E5D4FF",
                  color: "#5E5D6A",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 18px",
                }}>
                  <FolderOpen size={28} />
                </div>
                <h1 style={{ fontSize: "28px", fontWeight: 850, margin: "0 0 10px", color: "#4E4D5B" }}>
                  Start your first page
                </h1>
                <p style={{ fontSize: "14px", lineHeight: "1.7", color: c.docMuted, margin: "0 auto 26px", maxWidth: "360px" }}>
                  Open a PDF or image to begin, then add notes, drawings, shapes, and pictures on top.
                </p>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
                      padding: "14px 24px", borderRadius: "999px",
                      background: "#25324A", color: "#FFFFFF",
                      border: "none", cursor: "pointer",
                      fontWeight: 850, fontSize: "14px", fontFamily: "inherit",
                      minWidth: "220px",
                    }}
                  >
                    <FolderOpen size={16} />
                    Get started
                  </button>
                  <button
                    onClick={startBlankPage}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: "transparent", color: "#5E5D6A",
                      border: "none", cursor: "pointer",
                      fontWeight: 800, fontSize: "13px", fontFamily: "inherit",
                      textDecoration: "underline",
                      textUnderlineOffset: "4px",
                    }}
                  >
                    Start with a blank page
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
