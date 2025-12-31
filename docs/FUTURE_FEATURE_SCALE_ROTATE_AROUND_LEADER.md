# Future Feature: Scale/Rotate Around Leader

## Overview

Add a third option to the "Scale around" and "Rotate around" popup menus: **Leader**.

Currently:
- **Child** (1): Scale/rotate around the child's own anchor point
- **Parent** (2): Scale/rotate around the parent layer's position

Proposed:
- **Leader** (3): Scale/rotate around the leader layer's position

## Why This Feature?

The Leader index already establishes a "focal point" for timing (the leader has 0 delay). Making it the focal point for transforms is a natural extension:

- **Expand from center**: Children scale outward from the leader
- **Orbit effects**: Children rotate around a moving leader
- **Dynamic pivot**: When Leader index is animated, the pivot point changes mid-animation

## Technical Approach

### Finding the Leader Layer

Each child has a `PR_Index` slider effect. We can search for the leader:

```javascript
function findLeaderLayer(targetIndex) {
    for (var i = 1; i <= thisComp.numLayers; i++) {
        try {
            var layer = thisComp.layer(i);
            var indexEffect = layer.effect("PR_Index");
            if (indexEffect && Math.round(indexEffect("Slider").value) === targetIndex) {
                return layer;
            }
        } catch(e) {}
    }
    return null;
}
```

### Time Sampling

Use the leader's position at **current time** (not time-remapped):

```javascript
var leaderPos = leaderLayer.transform.position.valueAtTime(t);
```

Why current time?
- Leader has 0 delay, represents "current" state
- Children are delayed versions following the leader
- Creates meaningful expand/contract effect as cascade plays
- Using child's time-remapped time would result in minimal/no effect

### Animated Leader Index

The lookup is dynamic:

```javascript
var leaderIdx = Math.round(leaderIndexProp.valueAtTime(t));
var leaderLayer = findLeaderLayer(leaderIdx);
```

When Leader index keyframes from 2→4, the pivot automatically switches.

## Edge Cases

| Case | Behavior |
|------|----------|
| Leader is self | Skip transform (equivalent to "Child" mode) |
| Leader not found | Fallback to parent |
| Leader index = 1 | Child 1 is pivot for all others |
| 3D layers | Works the same, position is [x,y,z] |
| Split dimensions | Get X and Y from leader separately |

## Performance Considerations

Layer iteration happens every frame for each child:
- 50 layers × 10 children = 500 iterations/frame
- Acceptable for most rigs (<30 layers)
- Could optimize with naming convention, but adds fragility

## Implementation Checklist

### 1. Update Pseudo Effect

Add third option to popups in Pseudo Effect Maker:
```
Scale around: Child | Parent | Leader
Rotate around: Child | Parent | Leader
```

Then update PresetEffects.xml and FFX file (see NOTES.md for process).

### 2. Update Expression Header

Add the `findLeaderLayer()` function to both pseudo effect mode and slider fallback mode headers in `host/main.jsx`.

### 3. Modify Transform Logic

Update the position expression's scale-around and rotate-around sections:

```javascript
// Get pivot point based on mode
function getTransformPivot(mode, t) {
    if (mode === 1) {
        return null; // Child mode - no pivot transform
    } else if (mode === 2) {
        // Parent mode
        return parentLayer.transform.position.valueAtTime(getRemappedTime(t));
    } else if (mode === 3) {
        // Leader mode
        var leaderIdx = Math.round(leaderIndexProp.valueAtTime(t));

        // If I am the leader, no pivot transform needed
        if (myIndex === leaderIdx) return null;

        var leaderLayer = findLeaderLayer(leaderIdx);
        if (leaderLayer) {
            return leaderLayer.transform.position.valueAtTime(t); // Current time!
        }
        // Fallback to parent if leader not found
        return parentLayer.transform.position.valueAtTime(getRemappedTime(t));
    }
}
```

### 4. Handle Split Dimensions

For layers with separate X/Y/Z position:
```javascript
var leaderPosX = leaderLayer.transform.xPosition.valueAtTime(t);
var leaderPosY = leaderLayer.transform.yPosition.valueAtTime(t);
```

### 5. Update Slider Fallback Mode

Add equivalent logic or stub (Leader mode as pseudo-effect-only feature).

### 6. Update NOTES.md

Document the new popup values and any index changes.

## Example Use Cases

### Center-Out Explosion
- 5 children in a row
- Leader index = 3 (middle child)
- Scale around = Leader
- Parent scales up → children expand outward from center

### Following Orbit
- Children arranged in a circle
- Leader index = 1
- Rotate around = Leader
- Parent rotates → children orbit around child 1's position

### Animated Focus Point
- Leader index keyframed: 1 → 3 → 5
- Scale around = Leader
- Creates a "wave" of scale pivots moving through the children

## Complexity Assessment

**Medium complexity**
- Core logic is straightforward
- Main work is expression code and edge case handling
- No architectural changes needed
- Performance acceptable for typical use cases

## Decision

Deferred for now. Feature is well-defined and implementable when needed.
