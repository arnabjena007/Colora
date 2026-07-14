export type CloudViewMode = "fit-width" | "fit-page" | "actual";

export interface CloudTextHighlightRange {
  start: number;
  end: number;
  color: string;
}

export interface CloudNoteItem {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface CloudTextAnnotationItem {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  lineHeight: number;
  color: string;
  align?: "left" | "center" | "right";
  listStyle?: "none" | "bullet" | "number" | "alpha";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  highlights?: CloudTextHighlightRange[];
  highlightColor?: string;
}

export interface CloudPictureItem {
  id: string;
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CloudStrokePoint {
  x: number;
  y: number;
}

export interface CloudDrawStroke {
  id: string;
  kind: "pencil";
  color: string;
  width: number;
  points: CloudStrokePoint[];
}

export interface CloudHighlightStrokeBox {
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  wobble: number;
}

export interface CloudHighlightStroke {
  id: string;
  kind: "highlight";
  color: string;
  boxes: CloudHighlightStrokeBox[];
}

export type CloudCanvasStroke = CloudDrawStroke | CloudHighlightStroke;

export interface CloudPageSnapshot {
  pageNumber: number;
  name: string;
  backgroundDataUrl: string;
  overlayDataUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  notes: CloudNoteItem[];
  textAnnotations: CloudTextAnnotationItem[];
  pictures: CloudPictureItem[];
  strokes?: CloudCanvasStroke[];
}

export interface CloudSourceFile {
  name: string;
  mimeType: string;
  size: number;
  storagePath: string;
  publicUrl?: string | null;
}

export interface CloudEditorState {
  version: 1;
  docTitle: string;
  docSubtitle: string;
  totalPages: number;
  pageNum: number;
  includePageNumbers: boolean;
  darkMode: boolean;
  viewMode: CloudViewMode;
  zoomLevel: number;
  sourceFiles?: CloudSourceFile[];
  pages: CloudPageSnapshot[];
}

export interface CloudDocumentRecord {
  id: string;
  browser_key: string;
  user_id?: string | null;
  title: string;
  payload: CloudEditorState;
  created_at: string;
  updated_at: string;
}
