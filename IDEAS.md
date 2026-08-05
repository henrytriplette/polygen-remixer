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
8. Add more instruments to the melody tab
9. Allow the user to record a sample using the microphone
10. Whole song duration is driven by the lenght of bars, not the sample duration

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

## 6. Clear Piano Roll

### Clear Piano Roll Goal

Let users remove every melody note in one deliberate, undoable action without
affecting the drum pattern, sample sequence, or synth settings.

### Clear Piano Roll Behavior

- Add a clearly labelled Clear control to the piano-roll header.
- Disable the control when the roll has no notes.
- Clear all notes only after an intentional activation. A lightweight inline
	confirmation or undo-based feedback is acceptable; do not use a blocking
	browser confirmation dialog.
- Keep the selected synth waveform and the piano-roll viewport unchanged.
- Record clearing the complete note collection as one undo history entry.
- Restore all note properties, including pitch, start, length, and velocity,
	exactly on undo.

### Clear Piano Roll Acceptance Criteria

- Clearing removes every audible melody note from sequenced playback and WAV
	export.
- Undo and redo restore and remove the exact previous note collection.
- The control is keyboard operable, has an accessible name, and is disabled for
	an empty roll.
- Clearing notes does not modify drums, sample slices, effects, BPM, or bars.

### Clear Piano Roll Code Surfaces

- `src/components/PianoRoll.vue`
- `src/store.ts`

## 7. Piano Roll Zoom and Pan

### Piano Roll Viewport Goal

Allow users to edit longer arrangements and a wider pitch range precisely while
keeping the piano roll's musical grid and note hit testing aligned.

### Piano Roll Viewport Behavior

- Support horizontal zoom and pan across the song timeline, with the visible
	time under the pointer or pinch midpoint held in place while zooming.
- Support vertical zoom and pan across pitch rows without changing existing
	MIDI note values.
- Keep the keyboard column pinned while horizontally scrolling or panning.
- Retain a usable mobile interaction: two-finger pinch to zoom and a one-finger
	drag on an explicit pan affordance or empty grid space to pan.
- Clamp the viewport to the song's step range and the supported instrument
	pitch range.
- Provide a reset action that returns to the full song and default pitch range.
- Render the playhead, beat/bar guides, notes, and new-note placement through
	the same viewport-to-grid coordinate conversion.

### Piano Roll Viewport Acceptance Criteria

- Zooming and panning never change note timing, pitch, velocity, or song
	duration.
- A click or tap at every zoom level creates or selects the expected note and
	step.
- The playhead and bar lines remain visually aligned with notes at every
	viewport position.
- The roll remains usable at desktop and 390 px mobile widths without
	page-level horizontal overflow.
- Reset restores a predictable overview without mutating project data.

### Piano Roll Viewport Code Surfaces

- `src/components/PianoRoll.vue`
- A reusable piano-roll viewport helper if coordinate conversion becomes
	non-trivial
- `src/store.ts` only if viewport state must persist across view changes

## 8. Additional Melody Instruments

### Melody Instruments Goal

Give the melody tab a small, distinct palette of melodic sounds while preserving
the current piano-roll workflow and deterministic project playback.

### Melody Instruments Behavior

- Add an instrument selector in the piano-roll header alongside the waveform
	selector or replace the waveform selector with an instrument-aware control.
- Start with a focused set of synthesis-based instruments, such as bass, lead,
	pad, pluck, and keys; avoid requiring binary sample assets.
- Each instrument defines a stable oscillator/filter/envelope recipe and any
	supported controls it exposes.
- Switching instruments changes the sound for future and sequenced notes
	immediately, without modifying existing note events.
- Persist the selected instrument and its editable settings in saved projects.
- Make instrument selection undoable when it is part of the editable musical
	state, using one history entry per committed change.
- Keep the existing waveform choices available where they remain meaningful, or
	migrate the saved waveform field compatibly.

### Melody Instruments Acceptance Criteria

- Every listed instrument produces a distinguishable audible result during live
	playback and WAV export.
- Instrument selection survives save/load and old projects still load with the
	current synth sound as their fallback.
- Rapid instrument changes do not leak Web Audio nodes or leave stuck notes.
- The selector is keyboard accessible and works without clipping on 390 px
	mobile layouts.

