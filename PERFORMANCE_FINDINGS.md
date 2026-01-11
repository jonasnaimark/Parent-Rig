# Performance Investigation Findings

**NOTE**: The tests below identify performance bottlenecks but the "disabled" tests BREAK features.
Real optimizations would require conditionally excluding code sections at rig-time based on which features are actually used.

## Test Setup
- 12 children
- 3 second comp
- Position, Scale, Rotation followed
- Delay stretch: 10

## Baseline Measurements
| Configuration | Render Time |
|--------------|-------------|
| Native AE parenting | 2 seconds |
| Base rig (no affectors/targets) | 15 seconds |
| With affector system enabled + affector layer | 21 seconds |

## Test Results

### Test 1: Disable Affector/Target Layer Lookups
- Changed: Commented out `thisComp.layer("Parent Rig Affector X")` lookups
- Result: 21s → 18s (14% improvement)
- Conclusion: Layer name lookups contribute ~3s overhead

### Test 2: Disable All Affector Code Blocks
- Changed: Commented out all affector position calculations in scale/rotation/opacity expressions
- Result: 18s → 19s (no additional improvement)
- Conclusion: The expensive position calculations for affectors weren't running anyway since affectors array was empty

### Test 3: Disable Segments (buildChildSegs)
- Changed: Made `getRemapInfo()` return early with simple `time - delay` mode
- Result: Still 15s (no improvement)
- Conclusion: Segment parsing was NOT the bottleneck in base rig

### Unchecking Affector/Target Systems in UI
- Result: 21s → 15s (28% faster, 6 seconds saved)
- Conclusion: Just having affector function definitions in expression adds ~6s overhead

## Key Findings

### 1. Expression Size is the Problem
The generated expression is hundreds of lines. Even with all logic disabled, AE must parse and compile this expression for every child on every frame. Native parenting is a simple property read.

### 2. Affector/Target Overhead (6 seconds)
Just including the affector/target system code (function definitions) adds 6 seconds, even if no affectors exist. The ~350 lines of affector helper functions like `calcInfluenceFor`, `getAffectorSpread`, etc. are expensive to parse.

### 3. Layer Name Lookups (~3 seconds)
Searching for layers by name (`thisComp.layer("Parent Rig Affector 1")`) is slow. With 4 potential affectors × 12 children = 48 layer searches per frame.

### 4. Segments NOT the Main Culprit
`buildChildSegs()` iterating through keyframes was suspected but disabling it showed no improvement. The fast-path code in `getAccumulatedArrayDelta()` was already skipping it.

### Test 4: Disable Pin Edges Function
- Changed: Made `getPinEdgeState()` return immediately without any calculations
- Result: 21s → 18s (14% improvement, 3 seconds saved)
- Conclusion: Pin edges function was adding overhead even when no pins enabled

### Test 5: Disable Scale/Rotate Around Pivot
- Changed: Made pivot transform block skip entirely with `if (false && ...)`
- Result: 15s → 13-14s (13% improvement, ~2 seconds saved)
- Conclusion: Even in default Child mode, the condition check and variable setup adds overhead
- Note: ~1-2 second variability observed between test runs

### Test 6: Disable Order By System
- Changed: Commented out order by logic, hardcoded `baseIndex = myIndex`
- Result: 13s → 16s (SLOWER by 3 seconds!)
- Conclusion: Commenting out code added parsing overhead. Order by in default mode=1 is already fast since it just uses myIndex
- Reverted this change

## Features Still To Test
- **Leader Layer system**: Searching for leader layer by index

## Potential Optimizations

### High Impact (Recommended)
1. **Lazy-load affector/target code** - Only include function definitions if actually used
2. **Store layer indices instead of names** - Use layer index numbers for faster lookups
3. **Simplify Pin Edges** - Check pin enabled flags earlier, skip all calculations if disabled
4. **Create "lite" mode** - Minimal expression for basic delay-only use cases

### Medium Impact
1. **Cache layer references** - Store found layers in variables instead of searching each frame
2. **Reduce valueAtTime calls** - Batch property reads where possible
3. **Simplify Order By** - Pre-compute position-based indices at rig time, not runtime

### Lower Impact
1. **Marker-based segments** - Replace keyframe parsing with manual markers (helps when segments are needed)
2. **Bitmask for affector slots** - Already implemented, minor improvement

## Next Steps
1. Test with Pin Edges system disabled
2. Test with Scale/Rotate Around Pivot disabled
3. Consider creating a "lite" expression mode for simple use cases
4. Explore ways to conditionally include code sections
