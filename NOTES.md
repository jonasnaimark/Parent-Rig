# Parent Rig CEP Extension - Development Notes

## Pseudo Effect Index Mapping

**Important:** When using Pseudo Effect Maker with empty label groups, each label creates TWO entries:
1. The label itself
2. An "endLabel" entry

Both take up indices in the property list. This affects how you reference properties by index in expressions.

### Parent Rig - Parent Effect Structure (UPDATED Jan 2025 - with Pin Edges System)

**CRITICAL:** Nested group properties use FLAT indexing in expressions. You CANNOT access them via `pEff("Group Name")("Property")` - this causes "can't use this param type" error. You MUST use numeric indices.

| Index | Type | Property Name |
|-------|------|---------------|
| 1 | label | "Delay:" |
| 2 | endLabel | (auto) |
| **3** | slider | **Delay - Step** |
| **4** | slider | **Delay - Stretch** |
| **5** | slider | **Influence on children** |
| **6** | slider | **Falloff** (-100 to 100, default 0) |
| 7 | label | "" (empty separator) |
| 8 | endLabel | (auto) |
| 9 | label | "Order:" |
| 10 | endLabel | (auto) |
| 11 | label | "Order by:" |
| 12 | endLabel | (auto) |
| **13** | popup | **Order by** (1=Leader, 3-6=directional, 7-10=diagonal, 11-14=radial, 16=random) |
| **14** | slider | **Reverse order** |
| **15** | slider | **Random seed** |
| 16 | label | "" (empty separator) |
| 17 | endLabel | (auto) |
| 18 | label | "Leader layer:" |
| 19 | endLabel | (auto) |
| **20** | slider | **Leader index** |
| **21** | slider | **Delay before leader** |
| **22** | slider | **Delay after leader** |
| 23 | label | "" (empty separator) |
| 24 | endLabel | (auto) |
| 25 | label | "Transform type:" |
| 26 | endLabel | (auto) |
| **27** | popup | **Scale around** (1=Child, 2=Parent, 3=Leader) |
| **28** | popup | **Rotate around** (1=Child, 2=Parent, 3=Leader) |
| 29 | label | "" (empty separator) |
| 30 | endLabel | (auto) |
| 31 | group header | "Pin Edges:" |
| **32** | popup | **Pin Direction** (1=Overscroll Stretch, 2=Collision Squish) |
| **33** | slider | **Pin Influence** (0-100%, default 100%) |
| **34** | slider | **Pin Trim** (0-100, default 0) |
| 35 | label | "Top:" |
| 36 | endLabel | (auto) |
| **37** | checkbox | **Top** (enable top edge) |
| **38** | slider | **Top Y** (boundary position) |
| 39 | label | "Bottom:" |
| 40 | endLabel | (auto) |
| **41** | checkbox | **Bottom** (enable bottom edge) |
| **42** | slider | **Bottom Y** (boundary position, default = comp height) |
| 43 | label | "Left:" |
| 44 | endLabel | (auto) |
| **45** | checkbox | **Left** (enable left edge) |
| **46** | slider | **Left X** (boundary position) |
| 47 | label | "Right:" |
| 48 | endLabel | (auto) |
| **49** | checkbox | **Right** (enable right edge) |
| **50** | slider | **Right X** (boundary position, default = comp width) |
| 51 | endGroup | (auto) |
| 52 | group header | "Children follow:" |
| 53 | label | "" |
| 54 | endLabel | (auto) |
| **55** | checkbox | **Position** (in Children follow) |
| **56** | checkbox | **Scale** (in Children follow) |
| **57** | checkbox | **Rotation** (in Children follow) |
| **58** | checkbox | **Opacity** (in Children follow) |
| **59** | checkbox | **Anchor point** (in Children follow) |
| 60 | label | "" (empty separator inside group) |
| 61 | endLabel | (auto) |
| 62 | endGroup | (auto) |
| 63 | group header | "Delays apply to:" |
| **64** | checkbox | **Position** (in Delays apply to) |
| **65** | checkbox | **Scale** (in Delays apply to) |
| **66** | checkbox | **Rotation** (in Delays apply to) |
| **67** | checkbox | **Opacity** (in Delays apply to) |
| **68** | checkbox | **Anchor point** (in Delays apply to) |
| 69 | endGroup | (auto) |
| **70** | slider | **Child count** (hidden)

### Expression Access Pattern (FLAT INDICES ONLY)

**WARNING:** Do NOT use `pEff("Group Name")("Property")` syntax - it causes runtime errors.
Always use flat numeric indices for ALL properties, including those inside groups.

