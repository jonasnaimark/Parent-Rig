# Parent Rig - Feature Plans

---

# ✅ Pin System (COMPLETED)

## Problem
The current Influence Falloff system is too abstract for the main use case: overscroll stretch effects. Users need to juggle Falloff %, Curve %, and directional controls to achieve a simple "pin one end, stretch the rest" effect.

## Proposed Solution: Replace Falloff with Pin System

### Controls to REMOVE from Influence section:
- Influence Falloff (slider)
- Influence Falloff Curve (slider)

### Controls to ADD (new "Pin:" section):
1. **Pin** (dropdown): None / First / Last (default: None)
2. **Pin influence** (slider 0-100%, default 100%): How firmly the pinned layer stays in place
3. **Trim** (slider 0-childCount, default 0): How many layers to exclude from stretch

### Controls that STAY unchanged:
- Influence on children (in Influence section)
- All Delay controls (Step, Stretch, Falloff, Falloff Curve)
- Leader Index and related controls
- Everything else

---

## How It Works

### Pin dropdown:
- **None**: No pinning, normal behavior
- **First**: First layer (index 1) is pinned
- **Last**: Last layer (index = childCount) is pinned

### Pin influence:
- **100%**: Pinned layer stays completely in place
- **50%**: Pinned layer moves halfway
- **0%**: No pinning effect (same as Pin = None)

### Trim:
- **0**: All layers between pinned layer and opposite end participate in stretch
- **N**: Remove N layers from the stretch (from the non-pinned end)

### Stretch Distribution:
- Linear gradient from pinned layer to trim point
- Pinned layer: stays in place (0% influence)
- Layer next to pinned: **MOST stretch** (low influence, biggest gap)
- Layer at trim point: **minimal stretch** (high influence, follows almost fully)
- Layers beyond trim: follow normally (100% influence)

---

## Example: 20 layers, Pin = Last, Trim = 5

```
Layer 20 (pinned): stays in place (0% influence)
Layer 19: MOST stretch (low influence, big gap from 20)
Layer 18: less stretch
...
Layer 6 (trim point): minimal stretch (high influence)
Layer 5-1: follow normally (100% influence, beyond trim)
```

Parent moves up → Layer 20 stays put → Layer 19 lags most (big gap) → gaps decrease toward layer 6 → Layers 1-5 follow parent

---

## Example: Pin = First, Pin influence = 50%, Trim = 0

```
Layer 1 (pinned at 50%): moves halfway
Layer 2: MOST stretch (big gap from layer 1)
...
Layer 20: minimal stretch (follows almost fully)
```

---

## Implementation Steps

1. Update pseudo effect in Pseudo Effect Maker:
   - Remove "Falloff" slider from Influence section
   - Remove "Falloff Curve" slider from Influence section
   - Add new "Pin:" section with:
     - Pin (dropdown): None / First / Last
     - Pin influence (slider 0-100%, default 100%)
     - Trim (slider 0-100, default 0)

2. Export new FFX and copy to extension assets

3. Update PresetEffects.xml

4. Run test-indices.jsx to get new property indices

5. Update main.jsx:
   - Remove `getInfluenceFalloffMultiplier()` function
   - Remove `influenceFalloffProp` and `influenceFalloffCurveProp` references
   - Add new Pin logic:
   ```javascript
   function getPinInfluenceMultiplier(t) {
       var pinMode = pinModeProp.value; // 1=None, 2=First, 3=Last
       if (pinMode === 1) return 1; // No pinning, full influence

       var pinStrength = pinInfluenceProp.valueAtTime(t) / 100;
       var trim = Math.round(trimProp.valueAtTime(t));

       var pinnedIdx = (pinMode === 2) ? 1 : childCount;
       // Trim removes layers from the NON-pinned end
       var trimEndIdx = (pinMode === 2) ? childCount - trim : 1 + trim;

       // Check if this layer is beyond trim (no stretch effect, full influence)
       if (pinMode === 2 && myIndex > trimEndIdx) return 1;
       if (pinMode === 3 && myIndex < trimEndIdx) return 1;

       // Check if this is the pinned layer
       if (myIndex === pinnedIdx) return 1 - pinStrength; // 0 influence when fully pinned

       // Calculate linear gradient
       // Layer next to pinned = LOW influence (most stretch)
       // Layer at trim point = HIGH influence (minimal stretch)
       var distFromPinned = Math.abs(myIndex - pinnedIdx);
       var maxDist = Math.abs(trimEndIdx - pinnedIdx);
       var normalizedDist = distFromPinned / Math.max(maxDist, 1);

       // Influence increases as we get further from pinned layer
       // At pinned layer: influence = 0 (stays in place)
       // At trim point: influence = 1 (follows fully)
       var influence = normalizedDist;

       // Apply pin strength (pinStrength=1 means full effect, 0 means no effect)
       return 1 - (1 - influence) * pinStrength;
   }
   ```

