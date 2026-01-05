/*
 * Parent Rig v0.1 - CEP Extension Host Script
 * Expression-based parenting with delay, stretch, and influence controls
 */

// ============================================
// CONFIGURATION
// ============================================

var EFFECT_NAME_PARENT = "Parent Rig";
var EFFECT_NAME_CHILD = "Parent Rig - Child";

// Extension root path (set by panel)
var extensionRoot = "";

// ============================================
// MAIN LOGIC
// ============================================

// Helper to parse follow options from JSON
function parseFollowOptions(optionsJSON) {
    var followOptions = {
        position: true,
        scale: true,
        rotation: true,
        opacity: true,
        anchor: true
    };
    if (optionsJSON) {
        try {
            var parsed = JSON.parse(optionsJSON);
            if (typeof parsed.position === 'boolean') followOptions.position = parsed.position;
            if (typeof parsed.scale === 'boolean') followOptions.scale = parsed.scale;
            if (typeof parsed.rotation === 'boolean') followOptions.rotation = parsed.rotation;
            if (typeof parsed.opacity === 'boolean') followOptions.opacity = parsed.opacity;
            if (typeof parsed.anchor === 'boolean') followOptions.anchor = parsed.anchor;
        } catch (e) {}
    }
    return followOptions;
}

function applyParentRig(optionsJSON) {
    var followOptions = parseFollowOptions(optionsJSON);

    // Debug: Check if extensionRoot is set
    if (typeof extensionRoot === "undefined" || extensionRoot === "") {
        extensionRoot = "";  // Ensure it's at least an empty string
    }

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return "error";
    }

    if (comp.selectedLayers.length === 0) {
        alert("Please select layers with a parent-child relationship.");
        return "error";
    }

    var result = "error";
    var selectedLayers = comp.selectedLayers;
    var messageToShow = null;

    // Check if any selected layer is already part of a rig
    var existingRig = findExistingRig(selectedLayers, comp);
    if (existingRig) {
        alert("Selected layers are already part of a Parent Rig.\n\nUse 'Remove Parent Rig' first, then apply again with new settings.");
        return "error";
    }

    app.beginUndoGroup("Apply Parent Rig");

    try {
        // Check if selected layers should be ADDED to an existing rig
        var addToRigResult = checkForAddToRig(selectedLayers, comp);
        if (addToRigResult) {
            addLayersToExistingRig(addToRigResult.parent, addToRigResult.newChildren, comp, followOptions);
            result = "success";
        } else {
            // Find parent-child relationships from selection
            var relationships = findParentChildRelationships(selectedLayers, comp);

            if (relationships.length === 0) {
                messageToShow = "No parent-child relationships found in selection.\n\nMake sure selected layers have a parent assigned.";
            } else {
                // Apply rig to each parent-children group
                for (var i = 0; i < relationships.length; i++) {
                    var rel = relationships[i];
                    rigParentChildGroup(rel.parent, rel.children, comp, followOptions);
                }
                result = "success";
            }
        }
    } catch (e) {
        messageToShow = "Error: " + e.toString() + "\nLine: " + e.line;
    }

    app.endUndoGroup();

    if (messageToShow) {
        alert(messageToShow);
    }

    return result;
}

function removeParentRig() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return "error";
    }

    if (comp.selectedLayers.length === 0) {
        alert("Please select a layer that is part of a Parent Rig.");
        return "error";
    }

    var selectedLayers = comp.selectedLayers;
    var existingRig = findExistingRig(selectedLayers, comp);

    if (!existingRig) {
        alert("No Parent Rig found on selected layers.");
        return "error";
    }

    var result = "error";
    var messageToShow = null;

    app.beginUndoGroup("Remove Parent Rig");

    try {
        unrigLayers(existingRig.parent, existingRig.children, comp);
        messageToShow = "Parent Rig removed. Normal parenting restored.";
        result = "success";
    } catch (e) {
        messageToShow = "Error: " + e.toString() + "\nLine: " + e.line;
    }

    app.endUndoGroup();

    if (messageToShow) {
        alert(messageToShow);
    }

    return result;
}

// Check if a layer is a rigged parent (works for both pseudo effect and slider modes)
function isRiggedParent(layer) {
    return hasEffect(layer, "PR_Delay") || hasEffect(layer, "Parent Rig - Parent");
}

// Check if a layer is a rigged child
function isRiggedChild(layer) {
    // Check for old slider format OR pseudo effect (by matchName since name may be empty)
    return hasEffect(layer, "PR_Index") || hasEffect(layer, "Pseudo/ParentRigChild");
}

// Check if layer is a null or empty shape layer (doesn't need a rig layer created)
function isNullOrEmptyShape(layer) {
    // Check if null object
    if (layer.nullLayer) return true;

    // Check if empty shape layer (no content)
    try {
        if (layer.matchName === "ADBE Vector Layer") {
            var contents = layer.property("ADBE Root Vectors Group");
            if (contents && contents.numProperties === 0) return true;
        }
    } catch (e) {}

    return false;
}

// Check if this is a rig layer we created (name ends with " - Parent Rig")
function isCreatedRigLayer(layer) {
    return layer.name.indexOf(" - Parent Rig") === layer.name.length - 13;
}

// Create an invisible parent rig layer for visible parent layers
function createParentRigLayer(originalParent, children, comp) {
    // Create empty shape layer
    var rigLayer = comp.layers.addShape();
    rigLayer.name = originalParent.name + " - Parent Rig";

    // Match 3D status first (before copying properties)
    if (originalParent.threeDLayer) {
        rigLayer.threeDLayer = true;
    }

    // Match split dimensions
    var splitDims = originalParent.transform.position.dimensionsSeparated;
    rigLayer.transform.position.dimensionsSeparated = splitDims;

    // Copy all transform keyframes from original parent to rig layer
    copyTransformKeyframes(originalParent, rigLayer);

    // Reset anchor point to [0,0] - rig layer is just a position driver
    rigLayer.transform.anchorPoint.setValue([0, 0, 0]);

    // Find the bottommost child to place rig layer below all children
    var lowestChildIndex = originalParent.index;
    for (var i = 0; i < children.length; i++) {
        if (children[i].index > lowestChildIndex) {
            lowestChildIndex = children[i].index;
        }
    }

    // Move rig layer below all children (after the lowest child in layer stack)
    var lowestChild = comp.layer(lowestChildIndex);
    rigLayer.moveAfter(lowestChild);

    // Clear keyframes from original parent and set to current values
    clearTransformKeyframes(originalParent);

    return rigLayer;
}

// Copy all transform property keyframes from source to target layer
function copyTransformKeyframes(source, target) {
    var props = ['position', 'scale', 'rotation', 'opacity', 'anchorPoint'];
    var props3D = ['xRotation', 'yRotation', 'zRotation', 'xPosition', 'yPosition', 'zPosition'];

    // Copy standard properties
    for (var i = 0; i < props.length; i++) {
        copyPropertyKeyframes(source.transform[props[i]], target.transform[props[i]]);
    }

    // Copy 3D properties if applicable
    if (source.threeDLayer) {
        for (var j = 0; j < props3D.length; j++) {
            try {
                copyPropertyKeyframes(source.transform[props3D[j]], target.transform[props3D[j]]);
            } catch (e) {} // Some props may not exist
        }
    }
}

// Copy keyframes from one property to another
function copyPropertyKeyframes(sourceProp, targetProp) {
    if (!sourceProp || !targetProp) return;

    try {
        // If no keyframes, just copy the value
        if (sourceProp.numKeys === 0) {
            targetProp.setValue(sourceProp.value);
            return;
        }

        // Copy all keyframes
        for (var i = 1; i <= sourceProp.numKeys; i++) {
            var keyTime = sourceProp.keyTime(i);
            var keyValue = sourceProp.keyValue(i);

            // Add keyframe
            targetProp.setValueAtTime(keyTime, keyValue);

            // Copy keyframe interpolation
            try {
                var inInterp = sourceProp.keyInInterpolationType(i);
                var outInterp = sourceProp.keyOutInterpolationType(i);
                targetProp.setInterpolationTypeAtKey(i, inInterp, outInterp);

                // Copy temporal ease if not hold
                if (inInterp !== KeyframeInterpolationType.HOLD) {
                    var inEase = sourceProp.keyInTemporalEase(i);
                    var outEase = sourceProp.keyOutTemporalEase(i);
                    targetProp.setTemporalEaseAtKey(i, inEase, outEase);
                }

                // Copy spatial tangents for position-like properties
                if (sourceProp.propertyValueType === PropertyValueType.TwoD_SPATIAL ||
                    sourceProp.propertyValueType === PropertyValueType.ThreeD_SPATIAL) {
                    var inTangent = sourceProp.keyInSpatialTangent(i);
                    var outTangent = sourceProp.keyOutSpatialTangent(i);
                    targetProp.setSpatialTangentsAtKey(i, inTangent, outTangent);
                }
            } catch (e) {} // Interpolation copy may fail for some property types
        }
    } catch (e) {
        // If keyframe copy fails, just copy the value
        try {
            targetProp.setValue(sourceProp.value);
        } catch (e2) {}
    }
}

// Clear all keyframes from transform properties and set to current values
function clearTransformKeyframes(layer) {
    var currentTime = layer.containingComp.time;
    var props = ['position', 'scale', 'rotation', 'opacity', 'anchorPoint'];
    var props3D = ['xRotation', 'yRotation', 'zRotation', 'xPosition', 'yPosition', 'zPosition'];

    for (var i = 0; i < props.length; i++) {
        clearPropertyKeyframes(layer.transform[props[i]], currentTime);
    }

    if (layer.threeDLayer) {
        for (var j = 0; j < props3D.length; j++) {
            try {
                clearPropertyKeyframes(layer.transform[props3D[j]], currentTime);
            } catch (e) {}
        }
    }
}

// Clear keyframes from a property and set to value at specified time
function clearPropertyKeyframes(prop, atTime) {
    if (!prop) return;

    try {
        // Get value at current time before removing keyframes
        var currentValue = prop.valueAtTime(atTime, false);

        // Remove all keyframes (iterate backwards)
        while (prop.numKeys > 0) {
            prop.removeKey(1);
        }

        // Set to the captured value
        prop.setValue(currentValue);
    } catch (e) {}
}

// Check if selected layers should be added to an existing rig
function checkForAddToRig(selectedLayers, comp) {
    var newChildren = [];
    var riggedParent = null;
    var hasExistingRiggedLayers = false;

    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];

        // Track if selection includes already-rigged layers (but don't bail out)
        if (isRiggedChild(layer) || isRiggedParent(layer)) {
            hasExistingRiggedLayers = true;
            // If it's the parent, remember it
            if (isRiggedParent(layer)) {
                riggedParent = layer;
            }
            continue; // Skip to next layer, don't add to newChildren
        }

        // Check if this layer has a parent that is rigged
        if (layer.parent !== null) {
            var parentLayer = layer.parent;
            if (isRiggedParent(parentLayer)) {
                if (riggedParent === null) {
                    riggedParent = parentLayer;
                } else if (riggedParent.index !== parentLayer.index) {
                    // Multiple different rigged parents - bail out
                    return null;
                }
                newChildren.push(layer);
            }
        }
    }

    // If we found new children to add, return them
    if (riggedParent && newChildren.length > 0) {
        return { parent: riggedParent, newChildren: newChildren };
    }

    // If only existing rigged layers selected (no new children), return null
    // This allows unrig flow to handle it, but only if there are NO new children
    return null;
}

// Add new layers to an existing rig
function addLayersToExistingRig(parent, newChildren, comp, followOptions) {
    var currentTime = comp.time;
    var is3D = parent.threeDLayer;
    var parentSplitDims = parent.transform.position.dimensionsSeparated;

    var existingChildren = findRiggedChildren(parent, comp);

    var parentRestPos = [
        getEffectValue(existingChildren[0], "PR_Parent Rest Pos X"),
        getEffectValue(existingChildren[0], "PR_Parent Rest Pos Y")
    ];
    if (is3D) {
        var pz = getEffectValue(existingChildren[0], "PR_Parent Rest Pos Z");
        if (pz !== null) parentRestPos.push(pz);
    }
    var parentRestScale = [
        getEffectValue(existingChildren[0], "PR_Parent Rest Scale X"),
        getEffectValue(existingChildren[0], "PR_Parent Rest Scale Y")
    ];
    if (is3D) {
        var psz = getEffectValue(existingChildren[0], "PR_Parent Rest Scale Z");
        if (psz !== null) parentRestScale.push(psz);
        else parentRestScale.push(100);
    }
    var parentRestRot = getEffectValue(existingChildren[0], "PR_Parent Rest Rotation");
    var parentRestXRot = is3D ? (getEffectValue(existingChildren[0], "PR_Parent Rest X Rotation") || 0) : 0;
    var parentRestYRot = is3D ? (getEffectValue(existingChildren[0], "PR_Parent Rest Y Rotation") || 0) : 0;
    var parentRestOpacity = getEffectValue(existingChildren[0], "PR_Parent Rest Opacity");
    var parentRestAnchor = [
        getEffectValue(existingChildren[0], "PR_Parent Rest Anchor X") || parent.transform.anchorPoint.valueAtTime(currentTime, false)[0],
        getEffectValue(existingChildren[0], "PR_Parent Rest Anchor Y") || parent.transform.anchorPoint.valueAtTime(currentTime, false)[1]
    ];
    if (is3D) {
        var paz = getEffectValue(existingChildren[0], "PR_Parent Rest Anchor Z");
        if (paz !== null) parentRestAnchor.push(paz);
        else parentRestAnchor.push(parent.transform.anchorPoint.valueAtTime(currentTime, false)[2] || 0);
    }

    var parentAnchor = parent.transform.anchorPoint.valueAtTime(currentTime, false);

    for (var i = 0; i < newChildren.length; i++) {
        var child = newChildren[i];

        // Sync child's split dimensions to match parent
        child.transform.position.dimensionsSeparated = parentSplitDims;

        var childLocalPos = child.transform.position.valueAtTime(currentTime, false);
        var childRestScale = child.transform.scale.valueAtTime(currentTime, false);
        var childRestRot = child.transform.rotation.valueAtTime(currentTime, false);
        var childRestXRot = is3D ? child.transform.xRotation.valueAtTime(currentTime, false) : 0;
        var childRestYRot = is3D ? child.transform.yRotation.valueAtTime(currentTime, false) : 0;
        var childRestOpacity = child.transform.opacity.valueAtTime(currentTime, false);
        var childRestAnchor = child.transform.anchorPoint.valueAtTime(currentTime, false);

        var offsetX = childLocalPos[0] - parentAnchor[0];
        var offsetY = childLocalPos[1] - parentAnchor[1];
        offsetX *= parentRestScale[0] / 100;
        offsetY *= parentRestScale[1] / 100;

        var radians = parentRestRot * Math.PI / 180;
        var cosR = Math.cos(radians);
        var sinR = Math.sin(radians);
        var rotatedX = offsetX * cosR - offsetY * sinR;
        var rotatedY = offsetX * sinR + offsetY * cosR;

        var childWorldPosAtRest;
        if (childLocalPos.length > 2) {
            var offsetZ = childLocalPos[2] - (parentAnchor.length > 2 ? parentAnchor[2] : 0);
            offsetZ *= (parentRestScale.length > 2 ? parentRestScale[2] : 100) / 100;
            childWorldPosAtRest = [parentRestPos[0] + rotatedX, parentRestPos[1] + rotatedY, (parentRestPos.length > 2 ? parentRestPos[2] : 0) + offsetZ];
        } else {
            childWorldPosAtRest = [parentRestPos[0] + rotatedX, parentRestPos[1] + rotatedY];
        }

        child.parent = null;

        addChildEffect(child, 999, parent.index,
            childWorldPosAtRest, childRestScale, childRestRot, childRestXRot, childRestYRot, childRestOpacity, childRestAnchor,
            parentRestPos, parentRestScale, parentRestRot, parentRestXRot, parentRestYRot, parentRestOpacity, parentRestAnchor, is3D);

        applyExpressions(child, parent, comp, is3D, parentSplitDims, null, null, followOptions);
    }

    var allChildren = findRiggedChildren(parent, comp);

    allChildren.sort(function(a, b) {
        return a.index - b.index;
    });

    for (var i = 0; i < allChildren.length; i++) {
        // Reverse index order: bottom layer in timeline = index 1 (animates first)
        setEffectValue(allChildren[i], "PR_Index", allChildren.length - i);

        // Clean up any parent effect that shouldn't be on a child layer
        // (can happen when original parent becomes child, or from undo/redo)
        removeEffect(allChildren[i], "Parent Rig - Parent");
        removeEffect(allChildren[i], "PR_Delay");
    }

    setParentChildCount(parent, allChildren.length);
}

function setEffectValue(layer, effectName, value) {
    try {
        var effects = layer.property("ADBE Effect Parade");

        // For child effect properties, try pseudo effect first (by matchName since name may be empty)
        if (effectName.indexOf("PR_") === 0) {
            var propName = effectName.replace(/^PR_/, "").replace(/_/g, " ");
            for (var i = 1; i <= effects.numProperties; i++) {
                var eff = effects.property(i);
                if (eff.matchName === "Pseudo/ParentRigChild") {
                    try {
                        eff.property(propName).setValue(value);
                        return true;
                    } catch (e2) {}
                }
            }
        }

        // Fallback to old slider format
        for (var j = 1; j <= effects.numProperties; j++) {
            if (effects.property(j).name === effectName) {
                effects.property(j).property("Slider").setValue(value);
                return true;
            }
        }
    } catch (e) {}
    return false;
}

// Set the parent's child count - handles both pseudo effect and slider fallback modes
function setParentChildCount(parentLayer, count) {
    var effects = parentLayer.property("ADBE Effect Parade");

    // Try pseudo effect mode first (index 71 for Child count)
    for (var i = 1; i <= effects.numProperties; i++) {
        var eff = effects.property(i);
        if (eff.matchName === "Pseudo/ParentRigParent" || eff.name === "Parent Rig - Parent") {
            try {
                eff.property(71).setValue(count);
                return true;
            } catch (e) {
                // Fallback to name-based access
                try {
                    eff.property("Child count").setValue(count);
                    return true;
                } catch (e2) {}
            }
        }
    }

    // Fallback: slider mode
    return setEffectValue(parentLayer, "PR_Child Count", count);
}

function findExistingRig(selectedLayers, comp) {
    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];

        if (isRiggedParent(layer)) {
            var children = findRiggedChildren(layer, comp);
            return { parent: layer, children: children };
        }

        if (isRiggedChild(layer)) {
            // Find parent by searching for rigged parent layer
            // This is more robust than using stored index which breaks on layer reorder
            var parentLayer = findParentRigLayer(comp);
            if (parentLayer) {
                var children = findRiggedChildren(parentLayer, comp);
                return { parent: parentLayer, children: children };
            }
        }
    }
    return null;
}

// Find the parent rig layer in the comp
function findParentRigLayer(comp) {
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        if (isRiggedParent(layer)) {
            return layer;
        }
    }
    return null;
}

function findRiggedChildren(parentLayer, comp) {
    var children = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        if (!layer) continue;

        // Skip the parent layer itself
        if (parentLayer && layer.index === parentLayer.index) {
            continue;
        }

        // Validate layer is accessible
        try {
            var testName = layer.name;
            if (!testName) continue;
        } catch (e) {
            continue; // Skip inaccessible layers
        }

        // Check for old slider format OR pseudo effect (by matchName since name may be empty)
        if (hasEffect(layer, "PR_Index") || hasEffect(layer, "Pseudo/ParentRigChild")) {
            // For single-rig comps, all layers with child effect are children of the parent rig
            // The stored PR_Parent Layer index is unreliable after layer reordering
            children.push(layer);
        }
    }
    return children;
}

function getEffectValue(layer, effectName) {
    try {
        var effects = layer.property("ADBE Effect Parade");
        // Check pseudo effect first (by matchName since name may be empty)
        for (var i = 1; i <= effects.numProperties; i++) {
            var eff = effects.property(i);
            if (eff.matchName === "Pseudo/ParentRigChild") {
                // Convert "PR_Parent Rest Pos X" -> "Parent Rest Pos X"
                var propName = effectName.replace(/^PR_/, "").replace(/_/g, " ");
                try { return eff.property(propName).value; } catch(e) {}
            }
        }
        // Fall back to old slider format
        for (var j = 1; j <= effects.numProperties; j++) {
            if (effects.property(j).name === effectName) {
                return effects.property(j).property("Slider").value;
            }
        }
    } catch (e) {}
    return null;
}

function unrigLayers(parent, children, comp) {
    var rigLayerToDelete = null;
    var originalParent = null;
    var actualChildren = children;

    // Check if parent is a created rig layer (has " - Parent Rig" suffix)
    if (isCreatedRigLayer(parent)) {
        // Find the original parent among children by name matching
        var baseName = parent.name.replace(" - Parent Rig", "");
        for (var i = 0; i < children.length; i++) {
            if (children[i].name === baseName) {
                originalParent = children[i];
                break;
            }
        }

        // Fallback: if no name match, check for child with Parent Rig - Parent effect
        // (This shouldn't happen, but handles edge cases)
        if (!originalParent) {
            for (var i = 0; i < children.length; i++) {
                if (hasEffect(children[i], "Parent Rig - Parent") || hasEffect(children[i], "Pseudo/ParentRigParent")) {
                    originalParent = children[i];
                    break;
                }
            }
        }

        if (originalParent) {
            // Remove expressions from original parent first (before copying keyframes)
            try {
                originalParent.transform.position.expression = "";
                originalParent.transform.scale.expression = "";
                originalParent.transform.rotation.expression = "";
                originalParent.transform.opacity.expression = "";
                originalParent.transform.anchorPoint.expression = "";
                if (originalParent.threeDLayer) {
                    originalParent.transform.xRotation.expression = "";
                    originalParent.transform.yRotation.expression = "";
                    originalParent.transform.zRotation.expression = "";
                }
            } catch (e) {}

            // Copy keyframes back from rig layer to original parent
            copyTransformKeyframes(parent, originalParent);

            // Filter out original parent from children list
            actualChildren = [];
            for (var k = 0; k < children.length; k++) {
                if (children[k].index !== originalParent.index) {
                    actualChildren.push(children[k]);
                }
            }

            // Mark rig layer for deletion
            rigLayerToDelete = parent;
        }
    }

    // The layer to restore parenting to
    var restoreParent = originalParent || parent;

    // Remove expressions and restore parenting for all children
    for (var j = 0; j < actualChildren.length; j++) {
        var child = actualChildren[j];

        try {
            child.transform.position.expression = "";
            child.transform.scale.expression = "";
            child.transform.rotation.expression = "";
            child.transform.opacity.expression = "";
            child.transform.anchorPoint.expression = "";
            if (child.threeDLayer) {
                child.transform.xRotation.expression = "";
                child.transform.yRotation.expression = "";
                child.transform.zRotation.expression = "";
            }
        } catch (e) {}

        // Only re-parent if this isn't the restoreParent itself
        if (child.index !== restoreParent.index) {
            try {
                // Get child's current world position before re-parenting
                var worldPos = child.transform.position.value;

                // Set the parent
                child.parent = restoreParent;

                // Convert world position to local position relative to new parent
                // AE automatically adjusts, but we need to set position to maintain visual location
                var parentAnchor = restoreParent.transform.anchorPoint.value;
                var parentPos = restoreParent.transform.position.value;
                var parentScale = restoreParent.transform.scale.value;
                var parentRot = restoreParent.transform.rotation.value;

                // Calculate local position
                var dx = worldPos[0] - parentPos[0];
                var dy = worldPos[1] - parentPos[1];

                // Account for parent rotation
                var rad = -parentRot * Math.PI / 180;
                var cosR = Math.cos(rad);
                var sinR = Math.sin(rad);
                var rotatedX = dx * cosR - dy * sinR;
                var rotatedY = dx * sinR + dy * cosR;

                // Account for parent scale
                var localX = rotatedX / (parentScale[0] / 100) + parentAnchor[0];
                var localY = rotatedY / (parentScale[1] / 100) + parentAnchor[1];

                var localPos = [localX, localY];
                if (worldPos.length > 2) {
                    var dz = worldPos[2] - (parentPos.length > 2 ? parentPos[2] : 0);
                    var localZ = dz / ((parentScale.length > 2 ? parentScale[2] : 100) / 100) + (parentAnchor.length > 2 ? parentAnchor[2] : 0);
                    localPos.push(localZ);
                }

                // Only set position if no keyframes
                if (child.transform.position.numKeys === 0) {
                    child.transform.position.setValue(localPos);
                }
            } catch (parentErr) {
                // Silently skip - layer will be unrigged but position may not be perfect
            }
        }
        removeAllPREffects(child);
    }

    // Handle original parent if it was converted from a child
    if (originalParent) {
        // Expressions already removed above before keyframe copy
        originalParent.parent = null;
        removeAllPREffects(originalParent);
    }

    // Remove effects from rig layer (before deleting)
    if (rigLayerToDelete) {
        removeAllPREffects(rigLayerToDelete);
        rigLayerToDelete.remove();
    } else {
        removeAllPREffects(parent);
    }

    // Note: alert is now shown by caller after undo group closes
}

