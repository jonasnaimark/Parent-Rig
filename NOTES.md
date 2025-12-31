# Parent Rig CEP Extension - Development Notes

## Pseudo Effect Index Mapping

**Important:** When using Pseudo Effect Maker with empty label groups, each label creates TWO entries:
1. The label itself
2. An "endLabel" entry

Both take up indices in the property list. This affects how you reference properties by index in expressions.

### Parent Rig - Parent Effect Structure (VERIFIED Dec 2024)

**CRITICAL:** Nested group properties use FLAT indexing in expressions. You CANNOT access them via `pEff("Group Name")("Property")` - this causes "can't use this param type" error. You MUST use numeric indices.

| Index | Type | Property Name |
|-------|------|---------------|
| 1 | label | "Delay:" |
| 2 | endLabel | (auto-generated) |
| **3** | slider | **Delay - Step** |
| **4** | slider | **Delay - Stretch** |
| **5** | slider | **Falloff** |
| **6** | slider | **Influence on children** |
| 7 | label | "" (empty separator) |
| 8 | endLabel | (auto-generated) |
| 9 | label | "Order:" |
| 10 | endLabel | (auto-generated) |
| **11** | slider | **Reverse order** |
| **12** | checkbox | **Random order** |
| **13** | slider | **Random seed** |
| 14 | label | "" (empty separator) |
| 15 | endLabel | (auto-generated) |
| 16 | label | "Leader layer:" |
| 17 | endLabel | (auto-generated) |
| **18** | slider | **Leader index** |
| **19** | slider | **Delay before leader** |
| **20** | slider | **Delay after leader** |
| 21 | label | "" (empty separator) |
| 22 | endLabel | (auto-generated) |
| 23 | label | "Transform type:" |
| 24 | endLabel | (auto-generated) |
| **25** | popup | **Scale around** (1=Child, 2=Parent, 3=Leader) |
| **26** | popup | **Rotate around** (1=Child, 2=Parent, 3=Leader) |
| 27 | label | "" (empty separator) |
| 28 | endLabel | (auto-generated) |
| 29 | group header | "Children follow:" |
| **30** | checkbox | **Position** (in Children follow) |
| **31** | checkbox | **Scale** (in Children follow) |
| **32** | checkbox | **Rotation** (in Children follow) |
| **33** | checkbox | **Opacity** (in Children follow) |
| **34** | checkbox | **Anchor point** (in Children follow) |
| 35 | label | "" (empty separator inside group) |
| 36 | endLabel | (auto-generated) |
| 37 | endGroup | (auto-generated) |
| 38 | group header | "Delays apply to:" |
| **39** | checkbox | **Position** (in Delays apply to) |
| **40** | checkbox | **Scale** (in Delays apply to) |
| **41** | checkbox | **Rotation** (in Delays apply to) |
| **42** | checkbox | **Opacity** (in Delays apply to) |
| **43** | checkbox | **Anchor point** (in Delays apply to) |
| 44 | endGroup | (auto-generated) |
| **45** | slider | **Child count** (hidden)

### Expression Access Pattern (FLAT INDICES ONLY)

**WARNING:** Do NOT use `pEff("Group Name")("Property")` syntax - it causes runtime errors.
Always use flat numeric indices for ALL properties, including those inside groups.

```javascript
// In expressions, access pseudo effect properties:
var pEff = parentLayer.effect("Parent Rig - Parent");

// Delay section (indices 3-6)
var delayProp = pEff(3);        // Delay - Step
var stretchProp = pEff(4);      // Delay - Stretch
var falloffProp = pEff(5);      // Falloff
var parentInfluenceProp = pEff(6);  // Influence on children

// Order section (indices 11-13)
var reverseOrderProp = pEff(11);    // Reverse order
var randomEnabled = pEff(12).value; // Random order checkbox
var randomSeed = pEff(13).value;    // Random seed

// Leader layer section (indices 18-20)
var leaderIndexProp = pEff(18);          // Leader index
var delayBeforeLeaderProp = pEff(19);    // Delay before leader
var delayAfterLeaderProp = pEff(20);     // Delay after leader

// Transform type popups (indices 25-26): 1=Child, 2=Parent, 3=Leader
var scaleAroundMode = pEff(25).value;   // 1=Child, 2=Parent, 3=Leader
var rotateAroundMode = pEff(26).value;  // 1=Child, 2=Parent, 3=Leader

// Children follow (indices 30-34) - FLAT INDICES, NOT GROUP ACCESS
var followPosition = pEff(30).value;
var followScale = pEff(31).value;
var followRotation = pEff(32).value;
var followOpacity = pEff(33).value;
var followAnchorPoint = pEff(34).value;

// Delays apply to (indices 39-43) - FLAT INDICES, NOT GROUP ACCESS
var delayPosition = pEff(39).value;
var delayScale = pEff(40).value;
var delayRotation = pEff(41).value;
var delayOpacity = pEff(42).value;
var delayAnchorPoint = pEff(43).value;

// Child count (index 45)
var childCount = pEff(45).value;
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
- Falloff still applies to the calculated base index

## Child Pseudo Effect (TODO)

When creating the Child pseudo effect, remember:
- Each label group adds an endLabel that takes an index
- Count all labels and endLabels to determine correct property indices
- The Child effect will need: Index, Influence, Parent Layer reference, and all the Rest/Parent Rest values for each transform property

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
