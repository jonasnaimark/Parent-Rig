# Parent Rig Performance Optimization - Simple Checkbox Approach

## Problem
Render times increased from ~2 minutes to 3m15s due to expensive layer lookups in expressions.

### Root Cause
The expression does 21 `thisComp.layer()` lookups per frame:
- 5 lookups for affectors ("Parent Rig Affector 1-4" + legacy)
- 5 lookups for targets ("Parent Rig Target 1-4" + legacy)
- These happen on EVERY frame even when no affectors/targets exist

## Solution: Checkbox-Controlled Code Generation

### The Simple Approach
Add two checkboxes to control whether affector/target code is included in expressions:
- When **unchecked** (default): Don't generate affector/target code at all → 0 layer lookups
- When **checked**: Generate full affector/target code → dynamic support

**Key insight**: Don't use "stub functions" - just skip generating that code entirely when not needed.

## UI Changes

### Add Checkboxes (client/index.html)
```html
<div class="options-section">
    <div class="options-header">Children follow:</div>
    <div class="checkbox-group">
        <label><input type="checkbox" id="prPosition" checked> Position</label>
        <label><input type="checkbox" id="prScale" checked> Scale</label>
        <label><input type="checkbox" id="prRotation" checked> Rotation</label>
        <label><input type="checkbox" id="prOpacity"> Opacity</label>
        <label><input type="checkbox" id="prAnchor"> Anchor point</label>
    </div>
</div>

<div class="options-section">
    <div class="options-header">Dynamic support (slower):</div>
    <div class="checkbox-group">
        <label><input type="checkbox" id="prIncludeAffector"> Affector system</label>
        <label><input type="checkbox" id="prIncludeTarget"> Target system</label>
    </div>
</div>

<button id="applyRig" class="main-button">Apply Parent Rig</button>
```

### Update JavaScript (client/script.js)
```javascript
function getFollowOptions() {
    return {
        position: document.getElementById('prPosition').checked,
        scale: document.getElementById('prScale').checked,
        rotation: document.getElementById('prRotation').checked,
        opacity: document.getElementById('prOpacity').checked,
        anchor: document.getElementById('prAnchor').checked,
        includeAffector: document.getElementById('prIncludeAffector').checked,
        includeTarget: document.getElementById('prIncludeTarget').checked
    };
}
```

## Core Logic Changes (host/main.jsx)

### 1. Update `applyExpressions()` to use checkbox values
```javascript
function applyExpressions(child, parent, comp, is3D, splitDims, groupBounds, existingRestPos, followOptions) {
    // Get checkbox state from followOptions
    var includeAffector = followOptions.includeAffector || false;
    var includeTarget = followOptions.includeTarget || false;

    // ... build header ...

    // Conditionally generate affector code
    if (includeAffector) {
        header = header.concat([
            '// ===== AFFECTOR SYSTEM =====',
            // ... full affector code with layer lookups
        ]);
    }

    // Conditionally generate target code
    if (includeTarget) {
        header = header.concat([
            '// ===== TARGET SYSTEM =====',
            // ... full target code with layer lookups
        ]);
    }

    // ... position expression generation ...
}
```

### 2. Update Position Expression to Skip Function Calls

The position expression has these affector/target calls:
```javascript
// Apply Affector effects (spread and position offset)
var affectorSpread = getAffectorSpread(parentedPos, restPos);
var affectorPosOffset = getAffectorPositionOffset(parentedPos);
parentedPos = [parentedPos[0] + affectorSpread[0] + affectorPosOffset[0],
               parentedPos[1] + affectorSpread[1] + affectorPosOffset[1]];

// Apply Target repel offset
var targetRepel = getTargetRepelOffset(parentedPos);
parentedPos = [parentedPos[0] + targetRepel[0], parentedPos[1] + targetRepel[1]];
```

**Solution**: Only generate these lines when the checkbox is checked:

```javascript
var posExpr = header + timeRemapFunc + [
    // ... position calculation code ...

    // Pin edges
    'var pinState = getPinEdgeState(time, parentRestPos);',
    'if (pinState.active) {',
    '    parentedPos = [parentedPos[0] + pinState.offsetX, parentedPos[1] + pinState.offsetY];',
    '}',
    ''
].join('\n');

// Conditionally add affector code
if (includeAffector) {
    posExpr += [
        '// Apply Affector effects',
        'var affectorSpread = getAffectorSpread(parentedPos, restPos);',
        'var affectorPosOffset = getAffectorPositionOffset(parentedPos);',
        'parentedPos = [parentedPos[0] + affectorSpread[0] + affectorPosOffset[0], parentedPos[1] + affectorSpread[1] + affectorPosOffset[1]];',
        ''
    ].join('\n');
}

// Conditionally add target code
if (includeTarget) {
    posExpr += [
        '// Apply Target repel offset',
        'var targetRepel = getTargetRepelOffset(parentedPos);',
        'parentedPos = [parentedPos[0] + targetRepel[0], parentedPos[1] + targetRepel[1]];',
        ''
    ].join('\n');
}

posExpr += [
    'var childAnimPos = value;',
    'var childDelta = sub(childAnimPos, restPos);',
    'add(parentedPos, childDelta);'
].join('\n');
```

### 3. Similar Changes for Scale/Rotation/Opacity

These also call affector functions - conditionally generate:
```javascript
// Scale
if (includeAffector) {
    scaleExpr += 'scaledScale = mul(scaledScale, getAffectorScaleMult(parentedPos) / 100);\n';
}

// Rotation
if (includeAffector) {
    rotExpr += 'var affectorRotBoost = getAffectorRotationBoost(parentedPos);\n';
    rotExpr += 'parentedRotation += affectorRotBoost;\n';
}

// Opacity
if (includeAffector) {
    opacityExpr += 'parentedOpacity *= getAffectorOpacityMult(parentedPos) / 100;\n';
}
```

## Why This is Simpler

**Old approach (what we were trying):**
1. Generate full expression with stub functions that return defaults
2. Problem: After Effects expression engine validates code and chokes on stubs

**New approach:**
1. Don't generate affector/target code at all when checkboxes are OFF
2. Don't call those functions in position/scale/rotation expressions
3. Clean expressions with zero layer lookups

## Performance Impact

- **Checkboxes OFF** (default): 0 affector/target lookups → ~2 minute render ✅
- **Affector ON**: +5 lookups → slightly slower but flexible
- **Target ON**: +5 lookups → slightly slower but flexible
- **Both ON**: +10 lookups → comparable to old version but now optional

## Implementation Steps

1. ✅ Add checkboxes to HTML
2. ✅ Update `getFollowOptions()` in script.js
3. ⏳ Update `applyExpressions()` to read `includeAffector` and `includeTarget`
4. ⏳ Conditionally generate affector system code block
5. ⏳ Conditionally generate target system code block
6. ⏳ Conditionally generate affector function calls in position expression
7. ⏳ Conditionally generate target function calls in position expression
8. ⏳ Conditionally generate affector calls in scale/rotation/opacity expressions
9. ⏳ Test with checkboxes OFF → verify no errors and fast render
10. ⏳ Test with checkboxes ON → verify affectors/targets work

## Testing Checklist

### With Checkboxes OFF (Default)
- [ ] Position expression applies without errors
- [ ] Scale expression applies without errors
- [ ] Rotation expression applies without errors
- [ ] Opacity expression applies without errors
- [ ] No affector/target code in generated expressions
- [ ] Render time is ~2 minutes (baseline performance)

### With Affector Checkbox ON
- [ ] Affector system code included in expressions
- [ ] Affector function calls included in position/scale/rotation
- [ ] Can add affector layers and they work
- [ ] Render slightly slower but acceptable

### With Target Checkbox ON
- [ ] Target system code included in expressions
- [ ] Target function calls included in position/rotation
- [ ] Can add target layers and they work
- [ ] Render slightly slower but acceptable

## Notes

- Remove the old "Apply with Affector & Target" button - it's now just one button with checkboxes
- Default checkboxes to OFF for best performance out of the box
- Users who need affectors/targets can check the boxes (power user feature)
- Much simpler than trying to make stub functions work with AE's expression engine