```javascript
// In expressions, access pseudo effect properties:
var pEff = parentLayer.effect("Parent Rig - Parent");

// Delay section (indices 3-6)
var delayProp = pEff(3);              // Delay - Step
var stretchProp = pEff(4);            // Delay - Stretch
var parentInfluenceProp = pEff(5);    // Influence on children
var delayFalloffProp = pEff(6);       // Falloff (-100 to 100, default 0)

// Order section (indices 13-15)
var orderByProp = pEff(13);           // Order by (1=Leader, 3-6=directional, etc.)
var reverseOrderProp = pEff(14);      // Reverse order
var randomSeed = pEff(15).value;      // Random seed

// Leader layer section (indices 20-22)
var leaderIndexProp = pEff(20);          // Leader index
var delayBeforeLeaderProp = pEff(21);    // Delay before leader
var delayAfterLeaderProp = pEff(22);     // Delay after leader

// Transform type popups (indices 27-28): 1=Child, 2=Parent, 3=Leader
var scaleAroundMode = pEff(27).value;    // Scale around
var rotateAroundMode = pEff(28).value;   // Rotate around

// Pin Edges section (indices 32-50)
var pinDirectionProp = pEff(32);         // 1=Overscroll Stretch, 2=Collision Squish
var pinInfluenceProp = pEff(33);         // Pin influence (0-100%)
var pinTrimProp = pEff(34);              // Pin trim (0-childCount)
var pinTopEnabled = pEff(37).value;      // Top edge enabled
var pinTopY = pEff(38).value;            // Top Y boundary
var pinBottomEnabled = pEff(41).value;   // Bottom edge enabled
var pinBottomY = pEff(42).value;         // Bottom Y boundary
var pinLeftEnabled = pEff(45).value;     // Left edge enabled
var pinLeftX = pEff(46).value;           // Left X boundary
var pinRightEnabled = pEff(49).value;    // Right edge enabled
var pinRightX = pEff(50).value;          // Right X boundary

// Children follow (indices 55-59) - FLAT INDICES, NOT GROUP ACCESS
var followPosition = pEff(55).value;
var followScale = pEff(56).value;
var followRotation = pEff(57).value;
var followOpacity = pEff(58).value;
var followAnchorPoint = pEff(59).value;

// Delays apply to (indices 64-68) - FLAT INDICES, NOT GROUP ACCESS
var delayPosition = pEff(64).value;
var delayScale = pEff(65).value;
var delayRotation = pEff(66).value;
var delayOpacity = pEff(67).value;
var delayAnchorPoint = pEff(68).value;

// Child count (index 70)
var childCount = pEff(70).value;
```

### ExtendScript Access (Setting Values)

```javascript
// When setting values via ExtendScript, NAME-based access works:
var eff = layer.effect("Parent Rig - Parent");
eff.property("Child count").setValue(childCount);
```

### Finding Property Indices After Updating Pseudo Effect

When you update the pseudo effect structure, indices may change. Use this test script to discover the actual indices:

**Save as `/Users/jonas_naimark/Documents/ParentRig-CEP/test-indices.jsx`:**

```javascript
// Test script to find pseudo effect property indices
var comp = app.project.activeItem;
if (comp && comp instanceof CompItem && comp.selectedLayers.length > 0) {
    var layer = comp.selectedLayers[0];
    var eff = layer.effect("Parent Rig - Parent");

    if (eff) {
        var result = "Property indices:\n\n";
        for (var i = 1; i <= eff.numProperties; i++) {
            try {
                var prop = eff.property(i);
                result += i + ": " + prop.name + " (" + prop.matchName + ")\n";
            } catch(e) {
                result += i + ": [error]\n";
            }
        }
        alert(result);
    } else {
        alert("No 'Parent Rig - Parent' effect found on selected layer");
    }
} else {
    alert("Select a layer with the Parent Rig - Parent effect");
}
```

**How to use:**
1. Apply a fresh rig to a layer (to get the pseudo effect)
2. Select that layer
3. Run the script in AE (File → Scripts → Run Script File)
4. Copy the output and update the indices in `host/main.jsx`

## Key Fixes History

### Nested Group Property Access in Expressions (Dec 2024)
**Problem:** After adding nested groups ("Children follow:" and "Delays apply to:"), expressions failed with "can't use this param type" error.

**Attempted (WRONG):**
```javascript
var followGroup = pEff("Children follow:");
var followPosition = followGroup("Position").value;  // ERROR!
```

**Fix (CORRECT):** Use flat numeric indices. Nested properties continue the flat index sequence:
```javascript
var followPosition = pEff(23).value;  // Position is at index 23
var followScale = pEff(24).value;     // Scale is at index 24
```

**Why:** AE expressions cannot access Effect groups as containers. The group header takes an index, each property inside takes sequential indices, then an endGroup takes another index.

Location: `host/main.jsx` - all pseudo effect header variable declarations

### extensionRoot Variable Scope
**Problem:** `var extensionRoot = "..."` in evalScript created a local variable instead of updating the global.
**Fix:** Remove `var` to update the global: `extensionRoot = "..."`

Location: `client/script.js`

