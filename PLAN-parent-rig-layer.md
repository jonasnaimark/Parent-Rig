# Parent Rig Layer - Implementation Plan

## Problem

When using Parent Rig with reverse delay order on a visible parent layer:
- The parent layer animates immediately (no delay applied)
- Only children get delay based on their index
- The parent can't participate in the cascade

**Example of the problem:**
- Parent (visible shape) - animates at frame 0 (always!)
- Child 1 (index 1) - with reverse order, animates last
- Child 2 (index 2) - animates second-to-last
- Child 3 (index 3) - animates first

The parent should be able to animate LAST when reverse order is enabled.

## Solution

Create an invisible "Parent Rig" control layer that becomes the true parent:

1. **New layer**: Empty shape layer named `"[Original Parent Name] - Parent Rig"`
2. **Positioning**: Centered at original parent's anchor point position
3. **Hierarchy change**:
   - New rig layer becomes the parent (holds keyframes & rig controls)
   - Original parent becomes a child (gets index, participates in cascade)
   - Original children remain children (indices shift by 1)

**After rigging:**
```
[Original Parent] - Parent Rig  ← NEW invisible control layer (has Parent Rig effect)
  └── Original Parent           ← Now a child (index 1 or N depending on order)
  └── Child 1                   ← Index 2 or N-1
  └── Child 2                   ← Index 3 or N-2
  └── Child 3                   ← Index 4 or 1
```

## Smart Detection

**Skip creating new parent rig layer if:**
1. Parent is a **Null Object** (`layer.nullLayer === true`)
2. Parent is an **empty shape layer** (shape layer with no paths/content)

In these cases, assume the user already set up the control structure intentionally.

**Detection for empty shape layer:**
```javascript
function isEmptyShapeLayer(layer) {
    if (layer.matchName !== "ADBE Vector Layer") return false;
    var contents = layer.property("ADBE Root Vectors Group");
    return contents && contents.numProperties === 0;
}
```

## Implementation Steps

### 1. Modify `rigParentChildGroup()`

Before current logic:
```javascript
function rigParentChildGroup(parent, children, comp) {
    // NEW: Check if we need to create a parent rig layer
    var rigParent = parent;
    var allChildren = children.slice(); // Copy array

    if (!isNullOrEmptyShape(parent)) {
        // Create new parent rig layer
        rigParent = createParentRigLayer(parent, comp);

        // Original parent becomes a child
        allChildren.unshift(parent); // Add to beginning (will be index 1)
    }

    // Continue with existing logic using rigParent and allChildren
    // ...
}
```

### 2. New function: `createParentRigLayer()`

```javascript
function createParentRigLayer(originalParent, comp) {
    // Create empty shape layer
    var rigLayer = comp.layers.addShape();
    rigLayer.name = originalParent.name + " - Parent Rig";

    // Position at original parent's world position
    rigLayer.transform.position.setValue(
        originalParent.transform.position.value
    );

    // Match 3D status
    if (originalParent.threeDLayer) {
        rigLayer.threeDLayer = true;
    }

    // Move to just above original parent in layer stack
    rigLayer.moveBefore(originalParent);

    return rigLayer;
}
```

### 3. New function: `isNullOrEmptyShape()`

```javascript
function isNullOrEmptyShape(layer) {
    // Check if null object
    if (layer.nullLayer) return true;

    // Check if empty shape layer
    if (layer.matchName === "ADBE Vector Layer") {
        try {
            var contents = layer.property("ADBE Root Vectors Group");
            if (contents && contents.numProperties === 0) return true;
        } catch (e) {}
    }

    return false;
}
```

### 4. Update `unrigLayers()`

When unrigging:
1. Check if parent layer name ends with " - Parent Rig"
2. If so, find the original parent (first child that matches name prefix)
3. Re-parent all children to original parent
4. Delete the rig layer

```javascript
function unrigLayers(rigParent, children, comp) {
    var isRigLayer = rigParent.name.indexOf(" - Parent Rig") !== -1;
    var originalParent = null;
    var actualChildren = children;

    if (isRigLayer) {
        // Find original parent among children
        var baseName = rigParent.name.replace(" - Parent Rig", "");
        for (var i = 0; i < children.length; i++) {
            if (children[i].name === baseName) {
                originalParent = children[i];
                actualChildren = children.filter(function(c) {
                    return c.index !== originalParent.index;
                });
                break;
            }
        }
    }

    // Restore parenting
    var restoreParent = originalParent || rigParent;
    for (var i = 0; i < actualChildren.length; i++) {
        // Remove expressions, restore parent
        actualChildren[i].parent = restoreParent;
    }

    if (originalParent) {
        // Remove expressions from original parent too
        originalParent.parent = null; // Was parented to rig layer
    }

    // Remove rig effects
    removeRigEffects(restoreParent);
    for (var i = 0; i < actualChildren.length; i++) {
        removeRigEffects(actualChildren[i]);
    }

    // Delete rig layer if it was created
    if (isRigLayer && originalParent) {
        rigParent.remove();
    }
}
```

### 5. Update index assignment

When assigning indices:
- If original parent became a child, it gets index 1 (top of cascade)
- Original children get indices 2, 3, 4...
- With reverse order at 100%, original parent animates LAST

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Parent is null object | Use directly, no new layer |
| Parent is empty shape | Use directly, no new layer |
| Parent is visible shape | Create rig layer, parent becomes child |
| Parent is image/video | Create rig layer, parent becomes child |
| Parent is text layer | Create rig layer, parent becomes child |
| Parent is precomp | Create rig layer, parent becomes child |
| Unrig with rig layer | Delete rig layer, restore original hierarchy |
| Unrig without rig layer | Normal unrig (no layer deletion) |

## UI Considerations

- The new " - Parent Rig" layer will appear in the timeline
- It's an empty shape layer so it's invisible in the comp
- User can select it to access the rig controls
- User can lock it to prevent accidental selection

## Testing Checklist

- [ ] Apply to visible parent + children → creates rig layer
- [ ] Apply to null parent + children → uses null directly
- [ ] Apply to empty shape parent + children → uses shape directly
- [ ] Reverse order 0% → original parent animates first (index 1)
- [ ] Reverse order 100% → original parent animates last
- [ ] Unrig → deletes rig layer, restores original hierarchy
- [ ] 3D layers → rig layer is also 3D
- [ ] Re-apply to existing rig → unrigs correctly first
