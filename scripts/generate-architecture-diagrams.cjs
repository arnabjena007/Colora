const fs = require("node:fs");
const path = require("node:path");
const rough = require("roughjs/bundled/rough.cjs.js");

const generator = rough.generator();
const outputDir = path.join(__dirname, "..", "public", "architecture");

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const drawingToSvg = (drawing) => generator.toPaths(drawing).map((item) => (
  `<path d="${item.d}" stroke="${item.stroke ?? "none"}" stroke-width="${item.strokeWidth ?? 1}" fill="${item.fill ?? "none"}"/>`
)).join("");

const roundedRectPath = (x, y, width, height, radius = 22) => [
  `M ${x + radius} ${y}`,
  `L ${x + width - radius} ${y}`,
  `Q ${x + width} ${y} ${x + width} ${y + radius}`,
  `L ${x + width} ${y + height - radius}`,
  `Q ${x + width} ${y + height} ${x + width - radius} ${y + height}`,
  `L ${x + radius} ${y + height}`,
  `Q ${x} ${y + height} ${x} ${y + height - radius}`,
  `L ${x} ${y + radius}`,
  `Q ${x} ${y} ${x + radius} ${y}`,
  "Z",
].join(" ");

const box = (x, y, width, height, fill, stroke, seed, radius = 22) => drawingToSvg(generator.path(
  roundedRectPath(x, y, width, height, radius),
  { seed, roughness: 1.35, bowing: 1.15, stroke, strokeWidth: 2.2, fill, fillStyle: "solid" }
));

const line = (x1, y1, x2, y2, color, seed, width = 2.1) => drawingToSvg(generator.line(
  x1, y1, x2, y2,
  { seed, roughness: 1.2, bowing: 1, stroke: color, strokeWidth: width }
));

const arrow = (x1, y1, x2, y2, color, seed) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 14;
  const left = angle + Math.PI * 0.84;
  const right = angle - Math.PI * 0.84;
  return [
    line(x1, y1, x2, y2, color, seed, 2.3),
    line(x2, y2, x2 + Math.cos(left) * size, y2 + Math.sin(left) * size, color, seed + 1, 2.3),
    line(x2, y2, x2 + Math.cos(right) * size, y2 + Math.sin(right) * size, color, seed + 2, 2.3),
  ].join("");
};

const curvedArrow = (points, color, seed) => {
  const curve = drawingToSvg(generator.curve(points, {
    seed,
    roughness: 1.2,
    bowing: 1,
    stroke: color,
    strokeWidth: 2.3,
  }));
  const [before, end] = points.slice(-2);
  return curve + arrow(before[0], before[1], end[0], end[1], color, seed + 10).replace(
    line(before[0], before[1], end[0], end[1], color, seed + 10, 2.3),
    ""
  );
};

const text = (x, y, value, size = 22, color = "#1b1b1f", weight = 400, anchor = "start") => (
  `<text x="${x}" y="${y}" class="excalidraw-text" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${escapeXml(value)}</text>`
);

const lines = (x, y, values, size = 19, color = "#1b1b1f", gap = 30, weight = 400) => values
  .map((value, index) => text(x, y + index * gap, value, size, color, weight))
  .join("");

const svgDocument = (title, body, background = "#ffffff") => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img">
  <title>${escapeXml(title)}</title>
  <style>
    @font-face { font-family: Excalifont; src: url('../fonts/Excalifont-Regular.woff2') format('woff2'); font-display: block; }
    .excalidraw-text { font-family: Excalifont, "Segoe Print", cursive; }
  </style>
  <rect width="1600" height="900" fill="${background}"/>
  ${body}
