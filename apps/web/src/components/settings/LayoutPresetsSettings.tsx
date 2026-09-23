import { Trash2Icon } from "lucide-react";

import { describeLayout, useLayoutPresetStore } from "../../layoutPresets";
import { Button } from "../ui/button";
import { DraftInput } from "../ui/draft-input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const NO_DEFAULT = "none";

/** Saved pane layouts. Presets are created from the command palette, not here. */
export function LayoutPresetsSettings() {
  const presets = useLayoutPresetStore((state) => state.presets);
  const defaultPresetId = useLayoutPresetStore((state) => state.defaultPresetId);
  const rename = useLayoutPresetStore((state) => state.rename);
  const remove = useLayoutPresetStore((state) => state.remove);
  const setDefault = useLayoutPresetStore((state) => state.setDefault);
  const defaultPreset = presets.find((preset) => preset.id === defaultPresetId) ?? null;

  return (
    <SettingsSection id="layouts" title="Layouts">
      <SettingsRow
        title="Default layout"
        description={
          presets.length === 0
            ? "Save a layout from the command palette with “Save current layout”."
            : "Panes a new thread opens with. The sidebar is left as it is."
        }
        control={
          <Select
            value={defaultPreset?.id ?? NO_DEFAULT}
            onValueChange={(value) => setDefault(value === NO_DEFAULT ? null : value)}
          >
            <SelectTrigger
              size="sm"
              className="w-full sm:w-44"
              aria-label="Default layout"
              disabled={presets.length === 0}
            >
              <SelectValue>{defaultPreset?.name ?? "None"}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem hideIndicator value={NO_DEFAULT}>
                None
              </SelectItem>
              {presets.map((preset) => (
                <SelectItem hideIndicator key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      {presets.map((preset, index) => (
        <SettingsRow
          key={preset.id}
          title={
            <DraftInput
              size="sm"
              className="w-full sm:w-56"
              value={preset.name}
              onCommit={(name) => rename(preset.id, name)}
              aria-label={`Name of layout ${index + 1}`}
              spellCheck={false}
            />
          }
          description={describeLayout(preset)}
          control={
            <Button
              size="icon-sm"
              variant="ghost-destructive"
              aria-label={`Delete ${preset.name}`}
              onClick={() => remove(preset.id)}
            >
              <Trash2Icon />
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );
}