### Layer Reference by Name (not Index)
**Problem:** Original code used `thisComp.layer(parent.index)` which broke the rig when layers were added above the parent layer (indices shift).
**Fix:** Changed to use layer NAME instead: `thisComp.layer("Parent Layer Name")`

Location: `host/main.jsx` - both pseudo effect mode and slider fallback mode headers in `applyExpressions()`

### Parent Rest Value Preservation
**Problem:** When adding a new child to an existing rig (after the parent has been animated), the new child would jump to the wrong position because it captured the parent's CURRENT position as "rest" instead of the original rest position.
**Fix:** Added `getExistingParentRestValues()` function that checks if any selected child already has rig effects. If so, it extracts the stored parent rest values and uses them for ALL children when re-applying the rig.

Location: `host/main.jsx` - `getExistingParentRestValues()` and `rigParentChildGroup()`

### Pseudo Effect Detection
The code detects whether to use pseudo effect mode or slider fallback:
```javascript
var usePseudoEffect = false;
try {
    var testEff = parent.property("ADBE Effect Parade").property("Parent Rig - Parent");
    if (testEff) usePseudoEffect = true;
} catch (e) {}
```

### FFX vs PresetEffects.xml Mismatch (Dec 2024)
**Problem:** When updating the pseudo effect structure, the FFX file and PresetEffects.xml could get out of sync. Applying the FFX would create an effect with the OLD structure, but expressions expected the NEW structure indices.

**Symptom:** "effect control conversion required" warning + children don't follow parent.

**Fix:** Changed `addParentEffect()` to add the effect by matchname FIRST:
```javascript
// This uses PresetEffects.xml directly - always in sync with expressions
var eff = effects.addProperty("Pseudo/ParentRigParent");
```

**Why this works:** `addProperty("Pseudo/ParentRigParent")` creates the effect from PresetEffects.xml, which is the same source we update when changing the effect structure. The FFX is now only a fallback.

**Order of attempts in addParentEffect():**
1. `effects.addProperty("Pseudo/ParentRigParent")` - uses PresetEffects.xml
2. Apply FFX preset - fallback
3. Individual slider controls - last resort fallback

Location: `host/main.jsx` - `addParentEffect()` function

## Updating Pseudo Effects - COMPLETE GUIDE

### ⚠️ CRITICAL: There are TWO files you MUST update!

1. **PresetEffects.xml** - AE's master effect registry (requires sudo)
2. **FFX file in extension assets** - Fallback used by the extension

If you only update PresetEffects.xml, the extension may fall back to the OLD FFX and you'll see old controls!

### Key Facts
- **You use After Effects 2024** (not 2025)
- **Pseudo Effect Maker's "Apply" button does NOT work** (permissions issue)
- **The closing tag is `</Effects>`** not `</PresetEffects>`

### File Locations

| File | Path |
|------|------|
| PresetEffects.xml (AE 2024) | `/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml` |
| FFX save location (Pseudo Effect Maker) | `/Users/jonas_naimark/Library/CloudStorage/GoogleDrive-jonas.naimark@airbnb.com/My Drive/Scripts and Prototypes/Parent Rig/Parent Rig - Parent.ffx` |
| FFX extension assets (MUST COPY HERE!) | `/Users/jonas_naimark/Documents/ParentRig-CEP/assets/presets/Parent Rig - Parent.ffx` |

---

### Step-by-Step: Updating a Pseudo Effect

#### Step 1: Edit in Pseudo Effect Maker and save the FFX
Save to: `/Users/jonas_naimark/Library/CloudStorage/GoogleDrive-jonas.naimark@airbnb.com/My Drive/Scripts and Prototypes/Parent Rig/`

#### Step 2: Copy FFX to extension assets folder (CRITICAL!)
```bash
cp "/Users/jonas_naimark/Library/CloudStorage/GoogleDrive-jonas.naimark@airbnb.com/My Drive/Scripts and Prototypes/Parent Rig/Parent Rig - Parent.ffx" "/Users/jonas_naimark/Documents/ParentRig-CEP/assets/presets/Parent Rig - Parent.ffx"
```
**This step is often forgotten and causes the old effect to appear!**

#### Step 3: Get the XML from Pseudo Effect Maker
In Pseudo Effect Maker, copy the effect XML (there should be an export/copy option).

#### Step 4: Create the Python update script
Save as `/tmp/update_effect.py`:

**IMPORTANT:** Use this line-by-line script. The regex-based approach hangs on large XML files!

