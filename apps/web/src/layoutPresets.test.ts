import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  layoutApplyIndexFromCommand,
  type LayoutSnapshot,
  selectDefaultLayoutPreset,
  snapshotRightPanel,
  useLayoutPresetStore,
} from "./layoutPresets";

const layout: LayoutSnapshot = {
  sidebarOpen: true,
  sidebarWidth: 280,
  rightPanelOpen: true,
  rightPanelWidth: 640,
  rightPanelMaximized: false,
  surfaceKinds: ["terminal", "diff"],
  activeKind: "diff",
  terminalSplit: "vertical",
  terminalDrawerOpen: false,
};

beforeEach(() => {
  useLayoutPresetStore.setState({ presets: [], defaultPresetId: null });
});

describe("snapshotRightPanel", () => {
  it("records tab kinds, not the thread-specific tabs themselves", () => {
    const snapshot = snapshotRightPanel({
      isOpen: true,
      activeSurfaceId: "pull-request:p:owner%2Frepo:4",
      surfaces: [
        {
          id: "file:src/a.ts",
          kind: "file",
          relativePath: "src/a.ts",
          revealLine: null,
          revealRequestId: 0,
        },
        {
          id: "file:src/b.ts",
          kind: "file",
          relativePath: "src/b.ts",
          revealLine: null,
          revealRequestId: 0,
        },
        {
          id: "pull-request:p:owner%2Frepo:4",
          kind: "pull-request",
          projectId: "p",
          repository: "owner/repo",
          number: 4,
        },
      ],
    });
    expect(snapshot).toEqual({
      rightPanelOpen: true,
      surfaceKinds: ["files", "pull-requests"],
      activeKind: "pull-requests",
      terminalSplit: null,
    });
  });

  it("keeps the terminal split direction only when the group is split", () => {
    const terminal = {
      id: "terminal:term-1" as const,
      kind: "terminal" as const,
      resourceId: "term-1",
      activeTerminalId: "term-1",
    };
    expect(
      snapshotRightPanel({
        isOpen: true,
        activeSurfaceId: terminal.id,
        surfaces: [{ ...terminal, terminalIds: ["term-1"] }],
      }).terminalSplit,
    ).toBeNull();
    expect(
      snapshotRightPanel({
        isOpen: true,
        activeSurfaceId: terminal.id,
        surfaces: [{ ...terminal, terminalIds: ["term-1", "term-2"] }],
      }).terminalSplit,
    ).toBe("horizontal");
    expect(
      snapshotRightPanel({
        isOpen: true,
        activeSurfaceId: terminal.id,
        surfaces: [{ ...terminal, terminalIds: ["term-1", "term-2"], splitDirection: "vertical" }],
      }).terminalSplit,
    ).toBe("vertical");
  });

  it("treats a hidden panel as closed", () => {
    expect(
      snapshotRightPanel({
        isOpen: false,
        activeSurfaceId: "diff",
        surfaces: [{ id: "diff", kind: "diff" }],
      }).rightPanelOpen,
    ).toBe(false);
  });
});

describe("useLayoutPresetStore", () => {
  it("names presets without reusing an existing name", () => {
    const store = useLayoutPresetStore.getState();
    const first = store.save(layout);
    store.rename(first.id, "Layout 2");
    const second = store.save(layout);
    expect(first.name).toBe("Layout 1");
    expect(second.name).toBe("Layout 3");
  });

  it("ignores blank renames", () => {
    const preset = useLayoutPresetStore.getState().save(layout);
    useLayoutPresetStore.getState().rename(preset.id, "   ");
    expect(useLayoutPresetStore.getState().presets[0]?.name).toBe("Layout 1");
  });

  it("clears the default when its preset is removed", () => {
    const preset = useLayoutPresetStore.getState().save(layout);
    useLayoutPresetStore.getState().setDefault(preset.id);
    expect(selectDefaultLayoutPreset(useLayoutPresetStore.getState())?.id).toBe(preset.id);
    useLayoutPresetStore.getState().remove(preset.id);
    expect(useLayoutPresetStore.getState().defaultPresetId).toBeNull();
    expect(selectDefaultLayoutPreset(useLayoutPresetStore.getState())).toBeNull();
  });
});

describe("layoutApplyIndexFromCommand", () => {
  it("maps apply commands to zero-based preset slots", () => {
    expect(layoutApplyIndexFromCommand("layout.apply.1")).toBe(0);
    expect(layoutApplyIndexFromCommand("layout.apply.9")).toBe(8);
    expect(layoutApplyIndexFromCommand("thread.jump.1")).toBeNull();
  });
});