6. Update NOTES.md with new structure

---

## Benefits
- 3 intuitive controls instead of 5+ abstract ones
- Clear mental model: "pin this end, stretch the rest"
- Trim handles long lists where items go off-screen
- Keyframable for dynamic effects

## Tradeoffs
- Less flexible than falloff system (only first/last pinning)
- Linear stretch only (no curve control)
- But: these tradeoffs match the actual use case (overscroll)

---

# 🔮 Future Features

---

## Delay Order (Position-Based Staggering)

### Problem
Currently, delay order is based on layer stack order. Users often want to stagger animations based on spatial position (e.g., top-to-bottom, radial outward).

### Proposed Solution: Add Delay Order Dropdown

**New control in Order section:**
- **Delay order** (dropdown, default: Leader)

**Dropdown options:**
1. Leader (default) - current behavior, based on Leader Index
2. Top to bottom
3. Bottom to top
4. Left to right
5. Right to left
6. Top left to bottom right
7. Top right to bottom left
8. Bottom left to top right
9. Bottom right to top left
10. Radial outwards
11. Radial inwards
12. Random

### Reverse Order Interaction
- Options 1-11: Reverse Order slider works normally (can blend/flip direction)
- Option 12 (Random): Reverse Order is ignored

### Implementation Notes
- Calculate sort value based on each child's rest position
- For diagonal: `sortValue = restPos[0] + restPos[1]` (or difference for other diagonal)
- For radial: `sortValue = distance(restPos, groupCenter)`
- Group center = average of all children's rest positions

---

## Chain Mode (Daisy-Chain Parenting)

### Problem
Current system has all children following the parent directly (star topology). Some animations need compounding motion where each child follows the previous child (chain topology), like tails, ropes, or slinky effects.

### Current (Star):
```
Parent ─┬─ Child 1
        ├─ Child 2
        ├─ Child 3
        └─ Child 4
```
All children move the same amount (just delayed).

### Chain Mode:
```
Parent → Child 1 → Child 2 → Child 3 → Child 4
```
Movements compound - Child 4 inherits lag/stretch from all previous children.

### Proposed Solution: Add Chain Mode Toggle

**New control on parent effect:**
- **Chain mode** (checkbox, default: off)

### Implementation Challenges

**Rest Values:**
Currently, rest values are baked into expressions as constants. In chain mode, each child needs to know its predecessor's rest position.

**Solution:** Store rest values in effect properties (not just expression constants):
- Add hidden sliders: `PR_RestX`, `PR_RestY`, `PR_RestZ`
- Each child stores its own rest position
- In chain mode, expression reads previous child's rest values by finding layer with `PR_Index = myIndex - 1`

**Expression Logic:**
```javascript
if (chainMode && myIndex > 1) {
    var prevChild = findChildByIndex(myIndex - 1);
    var prevRestPos = [prevChild.effect("PR_RestX").value, prevChild.effect("PR_RestY").value];
    var prevDelta = prevChild.position - prevRestPos;
    // Apply delay/influence to prevDelta instead of parentDelta
} else {
    // Current behavior - follow parent
}
```

### Use Cases
- Tail/tentacle animations
- Rope/cable physics
- Slinky walking (combine with animated Leader + Rotate Around Leader)
- Organic follow-through where extremities exaggerate

### Estimated Effort
1-2 days - requires restructuring rest value storage