function removeAllPREffects(layer) {
    try {
        var effects = layer.property("ADBE Effect Parade");
        for (var i = effects.numProperties; i >= 1; i--) {
            var eff = effects.property(i);
            var effectName = eff.name;
            // Remove PR_ slider effects and pseudo effects (both parent and child)
            if (effectName.indexOf("PR_") === 0 ||
                effectName === "Parent Rig - Parent" ||
                effectName === "Parent Rig - Child" ||
                eff.matchName === "Pseudo/ParentRigParent" ||
                eff.matchName === "Pseudo/ParentRigChild") {
                eff.remove();
            }
        }
    } catch (e) {}
}

// ============================================
// RELATIONSHIP DETECTION
// ============================================

function findParentChildRelationships(selectedLayers, comp) {
    var relationships = [];
    var processedParents = {};

    // First priority: find relationships where selected layers have a parent assigned
    // This is the most common case - user selects children that are parented to something
    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];

        if (layer.parent !== null) {
            var parentLayer = layer.parent;
            var parentId = parentLayer.index;

            if (!processedParents[parentId]) {
                processedParents[parentId] = {
                    parent: parentLayer,
                    children: []
                };

                // Find ALL layers that have this parent
                for (var j = 1; j <= comp.numLayers; j++) {
                    var otherLayer = comp.layer(j);
                    if (otherLayer.parent !== null && otherLayer.parent.index === parentLayer.index) {
                        processedParents[parentId].children.push(otherLayer);
                    }
                }
            }
        }
    }

    // Second priority: only if no parent-child relationships found above,
    // check if selected layers themselves have children
    // (This handles the case where user selects the parent layer directly)
    var hasAnyParents = false;
    for (var p in processedParents) {
        if (processedParents.hasOwnProperty(p)) {
            hasAnyParents = true;
            break;
        }
    }
    if (!hasAnyParents) {
        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            var layerId = layer.index;

            for (var j = 1; j <= comp.numLayers; j++) {
                var otherLayer = comp.layer(j);
                if (otherLayer.parent !== null && otherLayer.parent.index === layer.index) {
                    if (!processedParents[layerId]) {
                        processedParents[layerId] = {
                            parent: layer,
                            children: []
                        };
                    }
                    processedParents[layerId].children.push(otherLayer);
                }
            }
        }
    }

    for (var id in processedParents) {
        if (processedParents.hasOwnProperty(id) && processedParents[id] && processedParents[id].children && processedParents[id].children.length > 0) {
            relationships.push(processedParents[id]);
        }
    }

    return relationships;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Calculate world position of a layer (accounting for entire parent chain)
function getLayerWorldPosition(layer, time) {
    // This function calculates what toWorld([0,0]) returns
    // i.e., the world position of the layer's anchor point
    //
    // In AE, a layer's position property places its anchor point in the parent's
    // coordinate system. The parent's coordinate system has its origin at the
    // parent's anchor point. So child positions are ALREADY relative to parent's anchor.

    var pos = layer.transform.position.valueAtTime(time, false);
    var worldX = pos[0];
    var worldY = pos[1];
    var worldZ = pos.length > 2 ? pos[2] : 0;

    // Walk up the parent chain, transforming the point through each parent's transform
    var currentLayer = layer.parent;
    while (currentLayer) {
        var parentPos = currentLayer.transform.position.valueAtTime(time, false);
        var parentScale = currentLayer.transform.scale.valueAtTime(time, false);
        var parentRot = currentLayer.transform.rotation.valueAtTime(time, false);

        // Apply parent's scale
        var scaleX = parentScale[0] / 100;
        var scaleY = parentScale[1] / 100;
        worldX *= scaleX;
        worldY *= scaleY;

        // Apply parent's rotation
        var rad = parentRot * Math.PI / 180;
        var cosR = Math.cos(rad);
        var sinR = Math.sin(rad);
        var rotatedX = worldX * cosR - worldY * sinR;
        var rotatedY = worldX * sinR + worldY * cosR;
        worldX = rotatedX;
        worldY = rotatedY;

        // Add parent's position to get position in grandparent/comp space
        worldX += parentPos[0];
        worldY += parentPos[1];

        currentLayer = currentLayer.parent;
    }

    return [worldX, worldY, worldZ];
}

function getLayerWorldScale(layer, time) {
    // Calculate cumulative scale from entire parent chain
    // Returns percentage values (100 = 100%)
    var worldScaleX = 1;
    var worldScaleY = 1;
    var worldScaleZ = 1;

    var currentLayer = layer;
    while (currentLayer) {
        var scale = currentLayer.transform.scale.valueAtTime(time, false);
        worldScaleX *= scale[0] / 100;
        worldScaleY *= scale[1] / 100;
        if (scale.length > 2) {
            worldScaleZ *= scale[2] / 100;
        }
        currentLayer = currentLayer.parent;
    }

    // Convert back to percentage (1 -> 100%)
    return [worldScaleX * 100, worldScaleY * 100, worldScaleZ * 100];
}

function hasEffect(layer, effectName) {
    // Map display names to matchNames for pseudo effects (which may have empty display names)
    var matchNameMap = {
        "Parent Rig - Child": "Pseudo/ParentRigChild",
        "Parent Rig - Parent": "Pseudo/ParentRigParent"
    };
    var targetMatchName = matchNameMap[effectName] || null;

    try {
        var effects = layer.property("ADBE Effect Parade");
        for (var i = 1; i <= effects.numProperties; i++) {
            var eff = effects.property(i);
            if (eff.name === effectName || eff.matchName === effectName) {
                return true;
            }
            // Also check mapped matchName for pseudo effects
            if (targetMatchName && eff.matchName === targetMatchName) {
                return true;
            }
        }
    } catch (e) {}
    return false;
}

function removeEffect(layer, effectName) {
    try {
        var effects = layer.property("ADBE Effect Parade");
        // Map display names to matchNames for pseudo effects (which may have empty display names)
        var matchNameMap = {
            "Parent Rig - Child": "Pseudo/ParentRigChild",
            "Parent Rig - Parent": "Pseudo/ParentRigParent"
        };
        var targetMatchName = matchNameMap[effectName] || null;

        for (var i = effects.numProperties; i >= 1; i--) {
            var eff = effects.property(i);
            // Check by display name OR by matchName (for pseudo effects with empty names)
            if (eff.name === effectName || (targetMatchName && eff.matchName === targetMatchName)) {
                eff.remove();
            }
        }
    } catch (e) {}
}

// ============================================
// APPLY RIG
// ============================================

// Try to get existing parent rest values from a child that's already part of the rig
function getExistingParentRestValues(children, is3D) {
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var effects = child.property("ADBE Effect Parade");

        // Helper to get property value from either pseudo effect or old slider format
        function getChildProp(pseudoEff, name) {
            if (pseudoEff) {
                try { return pseudoEff.property(name).value; } catch(e) {}
            }
            try { return effects.property("PR_" + name).property("Slider").value; } catch(e) {}
            return null;
        }

        // Check for pseudo effect first (by matchName since name may be empty)
        var pseudoEff = null;
        for (var j = 1; j <= effects.numProperties; j++) {
            try {
                if (effects.property(j).matchName === "Pseudo/ParentRigChild") {
                    pseudoEff = effects.property(j);
                    break;
                }
            } catch(e) {}
        }

        var testVal = getChildProp(pseudoEff, "Parent Rest Pos X");
        if (testVal !== null) {
            // Found an existing rigged child, extract all parent rest values
            var parentRestPos = [
                getChildProp(pseudoEff, "Parent Rest Pos X"),
                getChildProp(pseudoEff, "Parent Rest Pos Y")
            ];
            var zVal = getChildProp(pseudoEff, "Parent Rest Pos Z");
            if (zVal !== null) parentRestPos.push(zVal);

            var parentRestScale = [
                getChildProp(pseudoEff, "Parent Rest Scale X"),
                getChildProp(pseudoEff, "Parent Rest Scale Y")
            ];
            if (is3D) {
                var scaleZ = getChildProp(pseudoEff, "Parent Rest Scale Z");
                parentRestScale.push(scaleZ !== null ? scaleZ : 100);
            }

            var parentRestRot = getChildProp(pseudoEff, "Parent Rest Rotation") || 0;

            var parentRestXRot = 0;
            var parentRestYRot = 0;
            if (is3D) {
                parentRestXRot = getChildProp(pseudoEff, "Parent Rest X Rotation") || 0;
                parentRestYRot = getChildProp(pseudoEff, "Parent Rest Y Rotation") || 0;
            }

            var parentRestOpacity = getChildProp(pseudoEff, "Parent Rest Opacity") || 100;

            var parentRestAnchor = [
                getChildProp(pseudoEff, "Parent Rest Anchor X") || 0,
                getChildProp(pseudoEff, "Parent Rest Anchor Y") || 0
            ];
            var zAnchor = getChildProp(pseudoEff, "Parent Rest Anchor Z");
            if (zAnchor !== null) parentRestAnchor.push(zAnchor);

            return {
                pos: parentRestPos,
                scale: parentRestScale,
                rot: parentRestRot,
                xRot: parentRestXRot,
                yRot: parentRestYRot,
                opacity: parentRestOpacity,
                anchor: parentRestAnchor
            };
        }
    }

    return null; // No existing rig found
}

function rigParentChildGroup(parent, children, comp, followOptions) {
    var currentTime = comp.time;
    var originalParent = parent;  // Keep reference to original
    var rigLayerCreated = false;

    // Check if we need to create a parent rig layer (for visible parents)
    if (!isNullOrEmptyShape(parent)) {
        // Create invisible rig layer
        var rigLayer = createParentRigLayer(originalParent, children, comp);
        rigLayerCreated = true;

        // Clean up any parent effect on original parent (from previous rig or undo/redo)
        removeEffect(originalParent, "Parent Rig - Parent");
        removeEffect(originalParent, "PR_Delay");

        // Original parent becomes a child - add to beginning of children array
        // so it gets index 1 (first in cascade with normal order)
        children.unshift(originalParent);

        // Use the rig layer as the new parent
        parent = rigLayer;
    } else {
        // Parent is null/empty shape - rename it and recolor to indicate it's a rig parent
        if (parent.name.indexOf(" - Parent Rig") === -1) {
            parent.name = parent.name + " - Parent Rig";
        }
        // Set label color to fuchsia (13) to make it stand out
        parent.label = 13;
    }

    var is3D = originalParent.threeDLayer;
    var parentSplitDims = originalParent.transform.position.dimensionsSeparated;

    // For rig layer, match the 3D and split dims settings
    if (rigLayerCreated) {
        parent.threeDLayer = is3D;
        parent.transform.position.dimensionsSeparated = parentSplitDims;
    }

    children.sort(function(a, b) {
        return a.index - b.index;
    });

    // Try to get existing parent rest values from already-rigged children
    var existingRest = getExistingParentRestValues(children, is3D);

    // Get parent rest values - use existing values if rig already exists, otherwise capture current
    var parentRestPos, parentRestScale, parentRestRot, parentRestXRot, parentRestYRot, parentRestOpacity, parentRestAnchor;

    if (existingRest) {
        // Use existing parent rest values to maintain consistency when adding new children
        parentRestPos = existingRest.pos;
        parentRestScale = existingRest.scale;
        parentRestRot = existingRest.rot;
        parentRestXRot = existingRest.xRot;
        parentRestYRot = existingRest.yRot;
        parentRestOpacity = existingRest.opacity;
        parentRestAnchor = existingRest.anchor;
    } else {
        // No existing rig - capture current parent values as rest position
        if (parentSplitDims) {
            parentRestPos = [
                parent.transform.xPosition.valueAtTime(currentTime, false),
                parent.transform.yPosition.valueAtTime(currentTime, false)
            ];
            if (is3D) parentRestPos.push(parent.transform.zPosition.valueAtTime(currentTime, false));
        } else {
            parentRestPos = parent.transform.position.valueAtTime(currentTime, false);
        }
        parentRestScale = parent.transform.scale.valueAtTime(currentTime, false);
        parentRestRot = parent.transform.rotation.valueAtTime(currentTime, false);
        parentRestXRot = is3D ? parent.transform.xRotation.valueAtTime(currentTime, false) : 0;
        parentRestYRot = is3D ? parent.transform.yRotation.valueAtTime(currentTime, false) : 0;
        parentRestOpacity = parent.transform.opacity.valueAtTime(currentTime, false);
        parentRestAnchor = parent.transform.anchorPoint.valueAtTime(currentTime, false);
    }

    addParentEffect(parent, children.length);

    // Set the "Children follow" checkboxes in the parent effect to match panel options
    // This makes the effect UI reflect what's actually applied (indices 56-60)
    try {
        var pEffects = parent.property("ADBE Effect Parade");
        for (var pe = 1; pe <= pEffects.numProperties; pe++) {
            if (pEffects.property(pe).matchName === "Pseudo/ParentRigParent") {
                var pEff = pEffects.property(pe);
                pEff(56).setValue(followOptions.position ? 1 : 0);  // Position
                pEff(57).setValue(followOptions.scale ? 1 : 0);     // Scale
                pEff(58).setValue(followOptions.rotation ? 1 : 0);  // Rotation
                pEff(59).setValue(followOptions.opacity ? 1 : 0);   // Opacity
                pEff(60).setValue(followOptions.anchor ? 1 : 0);    // Anchor point
                break;
            }
        }
    } catch (e) {}

    // First pass: collect all children's world positions for bounds calculation
    var childData = [];
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var childIndex = children.length - i;

        child.transform.position.dimensionsSeparated = parentSplitDims;

        var childLocalPos;
        if (parentSplitDims) {
            childLocalPos = [
                child.transform.xPosition.valueAtTime(currentTime, false),
                child.transform.yPosition.valueAtTime(currentTime, false)
            ];
            if (is3D) childLocalPos.push(child.transform.zPosition.valueAtTime(currentTime, false));
        } else {
            childLocalPos = child.transform.position.valueAtTime(currentTime, false);
        }
        var childRestScale = child.transform.scale.valueAtTime(currentTime, false);
        var childRestRot = child.transform.rotation.valueAtTime(currentTime, false);
        var childRestXRot = is3D ? child.transform.xRotation.valueAtTime(currentTime, false) : 0;
        var childRestYRot = is3D ? child.transform.yRotation.valueAtTime(currentTime, false) : 0;
        var childRestOpacity = child.transform.opacity.valueAtTime(currentTime, false);
        var childRestAnchor = child.transform.anchorPoint.valueAtTime(currentTime, false);

        var childWorldPos;
        var isOriginalParentAsChild = rigLayerCreated && child.index === originalParent.index;

        if (isOriginalParentAsChild) {
            childWorldPos = childLocalPos.slice();
        } else {
            var parentPos = parentRestPos;
            var parentAnchor = parentRestAnchor;
            var parentScale = parentRestScale;
            var parentRot = parentRestRot;

            var offsetX = childLocalPos[0] - parentAnchor[0];
            var offsetY = childLocalPos[1] - parentAnchor[1];

            offsetX *= parentScale[0] / 100;
            offsetY *= parentScale[1] / 100;

            var radians = parentRot * Math.PI / 180;
            var cosR = Math.cos(radians);
            var sinR = Math.sin(radians);
            var rotatedX = offsetX * cosR - offsetY * sinR;
            var rotatedY = offsetX * sinR + offsetY * cosR;

            if (childLocalPos.length > 2) {
                var offsetZ = childLocalPos[2] - (parentAnchor.length > 2 ? parentAnchor[2] : 0);
                offsetZ *= (parentScale.length > 2 ? parentScale[2] : 100) / 100;
                childWorldPos = [parentPos[0] + rotatedX, parentPos[1] + rotatedY, (parentPos.length > 2 ? parentPos[2] : 0) + offsetZ];
            } else {
                childWorldPos = [parentPos[0] + rotatedX, parentPos[1] + rotatedY];
            }
        }

        childData.push({
            child: child,
            childIndex: childIndex,
            childWorldPos: childWorldPos,
            childRestScale: childRestScale,
            childRestRot: childRestRot,
            childRestXRot: childRestXRot,
            childRestYRot: childRestYRot,
            childRestOpacity: childRestOpacity,
            childRestAnchor: childRestAnchor
        });
    }

    // Calculate group bounds from all children's positions
    var groupBounds = {
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        centerX: 0, centerY: 0
    };
    for (var j = 0; j < childData.length; j++) {
        var pos = childData[j].childWorldPos;
        groupBounds.minX = Math.min(groupBounds.minX, pos[0]);
        groupBounds.maxX = Math.max(groupBounds.maxX, pos[0]);
        groupBounds.minY = Math.min(groupBounds.minY, pos[1]);
        groupBounds.maxY = Math.max(groupBounds.maxY, pos[1]);
        groupBounds.centerX += pos[0];
        groupBounds.centerY += pos[1];
    }
    groupBounds.centerX /= childData.length;
    groupBounds.centerY /= childData.length;

    // Second pass: apply effects and expressions with bounds
    for (var k = 0; k < childData.length; k++) {
        var data = childData[k];

        data.child.parent = null;

        // Set position to world coordinates (since we removed native parenting)
        // Skip if property has keyframes - expression will handle it
        if (parentSplitDims) {
            if (data.child.transform.xPosition.numKeys === 0) {
                data.child.transform.xPosition.setValue(data.childWorldPos[0]);
            }
            if (data.child.transform.yPosition.numKeys === 0) {
                data.child.transform.yPosition.setValue(data.childWorldPos[1]);
            }
            if (is3D && data.childWorldPos.length > 2 && data.child.transform.zPosition.numKeys === 0) {
                data.child.transform.zPosition.setValue(data.childWorldPos[2]);
            }
        } else {
            if (data.child.transform.position.numKeys === 0) {
                data.child.transform.position.setValue(data.childWorldPos);
            }
        }

        addChildEffect(data.child, data.childIndex, parent.index,
            data.childWorldPos, data.childRestScale, data.childRestRot, data.childRestXRot, data.childRestYRot, data.childRestOpacity, data.childRestAnchor,
            parentRestPos, parentRestScale, parentRestRot, parentRestXRot, parentRestYRot, parentRestOpacity, parentRestAnchor, is3D);

        applyExpressions(data.child, parent, comp, is3D, parentSplitDims, groupBounds, null, followOptions);
    }
}

// ============================================
// EFFECT CREATION
// ============================================

function addParentEffect(layer, childCount) {
    var effects = layer.property("ADBE Effect Parade");

    // Remove any child effect - parent layers should NOT have child effects
    removeEffect(layer, "Parent Rig - Child");
    removeEffect(layer, "PR_Index");

    // Check if already has parent effect
    if (hasEffect(layer, "Parent Rig - Parent") || hasEffect(layer, "PR_Delay")) {
        return;
    }

    // Try to add pseudo effect by matchname first (uses PresetEffects.xml - always in sync)
    var pseudoEffectApplied = false;
    try {
        var eff = effects.addProperty("Pseudo/ParentRigParent");
        if (eff) {
            // Verify the effect actually loaded properly (has expected properties)
            if (eff.numProperties >= 60) {
                eff.name = "Parent Rig - Parent";  // Ensure consistent name for expression access
                pseudoEffectApplied = true;
                // Set the child count value (index 71)
                try {
                    eff.property(71).setValue(childCount);
                } catch (e2) {
                    try {
                        eff.property("Child count").setValue(childCount);
                    } catch (e3) {}
                }
                // Set pin boundary defaults from comp size
                var comp = layer.containingComp;
                try {
                    eff.property(43).setValue(comp.height);  // Bottom Y boundary
                    eff.property(51).setValue(comp.width);   // Right X boundary
                } catch (e2) {}
            } else {
                // Effect was created but is broken - remove it and try fallback
                eff.remove();
                pseudoEffectApplied = false;
            }
        }
    } catch (e) {
        pseudoEffectApplied = false;
    }

    // Fallback: Try FFX preset if matchname approach failed
    if (!pseudoEffectApplied && extensionRoot !== "") {
        var ffxPath = extensionRoot + "/assets/presets/Parent Rig - Parent.ffx";
        var ffxFile = new File(ffxPath);

        if (ffxFile.exists) {
            try {
                layer.applyPreset(ffxFile);
                pseudoEffectApplied = true;

                // Set values - find the effect by iterating
                for (var i = 1; i <= effects.numProperties; i++) {
                    var eff = effects.property(i);
                    if (eff.matchName === "Pseudo/ParentRigParent" || eff.name === "Parent Rig - Parent") {
                        eff.name = "Parent Rig - Parent";  // Ensure consistent name for expression access
                        try {
                            eff.property(71).setValue(childCount);  // Child count
                        } catch (e2) {
                            try {
                                eff.property("Child count").setValue(childCount);
                            } catch (e3) {}
                        }
                        // Set pin boundary defaults from comp size
                        var comp = layer.containingComp;
                        try {
                            eff.property(43).setValue(comp.height);  // Bottom Y boundary
                            eff.property(51).setValue(comp.width);   // Right X boundary
                        } catch (e2) {}
                        break;
                    }
                }
            } catch (e) {
                pseudoEffectApplied = false;
            }
        }
    }

    // Fallback: Use individual slider controls
    if (!pseudoEffectApplied) {
        var delay = effects.addProperty("ADBE Slider Control");
        delay.name = "PR_Delay";
        delay.property("Slider").setValue(0);

        var stretch = effects.addProperty("ADBE Slider Control");
        stretch.name = "PR_Delay Stretch";
        stretch.property("Slider").setValue(0);

        var reverseOrder = effects.addProperty("ADBE Slider Control");
        reverseOrder.name = "PR_Reverse Order";
        reverseOrder.property("Slider").setValue(0);

        var falloff = effects.addProperty("ADBE Slider Control");
        falloff.name = "PR_Falloff";
        falloff.property("Slider").setValue(100);

        var random = effects.addProperty("ADBE Checkbox Control");
        random.name = "PR_Random";
        random.property("Checkbox").setValue(0);

        var randomSeed = effects.addProperty("ADBE Slider Control");
        randomSeed.name = "PR_Random Seed";
        randomSeed.property("Slider").setValue(0);

        var followPos = effects.addProperty("ADBE Checkbox Control");
        followPos.name = "PR_Follow Position";
        followPos.property("Checkbox").setValue(1);

        var followScale = effects.addProperty("ADBE Checkbox Control");
        followScale.name = "PR_Follow Scale";
        followScale.property("Checkbox").setValue(1);

        var followRot = effects.addProperty("ADBE Checkbox Control");
        followRot.name = "PR_Follow Rotation";
        followRot.property("Checkbox").setValue(1);

        var followOpacity = effects.addProperty("ADBE Checkbox Control");
        followOpacity.name = "PR_Follow Opacity";
        followOpacity.property("Checkbox").setValue(1);

        var followAnchor = effects.addProperty("ADBE Checkbox Control");
        followAnchor.name = "PR_Follow Anchor Point";
        followAnchor.property("Checkbox").setValue(1);

        // Child Count at the end (hidden in pseudo effect)
        var count = effects.addProperty("ADBE Slider Control");
        count.name = "PR_Child Count";
        count.property("Slider").setValue(childCount);
    }
}