### Melody Instruments Code Surfaces

- `src/components/PianoRoll.vue`
- `src/audio/synth.ts`
- `src/store.ts`
- `src/project.ts`

### Melody Instruments Open Decision

- Should instruments be a project-wide melody sound, or should each note store
	its own instrument for multi-timbral arrangements?

## 9. Microphone Sample Recording

### Microphone Recording Goal

Let users capture an audio sample directly in the browser and load it through
the same analysis and editing pipeline as an uploaded file.

### Microphone Recording Behavior

- Add a Record control near sample upload, with visible idle, requesting
	permission, recording, stopped, and error states.
- Request microphone access only after the user activates recording.
- Capture audio with `MediaRecorder` using a browser-supported MIME type, then
	decode the resulting blob through the existing sample-loading path.
- Provide Start, Stop, Cancel, and Retake actions. Stopping should make the
	recording available for analysis; cancelling must discard it without changing
	the current sample.
- Show elapsed recording time and enforce a practical maximum recording length
	so accidental long captures do not exhaust memory.
- Stop active microphone tracks on stop, cancel, component disposal, and error.
- Surface permission, unavailable-device, and decode failures as clear
	user-visible errors without corrupting the current project.

### Microphone Recording Acceptance Criteria

- A successful recording becomes the active sample and receives the same BPM,
	key, transient, duration, and loudness analysis as an uploaded audio file.
- Denied permission, unsupported recording APIs, and decode errors leave the
	existing sample and project state unchanged.
- A cancelled recording never replaces the current sample and releases the
	microphone promptly.
- The recording workflow is usable with keyboard and touch input, including at
	390 px mobile width.
- Export and save/load work with a recorded sample just as they do with an
	uploaded sample.

### Microphone Recording Code Surfaces

- `src/components/TopToolbar.vue`
- `src/store.ts`
- `src/audio/analysis.ts`

### Microphone Recording Open Decision

- Choose and document the maximum recording duration and whether monitoring
	through the mixer is supported in the initial release.

## 10. Bar-Driven Song Duration

### Bar-Driven Duration Goal

Make the selected number of bars and BPM the sole source of the song-loop
duration. The sample should be fit, repeated, or sliced within that duration;
its decoded duration must not change transport, export, or arrangement length.

### Bar-Driven Duration Behavior

- Define song duration as $bars \u00d7 4 \u00d7 60 / bpm$ seconds and derive the
	sequencer step count as $bars \u00d7 16$.
- Keep `bars` as the canonical arrangement-length setting; changing it resizes
	drum lanes, sample-sequencer rows, and piano-roll visibility according to
	documented migration rules.
- Schedule sample playback within the active step loop. A source sample longer
	than the song must not extend the loop; a shorter sample must not introduce
	silence unless that is the selected playback behavior.
- Apply the same bar-derived end time to live looping, the playhead reset,
	OfflineAudioContext export, and any duration display that represents the song.
- Continue showing the decoded sample duration separately in sample metadata.
- Ensure project load restores the bar setting before rebuilding time-dependent
	sequences and audio scheduling.

### Bar-Driven Duration Acceptance Criteria

- For every supported BPM and bar count, transport completes one non-looping
	pass after exactly $bars \u00d7 16$ sequencer steps.
- WAV export length matches the bar-derived song duration, allowing only the
	documented effect tail when one is deliberately rendered.
- Loading a shorter or longer sample does not change `bars`, `totalSteps`, or
	the song duration.
- Changing bars updates all sequencer lanes consistently and does not leave
	notes or step events beyond the active arrangement range.
- Saved projects reproduce the same bar-derived playback and export length.

### Bar-Driven Duration Code Surfaces

- `src/store.ts`
- `src/audio/engine.ts`
- `src/audio/transport.ts`
- `src/audio/sample.ts`
- `src/audio/wav.ts`
- `src/project.ts`

### Bar-Driven Duration Open Decisions

- When the bar count shrinks, should out-of-range drum events and melody notes
	be discarded, retained for restoration if bars expand again, or moved into the
	final bar?
- Should WAV export include a configurable effects tail beyond the arrangement
	duration, or end exactly at the final bar?
