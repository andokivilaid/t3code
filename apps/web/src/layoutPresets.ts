/**
 * Named workspace layouts: which panes are open, which right-panel tab kinds
 * exist, and how wide things are. Presets are device-local on purpose; a phone
 * and a desktop should not share one.
 *
 * Presets store tab kinds, never tab contents: applying "Terminal + Diff"
 * opens a fresh terminal and the diff for whatever thread is active, rather
 * than reopening one thread's file or pull request in another.
 */
import {
  LAYOUT_APPLY_KEYBINDING_COMMANDS,
  type LayoutApplyKeybindingCommand,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  dispatchLocalStorageChange,
  getLocalStorageItem,
  setLocalStorageItem,
} from "./hooks/useLocalStorage";
import { resolveStorage } from "./lib/storage";
import { randomUUID } from "./lib/utils";
import type { RightPanelSurface, ThreadRightPanelState } from "./rightPanelStore";

/** Right-panel kinds a preset can recreate without thread-specific context. */
export const LAYOUT_SURFACE_KINDS = [
  "terminal",
  "diff",
  "files",
  "preview",
  "device",
  "pull-requests",
  "agents",
] as const;
export type LayoutSurfaceKind = (typeof LAYOUT_SURFACE_KINDS)[number];

export interface LayoutSnapshot {
  sidebarOpen: boolean;
  /** Null keeps the current width when applied. */
  sidebarWidth: number | null;
  rightPanelOpen: boolean;
  rightPanelWidth: number | null;
  rightPanelMaximized: boolean;
  surfaceKinds: LayoutSurfaceKind[];
  activeKind: LayoutSurfaceKind | null;
  /** Split direction of the first terminal group, when it holds two or more terminals. */
  terminalSplit: "horizontal" | "vertical" | null;
  /** The terminal drawer under the chat, separate from right-panel terminal tabs. */
  terminalDrawerOpen: boolean;
}

export interface LayoutPreset extends LayoutSnapshot {
  id: string;
  name: string;
}

/**
 * Implemented by the mounted chat view, which owns the state a layout spans.
 * The command palette and keybindings reach it through this registry.
 */
export interface LayoutController {
  capture: () => LayoutSnapshot;
  apply: (layout: LayoutSnapshot) => void;
}

let activeController: LayoutController | null = null;

export function registerLayoutController(controller: LayoutController): () => void {
  activeController = controller;
  return () => {
    if (activeController === controller) activeController = null;
  };
}

export function getLayoutController(): LayoutController | null {
  return activeController;
}

export function layoutSurfaceKind(surface: RightPanelSurface): LayoutSurfaceKind | null {
  // Single files and single pull requests belong to one thread; the Files
  // and Pull requests tabs are their thread-independent stand-ins.
  if (surface.kind === "file") return "files";
  if (surface.kind === "pull-request") return "pull-requests";
  return surface.kind;
}

export function snapshotRightPanel(
  state: ThreadRightPanelState,
): Pick<LayoutSnapshot, "rightPanelOpen" | "surfaceKinds" | "activeKind" | "terminalSplit"> {
  const surfaceKinds: LayoutSurfaceKind[] = [];
  for (const surface of state.surfaces) {
    const kind = layoutSurfaceKind(surface);
    if (kind && !surfaceKinds.includes(kind)) surfaceKinds.push(kind);
  }
  const active = state.surfaces.find((surface) => surface.id === state.activeSurfaceId);
  const terminal = state.surfaces.find(
    (surface): surface is Extract<RightPanelSurface, { kind: "terminal" }> =>
      surface.kind === "terminal",
  );
  return {
    rightPanelOpen: state.isOpen && surfaceKinds.length > 0,
    surfaceKinds,
    activeKind: active ? layoutSurfaceKind(active) : null,
    terminalSplit:
      terminal && terminal.terminalIds.length > 1
        ? (terminal.splitDirection ?? "horizontal")
        : null,
  };
}