function addChildEffect(layer, index, parentLayerIndex,
                       childPos, childScale, childRot, childXRot, childYRot, childOpacity, childAnchor,
                       parentPos, parentScale, parentRot, parentXRot, parentYRot, parentOpacity, parentAnchor, is3D) {

    var effects = layer.property("ADBE Effect Parade");

    removeEffect(layer, EFFECT_NAME_CHILD);

    var pseudoEffectApplied = false;
    var eff = null;

    // Helper function to set all child effect values
    function setChildEffectValues(eff) {
        eff.property("Index").setValue(index);
        eff.property("Influence").setValue(100);
        eff.property("Rest Pos X").setValue(childPos[0]);
        eff.property("Rest Pos Y").setValue(childPos[1]);
        eff.property("Rest Pos Z").setValue(childPos.length > 2 ? childPos[2] : 0);
        eff.property("Rest Scale X").setValue(childScale[0]);
        eff.property("Rest Scale Y").setValue(childScale[1]);
        eff.property("Rest Scale Z").setValue(childScale.length > 2 ? childScale[2] : 100);
        eff.property("Rest Rotation").setValue(childRot);
        eff.property("Rest Opacity").setValue(childOpacity);
        eff.property("Rest Anchor X").setValue(childAnchor[0]);
        eff.property("Rest Anchor Y").setValue(childAnchor[1]);
        eff.property("Rest Anchor Z").setValue(childAnchor.length > 2 ? childAnchor[2] : 0);
        eff.property("Parent Rest Pos X").setValue(parentPos[0]);
        eff.property("Parent Rest Pos Y").setValue(parentPos[1]);
        eff.property("Parent Rest Pos Z").setValue(parentPos.length > 2 ? parentPos[2] : 0);
        eff.property("Parent Rest Scale X").setValue(parentScale[0]);
        eff.property("Parent Rest Scale Y").setValue(parentScale[1]);
        eff.property("Parent Rest Scale Z").setValue(parentScale.length > 2 ? parentScale[2] : 100);
        eff.property("Parent Rest Rotation").setValue(parentRot);
        eff.property("Parent Rest Opacity").setValue(parentOpacity);
        eff.property("Parent Rest Anchor X").setValue(parentAnchor[0]);
        eff.property("Parent Rest Anchor Y").setValue(parentAnchor[1]);
        eff.property("Parent Rest Anchor Z").setValue(parentAnchor.length > 2 ? parentAnchor[2] : 0);
    }

    // APPROACH 1: Try FFX preset first (applyPreset uses different AE code path, more reliable on cold start)
    if (!pseudoEffectApplied && extensionRoot !== "") {
        var ffxPath = extensionRoot + "/assets/presets/Parent Rig - Child.ffx";
        var ffxFile = new File(ffxPath);

        if (ffxFile.exists) {
            var effectCountBefore = effects.numProperties;
            try {
                // IMPORTANT: applyPreset can apply to selected layers instead of the target layer
                // Deselect all, select only target layer, apply, then restore selection
                var comp = layer.containingComp;
                var savedSelection = comp.selectedLayers.slice(); // Copy array
                for (var s = comp.selectedLayers.length - 1; s >= 0; s--) {
                    comp.selectedLayers[s].selected = false;
                }
                layer.selected = true;
                layer.applyPreset(ffxFile);
                layer.selected = false;
                for (var r = 0; r < savedSelection.length; r++) {
                    savedSelection[r].selected = true;
                }

                // Find the effect we just applied (by matchName since name may be empty)
                for (var i = 1; i <= effects.numProperties; i++) {
                    var testEff = effects.property(i);
                    if (testEff.matchName === "Pseudo/ParentRigChild") {
                        eff = testEff;
                        break;
                    }
                }

                if (eff && eff.numProperties >= 24) {
                    eff.name = "Parent Rig - Child";
                    setChildEffectValues(eff);
                    pseudoEffectApplied = true;
                } else {
                    // FFX didn't create a valid effect - clean up ANY new effects it may have added
                    if (eff) {
                        eff.remove();
                        eff = null;
                    }
                    // Also remove any other effects that appeared (applyPreset can be unpredictable)
                    for (var j = effects.numProperties; j > effectCountBefore; j--) {
                        try { effects.property(j).remove(); } catch (e3) {}
                    }
                }
            } catch (e) {}
        }
    }

    // APPROACH 2: Try addProperty (uses PresetEffects.xml directly)
    if (!pseudoEffectApplied) {
        try {
            eff = effects.addProperty("Pseudo/ParentRigChild");
            if (eff && eff.numProperties >= 24) {
                eff.name = "Parent Rig - Child";
                setChildEffectValues(eff);
                pseudoEffectApplied = true;
            } else if (eff) {
                eff.remove();
                eff = null;
            }
        } catch (e) {}
    }

    // Fallback: Use individual slider controls
    if (!pseudoEffectApplied) {
        var indexSlider = effects.addProperty("ADBE Slider Control");
        indexSlider.name = "PR_Index";
        indexSlider.property("Slider").setValue(index);

        var influence = effects.addProperty("ADBE Slider Control");
        influence.name = "PR_Influence";
        influence.property("Slider").setValue(100);

        var parentIdx = effects.addProperty("ADBE Slider Control");
        parentIdx.name = "PR_Parent Layer";
        parentIdx.property("Slider").setValue(parentLayerIndex);

        var restPosX = effects.addProperty("ADBE Slider Control");
        restPosX.name = "PR_Rest Pos X";
        restPosX.property("Slider").setValue(childPos[0]);

        var restPosY = effects.addProperty("ADBE Slider Control");
        restPosY.name = "PR_Rest Pos Y";
        restPosY.property("Slider").setValue(childPos[1]);

        if (childPos.length > 2) {
            var restPosZ = effects.addProperty("ADBE Slider Control");
            restPosZ.name = "PR_Rest Pos Z";
            restPosZ.property("Slider").setValue(childPos[2]);
        }

        var restScaleX = effects.addProperty("ADBE Slider Control");
        restScaleX.name = "PR_Rest Scale X";
        restScaleX.property("Slider").setValue(childScale[0]);

        var restScaleY = effects.addProperty("ADBE Slider Control");
        restScaleY.name = "PR_Rest Scale Y";
        restScaleY.property("Slider").setValue(childScale[1]);

        if (childScale.length > 2) {
            var restScaleZ = effects.addProperty("ADBE Slider Control");
            restScaleZ.name = "PR_Rest Scale Z";
            restScaleZ.property("Slider").setValue(childScale[2]);
        }

        var restRotation = effects.addProperty("ADBE Slider Control");
        restRotation.name = "PR_Rest Rotation";
        restRotation.property("Slider").setValue(childRot);

        if (is3D) {
            var restXRotation = effects.addProperty("ADBE Slider Control");
            restXRotation.name = "PR_Rest X Rotation";
            restXRotation.property("Slider").setValue(childXRot);

            var restYRotation = effects.addProperty("ADBE Slider Control");
            restYRotation.name = "PR_Rest Y Rotation";
            restYRotation.property("Slider").setValue(childYRot);
        }

        var restOpacity = effects.addProperty("ADBE Slider Control");
        restOpacity.name = "PR_Rest Opacity";
        restOpacity.property("Slider").setValue(childOpacity);

        var restAnchorX = effects.addProperty("ADBE Slider Control");
        restAnchorX.name = "PR_Rest Anchor X";
        restAnchorX.property("Slider").setValue(childAnchor[0]);

        var restAnchorY = effects.addProperty("ADBE Slider Control");
        restAnchorY.name = "PR_Rest Anchor Y";
        restAnchorY.property("Slider").setValue(childAnchor[1]);

        if (childAnchor.length > 2) {
            var restAnchorZ = effects.addProperty("ADBE Slider Control");
            restAnchorZ.name = "PR_Rest Anchor Z";
            restAnchorZ.property("Slider").setValue(childAnchor[2]);
        }

        var parentPosX = effects.addProperty("ADBE Slider Control");
        parentPosX.name = "PR_Parent Rest Pos X";
        parentPosX.property("Slider").setValue(parentPos[0]);

        var parentPosY = effects.addProperty("ADBE Slider Control");
        parentPosY.name = "PR_Parent Rest Pos Y";
        parentPosY.property("Slider").setValue(parentPos[1]);

        if (parentPos.length > 2) {
            var parentPosZ = effects.addProperty("ADBE Slider Control");
            parentPosZ.name = "PR_Parent Rest Pos Z";
            parentPosZ.property("Slider").setValue(parentPos[2]);
        }

        var parentScaleX = effects.addProperty("ADBE Slider Control");
        parentScaleX.name = "PR_Parent Rest Scale X";
        parentScaleX.property("Slider").setValue(parentScale[0]);

        var parentScaleY = effects.addProperty("ADBE Slider Control");
        parentScaleY.name = "PR_Parent Rest Scale Y";
        parentScaleY.property("Slider").setValue(parentScale[1]);

        if (is3D) {
            var parentScaleZ = effects.addProperty("ADBE Slider Control");
            parentScaleZ.name = "PR_Parent Rest Scale Z";
            parentScaleZ.property("Slider").setValue(parentScale.length > 2 ? parentScale[2] : 100);
        }

        var parentRotation = effects.addProperty("ADBE Slider Control");
        parentRotation.name = "PR_Parent Rest Rotation";
        parentRotation.property("Slider").setValue(parentRot);

        if (is3D) {
            var parentXRotation = effects.addProperty("ADBE Slider Control");
            parentXRotation.name = "PR_Parent Rest X Rotation";
            parentXRotation.property("Slider").setValue(parentXRot);

            var parentYRotation = effects.addProperty("ADBE Slider Control");
            parentYRotation.name = "PR_Parent Rest Y Rotation";
            parentYRotation.property("Slider").setValue(parentYRot);
        }

        var parentOpacitySlider = effects.addProperty("ADBE Slider Control");
        parentOpacitySlider.name = "PR_Parent Rest Opacity";
        parentOpacitySlider.property("Slider").setValue(parentOpacity);

        var parentAnchorX = effects.addProperty("ADBE Slider Control");
        parentAnchorX.name = "PR_Parent Rest Anchor X";
        parentAnchorX.property("Slider").setValue(parentAnchor[0]);

        var parentAnchorY = effects.addProperty("ADBE Slider Control");
        parentAnchorY.name = "PR_Parent Rest Anchor Y";
        parentAnchorY.property("Slider").setValue(parentAnchor[1]);

        if (parentAnchor.length > 2) {
            var parentAnchorZ = effects.addProperty("ADBE Slider Control");
            parentAnchorZ.name = "PR_Parent Rest Anchor Z";
            parentAnchorZ.property("Slider").setValue(parentAnchor[2]);
        }
    }
}

// ============================================
// AFFECTOR
// ============================================

function addAffector() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return "error";
    }

    // Check if affector already exists
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === "Parent Rig Affector") {
            alert("An affector already exists in this composition.");
            return "exists";
        }
    }

    app.beginUndoGroup("Add Parent Rig Affector");

    try {
        // Create shape layer
        var affector = comp.layers.addShape();
        affector.name = "Parent Rig Affector";
        affector.guideLayer = true;

        var contents = affector.property("ADBE Root Vectors Group");

        // Outer ellipse group
        var outerGroup = contents.addProperty("ADBE Vector Group");
        outerGroup.name = "Outer";
        var outerVectors = outerGroup.property("ADBE Vectors Group");
        var outerEllipse = outerVectors.addProperty("ADBE Vector Shape - Ellipse");
        var outerSize = outerEllipse.property("ADBE Vector Ellipse Size");
        outerSize.setValue([400, 400]);
        var outerStroke = outerVectors.addProperty("ADBE Vector Graphic - Stroke");
        outerStroke.property("ADBE Vector Stroke Color").setValue([1, 0.5, 0, 1]); // Orange
        outerStroke.property("ADBE Vector Stroke Width").setValue(3);

        // Inner ellipse group
        var innerGroup = contents.addProperty("ADBE Vector Group");
        innerGroup.name = "Inner";
        var innerVectors = innerGroup.property("ADBE Vectors Group");
        var innerEllipse = innerVectors.addProperty("ADBE Vector Shape - Ellipse");
        var innerSize = innerEllipse.property("ADBE Vector Ellipse Size");
        innerSize.setValue([100, 100]);
        var innerStroke = innerVectors.addProperty("ADBE Vector Graphic - Stroke");
        innerStroke.property("ADBE Vector Stroke Color").setValue([1, 0.7, 0.3, 1]); // Lighter orange
        innerStroke.property("ADBE Vector Stroke Width").setValue(2);

        // Position at center of comp
        affector.transform.position.setValue([comp.width / 2, comp.height / 2]);

        // Add effects
        var effects = affector.property("ADBE Effect Parade");

        // Influence (at top for easy animation - use to fake inertia)
        var influenceCtrl = effects.addProperty("ADBE Slider Control");
        influenceCtrl.name = "Influence";
        influenceCtrl.property("Slider").setValue(100);

        // Falloff with keyframes (100 at frame 0, 0 at frame 60)
        var falloff = effects.addProperty("ADBE Slider Control");
        falloff.name = "Falloff";
        var falloffSlider = falloff.property("Slider");
        falloffSlider.setValueAtTime(0, 100);
        falloffSlider.setValueAtTime(60 * comp.frameDuration, 0);

        // Radius controls
        var outerRadius = effects.addProperty("ADBE Slider Control");
        outerRadius.name = "Outer Radius";
        outerRadius.property("Slider").setValue(200);

        var innerRadius = effects.addProperty("ADBE Slider Control");
        innerRadius.name = "Inner Radius";
        innerRadius.property("Slider").setValue(0);

        // Scale (100 = no change, 150 = 150% scale)
        var scaleCtrl = effects.addProperty("ADBE Slider Control");
        scaleCtrl.name = "Scale";
        scaleCtrl.property("Slider").setValue(100);

        // Opacity (100 = no change, 50 = 50% opacity)
        var opacityCtrl = effects.addProperty("ADBE Slider Control");
        opacityCtrl.name = "Opacity";
        opacityCtrl.property("Slider").setValue(100);

        // Rotation (degrees added to rotation)
        var rotCtrl = effects.addProperty("ADBE Slider Control");
        rotCtrl.name = "Rotation";
        rotCtrl.property("Slider").setValue(0);

        // Position offsets
        var posX = effects.addProperty("ADBE Slider Control");
        posX.name = "Position X";
        posX.property("Slider").setValue(0);

        var posY = effects.addProperty("ADBE Slider Control");
        posY.name = "Position Y";
        posY.property("Slider").setValue(0);

        var posZ = effects.addProperty("ADBE Slider Control");
        posZ.name = "Position Z";
        posZ.property("Slider").setValue(0);

        // Auto-detect item size from existing Parent Rig children
        var detectedItemSize = 400;  // Default fallback
        try {
            var childPositions = [];
            for (var ci = 1; ci <= comp.numLayers; ci++) {
                var layer = comp.layer(ci);
                var layerEffects = layer.property("ADBE Effect Parade");
                if (layerEffects) {
                    for (var ei = 1; ei <= layerEffects.numProperties; ei++) {
                        var eff = layerEffects.property(ei);
                        if (eff && (eff.matchName === "Pseudo/ParentRigChild" || eff.name === "Parent Rig - Child")) {
                            var pos = layer.transform.position.value;
                            childPositions.push({x: pos[0], y: pos[1]});
                            break;
                        }
                    }
                }
            }
            if (childPositions.length >= 2) {
                // Sort by X to check horizontal layout
                childPositions.sort(function(a, b) { return a.x - b.x; });
                var xSpacings = [];
                for (var si = 1; si < childPositions.length; si++) {
                    xSpacings.push(Math.abs(childPositions[si].x - childPositions[si-1].x));
                }
                // Sort by Y to check vertical layout
                childPositions.sort(function(a, b) { return a.y - b.y; });
                var ySpacings = [];
                for (var si = 1; si < childPositions.length; si++) {
                    ySpacings.push(Math.abs(childPositions[si].y - childPositions[si-1].y));
                }
                // Use whichever has larger average spacing (that's the layout direction)
                var avgX = xSpacings.length > 0 ? xSpacings.reduce(function(a,b){return a+b;},0) / xSpacings.length : 0;
                var avgY = ySpacings.length > 0 ? ySpacings.reduce(function(a,b){return a+b;},0) / ySpacings.length : 0;
                detectedItemSize = Math.round(Math.max(avgX, avgY));
                if (detectedItemSize < 10) detectedItemSize = 400;  // Sanity check
            }
        } catch (detectErr) {
            // Fall back to default if detection fails
            detectedItemSize = 400;
        }

        // Item Size (width/height of items - auto-detected or set manually)
        var itemSize = effects.addProperty("ADBE Slider Control");
        itemSize.name = "Item Size";
        itemSize.property("Slider").setValue(detectedItemSize);

        // Affector Gap (adjusts gaps in the affector zone)
        var affectorGap = effects.addProperty("ADBE Slider Control");
        affectorGap.name = "Affector Gap";
        affectorGap.property("Slider").setValue(0);

        // Affector Gap Falloff (multiply gaps at center, 100 = no change)
        var gapFalloff = effects.addProperty("ADBE Slider Control");
        gapFalloff.name = "Affector Gap Falloff";
        gapFalloff.property("Slider").setValue(100);

        // Global Gap (adjusts gaps between ALL items uniformly)
        var globalGap = effects.addProperty("ADBE Slider Control");
        globalGap.name = "Global Gap";
        globalGap.property("Slider").setValue(0);

        // Find parent layer to position affector just above it in timeline
        // (lower index = higher in timeline, so we want affector index = parentIndex - 1)
        var parentLayer = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.name === affector.name) continue; // Skip the affector itself
            if (layer.name === "Carousel Parent" || layer.name === "List Parent" || layer.name === "Grid Parent" ||
                hasEffect(layer, "Parent Rig - Parent") || hasEffect(layer, "PR_Delay")) {
                parentLayer = layer;
                break;
            }
        }

        if (parentLayer) {
            // Move affector just above (before) the parent layer in timeline
            affector.moveBefore(parentLayer);
        } else {
            // No parent found, move to top
            affector.moveToBeginning();
        }

        // Link ellipse sizes to sliders via expressions (access fresh references)
        var outerSizeExpr = affector.property("ADBE Root Vectors Group").property("Outer").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        var innerSizeExpr = affector.property("ADBE Root Vectors Group").property("Inner").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        outerSizeExpr.expression = 'var r = effect("Outer Radius")("Slider"); [r*2, r*2];';
        innerSizeExpr.expression = 'var r = effect("Inner Radius")("Slider"); [r*2, r*2];';

        // Set outer radius to half of the smaller comp dimension (access fresh reference)
        var affectorSize = Math.min(comp.width, comp.height) / 2;
        affector.effect("Outer Radius")("Slider").setValue(affectorSize);

        // Update existing rigged children to include affector code
        updateExistingRigsWithAffector(comp);

    } catch (e) {
        alert("Error creating affector: " + e.toString());
        app.endUndoGroup();
        return "error";
    }

    app.endUndoGroup();
    return "success";
}

// Re-apply expressions to existing rigged children so they include affector code
function updateExistingRigsWithAffector(comp) {
    // Find parent layer (has Parent Rig - Parent effect)
    var parent = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        if (hasEffect(layer, "Parent Rig - Parent") || hasEffect(layer, "PR_Delay")) {
            parent = layer;
            break;
        }
    }

    if (!parent) return; // No rig found

    // Ensure parent effect has correct name for expression access
    try {
        var parentEffects = parent.property("ADBE Effect Parade");
        for (var pe = 1; pe <= parentEffects.numProperties; pe++) {
            var eff = parentEffects.property(pe);
            if (eff.matchName === "Pseudo/ParentRigParent") {
                eff.name = "Parent Rig - Parent";
                break;
            }
        }
    } catch (e) {}

    // Find all children (have Parent Rig - Child effect) and ensure effect names are correct
    var children = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        if (layer.index !== parent.index && hasEffect(layer, "Parent Rig - Child")) {
            // Ensure child effect has correct name for expression access
            try {
                var layerEffects = layer.property("ADBE Effect Parade");
                for (var ce = 1; ce <= layerEffects.numProperties; ce++) {
                    var eff = layerEffects.property(ce);
                    if (eff.matchName === "Pseudo/ParentRigChild") {
                        eff.name = "Parent Rig - Child";
                        break;
                    }
                }
            } catch (e) {}
            children.push(layer);
        }
    }

    if (children.length === 0) return;

    // Calculate group bounds from children's rest positions
    var groupBounds = {
        minX: Infinity, maxX: -Infinity,
        minY: Infinity, maxY: -Infinity,
        centerX: 0, centerY: 0
    };

    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var restX = 0, restY = 0;

        // Get rest position from child effect
        try {
            var childEff = child.effect("Parent Rig - Child");
            if (childEff) {
                restX = childEff.property(3).value; // Rest Pos X
                restY = childEff.property(4).value; // Rest Pos Y
            }
        } catch (e) {}

        if (restX < groupBounds.minX) groupBounds.minX = restX;
        if (restX > groupBounds.maxX) groupBounds.maxX = restX;
        if (restY < groupBounds.minY) groupBounds.minY = restY;
        if (restY > groupBounds.maxY) groupBounds.maxY = restY;
    }

    groupBounds.centerX = (groupBounds.minX + groupBounds.maxX) / 2;
    groupBounds.centerY = (groupBounds.minY + groupBounds.maxY) / 2;

    // Re-apply expressions to each child, using stored rest positions
    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var is3D = child.threeDLayer;
        var splitDims = false;

        // Check for split dimensions
        try {
            var xPos = child.property("ADBE Transform Group").property("ADBE Position_0");
            splitDims = (xPos !== null && xPos.canSetExpression);
        } catch (e) {}

        // Get child rest position from stored effect values (NOT current position)
        var childRestPos;
        try {
            var childEff = child.effect("Parent Rig - Child");
            if (childEff) {
                childRestPos = [
                    childEff.property(3).value,  // Rest Pos X
                    childEff.property(4).value   // Rest Pos Y
                ];
                if (is3D) childRestPos.push(childEff.property(5).value);  // Rest Pos Z
            }
        } catch (e) {
            childRestPos = [0, 0];
        }

        // Detect which properties currently have expressions (preserve user's follow options)
        var followOptions = {
            position: false,
            scale: false,
            rotation: false,
            opacity: false,
            anchor: false
        };
        try {
            // Check if position has expression (handle split dimensions)
            if (splitDims) {
                var xPos = child.property("ADBE Transform Group").property("ADBE Position_0");
                followOptions.position = xPos && xPos.expression && xPos.expression.length > 0;
            } else {
                followOptions.position = child.transform.position.expression && child.transform.position.expression.length > 0;
            }
            followOptions.scale = child.transform.scale.expression && child.transform.scale.expression.length > 0;
            followOptions.rotation = child.transform.rotation.expression && child.transform.rotation.expression.length > 0;
            followOptions.opacity = child.transform.opacity.expression && child.transform.opacity.expression.length > 0;
            followOptions.anchor = child.transform.anchorPoint.expression && child.transform.anchorPoint.expression.length > 0;
        } catch (e) {}

        // Re-apply expressions with stored rest position, preserving original follow options
        applyExpressions(child, parent, comp, is3D, splitDims, groupBounds, childRestPos, followOptions);
    }
}


// ============================================
// EXPRESSION GENERATION
// ============================================