```python
preset_file = '/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml'

new_effect = '''  <Effect matchname="Pseudo/ParentRigParent" name="$$/AE/Preset/ParentRigParent=Parent Rig - Parent">
    ... PASTE YOUR EFFECT XML HERE (from Pseudo Effect Maker) ...
  </Effect>'''

# Line-by-line processing (regex hangs on large files!)
with open(preset_file, 'r') as f:
    lines = f.readlines()

output_lines = []
skip_until_end_effect = False

for line in lines:
    # Skip existing ParentRigParent effect entirely
    if 'matchname="Pseudo/ParentRigParent"' in line:
        skip_until_end_effect = True
        continue
    if skip_until_end_effect:
        if '</Effect>' in line:
            skip_until_end_effect = False
        continue
    output_lines.append(line)

content = ''.join(output_lines)
# Add new effect before closing </Effects> tag
content = content.replace('</Effects>', new_effect + '\n</Effects>')

with open(preset_file, 'w') as f:
    f.write(content)

print("Done!")
```

#### Step 5: Run with sudo
```bash
sudo python3 /tmp/update_effect.py
```

#### Step 6: Verify PresetEffects.xml was updated
```bash
grep -A 5 "NEW_PROPERTY_NAME" "/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml"
```
Replace `NEW_PROPERTY_NAME` with a property you just added (e.g., "Leader index"). If no output, the update failed.

#### Step 7: Force quit After Effects (IMPORTANT!)
Cmd+Q is NOT enough. AE processes linger. Use this command:
```bash
pkill -f "After Effects"
```

Then verify it's fully closed:
```bash
ps aux | grep -i "After Effects" | grep -v grep
```
Should show NO output. If processes still show, run `pkill` again.

#### Step 8: Reopen After Effects 2024 and test in a NEW project
- File → New → New Project
- **NEVER open existing projects** - they cache old effect structure
- Apply the rig to test layers
- Verify the new controls appear

#### Step 9: First-time warning is normal
You'll see: "effect control conversion required in effect..."
- This is expected when effect structure changes
- Click OK - won't appear again for new projects

#### Step 10: Find the new property indices
Run `test-indices.jsx` (File → Scripts → Run Script File) on a layer with the effect:
1. Apply the rig to a test parent-child setup
2. Select the parent layer
3. Run the script
4. Note all indices for properties used in expressions

#### Step 11: Update main.jsx with new indices
Edit `/Users/jonas_naimark/Documents/ParentRig-CEP/host/main.jsx`:
- Update expression header indices (search for `pEff(`)
- Update `setParentChildCount` if Child count index changed
- Update `addParentEffect` if Child count index changed

---

### Quick Reference Commands

**Copy FFX to extension (do this FIRST!):**
```bash
cp "/Users/jonas_naimark/Library/CloudStorage/GoogleDrive-jonas.naimark@airbnb.com/My Drive/Scripts and Prototypes/Parent Rig/Parent Rig - Parent.ffx" "/Users/jonas_naimark/Documents/ParentRig-CEP/assets/presets/Parent Rig - Parent.ffx"
```

**Force quit After Effects:**
```bash
pkill -f "After Effects"
```

**Check if new property exists in PresetEffects.xml:**
```bash
grep "YOUR_NEW_PROPERTY" "/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml"
```

**View full effect structure:**
```bash
grep -A 50 "ParentRigParent" "/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml"
```

---

### Troubleshooting: Still Seeing Old Effect?

**Checklist (in order):**
1. ✅ Did you copy FFX to extension assets folder? (Step 2)
2. ✅ Did you run the Python script with `sudo`? (Step 5)
3. ✅ Did you verify the new property exists in PresetEffects.xml? (Step 6)
4. ✅ Did you `pkill` After Effects (not just Cmd+Q)? (Step 7)
5. ✅ Did you open a NEW project (not existing)? (Step 8)

**If all checks pass but still old effect:**
- The FFX fallback is being used. Re-do Step 2.
- Check you're running AE 2024, not 2025 or Beta

**Nuclear option - verify both files have new property:**
```bash
# Check PresetEffects.xml
grep "Leader index" "/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml"

# Check FFX exists and is recent
ls -la "/Users/jonas_naimark/Documents/ParentRig-CEP/assets/presets/Parent Rig - Parent.ffx"
```

---

### Common Mistakes
1. **Forgetting to copy FFX to extension assets** - This is the #1 cause of "old effect still showing"
2. **Not force-quitting AE** - Cmd+Q leaves processes running. Use `pkill -f "After Effects"`
3. **Opening existing project** - Always test in File → New → New Project
4. **Wrong AE version** - Verify you're updating 2024 and running 2024
5. **Using group-based property access in expressions** - `pEff("Group Name")("Property")` does NOT work. Use flat indices like `pEff(30).value`
6. **Forgetting to run test-indices.jsx** - Property indices change when you add/remove properties
7. **Using regex-based Python script** - Regex with `.*?` on large XML files hangs indefinitely. Use the line-by-line script instead

## Transform Around Pivot Features

The "Scale around" and "Rotate around" popups control the pivot point for scale/rotation transforms. Each has three modes:

| Mode | Value | Behavior |
|------|-------|----------|
| Child | 1 | Default. Children scale/rotate around their own anchor points |
| Parent | 2 | Children scale/rotate around the parent layer's rest position |
| Leader | 3 | Children scale/rotate around the current leader layer's position |