</svg>`;

const overview = () => {
  const body = [];
  body.push(text(800, 72, "Colora System Architecture", 42, "#1b1b1f", 400, "middle"));

  body.push(box(70, 240, 300, 320, "#a5d8ff", "#1971c2", 10, 26));
  body.push(text(105, 300, "Browser editor", 31, "#1971c2"));
  body.push(lines(105, 350, ["PDF.js page + text layer", "React annotation tools", "Canvas and object layer", "Workspace UI"], 20, "#1971c2", 39));

  body.push(box(500, 150, 470, 500, "#fff3bf", "#f08c00", 20, 28));
  body.push(text(735, 205, "Document workspace", 32, "#f08c00", 400, "middle"));
  body.push(box(545, 250, 380, 105, "#ffec99", "#f08c00", 21, 20));
  body.push(text(575, 295, "Page + annotation state", 26, "#f08c00"));
  body.push(text(575, 327, "page-relative coordinates", 18, "#f08c00"));
  body.push(box(545, 395, 380, 105, "#ffd8a8", "#f08c00", 22, 20));
  body.push(text(575, 440, "Local autosave", 26, "#e67700"));
  body.push(text(575, 472, "latest 3 browser drafts", 18, "#e67700"));
  body.push(box(545, 540, 380, 70, "#ffffff", "#f08c00", 23, 18));
  body.push(text(735, 584, "Recent documents", 23, "#e67700", 400, "middle"));

  body.push(box(1095, 280, 235, 235, "#ffc9c9", "#e03131", 30, 26));
  body.push(text(1212, 345, "PDF composer", 29, "#e03131", 400, "middle"));
  body.push(text(1212, 390, "pdf-lib", 23, "#e03131", 400, "middle"));
  body.push(lines(1140, 440, ["maps layers", "writes each page"], 18, "#e03131", 30));

  body.push(box(1400, 120, 155, 160, "#b2f2bb", "#2f9e44", 40, 24));
  body.push(text(1477, 178, "Download", 25, "#2f9e44", 400, "middle"));
  body.push(lines(1422, 220, ["high-quality", "PDF"], 17, "#2f9e44", 27));
  body.push(box(1385, 540, 180, 175, "#b2f2bb", "#2f9e44", 41, 24));
  body.push(text(1475, 600, "Google Drive", 25, "#2f9e44", 400, "middle"));
  body.push(lines(1410, 642, ["colora-projects", "dated folders"], 17, "#2f9e44", 29));

  body.push(arrow(370, 400, 500, 400, "#1971c2", 50));
  body.push(text(435, 380, "edit", 17, "#1971c2", 400, "middle"));
  body.push(arrow(970, 400, 1095, 400, "#f08c00", 55));
  body.push(text(1032, 380, "export", 17, "#f08c00", 400, "middle"));
  body.push(curvedArrow([[1330, 350], [1370, 300], [1400, 240]], "#e03131", 60));
  body.push(curvedArrow([[1330, 450], [1370, 510], [1385, 585]], "#e03131", 70));

  body.push(text(800, 765, "Local recovery works without an account", 25, "#2f9e44", 400, "middle"));
  body.push(text(800, 807, "Drive backup is optional and opens back into the same editor", 20, "#2f9e44", 400, "middle"));
  return svgDocument("Colora System Architecture", body.join(""));
};

const storageFlow = () => {
  const body = [];
  body.push(text(800, 70, "Colora Save and Recovery Flow", 42, "#1b1b1f", 400, "middle"));

  body.push(box(70, 265, 290, 300, "#a5d8ff", "#1971c2", 100, 26));
  body.push(text(215, 330, "Active editor", 30, "#1971c2", 400, "middle"));
  body.push(lines(110, 385, ["pages", "annotations", "tool settings"], 21, "#1971c2", 42));

  body.push(box(530, 130, 365, 255, "#fff3bf", "#f08c00", 110, 26));
  body.push(text(712, 195, "Browser storage", 30, "#f08c00", 400, "middle"));
  body.push(lines(575, 250, ["per-document autosave", "latest 3 documents", "works offline"], 20, "#e67700", 40));

  body.push(box(530, 500, 365, 215, "#e5dbff", "#9c36b5", 120, 26));
  body.push(text(712, 565, "Recent documents", 30, "#9c36b5", 400, "middle"));
  body.push(lines(575, 620, ["local previews", "open into active editor"], 20, "#862e9c", 40));

  body.push(box(1080, 105, 330, 210, "#b2f2bb", "#2f9e44", 130, 26));
  body.push(text(1245, 168, "Google sign-in", 29, "#2f9e44", 400, "middle"));
  body.push(lines(1120, 220, ["Supabase OAuth", "scoped Drive access"], 20, "#2f9e44", 39));

  body.push(box(1080, 490, 330, 230, "#b2f2bb", "#2f9e44", 140, 26));
  body.push(text(1245, 555, "Google Drive", 29, "#2f9e44", 400, "middle"));
  body.push(lines(1120, 610, ["PDF exports only", "colora-projects", "YYYY-MM-DD folders"], 20, "#2f9e44", 36));

  body.push(arrow(360, 350, 530, 255, "#1971c2", 150));
  body.push(text(430, 272, "autosave", 18, "#1971c2"));
  body.push(arrow(712, 385, 712, 500, "#f08c00", 155));
  body.push(text(735, 450, "preview", 18, "#f08c00"));
  body.push(arrow(530, 610, 360, 480, "#9c36b5", 160));
  body.push(text(397, 575, "reopen", 18, "#9c36b5"));
  body.push(arrow(895, 250, 1080, 205, "#2f9e44", 165));
  body.push(text(958, 205, "sign in", 18, "#2f9e44"));
  body.push(arrow(895, 615, 1080, 615, "#2f9e44", 170));
  body.push(text(987, 590, "save PDF", 18, "#2f9e44", 400, "middle"));

  body.push(text(800, 820, "Closing the tab does not erase the latest local work", 25, "#1b1b1f", 400, "middle"));
  return svgDocument("Colora Save and Recovery Flow", body.join(""));
};

const exportPipeline = () => {
  const body = [];
  body.push(text(800, 70, "Colora PDF Export Pipeline", 42, "#1b1b1f", 400, "middle"));

  const sources = [
    [55, "Original page", "PDF or image"],
    [425, "Text layer", "font + highlight"],
    [795, "Canvas strokes", "draw + highlighter"],
    [1165, "Objects", "shapes + notes + images"],
  ];
  sources.forEach(([x, heading, detail], index) => {
    body.push(box(x, 145, 315, 145, "#a5d8ff", "#1971c2", 200 + index, 24));
    body.push(text(x + 157, 205, heading, 27, "#1971c2", 400, "middle"));
    body.push(text(x + 157, 250, detail, 18, "#1971c2", 400, "middle"));
  });

  body.push(box(465, 410, 520, 280, "#e5dbff", "#9c36b5", 210, 28));
  body.push(text(725, 475, "PDF composer", 35, "#9c36b5", 400, "middle"));
  body.push(text(725, 520, "pdf-lib", 25, "#862e9c", 400, "middle"));
  body.push(lines(535, 575, ["1. map page coordinates", "2. draw annotation layers", "3. write a real PDF"], 21, "#862e9c", 38));

  body.push(box(1130, 455, 350, 200, "#b2f2bb", "#2f9e44", 220, 26));
  body.push(text(1305, 520, "Exported PDF", 31, "#2f9e44", 400, "middle"));
  body.push(lines(1180, 570, ["download locally", "or save to Drive"], 20, "#2f9e44", 36));

  sources.forEach(([x], index) => {
    body.push(arrow(x + 157, 290, 570 + index * 105, 410, "#1971c2", 230 + index * 4));
  });
  body.push(arrow(985, 550, 1130, 550, "#2f9e44", 250));

  body.push(box(70, 480, 300, 170, "#ffc9c9", "#e03131", 260, 24));
  body.push(text(220, 535, "Not a screenshot", 27, "#e03131", 400, "middle"));
  body.push(lines(105, 582, ["keeps original pages", "uses page geometry"], 19, "#e03131", 34));
  body.push(text(800, 805, "The editor and the exported PDF share the same coordinate model", 25, "#1b1b1f", 400, "middle"));
  return svgDocument("Colora PDF Export Pipeline", body.join(""), "#fffdf7");
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "01-system-overview.svg"), overview());
fs.writeFileSync(path.join(outputDir, "02-document-lifecycle.svg"), storageFlow());
fs.writeFileSync(path.join(outputDir, "03-export-pipeline.svg"), exportPipeline());
