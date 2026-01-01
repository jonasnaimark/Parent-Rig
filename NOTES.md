# Parent Rig CEP Extension - Development Notes

## Pseudo Effect Index Mapping

**Important:** When using Pseudo Effect Maker with empty label groups, each label creates TWO entries:
1. The label itself
2. An "endLabel" entry

Both take up indices in the property list. This affects how you reference properties by index in expressions.

### Parent Rig - Parent Effect Structure (UPDATED Dec 2024 - with Pin System)

**CRITICAL:** Nested group properties use FLAT indexing in expressions. You CANNOT access them via `pEff("Group Name")("Property")` - this causes "can't use this param type" error. You MUST use numeric indices.

| Index | Type | Property Name |
|-------|------|---------------|
| 1 | label | "Delay:" |
| 2 | endLabel | (auto) |
| **3** | slider | **Delay - Step** |
| **4** | slider | **Delay - Stretch** |
| **5** | slider | **Falloff** (Delay) |
| 6 | label | "" (empty separator) |
| 7 | endLabel | (auto) |
| 8 | label | " Influence:" |
| 9 | endLabel | (auto) |
| **10** | slider | **Influence on children** |
| **11** | popup | **Pin layer** (1=None, 2=First, 3=Last) |
| **12** | slider | **Pin influence** (0-100%, default 100%) |
| **13** | slider | **Pin trim** (0-100, default 0) |
| 14 | label | "" (empty separator) |
| 15 | endLabel | (auto) |
| 16 | label | "Order:" |
| 17 | endLabel | (auto) |
| **18** | slider | **Reverse order** |
| **19** | checkbox | **Random order** |
| **20** | slider | **Random seed** |
| 21 | label | "" (empty separator) |
| 22 | endLabel | (auto) |
| 23 | label | "Leader layer:" |
| 24 | endLabel | (auto) |
| **25** | slider | **Leader index** |
| **26** | slider | **Delay before leader** |
| **27** | slider | **Delay after leader** |
| 28 | label | "" (empty separator) |
| 29 | endLabel | (auto) |
| 30 | label | " Transform type:" |
| 31 | endLabel | (auto) |
| **32** | popup | **Scale around** (1=Child, 2=Parent, 3=Leader) |
| **33** | popup | **Rotate around** (1=Child, 2=Parent, 3=Leader) |
| 34 | label | "" (empty separator) |
| 35 | endLabel | (auto) |
| 36 | group header | "Children follow:" |
| **37** | checkbox | **Position** (in Children follow) |
| **38** | checkbox | **Scale** (in Children follow) |
| **39** | checkbox | **Rotation** (in Children follow) |
| **40** | checkbox | **Opacity** (in Children follow) |
| **41** | checkbox | **Anchor point** (in Children follow) |
| 42 | label | "" (empty separator inside group) |
| 43 | endLabel | (auto) |
| 44 | endGroup | (auto) |
| 45 | group header | "Delays apply to:" |
| **46** | checkbox | **Position** (in Delays apply to) |
| **47** | checkbox | **Scale** (in Delays apply to) |
| **48** | checkbox | **Rotation** (in Delays apply to) |
| **49** | checkbox | **Opacity** (in Delays apply to) |
| **50** | checkbox | **Anchor point** (in Delays apply to) |
| 51 | endGroup | (auto) |
| **52** | slider | **Child count** (hidden)

### Expression Access Pattern (FLAT INDICES ONLY)

**WARNING:** Do NOT use `pEff("Group Name")("Property")` syntax - it causes runtime errors.
Always use flat numeric indices for ALL properties, including those inside groups.