### Scale Around Parent (Mode 2)
When enabled, children scale around the parent's position instead of their own anchor point.
- Parent scales up → children move **away** from parent (positions expand outward)
- Parent scales down → children move **toward** parent (positions contract inward)
- Creates a "group scale" effect where the whole arrangement scales as a unit
- Works independently of the "Follow Scale" checkbox (which controls whether children inherit scale values)

### Rotate Around Parent (Mode 2)
When enabled, children orbit around the parent when it rotates instead of rotating in place.
- Parent rotates → children orbit around parent in a circular path
- Creates a "group rotation" effect where the whole arrangement rotates as a unit
- Works independently of the "Follow Rotation" checkbox (which controls whether children inherit rotation values)

### Scale/Rotate Around Leader (Mode 3)
When enabled, children scale/rotate around the **current leader layer** (determined by Leader Index control).
- Similar to "around Parent" but the pivot is dynamic based on Leader Index
- The leader layer itself is excluded from this transform (to avoid scaling/rotating around itself)
- Uses `findLeaderLayer()` to find the child with matching PR_Index value
- Changing Leader Index changes which layer is the pivot point

**Use cases for Leader mode:**
- **Center-out scaling**: Set Leader to middle child, all other children scale from center
- **Focus zoom**: Scale the group while one layer stays fixed as the focal point
- **Dynamic pivot**: Animate Leader Index to change which layer is the pivot over time

