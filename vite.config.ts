import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { livePlugin } from "./server/live";

export default defineConfig({ plugins: [react(), tailwindcss(), livePlugin()] });