function applyExpressions(child, parent, comp, is3D, splitDims, groupBounds, existingRestPos, followOptions) {
    // Default followOptions if not provided (all enabled for backward compatibility)
    if (!followOptions) {
        followOptions = { position: true, scale: true, rotation: true, opacity: true, anchor: true };
    }

    // Default groupBounds if not provided (for update operations)
    if (!groupBounds) {
        groupBounds = { minX: 0, maxX: 1920, minY: 0, maxY: 1080, centerX: 960, centerY: 540 };
    }

    // Validate inputs with detailed error catching
    var parentNameEscaped, childName;
    try {
        if (parent === null || parent === undefined) {
            throw new Error("parent is null/undefined");
        }
        if (child === null || child === undefined) {
            throw new Error("child is null/undefined");
        }
        parentNameEscaped = String(parent.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        childName = String(child.name);
        if (!parentNameEscaped) {
            throw new Error("parent has empty name");
        }
    } catch (validationErr) {
        throw new Error("applyExpressions validation failed: " + validationErr.toString());
    }

    // Get child's rest position - use provided value if available (for re-rigging),
    // otherwise read current position (for initial rigging)
    var childRestPos;
    try {
        if (existingRestPos) {
            childRestPos = existingRestPos;
        } else if (splitDims && child.transform.xPosition) {
            childRestPos = [
                child.transform.xPosition.value,
                child.transform.yPosition.value
            ];
            if (is3D && child.transform.zPosition) {
                childRestPos.push(child.transform.zPosition.value);
            }
        } else {
            childRestPos = child.transform.position.value;
        }
    } catch (restPosErr) {
        // Fallback to standard position
        try {
            childRestPos = child.transform.position.value;
        } catch (e2) {
            childRestPos = [0, 0, 0];
        }
    }

    // Common expression header - supports both pseudo effect and slider fallback
    // Detect which effect type is on the parent (check by matchName since name may be empty)
    var usePseudoEffect = false;
    try {
        var parentEffects = parent.property("ADBE Effect Parade");
        if (parentEffects && parentEffects.numProperties > 0) {
            for (var pe = 1; pe <= parentEffects.numProperties; pe++) {
                var eff = parentEffects.property(pe);
                if (eff && eff.matchName === "Pseudo/ParentRigParent") {
                    usePseudoEffect = true;
                    break;
                }
            }
        }
    } catch (e) {}

    var header = [];

    // Debug: verify parentNameEscaped is valid before building header
    if (parentNameEscaped === null || parentNameEscaped === undefined) {
        throw new Error("parentNameEscaped is null before header creation");
    }

    if (usePseudoEffect) {
        header.push('// Parent Rig Expression (Pseudo Effect Mode)');
        header.push('var parentLayer = thisComp.layer("' + parentNameEscaped + '");');
        header.push('var pEff = parentLayer.effect("Parent Rig - Parent");');
        header.push('');
        header.push('// Child effect - access by name (set in addChildEffect)');
        header.push('var cEff = null;');
        header.push('try { cEff = thisLayer.effect("Parent Rig - Child"); } catch(e) {}');
        header.push('// Property index map for child pseudo effect (names may be empty due to localization)');
        header.push('var cpIdx = {');
        header.push('    "Index": 1, "Influence": 2,');
        header.push('    "Rest Pos X": 3, "Rest Pos Y": 4, "Rest Pos Z": 5,');
        header.push('    "Rest Scale X": 6, "Rest Scale Y": 7, "Rest Scale Z": 8,');
        header.push('    "Rest Rotation": 9, "Rest Opacity": 10,');
        header.push('    "Rest Anchor X": 11, "Rest Anchor Y": 12, "Rest Anchor Z": 13,');
        header.push('    "Parent Rest Pos X": 14, "Parent Rest Pos Y": 15, "Parent Rest Pos Z": 16,');
        header.push('    "Parent Rest Scale X": 17, "Parent Rest Scale Y": 18, "Parent Rest Scale Z": 19,');
        header.push('    "Parent Rest Rotation": 20, "Parent Rest Opacity": 21,');
        header.push('    "Parent Rest Anchor X": 22, "Parent Rest Anchor Y": 23, "Parent Rest Anchor Z": 24');
        header.push('};');
        header.push('function cp(name) {');
        header.push('    if (cEff && cpIdx[name]) { try { return cEff(cpIdx[name]).value; } catch(e) {} }');
        header.push('    try { return effect("PR_" + name)("Slider").value; } catch(e) {}');
        header.push('    return 0;');
        header.push('}');
        header.push('');
        header.push('// Get rig parameters from child effect');
        header.push('var myIndex = cp("Index") || 1;');
        header.push('var childInfluence = (cp("Influence") || 100) / 100;');
        header.push('');
        header.push('// Delay section (indices 3-6)');
        header.push('var delayProp = pEff(3);');
        header.push('var stretchProp = pEff(4);');
        header.push('var parentInfluenceProp = pEff(5);');
        header.push('var delayFalloffProp = pEff(6);');
        header.push('');
        header.push('// Order section (indices 13-15)');
        header.push('var orderByProp = pEff(13);');
        header.push('var reverseOrderProp = pEff(14);');
        header.push('var randomSeed = pEff(15).value;');
        header.push('');
        header.push('// Leader layer section (indices 20-22)');
        header.push('var leaderIndexProp = pEff(20);');
        header.push('var delayBeforeLeaderProp = pEff(21);');
        header.push('var delayAfterLeaderProp = pEff(22);');
        header.push('');
        header.push('// Transform type popups (indices 27-28): 1=Child, 2=Parent, 3=Leader');
        header.push('var scaleAroundMode = 1; try { scaleAroundMode = pEff(27).value; } catch(e) {}');
        header.push('var rotateAroundMode = 1; try { rotateAroundMode = pEff(28).value; } catch(e) {}');
        header.push('// Convert to number to ensure proper comparison');
        header.push('scaleAroundMode = Number(scaleAroundMode) || 1;');
        header.push('rotateAroundMode = Number(rotateAroundMode) || 1;');
        header.push('');
        header.push('// Pinning section (indices 32-51)');
        header.push('var pinDirectionProp = pEff(32);');
        header.push('var pinInfluenceProp = pEff(33);');
        header.push('var pinStretchProp = pEff(34);');
        header.push('var pinTrimProp = pEff(35);');
        header.push('var pinTopEnabled = pEff(38).value;');
        header.push('var pinTopY = pEff(39).value;');
        header.push('var pinBottomEnabled = pEff(42).value;');
        header.push('var pinBottomY = pEff(43).value;');
        header.push('var pinLeftEnabled = pEff(46).value;');
        header.push('var pinLeftX = pEff(47).value;');
        header.push('var pinRightEnabled = pEff(50).value;');
        header.push('var pinRightX = pEff(51).value;');
        // Continue with rest of header (functions and bounds) as array concat
        header = header.concat([
            '',
            '// Find leader layer by searching for the child with matching Index',
            'function findLeaderLayer() {',
            '    var leaderIdx = Math.round(leaderIndexProp.valueAtTime(time));',
            '    for (var i = 1; i <= thisComp.numLayers; i++) {',
            '        try {',
            '            var layer = thisComp.layer(i);',
            '            // Try child pseudo effect by name',
            '            try {',
            '                var childEff = layer.effect("Parent Rig - Child");',
            '                if (childEff && Math.round(childEff("Index").value) === leaderIdx) return layer;',
            '            } catch(e) {}',
            '            // Fallback to old slider',
            '            var indexEff = layer.effect("PR_Index");',
            '            if (indexEff && Math.round(indexEff("Slider").value) === leaderIdx) return layer;',
            '        } catch(e) {}',
            '    }',
            '    return null;',
            '}',
            '',
            '// Children follow (indices 56-60)',
            'var followPosition = pEff(56).value;',
            'var followScale = pEff(57).value;',
            'var followRotation = pEff(58).value;',
            'var followOpacity = pEff(59).value;',
            'var followAnchorPoint = pEff(60).value;',
            '',
            '// Delays apply to (indices 65-69)',
            'var delayPosition = pEff(65).value;',
            'var delayScale = pEff(66).value;',
            'var delayRotation = pEff(67).value;',
            'var delayOpacity = pEff(68).value;',
            'var delayAnchorPoint = pEff(69).value;',
            '',
            '// Flag for whether delays apply to current transform (set per-expression)',
            'var applyDelayToThisTransform = true;',
            '',
            '// Child count (index 71)',
            'var childCount = pEff(71).value;',
            '',
            '// Group bounds for position-based ordering (calculated at rig time)',
            'var groupMinX = ' + groupBounds.minX + ';',
            'var groupMaxX = ' + groupBounds.maxX + ';',
            'var groupMinY = ' + groupBounds.minY + ';',
            'var groupMaxY = ' + groupBounds.maxY + ';',
            'var groupCenterX = ' + groupBounds.centerX + ';',
            'var groupCenterY = ' + groupBounds.centerY + ';',
            '',
            '// Child rest position for position-based ordering (captured at rig time)',
            'var childRestPosForOrder = [' + childRestPos[0] + ', ' + childRestPos[1] + '];',
            '',
            '// Seeded random function for consistent randomization',
            'function seededRandom(seed, index) {',
            '    var hash = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;',
            '    return hash - Math.floor(hash);',
            '}',
            '',
            '// Get randomized index',
            'function getRandomizedIndex(baseIndex, seed, count) {',
            '    var rand = seededRandom(seed, baseIndex);',
            '    return 1 + rand * (count - 1);',
            '}',
            '',
            '// Get position-based index for Order by modes',
            '// Order by values: 1=Leader, 3=TopToBottom, 4=BottomToTop, 5=LeftToRight, 6=RightToLeft,',
            '//   8=TLtoBR, 9=TRtoBL, 10=BLtoTR, 11=BRtoTL, 13=RadialOut, 14=RadialIn, 16=Random',
            'function getPositionBasedIndex(mode, pos, count) {',
            '    var rangeX = groupMaxX - groupMinX;',
            '    var rangeY = groupMaxY - groupMinY;',
            '    if (rangeX < 1) rangeX = 1;',
            '    if (rangeY < 1) rangeY = 1;',
            '    var normX = (pos[0] - groupMinX) / rangeX;',
            '    var normY = (pos[1] - groupMinY) / rangeY;',
            '    var normalized;',
            '    ',
            '    if (mode === 3) { normalized = 1 - normY; }',  // Top to Bottom: top (low Y) → high normalized → low index → first
            '    else if (mode === 4) { normalized = normY; }',  // Bottom to Top: bottom (high Y) → high normalized → low index → first
            '    else if (mode === 5) { normalized = 1 - normX; }',  // Left to Right: left (low X) → high normalized → low index → first
            '    else if (mode === 6) { normalized = normX; }',  // Right to Left: right (high X) → high normalized → low index → first
            '    else if (mode === 8) { normalized = (1 - normX + 1 - normY) / 2; }',  // TL to BR: TL → high → first
            '    else if (mode === 9) { normalized = (normX + 1 - normY) / 2; }',  // TR to BL: TR → high → first
            '    else if (mode === 10) { normalized = (1 - normX + normY) / 2; }',  // BL to TR: BL → high → first
            '    else if (mode === 11) { normalized = (normX + normY) / 2; }',  // BR to TL: BR → high → first
            '    else if (mode === 13) {',  // Radial outwards: center first
            '        var dx = pos[0] - groupCenterX;',
            '        var dy = pos[1] - groupCenterY;',
            '        var maxDist = Math.sqrt(rangeX*rangeX + rangeY*rangeY) / 2;',
            '        var distNorm = Math.min(1, Math.sqrt(dx*dx + dy*dy) / Math.max(maxDist, 1));',
            '        normalized = 1 - distNorm;',  // center (dist=0) → normalized=1 → low index → first
            '    }',
            '    else if (mode === 14) {',  // Radial inwards: edges first
            '        var dx = pos[0] - groupCenterX;',
            '        var dy = pos[1] - groupCenterY;',
            '        var maxDist = Math.sqrt(rangeX*rangeX + rangeY*rangeY) / 2;',
            '        var distNorm = Math.min(1, Math.sqrt(dx*dx + dy*dy) / Math.max(maxDist, 1));',
            '        normalized = distNorm;',  // edge (dist=max) → normalized=1 → low index → first
            '    }',
            '    else { normalized = 0; }',
            '    ',
            '    // High normalized → low index → animate FIRST',
            '    return count - Math.max(0, Math.min(1, normalized)) * (count - 1);',
            '}',
            '',
            '// Get base index based on Order by mode',
            'var orderByMode = orderByProp.value;',
            'var baseIndex;',
            'if (orderByMode === 1) {',
            '    baseIndex = myIndex;',  // Leader mode - use stack order
            '} else if (orderByMode === 16) {',
            '    baseIndex = getRandomizedIndex(myIndex, randomSeed, childCount);',  // Random
            '} else if (orderByMode >= 3 && orderByMode <= 14) {',
            '    baseIndex = getPositionBasedIndex(orderByMode, childRestPosForOrder, childCount);',  // Position-based
            '} else {',
            '    baseIndex = myIndex;',  // Default/separator
            '}',
            '',
            '// For reverse order calculation',
            'var reversedIndex = childCount + 1 - baseIndex;',
            '',
            '// Calculate effective index with delay falloff (geometric series)',
            '// Falloff range: -100 to 100, where 0 = no effect',
            '// Positive values: delays compress toward first layers',
            '// Negative values: delays compress toward last layers',
            'function getEffectiveIndex(baseIdx, falloff) {',
            '    if (Math.abs(falloff) < 0.01) return baseIdx;',  // 0 = no falloff
            '    // Convert -100..100 to a ratio where higher abs = more compression',
            '    // Use 0.99 as max to avoid division issues at exactly 1',
            '    var r = 1 - Math.abs(falloff) / 100 * 0.99;',
            '    if (falloff < 0) {',
            '        // Negative: reverse the index before applying falloff, then reverse back',
            '        var reversedIdx = childCount + 1 - baseIdx;',
            '        var effectiveReversed = (1 - Math.pow(r, reversedIdx)) / (1 - r);',
            '        return childCount + 1 - effectiveReversed;',
            '    }',
            '    return (1 - Math.pow(r, baseIdx)) / (1 - r);',
            '}',
            '',
            '// Pin Edges System - boundary-based pinning',
            '// Returns {active: bool, offsetX: number, offsetY: number, influence: number}',
            'function getPinEdgeState(t, parentRestPos) {',
            '    var result = {active: false, offsetX: 0, offsetY: 0, influence: 1};',
            '    ',
            '    // Check if any pin edge is enabled',
            '    if (!pinTopEnabled && !pinBottomEnabled && !pinLeftEnabled && !pinRightEnabled) {',
            '        return result;',
            '    }',
            '    ',
            '    var pinDirection = pinDirectionProp.valueAtTime(t);',  // 1=Overscroll stretch, 2=Collision squish
            '    var pinStrength = pinInfluenceProp.valueAtTime(t) / 100;',
            '    var pinStretch = pinStretchProp.valueAtTime(t) / 100;',
            '    var trim = Math.round(pinTrimProp.valueAtTime(t));',
            '    ',
            '    // Calculate parent delta (how much parent moved from rest)',
            '    var posProp = parentLayer.transform.position;',
            '    var parentPos = posProp.valueAtTime(t);',
            '    var parentDeltaX = parentPos[0] - parentRestPos[0];',
            '    var parentDeltaY = parentPos[1] - parentRestPos[1];',
            '    ',
            '    // Calculate where pinned layers would naturally be',
            '    // Top/Left pinned layer: index = childCount (first in list), rest pos = groupMin',
            '    // Bottom/Right pinned layer: index = 1 (last in list), rest pos = groupMax',
            '    var topLayerNaturalY = groupMinY + parentDeltaY;',
            '    var bottomLayerNaturalY = groupMaxY + parentDeltaY;',
            '    var leftLayerNaturalX = groupMinX + parentDeltaX;',
            '    var rightLayerNaturalX = groupMaxX + parentDeltaX;',
            '    ',
            '    // Determine which pin is active (check Y first, then X)',
            '    var activePinEdge = null;',  // "top", "bottom", "left", "right"
            '    var pinnedIdx = 0;',
            '    var offset = 0;',
            '    var isVertical = true;',
            '    ',
            '    // Overscroll stretch: pins when layer would go PAST boundary (naturalPos past boundary)',
            '    // Collision squish: pins when layer would go INTO boundary (naturalPos past boundary, opposite side)',
            '    ',
            '    if (pinTopEnabled) {',
            '        // Top pin: pinned layer is at groupMinY (myIndex=1, first in sorted list)',
            '        // Overscroll: active when topLayerNaturalY > pinTopY (pulled below boundary, stretched)',
            '        // Collision: active when topLayerNaturalY < pinTopY (pushed above boundary, squished)',
            '        var topActive = (pinDirection === 1) ? (topLayerNaturalY > pinTopY) : (topLayerNaturalY < pinTopY);',
            '        if (topActive) {',
            '            activePinEdge = "top";',
            '            pinnedIdx = 1;',
            '            offset = pinTopY - topLayerNaturalY;',
            '            isVertical = true;',
            '        }',
            '    }',
            '    ',
            '    if (!activePinEdge && pinBottomEnabled) {',
            '        // Bottom pin: pinned layer is at groupMaxY (myIndex=childCount, last in sorted list)',
            '        // Overscroll: active when bottomLayerNaturalY < pinBottomY (pulled above boundary)',
            '        // Collision: active when bottomLayerNaturalY > pinBottomY (pushed below boundary)',
            '        var bottomActive = (pinDirection === 1) ? (bottomLayerNaturalY < pinBottomY) : (bottomLayerNaturalY > pinBottomY);',
            '        if (bottomActive) {',
            '            activePinEdge = "bottom";',
            '            pinnedIdx = childCount;',
            '            offset = pinBottomY - bottomLayerNaturalY;',
            '            isVertical = true;',
            '        }',
            '    }',
            '    ',
            '    if (!activePinEdge && pinLeftEnabled) {',
            '        // Left pin: pinned layer is at groupMinX (myIndex=1, first in sorted list)',
            '        var leftActive = (pinDirection === 1) ? (leftLayerNaturalX > pinLeftX) : (leftLayerNaturalX < pinLeftX);',
            '        if (leftActive) {',
            '            activePinEdge = "left";',
            '            pinnedIdx = 1;',
            '            offset = pinLeftX - leftLayerNaturalX;',
            '            isVertical = false;',
            '        }',
            '    }',
            '    ',
            '    if (!activePinEdge && pinRightEnabled) {',
            '        // Right pin: pinned layer is at groupMaxX (myIndex=childCount, last in sorted list)',
            '        var rightActive = (pinDirection === 1) ? (rightLayerNaturalX < pinRightX) : (rightLayerNaturalX > pinRightX);',
            '        if (rightActive) {',
            '            activePinEdge = "right";',
            '            pinnedIdx = childCount;',
            '            offset = pinRightX - rightLayerNaturalX;',
            '            isVertical = false;',
            '        }',
            '    }',
            '    ',
            '    if (!activePinEdge) return result;',
            '    ',
            '    // Calculate influence for this layer based on distance from pinned layer',
            '    // Trim removes layers from the NON-pinned end',
            '    var trimEndIdx = (pinnedIdx === childCount) ? 1 + trim : childCount - trim;',
            '    ',
            '    // Check if this layer is beyond trim (no pin effect)',
            '    if (pinnedIdx === childCount && myIndex < trimEndIdx) return result;',
            '    if (pinnedIdx === 1 && myIndex > trimEndIdx) return result;',
            '    ',
            '    // Calculate influence gradient',
            '    var distFromPinned = Math.abs(myIndex - pinnedIdx);',
            '    var maxDist = Math.abs(trimEndIdx - pinnedIdx);',
            '    var normalizedDist = distFromPinned / Math.max(maxDist, 1);',
            '    ',
            '    // Gentle curve (power 0.7): bigger effect near pinned layer',
            '    var spacingGradient = Math.pow(normalizedDist, 0.7);',
            '    ',
            '    // Pin stretch controls how much layers spread apart from each other',
            '    // At 100%: full spread (layers space out naturally)',
            '    // At 0%: no spread (all layers clump together)',
            '    var spreadAmount = spacingGradient * pinStretch;',
            '    ',
            '    // Pin influence controls how firmly the whole group stays at the boundary',
            '    // At 100%: pinned layer stays exactly at boundary',
            '    // At 0%: no pinning effect (group moves freely past boundary)',
            '    var boundaryOffset = offset * pinStrength;',
            '    ',
            '    // Each layer gets: boundary offset minus its spread from the pinned layer',
            '    // spreadAmount=0 (pinned layer): gets full boundaryOffset',
            '    // spreadAmount=1 (furthest layer): gets no offset (follows parent normally)',
            '    var layerOffset = boundaryOffset * (1 - spreadAmount);',
            '    ',
            '    result.active = true;',
            '    result.influence = 1;',
            '    if (isVertical) {',
            '        result.offsetY = layerOffset;',
            '    } else {',
            '        result.offsetX = layerOffset;',
            '    }',
            '    ',
            '    return result;',
            '}',
            '',
            '// Legacy function for compatibility (returns 1 since pin is now handled in position calc)',
            'function getPinInfluenceMultiplier(t) { return 1; }',
            '',
            '// Function to get effective index at a specific time (for reverse order/falloff/leader)',
            'function getEffectiveIndexAtTime(t) {',
            '    var leaderIdx = Math.round(leaderIndexProp.valueAtTime(t));',
            '    var falloff = delayFalloffProp.valueAtTime(t);',
            '    var baseIdx;',
            '    ',
            '    if (leaderIdx <= 1) {',
            '        // Standard mode: use reverse order (blend from normal to reversed)',
            '        var roVal = reverseOrderProp.valueAtTime(t) / 100;',
            '        baseIdx = baseIndex + (reversedIndex - baseIndex) * roVal;',
            '    } else {',
            '        // Leader mode: calculate distance from leader (ignores randomization)',
            '        var beforeMult = delayBeforeLeaderProp.valueAtTime(t) / 100;',
            '        var afterMult = delayAfterLeaderProp.valueAtTime(t) / 100;',
            '        var distanceFromLeader = Math.abs(myIndex - leaderIdx);',
            '        if (myIndex < leaderIdx) {',
            '            baseIdx = distanceFromLeader * beforeMult;',
            '        } else if (myIndex > leaderIdx) {',
            '            baseIdx = distanceFromLeader * afterMult;',
            '        } else {',
            '            baseIdx = 0;',
            '        }',
            '    }',
            '    ',
            '    return getEffectiveIndex(baseIdx, falloff);',
            '}',
            '',
            '// Function to get delay/stretch at a specific time (returns 0 if delays disabled for this transform)',
            'function getDelayAtTime(t) {',
            '    if (!applyDelayToThisTransform) return 0;',
            '    return delayProp.valueAtTime(t) * getEffectiveIndexAtTime(t) * thisComp.frameDuration;',
            '}',
            'function getStretchAtTime(t) {',
            '    if (!applyDelayToThisTransform) return 0;',
            '    return stretchProp.valueAtTime(t) * getEffectiveIndexAtTime(t) * thisComp.frameDuration;',
            '}',
            '',
            '// ===== AFFECTOR SYSTEM =====',
            'var affector = null;',
            'try { affector = thisComp.layer("Parent Rig Affector"); } catch(e) {}',
            '',
            'function getAffectorOuterRadius() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Outer Radius")("Slider").value; } catch(e) { return 200; }',
            '}',
            '',
            'function getAffectorInnerRadius() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Inner Radius")("Slider").value; } catch(e) { return 0; }',
            '}',
            '',
            'function getGlobalInfluence() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Influence")("Slider").value; } catch(e) { return 100; }',
            '}',
            '',
            'function getAffectorInfluence(pos) {',
            '    if (!affector) return 0;',
            '    var globalInf = getGlobalInfluence() / 100;',
            '    if (globalInf <= 0) return 0;',
            '    var affectorPos = affector.transform.position.value;',
            '    var outerR = getAffectorOuterRadius();',
            '    var innerR = getAffectorInnerRadius();',
            '    if (outerR <= 0) return 0;',
            '    var dx = pos[0] - affectorPos[0];',
            '    var dy = pos[1] - affectorPos[1];',
            '    var dist = Math.sqrt(dx * dx + dy * dy);',
            '    if (dist <= innerR) return globalInf;',
            '    if (dist >= outerR) return 0;',
            '    var falloffRange = outerR - innerR;',
            '    var normalizedDist = (dist - innerR) / falloffRange;',
            '    try {',
            '        var falloffProp = affector.effect("Falloff")("Slider");',
            '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
            '        return (falloffVal / 100) * globalInf;',
            '    } catch(e) { return (1 - normalizedDist) * globalInf; }',
            '}',
            '',
            'function getAffectorItemSize() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Item Size")("Slider").value; } catch(e) { return 100; }',
            '}',
            '',
            'function getAffectorGap() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Affector Gap")("Slider").value; } catch(e) { return 0; }',
            '}',
            '',
            'function getAffectorGapFalloff() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Affector Gap Falloff")("Slider").value; } catch(e) { return 100; }',
            '}',
            '',
            'function getGlobalGap() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Global Gap")("Slider").value; } catch(e) { return 0; }',
            '}',
            '',
            '// Scale multiplier for spread calculation (uses raw spatial influence, no inertia)',
            'function getScaleMultAtPos(pos) {',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 1;',
            '    var scalePercent = 100;',
            '    try { scalePercent = affector.effect("Scale")("Slider").value; } catch(e) {}',
            '    return 1 + (scalePercent / 100 - 1) * influence;',
            '}',
            '',
            '// Integral of influence from 0 to x (for gap compensation)',
            '// Uses linear falloff: influence(d) = 1 - d/radius',
            '// Integral: x - x^2/(2*radius) for |x| <= radius',
            'function influenceIntegral(x, radius) {',
            '    if (radius <= 0) return 0;',
            '    var absX = Math.abs(x);',
            '    var sign = x >= 0 ? 1 : (x < 0 ? -1 : 0);',
            '    if (absX >= radius) {',
            '        // Outside radius: constant at max value',
            '        return sign * radius / 2;',
            '    }',
            '    // Inside radius: quadratic curve',
            '    return sign * (absX - absX * absX / (2 * radius));',
            '}',
            '',
            'function getAffectorSpread(parentedPos, restPos) {',
            '    // Spread using integral approach for smooth animation + perfect gaps',
            '    if (!affector) return [0, 0];',
            '    var affectorPos = affector.transform.position.value;',
            '    var itemSize = getAffectorItemSize();',
            '    var affectorGap = getAffectorGap();',
            '    var gapFalloff = getAffectorGapFalloff();',
            '    var globalGap = getGlobalGap();',
            '    var outerR = getAffectorOuterRadius();',
            '    var innerR = getAffectorInnerRadius();',
            '    if (itemSize <= 0) itemSize = 100;',
            '    ',
            '    // Effective radius for falloff (outer - inner)',
            '    var falloffRadius = outerR - innerR;',
            '    if (falloffRadius <= 0) falloffRadius = outerR;',
            '    ',
            '    // Distance from affector center',
            '    var dx = parentedPos[0] - affectorPos[0];',
            '    var dy = parentedPos[1] - affectorPos[1];',
            '    ',
            '    // Direction for global gap',
            '    var dirX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);',
            '    var dirY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);',
            '    ',
            '    // How many items away (for global gap)',
            '    var itemsAwayX = Math.abs(dx) / itemSize;',
            '    var itemsAwayY = Math.abs(dy) / itemSize;',
            '    ',
            '    // Adjust for inner radius (offset distance by innerR)',
            '    var distX = Math.abs(dx) > innerR ? (Math.abs(dx) - innerR) * (dx >= 0 ? 1 : -1) : 0;',
            '    var distY = Math.abs(dy) > innerR ? (Math.abs(dy) - innerR) * (dy >= 0 ? 1 : -1) : 0;',
            '    ',
            '    // Get max scale (at center)',
            '    var maxScalePercent = 100;',
            '    try { maxScalePercent = affector.effect("Scale")("Slider").value; } catch(e) {}',
            '    var growth = maxScalePercent / 100 - 1;',
            '    ',
            '    // Integral values for this position',
            '    var integralX = influenceIntegral(distX, falloffRadius);',
            '    var integralY = influenceIntegral(distY, falloffRadius);',
            '    var maxIntegral = falloffRadius / 2;',
            '    if (maxIntegral <= 0) maxIntegral = 1;',
            '    ',
            '    // Scale compensation: offset = growth * itemSize * normalized_integral',
            '    var compOffsetX = growth * itemSize * integralX / maxIntegral;',
            '    var compOffsetY = growth * itemSize * integralY / maxIntegral;',
            '    ',
            '    // Affector Gap: smooth transition using same integral',
            '    var affectorOffsetX = affectorGap * integralX / maxIntegral;',
            '    var affectorOffsetY = affectorGap * integralY / maxIntegral;',
            '    ',
            '    // Global Gap: affects ALL items based on distance (itemsAway)',
            '    // Direction flip at center is tiny since itemsAway approaches 0',
            '    var globalOffsetX = itemsAwayX * globalGap * dirX;',
            '    var globalOffsetY = itemsAwayY * globalGap * dirY;',
            '    ',
            '    // Combine offsets',
            '    var totalOffsetX = compOffsetX + affectorOffsetX + globalOffsetX;',
            '    var totalOffsetY = compOffsetY + affectorOffsetY + globalOffsetY;',
            '    ',
            '    // Apply Affector Gap Falloff (multiplies gaps based on influence)',
            '    var influence = getAffectorInfluence(parentedPos);',
            '    var gapFalloffMult = 1 + (gapFalloff / 100 - 1) * influence;',
            '    ',
            '    return [totalOffsetX * gapFalloffMult, totalOffsetY * gapFalloffMult];',
            '}',
            '',
            'function getAffectorPositionOffset(pos) {',
            '    if (!affector) return [0, 0, 0];',
            '    // Position uses spatial influence only (no inertia) for consistent layout',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return [0, 0, 0];',
            '    var px = 0, py = 0, pz = 0;',
            '    try { px = affector.effect("Position X")("Slider").value; } catch(e) {}',
            '    try { py = affector.effect("Position Y")("Slider").value; } catch(e) {}',
            '    try { pz = affector.effect("Position Z")("Slider").value; } catch(e) {}',
            '    if (px === 0 && py === 0 && pz === 0) return [0, 0, 0];',
            '    // Position offset is uniform (same direction for all items)',
            '    return [px * influence, py * influence, pz * influence];',
            '}',
            '',
            'function getAffectorScaleMult(pos) {',
            '    if (!affector) return 100;',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 100;',
            '    var amount = 100;',
            '    try { amount = affector.effect("Scale")("Slider").value; } catch(e) {}',
            '    // Interpolate from 100 (no change) toward amount based on influence',
            '    return 100 + (amount - 100) * influence;',
            '}',
            '',
            'function getAffectorRotationBoost(pos) {',
            '    if (!affector) return 0;',
            '    // Rotation uses spatial influence only (no inertia) for consistent behavior',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 0;',
            '    var amount = 0;',
            '    try { amount = affector.effect("Rotation")("Slider").value; } catch(e) {}',
            '    return amount * influence;',
            '}',
            '',
            'function getAffectorOpacityMult(pos) {',
            '    if (!affector) return 100;',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 100;',
            '    var amount = 100;',
            '    try { amount = affector.effect("Opacity")("Slider").value; } catch(e) {}',
            '    // Interpolate from 100 (no change) toward amount based on influence',
            '    return 100 + (amount - 100) * influence;',
            '}',
            ''
        ]);
        header = header.join('\n');
    } else {
        header = [
            '// Parent Rig Expression (Slider Fallback Mode)',
            'var parentLayer = thisComp.layer("' + parentNameEscaped + '");',
            '',
            '// Child effect - access by name (set in addChildEffect)',
            'var cEff = null;',
            'try { cEff = thisLayer.effect("Parent Rig - Child"); } catch(e) {}',
            '// Property index map for child pseudo effect (names may be empty due to localization)',
            'var cpIdx = {',
            '    "Index": 1, "Influence": 2,',
            '    "Rest Pos X": 3, "Rest Pos Y": 4, "Rest Pos Z": 5,',
            '    "Rest Scale X": 6, "Rest Scale Y": 7, "Rest Scale Z": 8,',
            '    "Rest Rotation": 9, "Rest Opacity": 10,',
            '    "Rest Anchor X": 11, "Rest Anchor Y": 12, "Rest Anchor Z": 13,',
            '    "Parent Rest Pos X": 14, "Parent Rest Pos Y": 15, "Parent Rest Pos Z": 16,',
            '    "Parent Rest Scale X": 17, "Parent Rest Scale Y": 18, "Parent Rest Scale Z": 19,',
            '    "Parent Rest Rotation": 20, "Parent Rest Opacity": 21,',
            '    "Parent Rest Anchor X": 22, "Parent Rest Anchor Y": 23, "Parent Rest Anchor Z": 24',
            '};',
            'function cp(name) {',
            '    if (cEff && cpIdx[name]) { try { return cEff(cpIdx[name]).value; } catch(e) {} }',
            '    try { return effect("PR_" + name)("Slider").value; } catch(e) {}',
            '    return 0;',
            '}',
            '',
            '// Get rig parameters from slider controls',
            'var myIndex = cp("Index") || 1;',
            'var childInfluence = (cp("Influence") || 100) / 100;',
            'var delayProp = parentLayer.effect("PR_Delay")("Slider");',
            'var stretchProp = parentLayer.effect("PR_Delay Stretch")("Slider");',
            'var reverseOrderProp = parentLayer.effect("PR_Reverse Order")("Slider");',
            'var falloffProp = parentLayer.effect("PR_Falloff")("Slider");',
            'var randomSeed = parentLayer.effect("PR_Random Seed")("Slider").value;',
            'var followPosition = parentLayer.effect("PR_Follow Position")("Checkbox").value;',
            'var followScale = parentLayer.effect("PR_Follow Scale")("Checkbox").value;',
            'var followRotation = parentLayer.effect("PR_Follow Rotation")("Checkbox").value;',
            'var followOpacity = parentLayer.effect("PR_Follow Opacity")("Checkbox").value;',
            'var followAnchorPoint = parentLayer.effect("PR_Follow Anchor Point")("Checkbox").value;',
            'var childCount = parentLayer.effect("PR_Child Count")("Slider").value;',
            '// Features not available in fallback mode (pseudo effect only)',
            'var parentInfluenceProp = {value: 100, valueAtTime: function(t) { return 100; }};',
            'var leaderIndexProp = {value: 1, valueAtTime: function(t) { return 1; }};',
            'var delayBeforeLeaderProp = {value: 100, valueAtTime: function(t) { return 100; }};',
            'var delayAfterLeaderProp = {value: 100, valueAtTime: function(t) { return 100; }};',
            'var scaleAroundMode = 1;',
            'var rotateAroundMode = 1;',
            'function findLeaderLayer() { return null; }',
            'function getPinInfluenceMultiplier(t) { return 1; }',
            '// Pin edges not available in fallback mode',
            'var pinDirectionProp = {value: 1, valueAtTime: function(t) { return 1; }};',
            'var pinInfluenceProp = {value: 100, valueAtTime: function(t) { return 100; }};',
            'var pinStretchProp = {value: 100, valueAtTime: function(t) { return 100; }};',
            'var pinTrimProp = {value: 0, valueAtTime: function(t) { return 0; }};',
            'var pinTopEnabled = false;',
            'var pinTopY = 0;',
            'var pinBottomEnabled = false;',
            'var pinBottomY = 1080;',
            'var pinLeftEnabled = false;',
            'var pinLeftX = 0;',
            'var pinRightEnabled = false;',
            'var pinRightX = 1920;',
            'function getPinEdgeState(t, parentRestPos) { return {active: false, offsetX: 0, offsetY: 0, influence: 1}; }',
            '// Delays apply to all transforms in fallback mode',
            'var delayPosition = true;',
            'var delayScale = true;',
            'var delayRotation = true;',
            'var delayOpacity = true;',
            'var delayAnchorPoint = true;',
            'var applyDelayToThisTransform = true;',
            '',
            '// Seeded random function for consistent randomization',
            'function seededRandom(seed, index) {',
            '    var hash = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;',
            '    return hash - Math.floor(hash);',
            '}',
            '',
            '// Get randomized index if random is enabled',
            'function getRandomizedIndex(baseIndex, seed, count) {',
            '    var rand = seededRandom(seed, baseIndex);',
            '    return 1 + rand * (count - 1);',
            '}',
            '',
            '// Index values for blending (fallback mode uses stack order only)',
            'var topToBottomIndex = myIndex;',
            'var bottomToTopIndex = childCount + 1 - topToBottomIndex;',
            '',
            '// Calculate effective index with delay falloff (geometric series)',
            '// Falloff range: -100 to 100, where 0 = no effect',
            '// Positive values: delays compress toward first layers',
            '// Negative values: delays compress toward last layers',
            'function getEffectiveIndex(baseIdx, falloff) {',
            '    if (Math.abs(falloff) < 0.01) return baseIdx;',
            '    var r = 1 - Math.abs(falloff) / 100 * 0.99;',
            '    if (falloff < 0) {',
            '        var reversedIdx = childCount + 1 - baseIdx;',
            '        var effectiveReversed = (1 - Math.pow(r, reversedIdx)) / (1 - r);',
            '        return childCount + 1 - effectiveReversed;',
            '    }',
            '    return (1 - Math.pow(r, baseIdx)) / (1 - r);',
            '}',
            '',
            '// Function to get effective index at a specific time (for reverse order/falloff/leader)',
            'function getEffectiveIndexAtTime(t) {',
            '    var leaderIdx = Math.round(leaderIndexProp.valueAtTime(t));',
            '    var falloff = falloffProp.valueAtTime(t);',
            '    var baseIdx;',
            '    ',
            '    if (leaderIdx <= 1) {',
            '        // Standard mode: use reverse order (blend from normal to reversed)',
            '        var roVal = reverseOrderProp.valueAtTime(t) / 100;',
            '        baseIdx = baseIndex + (reversedIndex - baseIndex) * roVal;',
            '    } else {',
            '        // Leader mode: calculate distance from leader (ignores randomization)',
            '        var beforeMult = delayBeforeLeaderProp.valueAtTime(t) / 100;',
            '        var afterMult = delayAfterLeaderProp.valueAtTime(t) / 100;',
            '        var distanceFromLeader = Math.abs(myIndex - leaderIdx);',
            '        if (myIndex < leaderIdx) {',
            '            baseIdx = distanceFromLeader * beforeMult;',
            '        } else if (myIndex > leaderIdx) {',
            '            baseIdx = distanceFromLeader * afterMult;',
            '        } else {',
            '            baseIdx = 0;',
            '        }',
            '    }',
            '    ',
            '    return getEffectiveIndex(baseIdx, falloff);',
            '}',
            '',
            '// Function to get delay/stretch at a specific time (returns 0 if delays disabled for this transform)',
            'function getDelayAtTime(t) {',
            '    if (!applyDelayToThisTransform) return 0;',
            '    return delayProp.valueAtTime(t) * getEffectiveIndexAtTime(t) * thisComp.frameDuration;',
            '}',
            'function getStretchAtTime(t) {',
            '    if (!applyDelayToThisTransform) return 0;',
            '    return stretchProp.valueAtTime(t) * getEffectiveIndexAtTime(t) * thisComp.frameDuration;',
            '}',
            '',
            '// ===== AFFECTOR SYSTEM =====',
            'var affector = null;',
            'try { affector = thisComp.layer("Parent Rig Affector"); } catch(e) {}',
            '',
            'function getAffectorOuterRadius() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Outer Radius")("Slider").value; } catch(e) { return 200; }',
            '}',
            '',
            'function getAffectorInnerRadius() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Inner Radius")("Slider").value; } catch(e) { return 0; }',
            '}',
            '',
            'function getGlobalInfluence() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Influence")("Slider").value; } catch(e) { return 100; }',
            '}',
            '',
            'function getAffectorInfluence(pos) {',
            '    if (!affector) return 0;',
            '    var globalInf = getGlobalInfluence() / 100;',
            '    if (globalInf <= 0) return 0;',
            '    var affectorPos = affector.transform.position.value;',
            '    var outerR = getAffectorOuterRadius();',
            '    var innerR = getAffectorInnerRadius();',
            '    if (outerR <= 0) return 0;',
            '    var dx = pos[0] - affectorPos[0];',
            '    var dy = pos[1] - affectorPos[1];',
            '    var dist = Math.sqrt(dx * dx + dy * dy);',
            '    if (dist <= innerR) return globalInf;',
            '    if (dist >= outerR) return 0;',
            '    var falloffRange = outerR - innerR;',
            '    var normalizedDist = (dist - innerR) / falloffRange;',
            '    try {',
            '        var falloffProp = affector.effect("Falloff")("Slider");',
            '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
            '        return (falloffVal / 100) * globalInf;',
            '    } catch(e) { return (1 - normalizedDist) * globalInf; }',
            '}',
            '',
            'function getAffectorItemSize() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Item Size")("Slider").value; } catch(e) { return 100; }',
            '}',
            '',
            'function getAffectorGap() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Affector Gap")("Slider").value; } catch(e) { return 0; }',
            '}',
            '',
            'function getAffectorGapFalloff() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Affector Gap Falloff")("Slider").value; } catch(e) { return 100; }',
            '}',
            '',
            'function getGlobalGap() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Global Gap")("Slider").value; } catch(e) { return 0; }',
            '}',
            '',
            '// Scale multiplier for spread calculation (uses raw spatial influence, no inertia)',
            'function getScaleMultAtPos(pos) {',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 1;',
            '    var scalePercent = 100;',
            '    try { scalePercent = affector.effect("Scale")("Slider").value; } catch(e) {}',
            '    return 1 + (scalePercent / 100 - 1) * influence;',
            '}',
            '',
            '// Integral of influence from 0 to x (for gap compensation)',
            '// Uses linear falloff: influence(d) = 1 - d/radius',
            '// Integral: x - x^2/(2*radius) for |x| <= radius',
            'function influenceIntegral(x, radius) {',
            '    if (radius <= 0) return 0;',
            '    var absX = Math.abs(x);',
            '    var sign = x >= 0 ? 1 : (x < 0 ? -1 : 0);',
            '    if (absX >= radius) {',
            '        // Outside radius: constant at max value',
            '        return sign * radius / 2;',
            '    }',
            '    // Inside radius: quadratic curve',
            '    return sign * (absX - absX * absX / (2 * radius));',
            '}',
            '',
            'function getAffectorSpread(parentedPos, restPos) {',
            '    // Spread using integral approach for smooth animation + perfect gaps',
            '    if (!affector) return [0, 0];',
            '    var affectorPos = affector.transform.position.value;',
            '    var itemSize = getAffectorItemSize();',
            '    var affectorGap = getAffectorGap();',
            '    var gapFalloff = getAffectorGapFalloff();',
            '    var globalGap = getGlobalGap();',
            '    var outerR = getAffectorOuterRadius();',
            '    var innerR = getAffectorInnerRadius();',
            '    if (itemSize <= 0) itemSize = 100;',
            '    ',
            '    // Effective radius for falloff (outer - inner)',
            '    var falloffRadius = outerR - innerR;',
            '    if (falloffRadius <= 0) falloffRadius = outerR;',
            '    ',
            '    // Distance from affector center',
            '    var dx = parentedPos[0] - affectorPos[0];',
            '    var dy = parentedPos[1] - affectorPos[1];',
            '    ',
            '    // Direction for global gap',
            '    var dirX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);',
            '    var dirY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);',
            '    ',
            '    // How many items away (for global gap)',
            '    var itemsAwayX = Math.abs(dx) / itemSize;',
            '    var itemsAwayY = Math.abs(dy) / itemSize;',
            '    ',
            '    // Adjust for inner radius (offset distance by innerR)',
            '    var distX = Math.abs(dx) > innerR ? (Math.abs(dx) - innerR) * (dx >= 0 ? 1 : -1) : 0;',
            '    var distY = Math.abs(dy) > innerR ? (Math.abs(dy) - innerR) * (dy >= 0 ? 1 : -1) : 0;',
            '    ',
            '    // Get max scale (at center)',
            '    var maxScalePercent = 100;',
            '    try { maxScalePercent = affector.effect("Scale")("Slider").value; } catch(e) {}',
            '    var growth = maxScalePercent / 100 - 1;',
            '    ',
            '    // Integral values for this position',
            '    var integralX = influenceIntegral(distX, falloffRadius);',
            '    var integralY = influenceIntegral(distY, falloffRadius);',
            '    var maxIntegral = falloffRadius / 2;',
            '    if (maxIntegral <= 0) maxIntegral = 1;',
            '    ',
            '    // Scale compensation: offset = growth * itemSize * normalized_integral',
            '    var compOffsetX = growth * itemSize * integralX / maxIntegral;',
            '    var compOffsetY = growth * itemSize * integralY / maxIntegral;',
            '    ',
            '    // Affector Gap: smooth transition using same integral',
            '    var affectorOffsetX = affectorGap * integralX / maxIntegral;',
            '    var affectorOffsetY = affectorGap * integralY / maxIntegral;',
            '    ',
            '    // Global Gap: affects ALL items based on distance (itemsAway)',
            '    // Direction flip at center is tiny since itemsAway approaches 0',
            '    var globalOffsetX = itemsAwayX * globalGap * dirX;',
            '    var globalOffsetY = itemsAwayY * globalGap * dirY;',
            '    ',
            '    // Combine offsets',
            '    var totalOffsetX = compOffsetX + affectorOffsetX + globalOffsetX;',
            '    var totalOffsetY = compOffsetY + affectorOffsetY + globalOffsetY;',
            '    ',
            '    // Apply Affector Gap Falloff (multiplies gaps based on influence)',
            '    var influence = getAffectorInfluence(parentedPos);',
            '    var gapFalloffMult = 1 + (gapFalloff / 100 - 1) * influence;',
            '    ',
            '    return [totalOffsetX * gapFalloffMult, totalOffsetY * gapFalloffMult];',
            '}',
            '',
            'function getAffectorPositionOffset(pos) {',
            '    if (!affector) return [0, 0, 0];',
            '    // Position uses spatial influence only (no inertia) for consistent layout',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return [0, 0, 0];',
            '    var px = 0, py = 0, pz = 0;',
            '    try { px = affector.effect("Position X")("Slider").value; } catch(e) {}',
            '    try { py = affector.effect("Position Y")("Slider").value; } catch(e) {}',
            '    try { pz = affector.effect("Position Z")("Slider").value; } catch(e) {}',
            '    if (px === 0 && py === 0 && pz === 0) return [0, 0, 0];',
            '    // Position offset is uniform (same direction for all items)',
            '    return [px * influence, py * influence, pz * influence];',
            '}',
            '',
            'function getAffectorScaleMult(pos) {',
            '    if (!affector) return 100;',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 100;',
            '    var amount = 100;',
            '    try { amount = affector.effect("Scale")("Slider").value; } catch(e) {}',
            '    // Interpolate from 100 (no change) toward amount based on influence',
            '    return 100 + (amount - 100) * influence;',
            '}',
            '',
            'function getAffectorRotationBoost(pos) {',
            '    if (!affector) return 0;',
            '    // Rotation uses spatial influence only (no inertia) for consistent behavior',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 0;',
            '    var amount = 0;',
            '    try { amount = affector.effect("Rotation")("Slider").value; } catch(e) {}',
            '    return amount * influence;',
            '}',
            '',
            'function getAffectorOpacityMult(pos) {',
            '    if (!affector) return 100;',
            '    var influence = getAffectorInfluence(pos);',
            '    if (influence <= 0) return 100;',
            '    var amount = 100;',
            '    try { amount = affector.effect("Opacity")("Slider").value; } catch(e) {}',
            '    // Interpolate from 100 (no change) toward amount based on influence',
            '    return 100 + (amount - 100) * influence;',
            '}',
            ''
        ].join('\n');
    }

    // Time remapping function
    var timeRemapFunc = [
        '// Time remapping with crossfade blending for overlapping segments',
        '// Find influence property from child effect or slider fallback',
        'var influencePropGlobal = null;',
        'try { influencePropGlobal = thisLayer.effect("Parent Rig - Child")("Influence"); } catch(e) {}',
        'if (!influencePropGlobal) { try { influencePropGlobal = effect("PR_Influence")("Slider"); } catch(e) {} }',
        '',
        '// Build child segments from property keyframes',
        'function buildChildSegs(prop) {',
        '    if (prop.numKeys < 2) return [];',
        '    ',
        '    var rawSegments = [];',
        '    for (var i = 1; i < prop.numKeys; i++) {',
        '        var t1 = prop.key(i).time;',
        '        var t2 = prop.key(i + 1).time;',
        '        var v1 = prop.key(i).value;',
        '        var v2 = prop.key(i + 1).value;',
        '        ',
        '        var isAnim = false;',
        '        if (v1 instanceof Array) {',
        '            for (var d = 0; d < v1.length; d++) {',
        '                if (Math.abs(v1[d] - v2[d]) > 0.001) { isAnim = true; break; }',
        '            }',
        '        } else {',
        '            isAnim = Math.abs(v1 - v2) > 0.001;',
        '        }',
        '        rawSegments.push({start: t1, end: t2, dur: t2 - t1, isAnim: isAnim});',
        '    }',
        '    ',
        '    var mergedSegments = [];',
        '    var i = 0;',
        '    while (i < rawSegments.length) {',
        '        var seg = rawSegments[i];',
        '        if (seg.isAnim) {',
        '            var mergedStart = seg.start;',
        '            var mergedEnd = seg.end;',
        '            while (i + 1 < rawSegments.length && rawSegments[i + 1].isAnim) {',
        '                i++;',
        '                mergedEnd = rawSegments[i].end;',
        '            }',
        '            mergedSegments.push({start: mergedStart, end: mergedEnd, dur: mergedEnd - mergedStart, isAnim: true});',
        '        } else {',
        '            mergedSegments.push(seg);',
        '        }',
        '        i++;',
        '    }',
        '    ',
        '    var childSegs = [];',
        '    for (var i = 0; i < mergedSegments.length; i++) {',
        '        var seg = mergedSegments[i];',
        '        var segDelayValue = delayProp.valueAtTime(seg.start);',
        '        var segEffIdx = getEffectiveIndexAtTime(seg.start);',
        '        var segDelay = applyDelayToThisTransform ? segDelayValue * segEffIdx * thisComp.frameDuration : 0;',
        '        var segStretch = getStretchAtTime(seg.start);',
        '        var childStart = seg.start + segDelay;',
        '        var childDur = seg.isAnim ? seg.dur + segStretch : seg.dur;',
        '        var childEnd = childStart + childDur;',
        '        var segInfluence = influencePropGlobal.valueAtTime(seg.start) / 100 * parentInfluenceProp.valueAtTime(seg.start) / 100 * getPinInfluenceMultiplier(seg.start);',
        '        childSegs.push({',
        '            childStart: childStart,',
        '            childEnd: childEnd,',
        '            parentStart: seg.start,',
        '            parentEnd: seg.end,',
        '            parentDur: seg.dur,',
        '            isAnim: seg.isAnim,',
        '            delayValue: segDelayValue,',
        '            effIdx: segEffIdx,',
        '            influence: segInfluence',
        '        });',
        '    }',
        '    ',
        '    // Prevent segment overlap ONLY when delay settings change between segments',
        '    // (e.g., when leader index changes, earlier segments should not extend into later ones)',
        '    // We detect this by comparing effective index - if it changed, delay settings changed',
        '    for (var i = 0; i < childSegs.length - 1; i++) {',
        '        var effIdxChanged = Math.abs(childSegs[i].effIdx - childSegs[i + 1].effIdx) > 0.01;',
        '        if (effIdxChanged && childSegs[i].childEnd > childSegs[i + 1].childStart) {',
        '            childSegs[i].childEnd = childSegs[i + 1].childStart;',
        '        }',
        '    }',
        '    ',
        '    return childSegs;',
        '}',
        '',
        'function getParentTimeForSeg(cs, ct) {',
        '    if (ct < cs.childStart) return cs.parentStart;',
        '    if (ct > cs.childEnd) return cs.parentEnd;',
        '    var progress = (ct - cs.childStart) / (cs.childEnd - cs.childStart);',
        '    return cs.parentStart + progress * cs.parentDur;',
        '}',
        '',
        'function getRemapInfo(t, prop) {',
        '    var result = {t1: t, t2: t, blend: 0, segInfluence: influencePropGlobal.valueAtTime(t) / 100 * parentInfluenceProp.valueAtTime(t) / 100 * getPinInfluenceMultiplier(t)};',
        '    if (prop.numKeys < 2) {',
        '        result.t1 = t - getDelayAtTime(t);',
        '        result.t2 = result.t1;',
        '        return result;',
        '    }',
        '    ',
        '    var childSegs = buildChildSegs(prop);',
        '    if (childSegs.length === 0) {',
        '        result.t1 = t - getDelayAtTime(t);',
        '        result.t2 = result.t1;',
        '        return result;',
        '    }',
        '    ',
        '    var firstSeg = childSegs[0];',
        '    var lastSeg = childSegs[childSegs.length - 1];',
        '    ',
        '    if (t < firstSeg.childStart) {',
        '        result.t1 = prop.key(1).time;',
        '        result.t2 = result.t1;',
        '        result.segInfluence = firstSeg.influence;',
        '        return result;',
        '    }',
        '    ',
        '    var activeSeg = null;',
        '    var activeIdx = -1;',
        '    for (var i = childSegs.length - 1; i >= 0; i--) {',
        '        var cs = childSegs[i];',
        '        if (t >= cs.childStart) {',
        '            activeSeg = cs;',
        '            activeIdx = i;',
        '            break;',
        '        }',
        '    }',
        '    ',
        '    if (!activeSeg) {',
        '        result.t1 = prop.key(1).time;',
        '        result.t2 = result.t1;',
        '        result.segInfluence = firstSeg.influence;',
        '        return result;',
        '    }',
        '    ',
        '    var prevSeg = (activeIdx > 0) ? childSegs[activeIdx - 1] : null;',
        '    if (prevSeg && t <= prevSeg.childEnd) {',
        '        var sameDelay = Math.abs(prevSeg.delayValue - activeSeg.delayValue) < 0.01;',
        '        ',
        '        if (sameDelay) {',
        '            var overlapStart = activeSeg.childStart;',
        '            var overlapEnd = Math.min(prevSeg.childEnd, activeSeg.childEnd);',
        '            var overlapDur = overlapEnd - overlapStart;',
        '            var blendProgress = (overlapDur > 0) ? (t - overlapStart) / overlapDur : 1;',
        '            blendProgress = Math.max(0, Math.min(1, blendProgress));',
        '            ',
        '            result.t1 = getParentTimeForSeg(prevSeg, t);',
        '            result.t2 = getParentTimeForSeg(activeSeg, t);',
        '            result.blend = blendProgress;',
        '            result.segInfluence = prevSeg.influence + (activeSeg.influence - prevSeg.influence) * blendProgress;',
        '            return result;',
        '        } else {',
        '            result.t1 = getParentTimeForSeg(activeSeg, t);',
        '            result.t2 = result.t1;',
        '            result.segInfluence = activeSeg.influence;',
        '            return result;',
        '        }',
        '    }',
        '    ',
        '    if (t <= activeSeg.childEnd) {',
        '        result.t1 = getParentTimeForSeg(activeSeg, t);',
        '        result.t2 = result.t1;',
        '        result.blend = 0;',
        '        result.segInfluence = activeSeg.influence;',
        '        return result;',
        '    }',
        '    ',
        '    result.t1 = activeSeg.parentEnd;',
        '    result.t2 = result.t1;',
        '    result.segInfluence = activeSeg.influence;',
        '    return result;',
        '}',
        '',
        '// Calculate accumulated position delta across all segments, weighted by influence',
        '// This preserves position from previous segments when current segment has 0% influence',
        'function getAccumulatedArrayDelta(t, prop, parentRestVal) {',
        '    // PERFORMANCE: Check for constant influence (no keyframes)',
        '    var hasInfluenceKeys = influencePropGlobal.numKeys > 0 || parentInfluenceProp.numKeys > 0;',
        '    var currentInfluence = influencePropGlobal.value / 100 * parentInfluenceProp.value / 100;',
        '    var hasPinEdges = pinTopEnabled || pinBottomEnabled || pinLeftEnabled || pinRightEnabled;',
        '    ',
        '    // Fast path: constant 0% influence - child ignores parent entirely',
        '    if (!hasInfluenceKeys && !hasPinEdges && currentInfluence === 0) {',
        '        return prop.value.length === 3 ? [0,0,0] : [0,0];',
        '    }',
        '    ',
        '    // Fast path: constant 100% influence (only if no pin edges) - use simple time remapping',
        '    if (!hasInfluenceKeys && !hasPinEdges && currentInfluence === 1) {',
        '        var remapInfo = getRemapInfo(t, prop);',
        '        var parentVal1 = prop.valueAtTime(remapInfo.t1);',
        '        var parentVal2 = prop.valueAtTime(remapInfo.t2);',
        '        var parentVal = blendValues(parentVal1, parentVal2, remapInfo.blend);',
        '        return sub(parentVal, parentRestVal);',
        '    }',
        '    ',
        '    // Animated influence - need to iterate through segments',
        '    var childSegs = buildChildSegs(prop);',
        '    if (childSegs.length === 0) return null;',
        '    ',
        '    var firstSeg = childSegs[0];',
        '    if (t < firstSeg.childStart) return null;',
        '    ',
        '    var accumulated = prop.value.length === 3 ? [0,0,0] : [0,0];',
        '    ',
        '    for (var i = 0; i < childSegs.length; i++) {',
        '        var seg = childSegs[i];',
        '        if (t < seg.childStart) break;',
        '        ',
        '        // Skip segments with 0% influence entirely',
        '        if (seg.influence === 0) continue;',
        '        ',
        '        var segStartPos = prop.valueAtTime(seg.parentStart);',
        '        var segEndPos = prop.valueAtTime(seg.parentEnd);',
        '        ',
        '        if (t >= seg.childEnd) {',
        '            // Segment complete - add full delta change weighted by influence',
        '            var segDelta = sub(segEndPos, segStartPos);',
        '            accumulated = add(accumulated, mul(segDelta, seg.influence));',
        '        } else {',
        '            // Segment in progress - add partial delta weighted by influence',
        '            var progress = (t - seg.childStart) / (seg.childEnd - seg.childStart);',
        '            progress = Math.max(0, Math.min(1, progress));',
        '            var parentTime = seg.parentStart + progress * seg.parentDur;',
        '            var currentPos = prop.valueAtTime(parentTime);',
        '            var partialDelta = sub(currentPos, segStartPos);',
        '            accumulated = add(accumulated, mul(partialDelta, seg.influence));',
        '        }',
        '    }',
        '    return accumulated;',
        '}',
        '',
        '// Scalar version for split dimensions (X, Y, Z Position)',
        'function getAccumulatedScalarDelta(t, prop, parentRestVal) {',
        '    // PERFORMANCE: Check for constant influence (no keyframes)',
        '    var hasInfluenceKeys = influencePropGlobal.numKeys > 0 || parentInfluenceProp.numKeys > 0;',
        '    var currentInfluence = influencePropGlobal.value / 100 * parentInfluenceProp.value / 100;',
        '    var hasPinEdges = pinTopEnabled || pinBottomEnabled || pinLeftEnabled || pinRightEnabled;',
        '    ',
        '    // Fast path: constant 0% influence - child ignores parent entirely',
        '    if (!hasInfluenceKeys && !hasPinEdges && currentInfluence === 0) {',
        '        return 0;',
        '    }',
        '    ',
        '    // Fast path: constant 100% influence (only if no pin edges) - use simple time remapping',
        '    if (!hasInfluenceKeys && !hasPinEdges && currentInfluence === 1) {',
        '        var remapInfo = getRemapInfo(t, prop);',
        '        var parentVal1 = prop.valueAtTime(remapInfo.t1);',
        '        var parentVal2 = prop.valueAtTime(remapInfo.t2);',
        '        var parentVal = parentVal1 + (parentVal2 - parentVal1) * remapInfo.blend;',
        '        return parentVal - parentRestVal;',
        '    }',
        '    ',
        '    // Animated influence - need to iterate through segments',
        '    var childSegs = buildChildSegs(prop);',
        '    if (childSegs.length === 0) return null;',
        '    ',
        '    var firstSeg = childSegs[0];',
        '    if (t < firstSeg.childStart) return null;',
        '    ',
        '    var accumulated = 0;',
        '    ',
        '    for (var i = 0; i < childSegs.length; i++) {',
        '        var seg = childSegs[i];',
        '        if (t < seg.childStart) break;',
        '        ',
        '        // Skip segments with 0% influence entirely',
        '        if (seg.influence === 0) continue;',
        '        ',
        '        var segStartVal = prop.valueAtTime(seg.parentStart);',
        '        var segEndVal = prop.valueAtTime(seg.parentEnd);',
        '        ',
        '        if (t >= seg.childEnd) {',
        '            accumulated += (segEndVal - segStartVal) * seg.influence;',
        '        } else {',
        '            var progress = (t - seg.childStart) / (seg.childEnd - seg.childStart);',
        '            progress = Math.max(0, Math.min(1, progress));',
        '            var parentTime = seg.parentStart + progress * seg.parentDur;',
        '            var currentVal = prop.valueAtTime(parentTime);',
        '            accumulated += (currentVal - segStartVal) * seg.influence;',
        '        }',
        '    }',
        '    return accumulated;',
        '}',
        '',
        'function blendValues(v1, v2, blend) {',
        '    if (blend === 0) return v1;',
        '    if (blend === 1) return v2;',
        '    if (v1 instanceof Array) {',
        '        var result = [];',
        '        for (var i = 0; i < v1.length; i++) {',
        '            result.push(v1[i] + (v2[i] - v1[i]) * blend);',
        '        }',
        '        return result;',
        '    }',
        '    return v1 + (v2 - v1) * blend;',
        '}',
        '',
        '// Element-wise array division (built-in div() requires scalar divisor)',
        'function divArrays(a, b) {',
        '    var result = [];',
        '    for (var i = 0; i < a.length; i++) {',
        '        result.push(a[i] / b[i]);',
        '    }',
        '    return result;',
        '}',
        '',
        '// Element-wise array multiplication (built-in mul() requires one scalar)',
        'function mulArrays(a, b) {',
        '    var result = [];',
        '    for (var i = 0; i < a.length; i++) {',
        '        result.push(a[i] * b[i]);',
        '    }',
        '    return result;',
        '}',
        ''
    ].join('\n');

    // Position expression - uses accumulated delta to preserve position when influence changes
    var posExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayPosition;',
        '',
        '// Position calculation with accumulated influence',
        'var restPos = [cp("Rest Pos X"), cp("Rest Pos Y")' + (is3D ? ', cp("Rest Pos Z")' : '') + '];',
        'var parentRestPos = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")' + (is3D ? ', cp("Parent Rest Pos Z")' : '') + '];',
        'var parentRestScale = [cp("Parent Rest Scale X"), cp("Parent Rest Scale Y")' + (is3D ? ', cp("Parent Rest Scale Z")' : '') + '];',
        'var parentRestRot = cp("Parent Rest Rotation");',
        '',
        '// Get accumulated delta from all segments, weighted by each segment\'s influence',
        'var posProp = parentLayer.transform.position;',
        'var accDelta = getAccumulatedArrayDelta(time, posProp, parentRestPos);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accDelta === null) {',
        '    var remapInfo = getRemapInfo(time, posProp);',
        '    var parentPos = posProp.valueAtTime(remapInfo.t1);',
        '    accDelta = mul(sub(parentPos, parentRestPos), remapInfo.segInfluence);',
        '}',
        '',
        'var parentedPos = add(restPos, accDelta);',
        '',
        '// Transform around pivot (scale and/or rotation affecting child position)',
        '// Mode: 1=Child (skip), 2=Parent, 3=Leader',
        'if (scaleAroundMode > 1 || rotateAroundMode > 1) {',
        '    // Determine pivot position based on mode',
        '    var scalePivotPos = parentRestPos;',
        '    var rotatePivotPos = parentRestPos;',
        '    ',
        '    // For Leader mode, find the leader layer position',
        '    if (scaleAroundMode === 3 || rotateAroundMode === 3) {',
        '        var leaderLayer = findLeaderLayer();',
        '        var leaderIdx = Math.round(leaderIndexProp.valueAtTime(time));',
        '        if (leaderLayer && myIndex !== leaderIdx) {',
        '            var leaderPos = leaderLayer.transform.position.valueAtTime(time);',
        '            if (scaleAroundMode === 3) scalePivotPos = leaderPos;',
        '            if (rotateAroundMode === 3) rotatePivotPos = leaderPos;',
        '        } else if (myIndex === leaderIdx) {',
        '            // I am the leader - skip transform around self',
        '            scalePivotPos = null;',
        '            rotatePivotPos = null;',
        '        }',
        '    }',
        '    ',
        '    // Apply scale around pivot first (scale before rotation in transform order)',
        '    if (scaleAroundMode > 1 && scalePivotPos !== null) {',
        '        var offsetFromPivot = sub(restPos, scalePivotPos);',
        '        var currentOffset = [offsetFromPivot[0], offsetFromPivot[1]' + (is3D ? ', offsetFromPivot[2]' : '') + '];',
        '        var scaleProp = parentLayer.transform.scale;',
        '        // Use getRemapInfo for proper delay + stretch timing',
        '        var scaleRemapInfo = getRemapInfo(time, scaleProp);',
        '        var parentScaleT = scaleProp.valueAtTime(scaleRemapInfo.t1);',
        '        var scaleInfluence = scaleRemapInfo.segInfluence * childInfluence;',
        '        currentOffset[0] *= parentScaleT[0] / parentRestScale[0];',
        '        currentOffset[1] *= parentScaleT[1] / parentRestScale[1];',
        (is3D ? '        if (currentOffset.length > 2) currentOffset[2] *= (parentScaleT[2] || 100) / 100;' : ''),
        '        var scaleDelta = sub(currentOffset, offsetFromPivot);',
        '        scaleDelta = mul(scaleDelta, scaleInfluence);',
        '        parentedPos = add(parentedPos, scaleDelta);',
        '    }',
        '    ',
        '    // Apply rotation around pivot (2D rotation around Z axis)',
        '    if (rotateAroundMode > 1 && rotatePivotPos !== null) {',
        '        var offsetFromPivot = sub(restPos, rotatePivotPos);',
        '        var currentOffset = [offsetFromPivot[0], offsetFromPivot[1]' + (is3D ? ', offsetFromPivot[2]' : '') + '];',
        '        var rotProp = parentLayer.transform.rotation;',
        '        // Use getRemapInfo for proper delay + stretch timing',
        '        var rotRemapInfo = getRemapInfo(time, rotProp);',
        '        var rotateInfluence = rotRemapInfo.segInfluence * childInfluence;',
        '        var parentRotT = rotProp.valueAtTime(rotRemapInfo.t1);',
        '        var rotDelta = parentRotT - parentRestRot;',
        '        var rad = rotDelta * Math.PI / 180;',
        '        var cosR = Math.cos(rad);',
        '        var sinR = Math.sin(rad);',
        '        var rx = currentOffset[0] * cosR - currentOffset[1] * sinR;',
        '        var ry = currentOffset[0] * sinR + currentOffset[1] * cosR;',
        '        var rotatedOffset = [rx, ry' + (is3D ? ', currentOffset[2]' : '') + '];',
        '        var rotateDelta = sub(rotatedOffset, offsetFromPivot);',
        '        rotateDelta = mul(rotateDelta, rotateInfluence);',
        '        parentedPos = add(parentedPos, rotateDelta);',
        '    }',
        '}',
        '',
        '// Apply Pin Edges offset',
        'var pinState = getPinEdgeState(time, parentRestPos);',
        'if (pinState.active) {',
        '    parentedPos = [parentedPos[0] + pinState.offsetX, parentedPos[1] + pinState.offsetY' + (is3D ? ', parentedPos[2]' : '') + '];',
        '}',
        '',
        '// Apply Affector effects (spread and position offset)',
        'var affectorSpread = getAffectorSpread(parentedPos, restPos);',
        'var affectorPosOffset = getAffectorPositionOffset(parentedPos);',
        'parentedPos = [parentedPos[0] + affectorSpread[0] + affectorPosOffset[0], parentedPos[1] + affectorSpread[1] + affectorPosOffset[1]' + (is3D ? ', parentedPos[2] + affectorPosOffset[2]' : '') + '];',
        '',
        'var childAnimPos = value;',
        'var childDelta = sub(childAnimPos, restPos);',
        '',
        '// Check if following position is enabled',
        'followPosition ? add(parentedPos, childDelta) : childAnimPos;'
    ].join('\n');

    // Scale expression - uses simple time remapping with multiplicative ratio
    var scaleExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayScale;',
        '',
        '// Scale calculation with time remapping',
        'var restScale = [cp("Rest Scale X"), cp("Rest Scale Y")' + (is3D ? ', cp("Rest Scale Z")' : '') + '];',
        'var parentRestScale = [cp("Parent Rest Scale X"), cp("Parent Rest Scale Y")' + (is3D ? ', cp("Parent Rest Scale Z")' : '') + '];',
        '',
        '// Get parent scale using time remapping',
        'var scaleProp = parentLayer.transform.scale;',
        'var remapInfo = getRemapInfo(time, scaleProp);',
        'var parentScale1 = scaleProp.valueAtTime(remapInfo.t1);',
        'var parentScale2 = scaleProp.valueAtTime(remapInfo.t2);',
        'var parentScale = blendValues(parentScale1, parentScale2, remapInfo.blend);',
        '',
        '// Calculate scale ratio: how much parent scaled relative to rest',
        'var scaleRatio = divArrays(parentScale, parentRestScale);',
        '',
        '// Apply influence to the ratio change (1 = no change, scaleRatio = full change)',
        'var influencedRatio = [];',
        'for (var i = 0; i < scaleRatio.length; i++) {',
        '    influencedRatio.push(1 + (scaleRatio[i] - 1) * remapInfo.segInfluence);',
        '}',
        '',
        '// Apply ratio to child rest scale',
        'var parentDrivenScale = mulArrays(restScale, influencedRatio);',
        '',
        '// Apply Affector scale multiplier (based on current position)',
        'var currentPos = thisLayer.transform.position.value;',
        'var scaleMult = getAffectorScaleMult(currentPos) / 100;',
        'parentDrivenScale = [parentDrivenScale[0] * scaleMult, parentDrivenScale[1] * scaleMult' + (is3D ? ', parentDrivenScale[2] * scaleMult' : '') + '];',
        '',
        '// Handle child animation: calculate child\'s own scale ratio relative to rest',
        'var childAnimScale = value;',
        'var childScaleRatio = divArrays(childAnimScale, restScale);',
        '',
        '// Check if following scale is enabled',
        'followScale ? mulArrays(parentDrivenScale, childScaleRatio) : childAnimScale;'
    ].join('\n');

    // Rotation expression (Z) - uses accumulated delta for influence handling
    var rotExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayRotation;',
        '',
        '// Rotation calculation with accumulated influence',
        'var restRot = cp("Rest Rotation");',
        'var parentRestRot = cp("Parent Rest Rotation");',
        '',
        'var rotProp = parentLayer.transform.rotation;',
        'var accRotDelta;',
        '',
        '// When rotateAroundMode > 1 (Parent or Leader), use same timing as orbit position',
        '// so rotation and position stay in sync (like native parenting)',
        'if (rotateAroundMode > 1) {',
        '    var rotRemapInfo = getRemapInfo(time, rotProp);',
        '    var parentRotT = rotProp.valueAtTime(rotRemapInfo.t1);',
        '    accRotDelta = (parentRotT - parentRestRot) * rotRemapInfo.segInfluence * childInfluence;',
        '} else {',
        '    // Normal rotation following (Child mode) - uses accumulated delta',
        '    accRotDelta = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '    ',
        '    // If before first segment, use simple delay-based remapping',
        '    if (accRotDelta === null) {',
        '        var remapInfo = getRemapInfo(time, rotProp);',
        '        var parentRot = rotProp.valueAtTime(remapInfo.t1);',
        '        accRotDelta = (parentRot - parentRestRot) * remapInfo.segInfluence;',
        '    }',
        '}',
        '',
        'var parentDrivenRot = restRot + accRotDelta;',
        '',
        '// Apply Affector rotation boost (based on current position)',
        'var currentPos = thisLayer.transform.position.value;',
        'var rotBoost = getAffectorRotationBoost(currentPos);',
        'parentDrivenRot = parentDrivenRot + rotBoost;',
        '',
        'var childAnimRot = value;',
        'var childRotDelta = childAnimRot - restRot;',
        '',
        '// Check if following rotation is enabled',
        'followRotation ? parentDrivenRot + childRotDelta : childAnimRot;'
    ].join('\n');

    // X Rotation expression (3D only) - uses accumulated delta for influence handling
    var xRotExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayRotation;',
        '',
        '// X Rotation calculation with accumulated influence',
        'var restRot = cp("Rest X Rotation");',
        'var parentRestRot = cp("Parent Rest X Rotation");',
        '',
        'var rotProp = parentLayer.transform.xRotation;',
        'var accRotDelta;',
        '',
        '// When rotateAroundMode > 1, use same timing as orbit position',
        'if (rotateAroundMode > 1) {',
        '    var rotRemapInfo = getRemapInfo(time, rotProp);',
        '    var parentRotT = rotProp.valueAtTime(rotRemapInfo.t1);',
        '    accRotDelta = (parentRotT - parentRestRot) * rotRemapInfo.segInfluence * childInfluence;',
        '} else {',
        '    accRotDelta = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '    if (accRotDelta === null) {',
        '        var remapInfo = getRemapInfo(time, rotProp);',
        '        var parentRot = rotProp.valueAtTime(remapInfo.t1);',
        '        accRotDelta = (parentRot - parentRestRot) * remapInfo.segInfluence;',
        '    }',
        '}',
        '',
        'var parentDrivenRot = restRot + accRotDelta;',
        'var childAnimRot = value;',
        'var childRotDelta = childAnimRot - restRot;',
        '',
        'followRotation ? parentDrivenRot + childRotDelta : childAnimRot;'
    ].join('\n');

    // Y Rotation expression (3D only) - uses accumulated delta for influence handling
    var yRotExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayRotation;',
        '',
        '// Y Rotation calculation with accumulated influence',
        'var restRot = cp("Rest Y Rotation");',
        'var parentRestRot = cp("Parent Rest Y Rotation");',
        '',
        'var rotProp = parentLayer.transform.yRotation;',
        'var accRotDelta;',
        '',
        '// When rotateAroundMode > 1, use same timing as orbit position',
        'if (rotateAroundMode > 1) {',
        '    var rotRemapInfo = getRemapInfo(time, rotProp);',
        '    var parentRotT = rotProp.valueAtTime(rotRemapInfo.t1);',
        '    accRotDelta = (parentRotT - parentRestRot) * rotRemapInfo.segInfluence * childInfluence;',
        '} else {',
        '    accRotDelta = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '    if (accRotDelta === null) {',
        '        var remapInfo = getRemapInfo(time, rotProp);',
        '        var parentRot = rotProp.valueAtTime(remapInfo.t1);',
        '        accRotDelta = (parentRot - parentRestRot) * remapInfo.segInfluence;',
        '    }',
        '}',
        '',
        'var parentDrivenRot = restRot + accRotDelta;',
        'var childAnimRot = value;',
        'var childRotDelta = childAnimRot - restRot;',
        '',
        'followRotation ? parentDrivenRot + childRotDelta : childAnimRot;'
    ].join('\n');

    // Opacity expression - uses accumulated delta for ratio calculation
    var opacityExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayOpacity;',
        '',
        '// Opacity calculation with accumulated influence',
        'var restOpacity = cp("Rest Opacity");',
        'var parentRestOpacity = cp("Parent Rest Opacity");',
        '',
        '// Get accumulated opacity delta from all segments, weighted by each segment\'s influence',
        'var opacityProp = parentLayer.transform.opacity;',
        'var accOpacityDelta = getAccumulatedScalarDelta(time, opacityProp, parentRestOpacity);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accOpacityDelta === null) {',
        '    var remapInfo = getRemapInfo(time, opacityProp);',
        '    var parentOpacity = opacityProp.valueAtTime(remapInfo.t1);',
        '    accOpacityDelta = (parentOpacity - parentRestOpacity) * remapInfo.segInfluence;',
        '}',
        '',
        '// Convert accumulated delta to ratio offset and apply',
        'var accRatioOffset = accOpacityDelta / parentRestOpacity;',
        'var effectiveRatio = 1 + accRatioOffset;',
        'var parentDrivenOpacity = restOpacity * effectiveRatio;',
        '',
        '// Apply Affector opacity multiplier (based on current position)',
        'var currentPos = thisLayer.transform.position.value;',
        'var opacityMult = getAffectorOpacityMult(currentPos) / 100;',
        'parentDrivenOpacity = parentDrivenOpacity * opacityMult;',
        '',
        'var childAnimOpacity = value;',
        'var childOpacityRatio = childAnimOpacity / restOpacity;',
        '',
        '// Check if following opacity is enabled',
        'followOpacity ? parentDrivenOpacity * childOpacityRatio : childAnimOpacity;'
    ].join('\n');

    // Anchor Point expression - uses accumulated delta for influence handling
    var anchorExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayAnchorPoint;',
        '',
        '// Anchor Point calculation with accumulated influence',
        'var restAnchor = [cp("Rest Anchor X"), cp("Rest Anchor Y")' + (is3D ? ', cp("Rest Anchor Z")' : '') + '];',
        'var parentRestAnchor = [cp("Parent Rest Anchor X"), cp("Parent Rest Anchor Y")' + (is3D ? ', cp("Parent Rest Anchor Z")' : '') + '];',
        '',
        '// Get accumulated anchor delta from all segments, weighted by each segment\'s influence',
        'var anchorProp = parentLayer.transform.anchorPoint;',
        'var accAnchorDelta = getAccumulatedArrayDelta(time, anchorProp, parentRestAnchor);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accAnchorDelta === null) {',
        '    var remapInfo = getRemapInfo(time, anchorProp);',
        '    var parentAnchor = anchorProp.valueAtTime(remapInfo.t1);',
        '    accAnchorDelta = mul(sub(parentAnchor, parentRestAnchor), remapInfo.segInfluence);',
        '}',
        '',
        'var parentDrivenAnchor = add(restAnchor, accAnchorDelta);',
        '',
        'var childAnimAnchor = value;',
        'var childDelta = sub(childAnimAnchor, restAnchor);',
        '',
        '// Check if following anchor point is enabled',
        'followAnchorPoint ? add(parentDrivenAnchor, childDelta) : childAnimAnchor;'
    ].join('\n');

    // Apply expressions conditionally based on followOptions (for performance)
    // Only apply expressions to properties that are enabled - no expression = native speed

    // Position expression
    if (followOptions.position) {
        if (splitDims) {
            // Split dimensions - apply separate X, Y, Z expressions
            var xPosExpr = createSplitPosExpr(header, timeRemapFunc, 'X', 'xPosition', is3D);
            var yPosExpr = createSplitPosExpr(header, timeRemapFunc, 'Y', 'yPosition', is3D);

            try { child.transform.xPosition.expression = xPosExpr; } catch (e) {}
            try { child.transform.yPosition.expression = yPosExpr; } catch (e) {}

            if (is3D) {
                var zPosExpr = createSplitPosExpr(header, timeRemapFunc, 'Z', 'zPosition', is3D);
                try { child.transform.zPosition.expression = zPosExpr; } catch (e) {}
            }
        } else {
            // Normal position - single expression
            try { child.transform.position.expression = posExpr; } catch (e) {}
        }
    } else {
        // Remove any existing position expression
        try { child.transform.position.expression = ""; } catch (e) {}
        if (splitDims) {
            try { child.transform.xPosition.expression = ""; } catch (e) {}
            try { child.transform.yPosition.expression = ""; } catch (e) {}
            if (is3D) { try { child.transform.zPosition.expression = ""; } catch (e) {} }
        }
    }

    // Scale expression
    if (followOptions.scale) {
        try { child.transform.scale.expression = scaleExpr; } catch (e) {}
    } else {
        try { child.transform.scale.expression = ""; } catch (e) {}
    }

    // Rotation expression
    if (followOptions.rotation) {
        try { child.transform.rotation.expression = rotExpr; } catch (e) {}
        // Apply X and Y rotation expressions for 3D layers
        if (is3D) {
            try { child.transform.xRotation.expression = xRotExpr; } catch (e) {}
            try { child.transform.yRotation.expression = yRotExpr; } catch (e) {}
        }
    } else {
        try { child.transform.rotation.expression = ""; } catch (e) {}
        if (is3D) {
            try { child.transform.xRotation.expression = ""; } catch (e) {}
            try { child.transform.yRotation.expression = ""; } catch (e) {}
        }
    }

    // Opacity expression
    if (followOptions.opacity) {
        try { child.transform.opacity.expression = opacityExpr; } catch (e) {}
    } else {
        try { child.transform.opacity.expression = ""; } catch (e) {}
    }

    // Anchor point expression
    if (followOptions.anchor) {
        try { child.transform.anchorPoint.expression = anchorExpr; } catch (e) {}
    } else {
        try { child.transform.anchorPoint.expression = ""; } catch (e) {}
    }
}