```javascript
// In expressions, access pseudo effect properties:
var pEff = parentLayer.effect("Parent Rig - Parent");

// Delay section (indices 3-5)
var delayProp = pEff(3);              // Delay - Step
var stretchProp = pEff(4);            // Delay - Stretch
var delayFalloffProp = pEff(5);       // Falloff (Delay)

// Influence section (indices 10-13)
var parentInfluenceProp = pEff(10);   // Influence on children
var pinModeProp = pEff(11);           // Pin layer (1=None, 2=First, 3=Last)
var pinInfluenceProp = pEff(12);      // Pin influence (0-100%)
var pinTrimProp = pEff(13);           // Pin trim (0-childCount)

// Order section (indices 18-20)
var reverseOrderProp = pEff(18);    // Reverse order
var randomEnabled = pEff(19).value; // Random order checkbox
var randomSeed = pEff(20).value;    // Random seed

// Leader layer section (indices 25-27)
var leaderIndexProp = pEff(25);          // Leader index
var delayBeforeLeaderProp = pEff(26);    // Delay before leader
var delayAfterLeaderProp = pEff(27);     // Delay after leader

// Transform type popups (indices 32-33): 1=Child, 2=Parent, 3=Leader
var scaleAroundMode = pEff(32).value;   // 1=Child, 2=Parent, 3=Leader
var rotateAroundMode = pEff(33).value;  // 1=Child, 2=Parent, 3=Leader

// Children follow (indices 37-41) - FLAT INDICES, NOT GROUP ACCESS
var followPosition = pEff(37).value;
var followScale = pEff(38).value;
var followRotation = pEff(39).value;
var followOpacity = pEff(40).value;
var followAnchorPoint = pEff(41).value;

// Delays apply to (indices 46-50) - FLAT INDICES, NOT GROUP ACCESS
var delayPosition = pEff(46).value;
var delayScale = pEff(47).value;
var delayRotation = pEff(48).value;
var delayOpacity = pEff(49).value;
var delayAnchorPoint = pEff(50).value;

// Child count (index 52)
var childCount = pEff(52).value;
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

## Pin System (Overscroll Stretch)

The Pin system provides intuitive control for overscroll stretch effects, where one end of a list stays pinned while the rest stretches.

### Controls

#### Pin layer (dropdown: None / First / Last, default: None)
Which end of the child list to pin in place.

- **None**: No pinning, all children follow parent equally
- **First**: Pin child at index 1 (first in stack order)
- **Last**: Pin child at highest index (last in stack order)

#### Pin influence (0-100%, default: 100%)
How firmly the pinned layer stays in place.

- **100%**: Pinned layer stays completely in place (0% influence)
- **50%**: Pinned layer moves halfway
- **0%**: No pinning effect (same as Pin layer = None)

#### Pin trim (0-childCount, default: 0)
How many layers to exclude from the stretch effect, counted from the **non-pinned end**.

- **0**: All layers participate in the stretch gradient
- **N**: Remove N layers from the far end - they follow parent at 100% influence

### How Stretch Distribution Works

The Pin system creates a **linear gradient** of influence from the pinned layer to the trim point:

- **Pinned layer**: Stays in place (0% influence when fully pinned)
- **Layer next to pinned**: MOST stretch (low influence, biggest gap)
- **Layers further from pinned**: Less stretch (increasing influence)
- **Layer at trim point**: Minimal stretch (nearly full influence)
- **Layers beyond trim**: Full influence (100%, follow parent normally)

**Key insight:** Layers CLOSE to the pinned layer have the BIGGEST gaps (most stretch). Layers FAR from the pinned layer have smaller gaps (less stretch).

### Example: 20 layers, Pin = Last, Trim = 5

```
Layer 20 (pinned): stays in place (0% influence)
Layer 19: MOST stretch (low influence, big gap from 20)
Layer 18: less stretch
...
Layer 6 (trim point): minimal stretch (high influence)
Layers 5-1: follow normally (100% influence, beyond trim)
```

When parent moves up → Layer 20 stays put → Layer 19 lags most (big gap) → gaps decrease toward layer 6 → Layers 1-5 follow parent fully.

### Example: Pin = First, Pin influence = 50%, Trim = 0

```
Layer 1 (pinned at 50%): moves halfway
Layer 2: MOST stretch (big gap from layer 1)
...
Layer 20: minimal stretch (follows almost fully)
```

### Implementation Formula

```javascript
function getPinInfluenceMultiplier(t) {
    var pinMode = pinModeProp.value;  // 1=None, 2=First, 3=Last
    if (pinMode === 1) return 1;  // No pinning

    var pinStrength = pinInfluenceProp.valueAtTime(t) / 100;
    var trim = Math.round(pinTrimProp.valueAtTime(t));

    var pinnedIdx = (pinMode === 2) ? 1 : childCount;
    var trimEndIdx = (pinMode === 2) ? childCount - trim : 1 + trim;

    // Beyond trim point = full influence
    if (pinMode === 2 && myIndex > trimEndIdx) return 1;
    if (pinMode === 3 && myIndex < trimEndIdx) return 1;

    // Pinned layer = low influence (stays in place)
    if (myIndex === pinnedIdx) return 1 - pinStrength;

    // Square root curve: biggest gap at pinned, smaller gaps toward trim
    var distFromPinned = Math.abs(myIndex - pinnedIdx);
    var maxDist = Math.abs(trimEndIdx - pinnedIdx);
    var normalizedDist = distFromPinned / Math.max(maxDist, 1);
    var influence = Math.sqrt(normalizedDist);

    return 1 - (1 - influence) * pinStrength;
}
```

### Use Cases
- **Overscroll stretch**: Pin the top/bottom of a list, rest stretches when scrolled past bounds
- **Elastic scroll indicators**: Visual feedback for scroll limits
- **Bouncy list animations**: Pin one end, animate parent position with overshoot
- **Accordion effects**: Pin header, body stretches/compresses

### Notes
- All Pin controls are keyframeable
- Pin system replaces the old Influence Falloff/Curve system
- Trim is useful for long lists where you only want some layers to stretch
- Uses square root curve for natural overscroll feel: biggest gap at pinned layer, progressively smaller gaps toward trim point

## Delay Falloff

Controls how delay changes for children further from the leader layer.

### Delay Falloff (0-200%, default: 100%)

- **100% (default)**: No change - all children use the same delay calculation
- **>100%**: Children further from leader get MORE delay (exponential increase)
- **<100%**: Children further from leader get LESS delay (exponential decrease)

Uses a geometric series formula for smooth falloff curves.

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

---

## Pin Edges System (Planned Feature)

### Problem with Current Pin System

The current pin system (Pin First/Last) has a limitation: it only works correctly when the parent is animated with keyframes. If you manually move the parent and then enable pinning, the list immediately stretches based on the delta from rest position. This is unintuitive - users expect to enable pinning and then animate to create the stretch effect.

### New Design: Boundary-Based Pinning

Instead of pinning relative to rest position, pin layers to **spatial boundaries** on the artboard. The pinned layer anchors to the boundary position, and other layers stretch/squish relative to it.

### How It Works

1. Enable a pin edge (Top, Bottom, Left, or Right) and set its boundary position
2. The first or last layer (by index) becomes the "pinned" layer for that edge:
   - Top/Left: `myIndex = childCount` (first in list)
   - Bottom/Right: `myIndex = 1` (last in list)
3. The pinned layer locks to that boundary position
4. Other layers stretch or squish relative to the pinned layer, with a gradient based on distance
5. Pin Influence controls how strong the effect is
6. Pin Trim excludes N layers from the stretch/squish effect

### Pin Direction Modes

**Overscroll Stretch (default):**
- Pin activates when layer would go *past* boundary (like scroll bounce)
- Example: Top pin enabled, parent moves down → top layer stays pinned at Top Y boundary, layers below spread apart
- Parent moves up → top layer is FREE to move up past the boundary, no pinning
- Use case: Scroll view overscroll bounce effect

**Collision Squish:**
- Pin activates when layer moves *into* boundary (like hitting a wall)
- Example: Top pin enabled, parent moves up → top layer hits Top Y and pins there, layers below compress together
- Parent moves down → top layer is FREE to move down, no pinning
- Use case: List compressing against a boundary

### New Controls Table

| Control | Type | Default | Range/Options | Notes |
|---------|------|---------|---------------|-------|
| Pin Direction | Dropdown | 1 | 1=Overscroll Stretch, 2=Collision Squish | Global mode for all edges |
| Top | Checkbox | Off | On/Off | Enable top edge pinning |
| Top Y | Slider | 0 | -10000 to 10000 | Y position of top boundary |
| Bottom | Checkbox | Off | On/Off | Enable bottom edge pinning |
| Bottom Y | Slider | 1080 | -10000 to 10000 | Y position of bottom boundary |
| Left | Checkbox | Off | On/Off | Enable left edge pinning |
| Left X | Slider | 0 | -10000 to 10000 | X position of left boundary |
| Right | Checkbox | Off | On/Off | Enable right edge pinning |
| Right X | Slider | 1920 | -10000 to 10000 | X position of right boundary |
| Pin Influence | Slider | 100 | 0 to 100 | Strength of pin effect (existing) |
| Pin Trim | Slider | 0 | 0 to 100 | Layers excluded from effect (existing) |

**Note:** These 9 new controls (1 dropdown + 4 checkboxes + 4 sliders) replace the existing "Pin layer" dropdown. Pin Influence and Pin Trim are retained.

### Behavior Summary

| Mode | Edge | Movement | Result |
|------|------|----------|--------|
| Overscroll Stretch | Top | Parent down (top layer would pass Top Y going up) | Top layer pins at Top Y, layers below stretch apart |
| Overscroll Stretch | Bottom | Parent up (bottom layer would pass Bottom Y going down) | Bottom layer pins at Bottom Y, layers above stretch apart |
| Collision Squish | Top | Parent up (top layer hits Top Y) | Top layer pins at Top Y, layers squish together |
| Collision Squish | Bottom | Parent down (bottom layer hits Bottom Y) | Bottom layer pins at Bottom Y, layers squish together |

Same logic applies to Left/Right edges using X positions.

### Grid Support

For grids where you want entire rows/columns to pin together:
- Manually set the same `myIndex` for all layers in a row (for Top/Bottom pinning)
- Manually set the same `myIndex` for all layers in a column (for Left/Right pinning)
- When the first/last index crosses the boundary, all layers with that index pin together

### Edge Cases

Enabling conflicting setups (e.g., vertical list with Left pin, or both Top AND Bottom simultaneously) may produce weird results. These are power-user scenarios - the system won't prevent them, but they may not look sensible. The common cases (vertical list with Top/Bottom, horizontal carousel with Left/Right) work intuitively.

### UI Organization

Controls should be in a collapsible "Pin Edges" group, collapsed by default since this is an advanced feature:

```
▶ Pin Edges
  Pin Direction: [Overscroll Stretch ▼]
  ☐ Top        [Top Y: 0      ]
  ☐ Bottom     [Bottom Y: 1080]
  ☐ Left       [Left X: 0     ]
  ☐ Right      [Right X: 1920 ]
  Pin Influence: [100%]
  Pin Trim: [0]
```