### Transform Order
When both are enabled, scale is applied first, then rotation (matching After Effects' standard transform order). This means:
1. Child offset from pivot is scaled by parent's scale ratio
2. The scaled offset is then rotated by parent's rotation delta

### Implementation Notes
- Uses the same time remapping (delay/stretch) as position for consistent timing
- Respects influence - at 0% influence, no transform-around-pivot effect is applied
- For split dimensions (separate X/Y/Z position), both X and Y expressions calculate the full rotation to extract their respective components
- Z axis rotation-around-pivot is not supported in split dimension mode
- Leader mode scans all layers in the comp to find the layer with matching PR_Index (performance impact only when Leader mode is active)
- Leader mode handles split dimension layers by checking for xPosition/yPosition properties

## Leader Index Feature

The Leader index feature provides an alternative to Reverse Order for controlling the cascade order of animations.

### Controls
- **Leader index** (default: 1) - Which child layer leads the animation (has 0 delay)
- **Delay before leader** (0-100%, default: 100%) - Delay multiplier for layers BEFORE the leader
- **Delay after leader** (0-100%, default: 100%) - Delay multiplier for layers AFTER the leader

### Behavior
- When **Leader index = 1**: Uses standard Reverse Order logic (backward compatible)
- When **Leader index > 1**: Uses distance-from-leader calculation:
  - The leader layer (at that index) has 0 delay
  - Layers before leader: `distance * (delayBeforeLeader / 100)`
  - Layers after leader: `distance * (delayAfterLeader / 100)`

### Example
With 5 children and Leader index = 3:
- Child 1: distance = 2, uses "before" multiplier
- Child 2: distance = 1, uses "before" multiplier
- Child 3: distance = 0, **LEADER** (no delay)
- Child 4: distance = 1, uses "after" multiplier
- Child 5: distance = 2, uses "after" multiplier

### Use Cases
- **Center-out animation**: Set Leader to the middle child, 100% before and after
- **Focus on specific layer**: Set that layer as Leader with 0 delay
- **Asymmetric cascades**: Different before/after multipliers (e.g., fast lead-in, slow follow-through)

### Notes
- Leader index ignores the Randomization feature (uses original child indices)
- All three Leader controls are animatable (can change throughout the timeline)
- Delay Falloff still applies to the calculated base index

## Pin Edges System (Boundary-Based Pinning)

The Pin Edges system provides spatial boundary-based pinning for overscroll and collision effects. Instead of pinning based on rest positions, layers are pinned when they cross defined boundary positions on the artboard.

### Why Boundary-Based?

The previous pin system (Pin First/Last) only worked correctly with keyframed parent animations. Moving the parent manually then enabling pinning caused immediate stretching. The boundary-based system is more intuitive: you define WHERE pinning happens (screen edges, UI boundaries, etc.) and the effect activates when layers reach those positions.

### Controls

#### Pin Direction (dropdown: Overscroll Stretch / Collision Squish)
How the pin effect behaves:

- **Overscroll Stretch**: Pins when a layer would go *past* the boundary (like scroll bounce). The pinned layer stays at the boundary while other layers spread apart.
- **Collision Squish**: Pins when a layer would go *into* the boundary (like hitting a wall). The pinned layer stops at the boundary while other layers compress together.

#### Pin Influence (0-100%, default: 100%)
How firmly the pinned layer stays at the boundary.

- **100%**: Pinned layer stays exactly at boundary
- **50%**: Pinned layer moves halfway past boundary
- **0%**: No pinning effect

#### Pin Trim (0-childCount, default: 0)
How many layers to exclude from the stretch/squish effect.

- **0**: All layers participate
- **N**: The N layers furthest from the pinned layer follow the parent normally

#### Edge Controls (Top, Bottom, Left, Right)
Each edge has:
- **Checkbox**: Enable/disable pinning for this edge
- **Boundary slider**: The X or Y position where pinning activates

**Defaults:**
- Top Y: 0 (top of comp)
- Bottom Y: Comp height
- Left X: 0 (left of comp)
- Right X: Comp width

### How It Works

1. **Which layer gets pinned?** Based on the edge:
   - Top/Left: First layer in list (myIndex = childCount)
   - Bottom/Right: Last layer in list (myIndex = 1)

2. **When does pinning activate?**
   - **Overscroll Stretch**: When the pinned layer's natural position would go *past* the boundary
   - **Collision Squish**: When the pinned layer's natural position would go *into* the boundary

3. **What happens when active?**
   - The pinned layer locks to the boundary position
   - Other layers stretch or squish based on distance from pinned layer
   - Layers close to pinned layer: biggest effect
   - Layers far from pinned layer: smallest effect
   - Layers beyond trim: no effect (follow parent normally)

### Example: Vertical List with Top Pin (Overscroll Stretch)

Setup: 10 layers, Top enabled, Top Y = 100

```
Parent at rest: Layer 10 (first) is at Y=100, other layers below
Parent moves DOWN: Layer 10 would go to Y=150 (below boundary)
  → Pin activates: Layer 10 stays at Y=100
  → Layers 9-1 spread apart below it

Parent moves UP: Layer 10 would go to Y=50 (above boundary)
  → Pin does NOT activate (layer free to move past boundary)
  → All layers follow parent normally
```

### Example: Horizontal Carousel with Left/Right Pins (Collision Squish)

Setup: 5 cards, Left X=50, Right X=1870, Collision Squish mode

```
Parent moves LEFT: First card hits Left boundary
  → First card pins at X=50
  → Other cards compress together behind it

Parent moves RIGHT: Last card hits Right boundary
  → Last card pins at X=1870
  → Other cards compress together in front of it
```

### Implementation

The `getPinEdgeState(t, parentRestPos)` function:
1. Calculates where each edge's pinned layer would naturally be
2. Checks if any enabled edge's condition is met (overscroll or collision)
3. Returns the offset needed to pin the layer at the boundary
4. Position expressions apply this offset with influence gradient

### Use Cases
- **Overscroll bounce**: Enable Top/Bottom with Overscroll Stretch for scroll views
- **Collision effects**: Enable edges with Collision Squish for lists that compress at boundaries
- **UI constraints**: Pin elements to screen edges
- **Carousel limits**: Prevent carousels from scrolling past first/last items

### Notes
- Only one edge can be active at a time (checked in order: Top, Bottom, Left, Right)
- All controls are keyframeable
- Boundary values default to comp size at rig time
- For grids: set same myIndex for entire rows/columns to pin them together
- Enabling conflicting edges (e.g., both Top and Bottom) may produce unexpected results

## Delay Falloff

Controls how delay changes for children further from the leader layer.

### Delay Falloff (-100 to 100, default: 0)

- **0 (default)**: No falloff - all children use equal delay spacing
- **Positive (1-100)**: Delays compress toward first layers (first layers cluster together, last layers spread apart)
- **Negative (-1 to -100)**: Delays compress toward last layers (last layers cluster together, first layers spread apart)

The higher the absolute value, the more pronounced the compression effect. Uses a geometric series formula for smooth falloff curves.

## Child Pseudo Effect

The Child pseudo effect (`Pseudo/ParentRigChild`) stores rest values for each child layer.

### Structure (24 properties)

| Index | Property Name | Visible | Default |
|-------|---------------|---------|---------|
| 1 | Index | Yes | 1 |
| 2 | Influence | Yes | 100% |
| 3 | Rest Pos X | No | 0 |
| 4 | Rest Pos Y | No | 0 |
| 5 | Rest Pos Z | No | 0 |
| 6 | Rest Scale X | No | 100% |
| 7 | Rest Scale Y | No | 100% |
| 8 | Rest Scale Z | No | 100% |
| 9 | Rest Rotation | No | 0 |
| 10 | Rest Opacity | No | 100% |
| 11 | Rest Anchor X | No | 0 |
| 12 | Rest Anchor Y | No | 0 |
| 13 | Rest Anchor Z | No | 0 |
| 14 | Parent Rest Pos X | No | 0 |
| 15 | Parent Rest Pos Y | No | 0 |
| 16 | Parent Rest Pos Z | No | 0 |
| 17 | Parent Rest Scale X | No | 100% |
| 18 | Parent Rest Scale Y | No | 100% |
| 19 | Parent Rest Scale Z | No | 100% |
| 20 | Parent Rest Rotation | No | 0 |
| 21 | Parent Rest Opacity | No | 100% |
| 22 | Parent Rest Anchor X | No | 0 |
| 23 | Parent Rest Anchor Y | No | 0 |
| 24 | Parent Rest Anchor Z | No | 0 |

### File Locations

| File | Path |
|------|------|
| PresetEffects.xml | Same as Parent effect |
| FFX (Pseudo Effect Maker) | `/Users/jonas_naimark/Library/CloudStorage/GoogleDrive-jonas.naimark@airbnb.com/My Drive/Scripts and Prototypes/Parent Rig/Parent Rig - Child.ffx` |
| FFX (extension assets) | `/Users/jonas_naimark/Documents/ParentRig-CEP/assets/presets/Parent Rig - Child.ffx` |

### Python Update Script

Save as `/tmp/update_child_effect.py`:

```python
preset_file = '/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml'

new_effect = '''  <Effect matchname="Pseudo/ParentRigChild" name="$$/AE/Preset/ParentRigChild=Parent Rig - Child">
    <Slider name="$$/AE/Preset/Index1=Index" default="1" valid_min="1" valid_max="999" slider_min="1" slider_max="10" precision="0" />
    <Slider name="$$/AE/Preset/Influence1=Influence" default="100" valid_min="0" valid_max="100" slider_min="0" slider_max="100" precision="0" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/RestPosX1=Rest Pos X" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/RestPosY1=Rest Pos Y" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/RestPosZ1=Rest Pos Z" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/RestScaleX1=Rest Scale X" INVISIBLE="true" default="100" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/RestScaleY1=Rest Scale Y" INVISIBLE="true" default="100" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/RestScaleZ1=Rest Scale Z" INVISIBLE="true" default="100" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/RestRotation1=Rest Rotation" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/RestOpacity1=Rest Opacity" INVISIBLE="true" default="100" valid_min="0" valid_max="100" slider_min="0" slider_max="100" precision="0" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/RestAnchorX1=Rest Anchor X" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/RestAnchorY1=Rest Anchor Y" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/RestAnchorZ1=Rest Anchor Z" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/ParentRestPosX1=Parent Rest Pos X" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/ParentRestPosY1=Parent Rest Pos Y" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/ParentRestPosZ1=Parent Rest Pos Z" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/ParentRestScaleX1=Parent Rest Scale X" INVISIBLE="true" default="100" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/ParentRestScaleY1=Parent Rest Scale Y" INVISIBLE="true" default="100" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/ParentRestScaleZ1=Parent Rest Scale Z" INVISIBLE="true" default="100" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/ParentRestRotation1=Parent Rest Rotation" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/ParentRestOpacity1=Parent Rest Opacity" INVISIBLE="true" default="100" valid_min="0" valid_max="100" slider_min="0" slider_max="100" precision="0" DISPLAY_PERCENT="true" />
    <Slider name="$$/AE/Preset/ParentRestAnchorX1=Parent Rest Anchor X" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/ParentRestAnchorY1=Parent Rest Anchor Y" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
    <Slider name="$$/AE/Preset/ParentRestAnchorZ1=Parent Rest Anchor Z" INVISIBLE="true" default="0" valid_min="-30000" valid_max="30000" slider_min="-30000" slider_max="10" precision="2" />
  </Effect>'''

# Line-by-line processing (regex hangs on large files!)
with open(preset_file, 'r') as f:
    lines = f.readlines()

output_lines = []
skip_until_end_effect = False

for line in lines:
    if 'matchname="Pseudo/ParentRigChild"' in line:
        skip_until_end_effect = True
        continue
    if skip_until_end_effect:
        if '</Effect>' in line:
            skip_until_end_effect = False
        continue
    output_lines.append(line)

content = ''.join(output_lines)
content = content.replace('</Effects>', new_effect + '\n</Effects>')

with open(preset_file, 'w') as f:
    f.write(content)

print("Done! Parent Rig - Child pseudo effect added to PresetEffects.xml")
```

Run with: `sudo python3 /tmp/update_child_effect.py`

### ⚠️ Empty Name Quirk

When adding a pseudo effect via `addProperty("Pseudo/ParentRigChild")`, **the effect name may be empty** even though the effect works correctly. This is an AE quirk with localization strings (`$$/AE/Preset/...`).

**Solution:** Don't validate by name. Instead:
1. Check `numProperties >= 24` (the child effect has 24 sliders)
2. Manually set the name: `eff.name = "Parent Rig - Child"`

```javascript
var eff = effects.addProperty("Pseudo/ParentRigChild");
if (eff) {
    // Don't check eff.name - it may be empty even when effect works!
    if (eff.numProperties >= 24) {
        eff.name = "Parent Rig - Child";  // Set name manually
        // ... set property values ...
    }
}
```

---

## CEP Extension Troubleshooting: Code Changes Not Loading

If you update `host/main.jsx` but After Effects keeps running the OLD code, follow this checklist.

### Symptoms
- Alert statements you added don't appear
- New behavior doesn't work despite code changes being in the file
- Sometimes the pseudo effect has "no name" in the Effects panel
- Intermittent/inconsistent behavior between AE restarts

### Root Causes (In Order of Likelihood)

#### 1. Duplicate Extension Symlinks (Most Common!)
Check for multiple symlinks pointing to the same extension:
```bash
ls -la ~/Library/Application\ Support/Adobe/CEP/extensions/ | grep -i parent
```

**If you see TWO entries** (e.g., `parentrig-dev` AND `com.parentrig.cep.dev`), remove the duplicate:
```bash
rm ~/Library/Application\ Support/Adobe/CEP/extensions/parentrig-dev
```

Only keep the one matching your manifest.xml bundle ID (`com.parentrig.cep.dev`).

#### 2. CEP Cache Not Cleared
Clear ALL CEP caches:
```bash
rm -rf ~/Library/Caches/CSXS/
rm -rf ~/Library/Caches/com.adobe.*
```

**Important:** The CSXS cache includes version-specific folders like:
`~/Library/Caches/CSXS/cep_cache/AEFT_24.6.6_com.parentrig.cep.dev.panel`

These are NOT cleared by clearing general Adobe caches.

#### 3. After Effects Not Fully Quit
Cmd+Q doesn't always kill all AE processes:
```bash
pkill -f "After Effects"
```

Verify it's fully closed:
```bash
ps aux | grep -i "After Effects" | grep -v grep
```
Should show NO output.

### Quick Fix Script
Run this to fix all common issues at once:
```bash
# Remove duplicate symlinks (adjust name if different)
rm -f ~/Library/Application\ Support/Adobe/CEP/extensions/parentrig-dev

# Clear ALL caches
rm -rf ~/Library/Caches/CSXS/
rm -rf ~/Library/Caches/com.adobe.* 2>/dev/null

# Force quit AE
pkill -f "After Effects"

echo "Done! Now reopen After Effects."
```

### Verifying Your Code is Loaded

**Step 1:** Add a test alert at the VERY START of `applyParentRig()`:
```javascript
function applyParentRig() {
    alert("CODE VERSION: 2024-12-31-V1");  // Change version each time!
    // ... rest of function
}
```

**Step 2:** Run this script to clear everything:
```bash
rm -rf ~/Library/Caches/CSXS/
pkill -f "After Effects"
```

**Step 3:** Verify before reopening AE:
```bash
# Should show only ONE symlink
ls -la ~/Library/Application\ Support/Adobe/CEP/extensions/ | grep -i parent

# Should show "Cache cleared" (folder doesn't exist)
ls ~/Library/Caches/CSXS/ 2>/dev/null || echo "Cache cleared ✓"

# Should show no processes
ps aux | grep -i "After Effects" | grep -v grep || echo "AE quit ✓"
```

**Step 4:** Reopen AE and click "Apply Parent Rig". You MUST see the alert with your version string.

**If no alert appears:** The symlink might be broken or there's a duplicate. Re-check step 3.

### Debug Checklist
1. ✅ Only ONE symlink in CEP extensions folder? (check for duplicates like `parentrig-dev`)
2. ✅ Symlink points to correct folder? (`ls -la` shows target path)
3. ✅ `~/Library/Caches/CSXS/` deleted? (will be recreated by AE, that's OK)
4. ✅ AE fully quit (used `pkill -f "After Effects"`, not just Cmd+Q)?
5. ✅ Test alert appears with YOUR version string when clicking button?
6. ✅ Change the version string EACH TIME you test (e.g., V1 → V2 → V3)

### Why This Extension Has More Issues Than Others

The Parent Rig extension:
- Uses a **symlinked** development setup (more cache-prone)
- Has a **pseudo effect** that depends on PresetEffects.xml sync
- Stores **expressions as strings** in JSX (no ES6 module reloading)

Other extensions that use compiled bundles or don't rely on pseudo effects may reload more reliably.

### Pseudo Effect "No Name" After Undo/Redo

**Symptom:** Apply rig → works. Undo → Apply rig again → pseudo effect has no name in Effects panel, rig doesn't work.

**Cause:** AE's internal pseudo effect cache gets corrupted after undo/redo. `addProperty("Pseudo/ParentRigParent")` returns an effect object, but it's broken (no name, missing properties).

**Fix (implemented Dec 2024):** Added verification in `addParentEffect()`:
```javascript
if (eff.name && eff.name !== "" && eff.numProperties >= 40) {
    // Effect loaded properly
} else {
    // Broken effect - remove and fall back to FFX
    eff.remove();
    pseudoEffectApplied = false;
}
```

If this issue returns, ensure the FFX file in `/assets/presets/` is up to date with the current effect structure.