// Helper function to create split dimension position expressions
function createSplitPosExpr(header, timeRemapFunc, axis, propName, is3D) {
    // For transform around parent, we need both X and Y even for single-axis expressions
    var needsBothAxes = (axis === 'X' || axis === 'Y');

    return header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayPosition;',
        '',
        '// ' + axis + ' Position calculation (split dimensions) with accumulated influence',
        'var restPos = cp("Rest Pos ' + axis + '");',
        'var parentRestPos = cp("Parent Rest Pos ' + axis + '");',
        // For transform around parent with rotation, we need both X and Y
        (needsBothAxes ? 'var restPosX = cp("Rest Pos X");' : ''),
        (needsBothAxes ? 'var restPosY = cp("Rest Pos Y");' : ''),
        (needsBothAxes ? 'var parentRestPosX = cp("Parent Rest Pos X");' : ''),
        (needsBothAxes ? 'var parentRestPosY = cp("Parent Rest Pos Y");' : ''),
        'var parentRestScaleX = cp("Parent Rest Scale X");',
        'var parentRestScaleY = cp("Parent Rest Scale Y");',
        (is3D ? 'var parentRestScaleZ = cp("Parent Rest Scale Z");' : ''),
        'var parentRestRot = cp("Parent Rest Rotation");',
        '',
        '// Get accumulated delta from all segments, weighted by each segment\'s influence',
        'var posProp = parentLayer.transform.' + propName + ';',
        'var accDelta = getAccumulatedScalarDelta(time, posProp, parentRestPos);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accDelta === null) {',
        '    var remapInfo = getRemapInfo(time, posProp);',
        '    var parentPos = posProp.valueAtTime(remapInfo.t1);',
        '    accDelta = (parentPos - parentRestPos) * remapInfo.segInfluence;',
        '}',
        '',
        'var parentedPos = restPos + accDelta;',
        '',
        '// Transform around pivot (scale and/or rotation affecting child position)',
        '// Mode: 1=Child (skip), 2=Parent, 3=Leader',
        'if (scaleAroundMode > 1 || rotateAroundMode > 1) {',
        '    // Determine pivot positions based on mode',
        '    var scalePivotX = parentRestPosX;',
        '    var scalePivotY = parentRestPosY;',
        '    var rotatePivotX = parentRestPosX;',
        '    var rotatePivotY = parentRestPosY;',
        '    var skipScaleTransform = false;',
        '    var skipRotateTransform = false;',
        '    ',
        '    // For Leader mode, find the leader layer position',
        '    if (scaleAroundMode === 3 || rotateAroundMode === 3) {',
        '        var leaderLayer = findLeaderLayer();',
        '        var leaderIdx = Math.round(leaderIndexProp.valueAtTime(time));',
        '        if (leaderLayer && myIndex !== leaderIdx) {',
        '            // Get leader position (handle split dims)',
        '            var leaderXProp = leaderLayer.transform.xPosition;',
        '            var leaderYProp = leaderLayer.transform.yPosition;',
        '            var leaderPos;',
        '            if (leaderXProp && leaderYProp) {',
        '                leaderPos = [leaderXProp.valueAtTime(time), leaderYProp.valueAtTime(time)];',
        '            } else {',
        '                leaderPos = leaderLayer.transform.position.valueAtTime(time);',
        '            }',
        '            if (scaleAroundMode === 3) { scalePivotX = leaderPos[0]; scalePivotY = leaderPos[1]; }',
        '            if (rotateAroundMode === 3) { rotatePivotX = leaderPos[0]; rotatePivotY = leaderPos[1]; }',
        '        } else if (myIndex === leaderIdx) {',
        '            // I am the leader - skip transform around self',
        '            if (scaleAroundMode === 3) skipScaleTransform = true;',
        '            if (rotateAroundMode === 3) skipRotateTransform = true;',
        '        }',
        '    }',
        '    ',
        (needsBothAxes ? '    var offsetX = restPosX - (scaleAroundMode === 3 ? scalePivotX : parentRestPosX);' : ''),
        (needsBothAxes ? '    var offsetY = restPosY - (scaleAroundMode === 3 ? scalePivotY : parentRestPosY);' : ''),
        (needsBothAxes ? '    var rotOffsetX = restPosX - rotatePivotX;' : ''),
        (needsBothAxes ? '    var rotOffsetY = restPosY - rotatePivotY;' : ''),
        '    ',
        '    // Variables for influence (set by getRemapInfo in each block)',
        '    var scaleInfluence = 0;',
        '    var rotateInfluence = 0;',
        '    ',
        '    // Apply scale around pivot',
        '    if (scaleAroundMode > 1 && !skipScaleTransform) {',
        '        var scaleProp = parentLayer.transform.scale;',
        '        // Use getRemapInfo for proper delay + stretch timing',
        '        var scaleRemapInfo = getRemapInfo(time, scaleProp);',
        '        scaleInfluence = scaleRemapInfo.segInfluence * childInfluence;',
        '        var parentScaleT = scaleProp.valueAtTime(scaleRemapInfo.t1);',
        (needsBothAxes ? '        offsetX *= parentScaleT[0] / parentRestScaleX;' : ''),
        (needsBothAxes ? '        offsetY *= parentScaleT[1] / parentRestScaleY;' : ''),
        '    }',
        '    ',
        '    // Apply rotation around pivot',
        '    if (rotateAroundMode > 1 && !skipRotateTransform) {',
        '        var rotProp = parentLayer.transform.rotation;',
        '        // Use getRemapInfo for proper delay + stretch timing',
        '        var rotRemapInfo = getRemapInfo(time, rotProp);',
        '        rotateInfluence = rotRemapInfo.segInfluence * childInfluence;',
        '        var parentRotT = rotProp.valueAtTime(rotRemapInfo.t1);',
        '        var rotDelta = parentRotT - parentRestRot;',
        '        var rad = rotDelta * Math.PI / 180;',
        '        var cosR = Math.cos(rad);',
        '        var sinR = Math.sin(rad);',
        (needsBothAxes ? '        var newRotOffsetX = rotOffsetX * cosR - rotOffsetY * sinR;' : ''),
        (needsBothAxes ? '        var newRotOffsetY = rotOffsetX * sinR + rotOffsetY * cosR;' : ''),
        (needsBothAxes ? '        rotOffsetX = newRotOffsetX;' : ''),
        (needsBothAxes ? '        rotOffsetY = newRotOffsetY;' : ''),
        '    }',
        '    ',
        '    // Calculate transform deltas for this axis',
        (axis === 'X' ? '    var scaleOriginalOffset = restPosX - (scaleAroundMode === 3 ? scalePivotX : parentRestPosX);' : ''),
        (axis === 'X' ? '    var scaleDelta = skipScaleTransform ? 0 : (offsetX - scaleOriginalOffset) * scaleInfluence;' : ''),
        (axis === 'X' ? '    var rotOriginalOffset = restPosX - rotatePivotX;' : ''),
        (axis === 'X' ? '    var rotateDelta = skipRotateTransform ? 0 : (rotOffsetX - rotOriginalOffset) * rotateInfluence;' : ''),
        (axis === 'Y' ? '    var scaleOriginalOffset = restPosY - (scaleAroundMode === 3 ? scalePivotY : parentRestPosY);' : ''),
        (axis === 'Y' ? '    var scaleDelta = skipScaleTransform ? 0 : (offsetY - scaleOriginalOffset) * scaleInfluence;' : ''),
        (axis === 'Y' ? '    var rotOriginalOffset = restPosY - rotatePivotY;' : ''),
        (axis === 'Y' ? '    var rotateDelta = skipRotateTransform ? 0 : (rotOffsetY - rotOriginalOffset) * rotateInfluence;' : ''),
        (axis === 'Z' ? '    var scaleDelta = 0; // Z transform around pivot not supported in split dimensions' : ''),
        (axis === 'Z' ? '    var rotateDelta = 0;' : ''),
        '    parentedPos += scaleDelta + rotateDelta;',
        '}',
        '',
        '// Apply Pin Edges offset',
        'var pinParentRestPos = [parentRestPosX, parentRestPosY];',
        'var pinState = getPinEdgeState(time, pinParentRestPos);',
        'if (pinState.active) {',
        (axis === 'X' ? '    parentedPos += pinState.offsetX;' : ''),
        (axis === 'Y' ? '    parentedPos += pinState.offsetY;' : ''),
        (axis === 'Z' ? '    // Z axis not affected by pin edges' : ''),
        '}',
        '',
        'var childAnimPos = value;',
        'var childDelta = childAnimPos - restPos;',
        '',
        '// Check if following position is enabled',
        'followPosition ? parentedPos + childDelta : childAnimPos;'
    ].join('\n');
}

