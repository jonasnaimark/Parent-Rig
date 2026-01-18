# Master Controller Feature Idea

## Overview

A "Master Controller" mode that allows multiple parent-child groups to share a single set of controls, inspired by the Delay Follower script.

## Current Parent Rig Behavior

Currently, when you apply Parent Rig:

1. Select children parented to Parent A → Creates controls on Parent A's rig layer
2. Select children parented to Parent B → Creates controls on Parent B's rig layer
3. Each group has **independent controls** (Delay, Stretch, Falloff, etc.)

```
Parent A (with its own Delay, Stretch controls)
  └── Child A1
  └── Child A2

Parent B (with its own Delay, Stretch controls)
  └── Child B1
  └── Child B2
```

**Downside**: To adjust timing across all children, you must modify multiple parent layers individually.

## Master Controller Concept

A shared controller layer that drives timing for **all** parent-child groups simultaneously.

```
Master Controller (Delay, Stretch, Variation controls)
  │
  ├── Parent A
  │     └── Child A1 (reads from Master Controller)
  │     └── Child A2 (reads from Master Controller)
  │
  └── Parent B
        └── Child B1 (reads from Master Controller)
        └── Child B2 (reads from Master Controller)
```

**Benefit**: Adjust one slider to affect all children across different parent groups.

## Inspiration: Delay Follower Script

The Delay Follower script (`Spring Follower.jsx`) implements this pattern:

### How It Works

1. User parents multiple layers to their respective parents using native AE parenting
2. User selects children and runs the script
3. Script creates:
   - One **"Delay Follow Controller"** shape layer with shared controls
   - Intermediate **"_follower"** layers for each child (invisible, guide layers)
4. Children are re-parented to their follower layers
5. Follower layers use expressions that read from the shared controller

### Controller Properties

```
Delay Follow Controller
├── Delay (frames) - cascade delay between children
├── Stretch (frames) - time stretch per child
└── Variation (%) - randomize timing per layer
```

### Key Expression Pattern

Each follower calculates its sample time based on:
- Its index in the cascade
- The shared Delay/Stretch values from the controller
- Composition markers for segment-based animation

```javascript
var ctrl = thisComp.layer("Delay Follow Controller");
var delayFrames = ctrl.effect("Delay")("Slider");
var stretchFrames = ctrl.effect("Stretch")("Slider");
var childIndex = 1; // varies per layer

var delay = childIndex * delayFrames * thisComp.frameDuration;
// ... use delay to sample parent position at offset time
```

## Implementation Options for Parent Rig

### Option A: Separate "Master Rig" Mode

Add a new button/mode: "Apply Master Rig"

- Creates a dedicated Master Controller layer
- All selected children (regardless of parent) read from this controller
- Individual parents retain their transform animation but lose timing controls

### Option B: "Link to Controller" Feature

After applying Parent Rig to multiple groups:

1. Select all parent rig layers
2. Click "Link to Master Controller"
3. Creates a Master Controller
4. Re-links all children's expressions to read from the Master Controller

### Option C: Global Controller Checkbox (Original Idea)

During "Apply Parent Rig":

- If checked, look for existing "Parent Rig Controller" layer
- If found, link new children to it
- If not found, create it and use it instead of per-parent controls

## UX Considerations

1. **Discovery**: How do users know this mode exists?
2. **Flexibility**: Can users mix master-controlled and independently-controlled groups?
3. **Editing**: How to unlink from master controller?
4. **Visual feedback**: How to indicate which children are master-controlled?

## Differences from Delay Follower

| Aspect | Delay Follower | Parent Rig (proposed) |
|--------|---------------|----------------------|
| Properties | Position, Scale, Rotation | Position, Scale, Rotation, Opacity, Anchor |
| Affector system | Edge Scale only | Full affector with Circle/Line/Artboard modes |
| Target system | None | Repel/attract targets |
| Pin boundaries | None | X/Y min/max boundaries |
| Native parenting | Removed (expression-based) | Removed (expression-based) |
| Cascade order | Layer stack order | Layer stack order (reversible) |

## Questions to Resolve

1. Should master controller include ALL parent effect properties, or just timing (Delay, Stretch)?
2. How to handle children with different parent rest positions?
3. Should index numbering be global (1-N across all groups) or per-group?
4. How does this interact with the Affector/Target systems?
