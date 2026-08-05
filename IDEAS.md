# Feature Backlog

This document captures candidate features for future AI-assisted implementation.
Each feature should be implemented as a focused change, follow existing Vue and
Web Audio patterns, preserve undo/redo behavior, and include responsive and
keyboard-accessible interactions.

## Suggested Implementation Order

1. Sample editor zoom and pan
2. Manual chop selection and boundary editing
3. Chop deletion
4. Configurable automatic chop count
5. Dynamic performance pads for all chops
6. Add a clear button for the piano roll editor
7. Add zoom and pan to the piano roll editor

The first three features share waveform coordinate and selection behavior and
should use the same viewport model. Dynamic performance pads should follow once
chop editing is stable.

## 1. Sample Editor Zoom and Pan

### Zoom Goal

Let users inspect and edit short regions of the waveform without changing the
underlying audio or slice timing.

### Zoom Behavior

- Desktop: zoom with the mouse wheel while the pointer is over the waveform.
- Mobile: zoom with a two-finger pinch gesture.
- Keep the time beneath the pointer or pinch midpoint anchored while zooming.
- Allow horizontal panning when the waveform is zoomed in.
- Clamp the viewport so it cannot move beyond the sample boundaries.
- Provide a quick way to reset the viewport to the full sample.
- Keep the playhead, trim handles, slice overlays, and pointer hit testing aligned with the visible waveform region.

### Zoom Acceptance Criteria

- Zooming changes only the waveform viewport, not sample playback or project data.
- Zoom works at desktop and 390 px mobile widths without page-level horizontal overflow.
- Slice and trim interactions target the correct audio time at every zoom level.
- Loading or resetting a sample restores a full-sample viewport.

### Zoom Code Surfaces

- `src/components/SampleEditor.vue`
- A reusable waveform viewport helper if coordinate logic becomes complex

## 2. Manual Chop Selection and Boundary Editing

### Manual Chop Goal

Allow a user to select one chop in manual mode and precisely adjust its start and
end times.

### Manual Chop Behavior

- Clicking or tapping a chop selects it and gives it a clear selected state.
- Show draggable start and end handles for the selected chop.
- Convert pointer positions through the current zoomed waveform viewport.
- Clamp boundaries to the sample duration and enforce a small minimum chop length.
- Prevent invalid overlap behavior. Choose and document one policy before coding: either move the adjacent boundary with the handle or prevent crossing adjacent chops.
- Previewing the selected chop uses the edited boundaries immediately.
- One completed drag creates one undo history entry.

### Manual Chop Acceptance Criteria

- Boundary edits are audible in preview and sequenced playback.
- Undo and redo restore both boundaries exactly.
- Handles are usable with mouse, touch, and keyboard.
- Selection remains valid after reordering unless the selected chop is removed.

### Manual Chop Code Surfaces

- `src/components/SampleEditor.vue`
- `src/store.ts`
- `src/audio/sample.ts`

### Manual Chop Open Decision

- Should moving a shared boundary resize both adjacent chops, or may gaps exist between chops?

## 3. Delete Selected Chops

### Chop Deletion Goal

Make chop removal discoverable and consistent across pointer and keyboard input.

### Chop Deletion Behavior

- Allow deletion from the selected chop's controls.
- Support the `Delete` and `Backspace` keys when focus is not inside a text input.
- Remove the matching sample-sequencer row with the chop.
- Choose a sensible next selection after deletion.
- Do not allow stale performance pads or sequencer references to the deleted chop.
- Make the operation undoable as one action.

### Chop Deletion Acceptance Criteria

- The chop and its sequencer row are removed together.
- Undo restores the chop, its position, and its complete sequencer row.
- Deleting the final chop leaves a valid empty state without runtime errors.
- The delete control has an accessible name and a confirmation is not required for an undoable edit.

### Chop Deletion Code Surfaces

- `src/components/SampleEditor.vue`
- `src/components/SampleSequencer.vue`
- `src/store.ts`

## 4. Configurable Automatic Chop Count

### Automatic Chops Goal

Let users control how many chops automatic slicing produces while retaining
transient-aware boundaries where possible.

### Automatic Chops Behavior

- Add a bounded numeric control in automatic slice mode.
- Start with a practical range such as 2-32 chops.
- Recompute slices when the value is committed, not on every transient input event.
- Prefer the strongest detected transients when more candidates exist than the requested count.
- Fill missing boundaries evenly when too few transients are detected.
- Redistribute or migrate sequencer rows according to an explicitly chosen policy.
- Make one count change one undoable action.

### Automatic Chops Acceptance Criteria

- The resulting chop count matches the requested count for valid samples.
- Boundaries are ordered, non-overlapping, and cover valid sample times.
- The control works on narrow mobile layouts without shifting the waveform.
- Saved projects restore the selected automatic chop count or the resulting slices.

### Automatic Chops Code Surfaces

- `src/components/SampleEditor.vue`
- `src/store.ts`
- `src/audio/sample.ts`

### Automatic Chops Open Decision

- When regenerating chops, should existing sample-sequencer patterns be cleared, redistributed, or mapped to the nearest new boundaries?

## 5. Dynamic Performance Pads for All Chops

### Performance Pads Goal

Expose every current sample chop as a playable pad in performance mode.

### Performance Pads Behavior

- Render one pad for each current chop instead of limiting sample playback to the first four pads.
- Use a responsive grid with stable pad dimensions and scrolling or pagination for large chop counts.
- Keep pad order synchronized with chop order.
- Show a concise chop label and selected keyboard binding where available.
- Trigger playback with low latency using the existing sample player.
- Define keyboard behavior when there are more chops than available convenient keys.
- Update immediately after chop creation, reorder, boundary editing, or deletion.

### Performance Pads Acceptance Criteria

- Every current chop can be triggered with pointer or touch input.
- Reordering and deleting chops updates the pad grid without stale mappings.
- At least the first set of pads is keyboard accessible; all pads are focusable and have accessible names.
- The grid works at desktop and 390 px mobile widths without overlapping transport controls.

### Performance Pads Code Surfaces

- `src/components/PerformanceMode.vue`
- `src/App.vue`
- `src/store.ts`

### Performance Pads Open Decision

- Choose between scrolling, pagination, or banks when the chop count exceeds the preferred visible pad count.

## Cross-Cutting Requirements

- Preserve project save/load compatibility. Increment or migrate the project schema only when new persistent state is required.
- Record one undo snapshot per completed user gesture, not per pointer-move event.
- Keep live playback and WAV export behavior consistent.
- Add focused unit tests for coordinate conversion and slice-boundary rules.
- Add browser coverage for mouse, touch-sized mobile layouts, keyboard operation, and project round trips.
- Do not introduce page-level horizontal overflow at supported mobile widths.