// ============================================
// ADD CHILD RIG
// ============================================

function addChildRig() {
    try {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    var selectedLayers = comp.selectedLayers;
    if (selectedLayers.length === 0) {
        alert("Please select one or more layers that are parented to another layer.");
        return;
    }

    // Separate layers into new rigs vs refresh existing
    var layersToRig = [];
    var layersToRefresh = [];

    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];
        var effects = layer.property("ADBE Effect Parade");
        var existingEffect = null;

        // Check if already has Child Rig
        for (var ei = 1; ei <= effects.numProperties; ei++) {
            var eff = effects.property(ei);
            if (eff.matchName === "Pseudo/ChildRig" || (eff.name && eff.name.indexOf("Child Rig") === 0)) {
                existingEffect = eff;
                break;
            }
        }

        if (existingEffect) {
            // Has existing Child Rig - refresh rest values
            layersToRefresh.push({ layer: layer, effect: existingEffect });
        } else {
            // New rig - needs parent
            if (!layer.parent) {
                alert("Layer '" + layer.name + "' is not parented to another layer.\n\nAdd Child Rig only works on layers that are already parented.");
                return;
            }
            layersToRig.push(layer);
        }
    }

    app.beginUndoGroup("Add Child Rig");

    // Refresh existing Child Rigs - update rest values to current state
    for (var r = 0; r < layersToRefresh.length; r++) {
        var child = layersToRefresh[r].layer;
        var eff = layersToRefresh[r].effect;
        var is3D = child.threeDLayer;

        // Get parent name from effect name ("Child Rig - ParentName")
        var effectName = eff.name;
        var parentName = effectName.replace("Child Rig - ", "");
        var comp = child.containingComp;
        var parent = null;

        // Find parent layer by name
        for (var li = 1; li <= comp.numLayers; li++) {
            if (comp.layer(li).name === parentName) {
                parent = comp.layer(li);
                break;
            }
        }

        if (!parent) {
            alert("Could not find parent layer '" + parentName + "' for refresh.");
            continue;
        }

        // Capture the current VISUAL position (expression output) before we change anything
        // This is what the layer looks like right now
        var visualPos = child.transform.position.valueAtTime(comp.time, false);

        // Capture current base values (what's in the property, not expression output)
        var childPosBase = child.transform.position.value;
        var childScale = child.transform.scale.value;
        var childRot = child.transform.rotation.value;
        var childOpacity = child.transform.opacity.value;

        // Get parent's WORLD position and scale (accounts for entire parent chain)
        var parentPos = getLayerWorldPosition(parent, comp.time);
        var parentScale = getLayerWorldScale(parent, comp.time);
        var parentRot = parent.transform.rotation.value;
        var parentOpacity = parent.transform.opacity.value;

        // After updating rest values, the expression delta will become 0
        // So we need to set the base position to the visual position
        // to keep the layer in the same place

        // Update rest values in the effect
        eff(15).setValue(visualPos[0]);  // Rest Pos X - use visual position
        eff(16).setValue(visualPos[1]);  // Rest Pos Y
        eff(17).setValue(is3D ? visualPos[2] : 0);  // Rest Pos Z
        eff(18).setValue(childScale[0]);  // Rest Scale X
        eff(19).setValue(childScale[1]);  // Rest Scale Y
        eff(20).setValue(is3D && childScale.length > 2 ? childScale[2] : 100);  // Rest Scale Z
        eff(21).setValue(childRot);  // Rest Rotation
        eff(22).setValue(childOpacity);  // Rest Opacity

        eff(26).setValue(parentPos[0]);  // Parent Rest Pos X
        eff(27).setValue(parentPos[1]);  // Parent Rest Pos Y
        eff(28).setValue(is3D && parentPos.length > 2 ? parentPos[2] : 0);  // Parent Rest Pos Z
        eff(29).setValue(parentScale[0]);  // Parent Rest Scale X
        eff(30).setValue(parentScale[1]);  // Parent Rest Scale Y
        eff(31).setValue(is3D && parentScale.length > 2 ? parentScale[2] : 100);  // Parent Rest Scale Z
        eff(32).setValue(parentRot);  // Parent Rest Rotation
        eff(33).setValue(parentOpacity);  // Parent Rest Opacity

        // Update the base position to match the visual position
        // This way: new expression output = visualPos + 0 delta = visualPos (unchanged)
        child.transform.position.setValue(visualPos);
    }

    // Apply new Child Rigs
    if (layersToRig.length === 0 && layersToRefresh.length === 0) {
        alert("No layers to rig or refresh. Make sure selected layers are parented to another layer.");
        app.endUndoGroup();
        return;
    }

    for (var i = 0; i < layersToRig.length; i++) {
        var child = layersToRig[i];
        var parent = child.parent;
        var is3D = child.threeDLayer;

        // Store rest values before unparenting
        var childRestScale = child.transform.scale.value;
        var childRestRot = child.transform.rotation.value;
        var childRestOpacity = child.transform.opacity.value;
        var childRestAnchor = child.transform.anchorPoint.value;

        // Get parent's current values
        // Use WORLD position to match what toWorld([0,0]) returns in the expression
        var parentRestPos = getLayerWorldPosition(parent, comp.time);
        var parentRestScale = getLayerWorldScale(parent, comp.time);
        var parentRestRot = parent.transform.rotation.value;
        var parentRestOpacity = parent.transform.opacity.value;

        // Unparent the layer (AE automatically converts position to world space)
        // Note: AE does NOT change scale when unparenting - scale property stays the same
        child.parent = null;

        // Get values after unparenting
        // Handle separated position dimensions
        var worldPos;
        var posProp = child.transform.position;
        if (posProp.dimensionsSeparated) {
            worldPos = [
                child.transform.xPosition.value,
                child.transform.yPosition.value,
                is3D ? child.transform.zPosition.value : 0
            ];
        } else {
            worldPos = posProp.value;
        }
        var worldScale = child.transform.scale.value;
        var worldAnchor = child.transform.anchorPoint.value;

        // Add the pseudo effect
        var effects = child.property("ADBE Effect Parade");
        var eff = null;
        var pseudoEffectApplied = false;

        // Effect name includes parent layer name for reference
        var effectName = "Child Rig - " + parent.name;

        // Try to add pseudo effect by matchname first (uses PresetEffects.xml)
        try {
            eff = effects.addProperty("Pseudo/ChildRig");
            if (eff && eff.numProperties >= 30) {
                eff.name = effectName;
                pseudoEffectApplied = true;
            } else if (eff) {
                eff.remove();
            }
        } catch (e) {
            pseudoEffectApplied = false;
        }

        // Fallback: Try FFX preset if matchname approach failed
        if (!pseudoEffectApplied && extensionRoot !== "") {
            var ffxPath = extensionRoot + "/assets/presets/Child Rig.ffx";
            var ffxFile = new File(ffxPath);

            if (ffxFile.exists) {
                try {
                    child.applyPreset(ffxFile);
                    // Find the effect we just applied
                    for (var ei = 1; ei <= effects.numProperties; ei++) {
                        var testEff = effects.property(ei);
                        if (testEff.matchName === "Pseudo/ChildRig" || testEff.name === "Child Rig" || testEff.name.indexOf("Child Rig - ") === 0) {
                            eff = testEff;
                            eff.name = effectName;
                            pseudoEffectApplied = true;
                            break;
                        }
                    }
                } catch (e2) {
                    pseudoEffectApplied = false;
                }
            }
        }

        if (!pseudoEffectApplied || !eff) {
            alert("Child Rig pseudo effect not found.\n\nPlease ensure:\n1. Child Rig.ffx is in assets/presets/\n2. PresetEffects.xml has been updated\n3. After Effects was restarted");
            app.endUndoGroup();
            return;
        }

        // Set rest values using indices
        // Index map (with Anchor Point influence removed):
        // 1=Influence, 2=Delay, 3=Scale around, 4=Rotate around
        // 5=spacer, 6=group, 7=Individual Influence: (label), 8=group
        // 9=Position X, 10=Position Y, 11=Position Z, 12=Scale, 13=Rotation, 14=Opacity
        // 15-22=Rest values (Pos X/Y/Z, Scale X/Y/Z, Rotation, Opacity)
        // 23-25=Rest Anchor (unused but in effect)
        // 26-33=Parent Rest values (Pos X/Y/Z, Scale X/Y/Z, Rotation, Opacity)
        // 34-36=Parent Rest Anchor (unused but in effect)

        eff(15).setValue(worldPos[0]);  // Rest Pos X
        eff(16).setValue(worldPos[1]);  // Rest Pos Y
        eff(17).setValue(is3D ? worldPos[2] : 0);  // Rest Pos Z
        eff(18).setValue(worldScale[0]);  // Rest Scale X
        eff(19).setValue(worldScale[1]);  // Rest Scale Y
        eff(20).setValue(is3D && worldScale.length > 2 ? worldScale[2] : 100);  // Rest Scale Z
        eff(21).setValue(childRestRot);  // Rest Rotation
        eff(22).setValue(childRestOpacity);  // Rest Opacity
        // Anchor point rest values not set - anchor point is not tracked

        eff(26).setValue(parentRestPos[0]);  // Parent Rest Pos X (world position)
        eff(27).setValue(parentRestPos[1]);  // Parent Rest Pos Y
        eff(28).setValue(is3D && parentRestPos.length > 2 ? parentRestPos[2] : 0);  // Parent Rest Pos Z
        eff(29).setValue(parentRestScale[0]);  // Parent Rest Scale X
        eff(30).setValue(parentRestScale[1]);  // Parent Rest Scale Y
        eff(31).setValue(is3D && parentRestScale.length > 2 ? parentRestScale[2] : 100);  // Parent Rest Scale Z
        eff(32).setValue(parentRestRot);  // Parent Rest Rotation
        eff(33).setValue(parentRestOpacity);  // Parent Rest Opacity
        // Parent anchor rest values not used

        // Apply expressions
        var parentNameEscaped = parent.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var effectNameEscaped = effectName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        applyChildRigExpressions(child, parentNameEscaped, effectNameEscaped, is3D);
    }

    app.endUndoGroup();

    // Build result message
    var msg = "";
    if (layersToRig.length > 0) {
        msg += "Child Rig applied to " + layersToRig.length + " layer(s)";
    }
    if (layersToRefresh.length > 0) {
        if (msg) msg += ", ";
        msg += "Rest values refreshed on " + layersToRefresh.length + " layer(s)";
    }
    return msg || "No changes made";
    } catch (e) {
        alert("addChildRig error: " + e.message + " at line " + e.line);
        app.endUndoGroup();
    }
}

