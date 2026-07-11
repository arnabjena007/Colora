import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Colora PDF Editor",
    short_name: "Colora",
    description: "A design-first PDF annotation editor for highlighting, signing, merging, and exporting PDFs.",
    start_url: "/editor",
    scope: "/",
    display: "standalone",
    background_color: "#FAF9FB",
    theme_color: "#E5D4FF",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Open PDF Editor",
        short_name: "Editor",
        description: "Launch the Colora PDF editor",
        url: "/editor",
        icons: [{ src: "/pwa-icon-512.png", sizes: "512x512", type: "image/png" }],
      },
    ],
  };
}
