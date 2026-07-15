export type LocalViewMode = "fit-width" | "fit-page" | "actual";

export interface LocalTextHighlightRange {
  start: number;
  end: number;
  color: string;
}

export interface LocalNoteItem {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface LocalTextAnnotationItem {
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
  highlights?: LocalTextHighlightRange[];
  highlightColor?: string;
}

export interface LocalPictureItem {
  id: string;
  src: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocalStrokePoint {
  x: number;
  y: number;
}

export interface LocalDrawStroke {
  id: string;
  kind: "pencil";
  color: string;
  width: number;
  points: LocalStrokePoint[];
}

export interface LocalHighlightStrokeBox {
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  wobble: number;
}

export interface LocalHighlightStroke {
  id: string;
  kind: "highlight";
  color: string;
  boxes: LocalHighlightStrokeBox[];
}

export type LocalCanvasStroke = LocalDrawStroke | LocalHighlightStroke;

export interface LocalPageSnapshot {
  pageNumber: number;
  name: string;
  backgroundDataUrl: string;
  overlayDataUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  notes: LocalNoteItem[];
  textAnnotations: LocalTextAnnotationItem[];
  pictures: LocalPictureItem[];
  strokes?: LocalCanvasStroke[];
}

export interface LocalEditorState {
  version: 1;
  docTitle: string;
  docSubtitle: string;
  totalPages: number;
  pageNum: number;
  includePageNumbers: boolean;
  darkMode: boolean;
  viewMode: LocalViewMode;
  zoomLevel: number;
  pages: LocalPageSnapshot[];
}