function applyChildRigExpressions(child, parentName, effectName, is3D) {
    // Expression header for Child Rig using pseudo effect indices
    // Index map (with Delay at index 2):
    // 1=Influence, 2=Delay, 3=Scale around, 4=Rotate around
    // 5=spacer, 6=Child Rig (group), 7=Individual Influence: (label), 8=Child Rig (group)
    // 9=Position X, 10=Position Y, 11=Position Z, 12=Scale, 13=Rotation, 14=Opacity, 15=Anchor Point
    // 16-26=Rest values, 27-37=Parent Rest values
    var header = [
        '// Child Rig Expression',
        'var parentLayer = thisComp.layer("' + parentName + '");',
        'var eff = effect("' + effectName + '");',
        '',
        '// Controls',
        'var globalInfluence = eff(1).value / 100;',
        'var delayFrames = eff(2).value;',
        'var delaySecs = delayFrames * thisComp.frameDuration;',
        'var scaleAroundMode = eff(3).value;  // 1=Parent, 2=Child',
        'var rotateAroundMode = eff(4).value;  // 1=Parent, 2=Child',
        '',
        '// Individual influence sliders (indices 9-14) - combined with global',
        'var influencePosX = globalInfluence * eff(9).value / 100;',
        'var influencePosY = globalInfluence * eff(10).value / 100;',
        'var influencePosZ = globalInfluence * eff(11).value / 100;',
        'var influenceScale = globalInfluence * eff(12).value / 100;',
        'var influenceRotation = globalInfluence * eff(13).value / 100;',
        'var influenceOpacity = globalInfluence * eff(14).value / 100;',
        '',
        '// Rest values (indices 15-22)',
        'var restPosX = eff(15).value;',
        'var restPosY = eff(16).value;',
        'var restPosZ = eff(17).value;',
        'var restScaleX = eff(18).value;',
        'var restScaleY = eff(19).value;',
        'var restScaleZ = eff(20).value;',
        'var restRot = eff(21).value;',
        'var restOpacity = eff(22).value;',
        '',
        '// Parent rest values (indices 26-33)',
        'var parentRestPosX = eff(26).value;',
        'var parentRestPosY = eff(27).value;',
        'var parentRestPosZ = eff(28).value;',
        'var parentRestScaleX = eff(29).value;',
        'var parentRestScaleY = eff(30).value;',
        'var parentRestScaleZ = eff(31).value;',
        'var parentRestRot = eff(32).value;',
        'var parentRestOpacity = eff(33).value;',
        ''
    ].join('\n');

    // Position expression
    var posExpr = header + [
        '// Get delayed time',
        'var t = Math.max(0, time - delaySecs);',
        '',
        '// Get parent WORLD position at delayed time (accounts for entire parent chain)',
        '// IMPORTANT: toWorld([0,0]) gives world pos of anchor point, NOT toWorld(anchorPoint)',
        'var parentWorldPos = parentLayer.toWorld([0, 0], t);',
        'var parentScale = parentLayer.transform.scale.valueAtTime(t);',
        'var parentRot = parentLayer.transform.rotation.valueAtTime(t);',
        '',
        '// Start with keyframed value',
        'var result = value.slice ? value.slice() : [value[0], value[1]' + (is3D ? ', value[2]' : '') + '];',
        '',
        '// Position delta from parent world movement',
        'var posDeltaX = (parentWorldPos[0] - parentRestPosX) * influencePosX;',
        'var posDeltaY = (parentWorldPos[1] - parentRestPosY) * influencePosY;',
        (is3D ? 'var posDeltaZ = (parentWorldPos[2] - parentRestPosZ) * influencePosZ;' : ''),
        'result[0] += posDeltaX;',
        'result[1] += posDeltaY;',
        (is3D ? 'result[2] += posDeltaZ;' : ''),
        '',
        '// Scale around parent: position shifts based on parent scale',
        'if (scaleAroundMode === 1 && influenceScale > 0) {',
        '    var scaleRatioX = parentScale[0] / parentRestScaleX;',
        '    var scaleRatioY = parentScale[1] / parentRestScaleY;',
        '    var offsetX = restPosX - parentRestPosX;',
        '    var offsetY = restPosY - parentRestPosY;',
        '    var scaledOffsetX = offsetX * scaleRatioX;',
        '    var scaledOffsetY = offsetY * scaleRatioY;',
        '    result[0] += (scaledOffsetX - offsetX) * influenceScale;',
        '    result[1] += (scaledOffsetY - offsetY) * influenceScale;',
        '}',
        '',
        '// Rotate around parent: position orbits based on parent rotation',
        'if (rotateAroundMode === 1 && influenceRotation > 0) {',
        '    var rotDelta = (parentRot - parentRestRot) * influenceRotation;',
        '    var rad = rotDelta * Math.PI / 180;',
        '    var offsetX = restPosX - parentRestPosX;',
        '    var offsetY = restPosY - parentRestPosY;',
        '    var cosR = Math.cos(rad);',
        '    var sinR = Math.sin(rad);',
        '    var rotatedX = offsetX * cosR - offsetY * sinR;',
        '    var rotatedY = offsetX * sinR + offsetY * cosR;',
        '    result[0] += rotatedX - offsetX;',
        '    result[1] += rotatedY - offsetY;',
        '}',
        '',
        'result;'
    ].join('\n');

    // Scale expression - allows keyframing on top of parent following
    // Uses world scale to account for entire parent chain
    // Scale should be MULTIPLIED by the ratio, not added as delta
    var scaleExpr = header + [
        'var t = Math.max(0, time - delaySecs);',
        '',
        '// Calculate world scale by walking up parent chain (including the layer itself)',
        'function getWorldScale(layer, time) {',
        '    var worldScaleX = 1;',
        '    var worldScaleY = 1;',
        '    var worldScaleZ = 1;',
        '    var currentLayer = layer;',
        '    while (currentLayer) {',
        '        var s = currentLayer.transform.scale.valueAtTime(time);',
        '        worldScaleX *= s[0] / 100;',
        '        worldScaleY *= s[1] / 100;',
        '        if (s.length > 2) worldScaleZ *= s[2] / 100;',
        '        try { currentLayer = currentLayer.parent; } catch(e) { currentLayer = null; }',
        '    }',
        '    return [worldScaleX * 100, worldScaleY * 100, worldScaleZ * 100];',
        '}',
        '',
        'var parentWorldScale = getWorldScale(parentLayer, t);',
        '',
        '// Calculate scale ratio (current world scale / rest world scale)',
        'var scaleRatioX = parentWorldScale[0] / parentRestScaleX;',
        'var scaleRatioY = parentWorldScale[1] / parentRestScaleY;',
        (is3D ? 'var scaleRatioZ = parentWorldScale[2] / parentRestScaleZ;' : ''),
        '',
        '// Blend between no effect (ratio=1) and full effect based on influence',
        'var blendedRatioX = 1 + (scaleRatioX - 1) * influenceScale;',
        'var blendedRatioY = 1 + (scaleRatioY - 1) * influenceScale;',
        (is3D ? 'var blendedRatioZ = 1 + (scaleRatioZ - 1) * influenceScale;' : ''),
        '',
        '// Apply scale ratio to keyframed value',
        '[value[0] * blendedRatioX, value[1] * blendedRatioY' + (is3D ? ', value[2] * blendedRatioZ' : '') + '];'
    ].join('\n');

    // Rotation expression - allows keyframing on top of parent following
    var rotExpr = header + [
        'var t = Math.max(0, time - delaySecs);',
        'var parentRot = parentLayer.transform.rotation.valueAtTime(t);',
        'var parentDelta = (parentRot - parentRestRot) * influenceRotation;',
        '// Start with keyframed value, add parent delta',
        'value + parentDelta;'
    ].join('\n');

    // Opacity expression - allows keyframing on top of parent following
    var opacityExpr = header + [
        'var t = Math.max(0, time - delaySecs);',
        'var parentOpacity = parentLayer.transform.opacity.valueAtTime(t);',
        'var parentDelta = (parentOpacity - parentRestOpacity) * influenceOpacity;',
        '// Start with keyframed value, add parent delta (clamped to 0-100)',
        'Math.max(0, Math.min(100, value + parentDelta));'
    ].join('\n');

    // Apply expressions (anchor point intentionally not controlled - allows free repositioning after rigging)
    // Check if position has separate dimensions enabled
    var posProp = child.transform.position;
    if (posProp.dimensionsSeparated) {
        // Position is separated into X, Y, Z - apply to each
        var xProp = child.transform.xPosition;
        var yProp = child.transform.yPosition;

        var posXExpr = header + [
            'var t = Math.max(0, time - delaySecs);',
            'var parentWorldPos = parentLayer.toWorld([0, 0], t);',
            'var parentScale = parentLayer.transform.scale.valueAtTime(t);',
            'var parentRot = parentLayer.transform.rotation.valueAtTime(t);',
            '',
            'var posDeltaX = (parentWorldPos[0] - parentRestPosX) * influencePosX;',
            'var result = value + posDeltaX;',
            '',
            'if (scaleAroundMode === 1 && influenceScale > 0) {',
            '    var scaleRatioX = parentScale[0] / parentRestScaleX;',
            '    var offsetX = restPosX - parentRestPosX;',
            '    var scaledOffsetX = offsetX * scaleRatioX;',
            '    result += (scaledOffsetX - offsetX) * influenceScale;',
            '}',
            '',
            'if (rotateAroundMode === 1 && influenceRotation > 0) {',
            '    var rotDelta = (parentRot - parentRestRot) * influenceRotation;',
            '    var rad = rotDelta * Math.PI / 180;',
            '    var offsetX = restPosX - parentRestPosX;',
            '    var offsetY = restPosY - parentRestPosY;',
            '    var rotatedX = offsetX * Math.cos(rad) - offsetY * Math.sin(rad);',
            '    result += rotatedX - offsetX;',
            '}',
            'result;'
        ].join('\n');

        var posYExpr = header + [
            'var t = Math.max(0, time - delaySecs);',
            'var parentWorldPos = parentLayer.toWorld([0, 0], t);',
            'var parentScale = parentLayer.transform.scale.valueAtTime(t);',
            'var parentRot = parentLayer.transform.rotation.valueAtTime(t);',
            '',
            'var posDeltaY = (parentWorldPos[1] - parentRestPosY) * influencePosY;',
            'var result = value + posDeltaY;',
            '',
            'if (scaleAroundMode === 1 && influenceScale > 0) {',
            '    var scaleRatioY = parentScale[1] / parentRestScaleY;',
            '    var offsetY = restPosY - parentRestPosY;',
            '    var scaledOffsetY = offsetY * scaleRatioY;',
            '    result += (scaledOffsetY - offsetY) * influenceScale;',
            '}',
            '',
            'if (rotateAroundMode === 1 && influenceRotation > 0) {',
            '    var rotDelta = (parentRot - parentRestRot) * influenceRotation;',
            '    var rad = rotDelta * Math.PI / 180;',
            '    var offsetX = restPosX - parentRestPosX;',
            '    var offsetY = restPosY - parentRestPosY;',
            '    var rotatedY = offsetX * Math.sin(rad) + offsetY * Math.cos(rad);',
            '    result += rotatedY - offsetY;',
            '}',
            'result;'
        ].join('\n');

        try { xProp.expression = posXExpr; } catch (e) {}
        try { yProp.expression = posYExpr; } catch (e) {}

        if (is3D) {
            var zProp = child.transform.zPosition;
            var posZExpr = header + [
                'var t = Math.max(0, time - delaySecs);',
                'var parentWorldPos = parentLayer.toWorld([0, 0], t);',
                'var posDeltaZ = (parentWorldPos[2] - parentRestPosZ) * influencePosZ;',
                'value + posDeltaZ;'
            ].join('\n');
            try { zProp.expression = posZExpr; } catch (e) {}
        }
    } else {
        // Standard combined position property
        try { child.transform.position.expression = posExpr; } catch (e) {}
    }

    try { child.transform.scale.expression = scaleExpr; } catch (e) {}
    try { child.transform.rotation.expression = rotExpr; } catch (e) {}
    try { child.transform.opacity.expression = opacityExpr; } catch (e) {}
}