export function describeLayout(layout: LayoutSnapshot): string {
  const labels: Record<LayoutSurfaceKind, string> = {
    terminal: "Terminal",
    diff: "Diff",
    files: "Files",
    preview: "Browser",
    device: "Device",
    "pull-requests": "Pull requests",
    agents: "Agents",
  };
  const parts = [layout.sidebarOpen ? "Sidebar" : "No sidebar"];
  if (layout.terminalDrawerOpen) parts.push("Terminal drawer");
  if (layout.surfaceKinds.length === 0 || !layout.rightPanelOpen) {
    parts.push("panel closed");
  } else {
    parts.push(
      layout.surfaceKinds
        .map((kind) =>
          kind === "terminal" && layout.terminalSplit ? "Split terminal" : labels[kind],
        )
        .join(", "),
    );
    if (layout.rightPanelMaximized) parts.push("maximized");
  }
  return parts.join(" · ");
}

/** Reads a panel width persisted by `useResizableWidth` or the thread sidebar. */
export function readLayoutWidth(storageKey: string): number | null {
  try {
    return getLocalStorageItem(storageKey, Schema.Finite);
  } catch {
    return null;
  }
}

/** Persists a panel width and tells the mounted panel to pick it up. */
export function writeLayoutWidth(storageKey: string, width: number): void {
  try {
    setLocalStorageItem(storageKey, width, Schema.Finite);
    dispatchLocalStorageChange(storageKey);
  } catch (error) {
    console.error("Could not apply layout width.", error);
  }
}

function nextPresetName(presets: readonly LayoutPreset[]): string {
  const names = new Set(presets.map((preset) => preset.name));
  let index = presets.length + 1;
  while (names.has(`Layout ${index}`)) index += 1;
  return `Layout ${index}`;
}

interface LayoutPresetStoreState {
  presets: LayoutPreset[];
  /** Applied to a thread's right panel the first time it opens with no saved panel state. */
  defaultPresetId: string | null;
  save: (layout: LayoutSnapshot) => LayoutPreset;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  setDefault: (id: string | null) => void;
}

export const useLayoutPresetStore = create<LayoutPresetStoreState>()(
  persist(
    (set, get) => ({
      presets: [],
      defaultPresetId: null,
      save: (layout) => {
        const preset: LayoutPreset = {
          ...layout,
          id: randomUUID(),
          name: nextPresetName(get().presets),
        };
        set((state) => ({ presets: [...state.presets, preset] }));
        return preset;
      },
      rename: (id, name) =>
        set((state) => ({
          presets: state.presets.map((preset) =>
            preset.id === id ? { ...preset, name: name.trim() || preset.name } : preset,
          ),
        })),
      remove: (id) =>
        set((state) => ({
          presets: state.presets.filter((preset) => preset.id !== id),
          defaultPresetId: state.defaultPresetId === id ? null : state.defaultPresetId,
        })),
      setDefault: (id) => set({ defaultPresetId: id }),
    }),
    {
      name: "t3code:layout-presets:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        presets: state.presets,
        defaultPresetId: state.defaultPresetId,
      }),
    },
  ),
);

export function selectDefaultLayoutPreset(state: {
  presets: readonly LayoutPreset[];
  defaultPresetId: string | null;
}): LayoutPreset | null {
  return state.presets.find((preset) => preset.id === state.defaultPresetId) ?? null;
}

/** Applies the Nth preset (zero-based) through the mounted chat view. */
export function applyLayoutPresetAtIndex(index: number): boolean {
  const preset = useLayoutPresetStore.getState().presets[index];
  const controller = getLayoutController();
  if (!preset || !controller) return false;
  controller.apply(preset);
  return true;
}

export function layoutApplyIndexFromCommand(command: string): number | null {
  const index = LAYOUT_APPLY_KEYBINDING_COMMANDS.indexOf(command as LayoutApplyKeybindingCommand);
  return index === -1 ? null : index;
}
