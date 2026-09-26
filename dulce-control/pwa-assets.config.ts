import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#F4527A" } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: "#F4527A" } },
  },
  images: ["public/favicon.svg"],
});