// ============================================
// TEST SHAPE GENERATORS
// ============================================

function addHorizontalCarousel() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    app.beginUndoGroup("Add Horizontal Carousel");

    var shapeWidth = 400;
    var shapeHeight = 400;
    var gap = 20;
    var cornerRadius = 64;
    var numShapes = 19;
    var compCenter = [comp.width / 2, comp.height / 2];

    // Calculate total width to center the carousel
    var totalWidth = (numShapes * shapeWidth) + ((numShapes - 1) * gap);
    var startX = compCenter[0] - (totalWidth / 2) + (shapeWidth / 2);

    // Create parent null first (will be at bottom of layer stack)
    var parentNull = comp.layers.addShape();
    parentNull.name = "Carousel Parent";
    parentNull.transform.position.setValue([comp.width / 2, comp.height / 2]);
    parentNull.label = 9; // Green

    // Create shapes in world coordinates, then parent (AE adjusts position automatically)
    for (var i = 0; i < numShapes; i++) {
        var layer = comp.layers.addShape();
        layer.name = "Card " + (i + 1);

        // Add rectangle shape
        var contents = layer.property("ADBE Root Vectors Group");
        var rectGroup = contents.addProperty("ADBE Vector Group");
        rectGroup.name = "Rectangle";

        var rectPath = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rectPath.property("ADBE Vector Rect Size").setValue([shapeWidth, shapeHeight]);
        rectPath.property("ADBE Vector Rect Roundness").setValue(cornerRadius);

        var fill = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([0, 0, 0, 1]); // Black

        // Set world position first
        var xPos = startX + (i * (shapeWidth + gap));
        layer.transform.position.setValue([xPos, compCenter[1]]);

        // Parent to null (AE will convert position to be relative to parent)
        layer.parent = parentNull;
    }

    app.endUndoGroup();
}

function addVerticalList() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    app.beginUndoGroup("Add Vertical List");

    var shapeWidth = 800;
    var shapeHeight = 220;
    var gap = 20;
    var cornerRadius = 32;
    var numShapes = 19;
    var compCenter = [comp.width / 2, comp.height / 2];

    // Calculate total height to center the list
    var totalHeight = (numShapes * shapeHeight) + ((numShapes - 1) * gap);
    var startY = compCenter[1] - (totalHeight / 2) + (shapeHeight / 2);

    // Create parent null first (will be at bottom of layer stack)
    var parentNull = comp.layers.addShape();
    parentNull.name = "List Parent";
    parentNull.transform.position.setValue([comp.width / 2, comp.height / 2]);
    parentNull.label = 9; // Green

    // Create shapes - centered on artboard
    for (var i = 0; i < numShapes; i++) {
        var layer = comp.layers.addShape();
        layer.name = "Row " + (i + 1);

        // Add rectangle shape
        var contents = layer.property("ADBE Root Vectors Group");
        var rectGroup = contents.addProperty("ADBE Vector Group");
        rectGroup.name = "Rectangle";

        var rectPath = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rectPath.property("ADBE Vector Rect Size").setValue([shapeWidth, shapeHeight]);
        rectPath.property("ADBE Vector Rect Roundness").setValue(cornerRadius);

        var fill = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([0, 0, 0, 1]); // Black

        // Set world position first
        var yPos = startY + (i * (shapeHeight + gap));
        layer.transform.position.setValue([compCenter[0], yPos]);

        // Parent to null (AE will convert position to be relative to parent)
        layer.parent = parentNull;
    }

    app.endUndoGroup();
}

function addGrid() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    app.beginUndoGroup("Add 5x5 Grid");

    var gridSize = 5;
    var squareSize = 180;
    var gap = 30;
    var cornerRadius = 20;
    var fillColor = [0.1, 0.1, 0.1, 1]; // Dark gray

    // Calculate total grid size
    var totalWidth = gridSize * squareSize + (gridSize - 1) * gap;
    var totalHeight = gridSize * squareSize + (gridSize - 1) * gap;

    // Starting position (centered in comp)
    var startX = (comp.width - totalWidth) / 2 + squareSize / 2;
    var startY = (comp.height - totalHeight) / 2 + squareSize / 2;

    // Create parent shape layer (empty)
    var parentNull = comp.layers.addShape();
    parentNull.name = "Grid Parent";
    parentNull.transform.position.setValue([comp.width / 2, comp.height / 2]);
    parentNull.label = 9; // Green

    // Create grid of shape layers (bottom-right to top-left so layer order matches visual)
    for (var row = gridSize - 1; row >= 0; row--) {
        for (var col = gridSize - 1; col >= 0; col--) {
            var x = startX + col * (squareSize + gap);
            var y = startY + row * (squareSize + gap);

            var layer = comp.layers.addShape();
            var index = row * gridSize + col + 1;
            layer.name = "Square " + index;

            // Add rectangle shape
            var contents = layer.property("ADBE Root Vectors Group");
            var rectGroup = contents.addProperty("ADBE Vector Group");
            rectGroup.name = "Rectangle";

            var rectPath = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            rectPath.property("ADBE Vector Rect Size").setValue([squareSize, squareSize]);
            rectPath.property("ADBE Vector Rect Roundness").setValue(cornerRadius);

            var fill = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue(fillColor);

            // Position the layer
            layer.transform.position.setValue([x, y]);

            // Parent to null
            layer.parent = parentNull;
        }
    }

    // Select parent for easy rigging
    for (var i = 1; i <= comp.numLayers; i++) {
        comp.layer(i).selected = false;
    }
    parentNull.selected = true;

    app.endUndoGroup();
}

function addRadialCarousel() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    app.beginUndoGroup("Add Radial Carousel");

    var numShapes = 19;
    var shapeWidth = 220;
    var shapeHeight = 220;
    var cornerRadius = 32;
    var gap = 20;
    var fillColor = [0, 0, 0, 1]; // Black

    // Much larger radius for subtle arc
    var radius = 4000;

    // Calculate arc angle based on item size + gap at the circumference
    var itemArcLength = shapeWidth + gap;
    var degreesPerItem = (itemArcLength / radius) * (180 / Math.PI);

    // Parent position: center item should be at middle of artboard
    // So parent is radius distance below the center
    var parentX = comp.width / 2;
    var parentY = (comp.height / 2) + radius;

    // Create parent shape layer
    var parentNull = comp.layers.addShape();
    parentNull.name = "Radial Parent";
    parentNull.transform.position.setValue([parentX, parentY]);
    parentNull.label = 9; // Green

    // Create shapes arranged in an arc
    // Center item (index 9, 0-based) is at top (angle -90 degrees from parent)
    var centerIndex = Math.floor(numShapes / 2);

    for (var i = 0; i < numShapes; i++) {
        var layer = comp.layers.addShape();
        layer.name = "Item " + (i + 1);

        // Add rectangle shape
        var contents = layer.property("ADBE Root Vectors Group");
        var rectGroup = contents.addProperty("ADBE Vector Group");
        rectGroup.name = "Rectangle";

        var rectPath = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rectPath.property("ADBE Vector Rect Size").setValue([shapeWidth, shapeHeight]);
        rectPath.property("ADBE Vector Rect Roundness").setValue(cornerRadius);

        var fill = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(fillColor);

        // Calculate angle: center item is at -90 degrees (straight up)
        var offsetFromCenter = i - centerIndex;
        var angleDegrees = -90 + (offsetFromCenter * degreesPerItem);
        var angleRadians = angleDegrees * Math.PI / 180;

        // Position on circle
        var x = parentX + Math.cos(angleRadians) * radius;
        var y = parentY + Math.sin(angleRadians) * radius;
        layer.transform.position.setValue([x, y]);

        // Rotation: items rotate to face tangent to circle
        var rotation = offsetFromCenter * degreesPerItem;
        layer.transform.rotation.setValue(rotation);

        // Parent to null
        layer.parent = parentNull;
    }

    // Select parent for easy rigging
    for (var i = 1; i <= comp.numLayers; i++) {
        comp.layer(i).selected = false;
    }
    parentNull.selected = true;

    app.endUndoGroup();
}
