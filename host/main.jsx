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

function applyParentRig() {
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
    var messageToShow = null;  // Defer alerts until after undo group closes

    app.beginUndoGroup("Apply Parent Rig");

    try {
        // Check if selected layers should be ADDED to an existing rig
        var addToRigResult = checkForAddToRig(selectedLayers, comp);
        if (addToRigResult) {
            addLayersToExistingRig(addToRigResult.parent, addToRigResult.newChildren, comp);
            result = "success";
        } else {
            // Check if any selected layer is already part of a rig
            var existingRig = findExistingRig(selectedLayers, comp);
            if (existingRig) {
                // Check if selected rigged children are still parented to the rig parent
                // If so, user wants to re-index (not unrig)
                var wantsReindex = false;
                for (var r = 0; r < selectedLayers.length; r++) {
                    var sl = selectedLayers[r];
                    if (isRiggedChild(sl) && sl.parent !== null && sl.parent.index === existingRig.parent.index) {
                        wantsReindex = true;
                        break;
                    }
                }

                if (wantsReindex) {
                    // Re-index all children automatically
                    var allChildren = findRiggedChildren(existingRig.parent, comp);
                    allChildren.sort(function(a, b) { return a.index - b.index; });
                    for (var ri = 0; ri < allChildren.length; ri++) {
                        // Reverse index order: bottom layer in timeline = index 1 (animates first)
                        setEffectValue(allChildren[ri], "PR_Index", allChildren.length - ri);
                        // Remove native parenting (rig uses expressions instead)
                        if (allChildren[ri].parent !== null) {
                            allChildren[ri].parent = null;
                        }
                        // Clean up any parent effect that shouldn't be on a child layer
                        removeEffect(allChildren[ri], "Parent Rig - Parent");
                        removeEffect(allChildren[ri], "PR_Delay");
                    }
                    setParentChildCount(existingRig.parent, allChildren.length);
                    result = "success";
                } else {
                    // Not parented to rig parent - assume they want to unrig
                    unrigLayers(existingRig.parent, existingRig.children, comp);
                    messageToShow = "Parent Rig removed. Normal parenting restored.";
                    result = "success";
                }
            } else {
                // Find parent-child relationships from selection
                var relationships = findParentChildRelationships(selectedLayers, comp);

                if (relationships.length === 0) {
                    messageToShow = "No parent-child relationships found in selection.\n\nMake sure selected layers have a parent assigned.";
                } else {
                    // Apply rig to each parent-children group
                    for (var i = 0; i < relationships.length; i++) {
                        var rel = relationships[i];
                        rigParentChildGroup(rel.parent, rel.children, comp);
                    }
                    result = "success";
                }
            }
        }
    } catch (e) {
        messageToShow = "Error: " + e.toString() + "\nLine: " + e.line;
    }

    app.endUndoGroup();

    // Show any deferred messages AFTER undo group is closed
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
    return hasEffect(layer, "PR_Index");
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
function addLayersToExistingRig(parent, newChildren, comp) {
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

        applyExpressions(child, parent, comp, is3D, parentSplitDims);
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
        for (var i = 1; i <= effects.numProperties; i++) {
            if (effects.property(i).name === effectName) {
                effects.property(i).property("Slider").setValue(value);
                return true;
            }
        }
    } catch (e) {}
    return false;
}

// Set the parent's child count - handles both pseudo effect and slider fallback modes
function setParentChildCount(parentLayer, count) {
    var effects = parentLayer.property("ADBE Effect Parade");

    // Try pseudo effect mode first (index 38 for Child count)
    for (var i = 1; i <= effects.numProperties; i++) {
        var eff = effects.property(i);
        if (eff.matchName === "Pseudo/ParentRigParent" || eff.name === "Parent Rig - Parent") {
            try {
                eff.property(38).setValue(count);
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

        if (hasEffect(layer, "PR_Index")) {
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
        if (hasEffect(layer, "PR_Index")) {
            // For single-rig comps, all layers with PR_Index are children of the parent rig
            // The stored PR_Parent Layer index is unreliable after layer reordering
            children.push(layer);
        }
    }
    return children;
}

function getEffectValue(layer, effectName) {
    try {
        var effects = layer.property("ADBE Effect Parade");
        for (var i = 1; i <= effects.numProperties; i++) {
            if (effects.property(i).name === effectName) {
                return effects.property(i).property("Slider").value;
            }
        }
    } catch (e) {}
    return null;
}

function unrigLayers(parent, children, comp) {
    var rigLayerToDelete = null;
    var originalParent = null;
    var actualChildren = children;

    // Check if parent is a created rig layer
    if (isCreatedRigLayer(parent)) {
        // Find the original parent among children
        var baseName = parent.name.replace(" - Parent Rig", "");
        for (var i = 0; i < children.length; i++) {
            if (children[i].name === baseName) {
                originalParent = children[i];
                break;
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

        child.parent = restoreParent;
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
            // Remove PR_ slider effects and the pseudo effect
            if (effectName.indexOf("PR_") === 0 ||
                effectName === "Parent Rig - Parent" ||
                eff.matchName === "Pseudo/ParentRigParent") {
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

                for (var j = 1; j <= comp.numLayers; j++) {
                    var otherLayer = comp.layer(j);
                    if (otherLayer.parent === parentLayer) {
                        processedParents[parentId].children.push(otherLayer);
                    }
                }
            }
        }

        for (var j = 1; j <= comp.numLayers; j++) {
            var otherLayer = comp.layer(j);
            if (otherLayer.parent === layer) {
                var layerId = layer.index;
                if (!processedParents[layerId]) {
                    processedParents[layerId] = {
                        parent: layer,
                        children: []
                    };
                }
                var alreadyAdded = false;
                for (var k = 0; k < processedParents[layerId].children.length; k++) {
                    if (processedParents[layerId].children[k].index === otherLayer.index) {
                        alreadyAdded = true;
                        break;
                    }
                }
                if (!alreadyAdded) {
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

function hasEffect(layer, effectName) {
    try {
        var effects = layer.property("ADBE Effect Parade");
        for (var i = 1; i <= effects.numProperties; i++) {
            var eff = effects.property(i);
            if (eff.name === effectName || eff.matchName === effectName) {
                return true;
            }
        }
    } catch (e) {}
    return false;
}

function removeEffect(layer, effectName) {
    try {
        var effects = layer.property("ADBE Effect Parade");
        for (var i = effects.numProperties; i >= 1; i--) {
            if (effects.property(i).name === effectName) {
                effects.property(i).remove();
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

        // Check if this child has PR_Parent Rest Pos X (meaning it's already rigged)
        try {
            var testEffect = effects.property("PR_Parent Rest Pos X");
            if (testEffect) {
                // Found an existing rigged child, extract all parent rest values
                var parentRestPos = [
                    effects.property("PR_Parent Rest Pos X").property("Slider").value,
                    effects.property("PR_Parent Rest Pos Y").property("Slider").value
                ];

                // Check for Z (3D)
                var zProp = effects.property("PR_Parent Rest Pos Z");
                if (zProp) {
                    parentRestPos.push(zProp.property("Slider").value);
                }

                var parentRestScale = [
                    effects.property("PR_Parent Rest Scale X").property("Slider").value,
                    effects.property("PR_Parent Rest Scale Y").property("Slider").value
                ];

                var parentRestRot = effects.property("PR_Parent Rest Rotation").property("Slider").value;

                var parentRestXRot = 0;
                var parentRestYRot = 0;
                if (is3D) {
                    var xRotProp = effects.property("PR_Parent Rest X Rotation");
                    var yRotProp = effects.property("PR_Parent Rest Y Rotation");
                    if (xRotProp) parentRestXRot = xRotProp.property("Slider").value;
                    if (yRotProp) parentRestYRot = yRotProp.property("Slider").value;
                }

                var parentRestOpacity = effects.property("PR_Parent Rest Opacity").property("Slider").value;

                var parentRestAnchor = [
                    effects.property("PR_Parent Rest Anchor X").property("Slider").value,
                    effects.property("PR_Parent Rest Anchor Y").property("Slider").value
                ];
                var zAnchorProp = effects.property("PR_Parent Rest Anchor Z");
                if (zAnchorProp) {
                    parentRestAnchor.push(zAnchorProp.property("Slider").value);
                }

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
        } catch (e) {
            // This child doesn't have rig effects, try next
        }
    }

    return null; // No existing rig found
}

function rigParentChildGroup(parent, children, comp) {
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

    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        // Reverse index order: bottom layer in timeline = index 1 (animates first)
        var childIndex = children.length - i;

        // Sync child's split dimensions to match parent
        child.transform.position.dimensionsSeparated = parentSplitDims;

        // Get child position (handle split dimensions)
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

        // For the original parent that became a child (when rig layer created),
        // its position is already in world space - don't transform it
        var isOriginalParentAsChild = rigLayerCreated && child.index === originalParent.index;

        if (isOriginalParentAsChild) {
            // Original parent's position is already world position
            childWorldPos = childLocalPos.slice(); // Copy the array
        } else {
            // Normal children: convert local position to world position
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

        child.parent = null;

        // Set child position (handle split dimensions)
        if (parentSplitDims) {
            child.transform.xPosition.setValue(childWorldPos[0]);
            child.transform.yPosition.setValue(childWorldPos[1]);
            if (is3D && childWorldPos.length > 2) {
                child.transform.zPosition.setValue(childWorldPos[2]);
            }
        } else {
            child.transform.position.setValue(childWorldPos);
        }

        addChildEffect(child, childIndex, parent.index,
            childWorldPos, childRestScale, childRestRot, childRestXRot, childRestYRot, childRestOpacity, childRestAnchor,
            parentRestPos, parentRestScale, parentRestRot, parentRestXRot, parentRestYRot, parentRestOpacity, parentRestAnchor, is3D);

        applyExpressions(child, parent, comp, is3D, parentSplitDims);
    }
}

// ============================================
// EFFECT CREATION
// ============================================

function addParentEffect(layer, childCount) {
    var effects = layer.property("ADBE Effect Parade");

    // Check if already has parent effect
    if (hasEffect(layer, "Parent Rig - Parent") || hasEffect(layer, "PR_Delay")) {
        return;
    }

    // Try to add pseudo effect by matchname first (uses PresetEffects.xml - always in sync)
    var pseudoEffectApplied = false;
    try {
        var eff = effects.addProperty("Pseudo/ParentRigParent");
        if (eff) {
            // Verify the effect actually loaded properly (has name and expected properties)
            // After undo/redo, AE sometimes returns a broken effect with no name
            if (eff.name && eff.name !== "" && eff.numProperties >= 40) {
                pseudoEffectApplied = true;
                // Set the child count value (index 45)
                try {
                    eff.property(45).setValue(childCount);
                } catch (e2) {
                    try {
                        eff.property("Child count").setValue(childCount);
                    } catch (e3) {}
                }
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

                // Set the child count value - find the effect by iterating
                for (var i = 1; i <= effects.numProperties; i++) {
                    var eff = effects.property(i);
                    if (eff.matchName === "Pseudo/ParentRigParent" || eff.name === "Parent Rig - Parent") {
                        try {
                            eff.property(45).setValue(childCount);
                        } catch (e2) {
                            try {
                                eff.property("Child count").setValue(childCount);
                            } catch (e3) {}
                        }
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

    // Use individual slider controls (fallback mode)
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

// ============================================
// EXPRESSION GENERATION
// ============================================

function applyExpressions(child, parent, comp, is3D, splitDims) {
    var parentName = parent.name.replace(/"/g, '\\"');

    // Common expression header - supports both pseudo effect and slider fallback
    // Detect which effect type is on the parent and get property references
    var usePseudoEffect = false;
    try {
        var testEff = parent.property("ADBE Effect Parade").property("Parent Rig - Parent");
        if (testEff) usePseudoEffect = true;
    } catch (e) {}

    var parentNameEscaped = parent.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    var header;
    if (usePseudoEffect) {
        header = [
            '// Parent Rig Expression (Pseudo Effect Mode)',
            'var parentLayer = thisComp.layer("' + parentNameEscaped + '");',
            'var pr = effect;',
            'var pEff = parentLayer.effect("Parent Rig - Parent");',
            '',
            '// Get rig parameters from pseudo effect',
            'var myIndex = 1; try { myIndex = pr("PR_Index")("Slider").value; } catch(e) {}',
            'var childInfluence = 1; try { childInfluence = pr("PR_Influence")("Slider").value / 100; } catch(e) {}',
            '',
            '// Delay section (indices 3-6)',
            'var delayProp = pEff(3);',
            'var stretchProp = pEff(4);',
            'var falloffProp = pEff(5);',
            'var parentInfluenceProp = pEff(6);',
            '',
            '// Order section (indices 11-13)',
            'var reverseOrderProp = pEff(11);',
            'var randomEnabled = pEff(12).value;',
            'var randomSeed = pEff(13).value;',
            '',
            '// Leader layer section (indices 18-20)',
            'var leaderIndexProp = pEff(18);',
            'var delayBeforeLeaderProp = pEff(19);',
            'var delayAfterLeaderProp = pEff(20);',
            '',
            '// Transform type popups (indices 25-26): 1=Child, 2=Parent',
            'var scaleAroundParent = pEff(25).value === 2;',
            'var rotateAroundParent = pEff(26).value === 2;',
            '',
            '// Children follow (indices 30-34)',
            'var followPosition = pEff(30).value;',
            'var followScale = pEff(31).value;',
            'var followRotation = pEff(32).value;',
            'var followOpacity = pEff(33).value;',
            'var followAnchorPoint = pEff(34).value;',
            '',
            '// Delays apply to (indices 39-43)',
            'var delayPosition = pEff(39).value;',
            'var delayScale = pEff(40).value;',
            'var delayRotation = pEff(41).value;',
            'var delayOpacity = pEff(42).value;',
            'var delayAnchorPoint = pEff(43).value;',
            '',
            '// Flag for whether delays apply to current transform (set per-expression)',
            'var applyDelayToThisTransform = true;',
            '',
            '// Child count (index 45)',
            'var childCount = pEff(45).value;',
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
            '// Index values for blending',
            'var topToBottomIndex = randomEnabled ? getRandomizedIndex(myIndex, randomSeed, childCount) : myIndex;',
            'var bottomToTopIndex = childCount + 1 - topToBottomIndex;',
            '',
            '// Calculate effective index with falloff (geometric series)',
            'function getEffectiveIndex(baseIdx, falloff) {',
            '    if (Math.abs(falloff - 100) < 0.01) return baseIdx;',
            '    var r = falloff / 100;',
            '    if (Math.abs(r) < 0.001) return 1;',
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
            '        // Standard mode: use reverse order (and randomization if enabled)',
            '        var ro = reverseOrderProp.valueAtTime(t);',
            '        baseIdx = topToBottomIndex + (bottomToTopIndex - topToBottomIndex) * (ro / 100);',
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
            ''
        ].join('\n');
    } else {
        header = [
            '// Parent Rig Expression (Slider Fallback Mode)',
            'var parentLayer = thisComp.layer("' + parentNameEscaped + '");',
            'var pr = effect;',
            '',
            '// Get rig parameters from slider controls',
            'var myIndex = pr("PR_Index")("Slider").value;',
            'var influence = pr("PR_Influence")("Slider").value / 100;',
            'var delayProp = parentLayer.effect("PR_Delay")("Slider");',
            'var stretchProp = parentLayer.effect("PR_Delay Stretch")("Slider");',
            'var reverseOrderProp = parentLayer.effect("PR_Reverse Order")("Slider");',
            'var falloffProp = parentLayer.effect("PR_Falloff")("Slider");',
            'var randomEnabled = parentLayer.effect("PR_Random")("Checkbox").value;',
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
            'var scaleAroundParent = false;',
            'var rotateAroundParent = false;',
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
            '// Index values for blending',
            'var topToBottomIndex = randomEnabled ? getRandomizedIndex(myIndex, randomSeed, childCount) : myIndex;',
            'var bottomToTopIndex = childCount + 1 - topToBottomIndex;',
            '',
            '// Calculate effective index with falloff (geometric series)',
            'function getEffectiveIndex(baseIdx, falloff) {',
            '    if (Math.abs(falloff - 100) < 0.01) return baseIdx;',
            '    var r = falloff / 100;',
            '    if (Math.abs(r) < 0.001) return 1;',
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
            '        // Standard mode: use reverse order (and randomization if enabled)',
            '        var ro = reverseOrderProp.valueAtTime(t);',
            '        baseIdx = topToBottomIndex + (bottomToTopIndex - topToBottomIndex) * (ro / 100);',
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
            ''
        ].join('\n');
    }

    // Time remapping function
    var timeRemapFunc = [
        '// Time remapping with crossfade blending for overlapping segments',
        'var influencePropGlobal = pr("PR_Influence")("Slider");',
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
        '        var segDelay = segDelayValue * segEffIdx * thisComp.frameDuration;',
        '        var segStretch = getStretchAtTime(seg.start);',
        '        var childStart = seg.start + segDelay;',
        '        var childDur = seg.isAnim ? seg.dur + segStretch : seg.dur;',
        '        var childEnd = childStart + childDur;',
        '        var segInfluence = influencePropGlobal.valueAtTime(seg.start) / 100 * parentInfluenceProp.valueAtTime(seg.start) / 100;',
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
        '    var result = {t1: t, t2: t, blend: 0, segInfluence: influencePropGlobal.valueAtTime(t) / 100 * parentInfluenceProp.valueAtTime(t) / 100};',
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
        '    ',
        '    // Fast path: constant 0% influence - child ignores parent entirely',
        '    if (!hasInfluenceKeys && currentInfluence === 0) {',
        '        return prop.value.length === 3 ? [0,0,0] : [0,0];',
        '    }',
        '    ',
        '    // Fast path: constant 100% influence - use simple time remapping (no segment iteration)',
        '    if (!hasInfluenceKeys && currentInfluence === 1) {',
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
        '    ',
        '    // Fast path: constant 0% influence - child ignores parent entirely',
        '    if (!hasInfluenceKeys && currentInfluence === 0) {',
        '        return 0;',
        '    }',
        '    ',
        '    // Fast path: constant 100% influence - use simple time remapping',
        '    if (!hasInfluenceKeys && currentInfluence === 1) {',
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
        'var restPos = [pr("PR_Rest Pos X")("Slider").value, pr("PR_Rest Pos Y")("Slider").value' + (is3D ? ', pr("PR_Rest Pos Z")("Slider").value' : '') + '];',
        'var parentRestPos = [pr("PR_Parent Rest Pos X")("Slider").value, pr("PR_Parent Rest Pos Y")("Slider").value' + (is3D ? ', pr("PR_Parent Rest Pos Z")("Slider").value' : '') + '];',
        'var parentRestScale = [pr("PR_Parent Rest Scale X")("Slider").value, pr("PR_Parent Rest Scale Y")("Slider").value];',
        'var parentRestRot = pr("PR_Parent Rest Rotation")("Slider").value;',
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
        '// Transform around parent (scale and/or rotation affecting child position)',
        'if (scaleAroundParent || rotateAroundParent) {',
        '    var offsetFromParent = sub(restPos, parentRestPos);',
        '    var currentOffset = [offsetFromParent[0], offsetFromParent[1]' + (is3D ? ', offsetFromParent[2]' : '') + '];',
        '    ',
        '    // Use simple delay for transform-around-parent (independent of position keyframes)',
        '    var transformDelay = getDelayAtTime(time);',
        '    var transformT = time - transformDelay;',
        '    var transformInfluence = childInfluence * parentInfluenceProp.valueAtTime(time) / 100;',
        '    ',
        '    // Apply scale around parent first (scale before rotation in transform order)',
        '    if (scaleAroundParent) {',
        '        var scaleProp = parentLayer.transform.scale;',
        '        var parentScaleT = scaleProp.valueAtTime(transformT);',
        '        currentOffset[0] *= parentScaleT[0] / parentRestScale[0];',
        '        currentOffset[1] *= parentScaleT[1] / parentRestScale[1];',
        (is3D ? '        if (currentOffset.length > 2) currentOffset[2] *= (parentScaleT[2] || 100) / 100;' : ''),
        '    }',
        '    ',
        '    // Apply rotation around parent (2D rotation around Z axis)',
        '    if (rotateAroundParent) {',
        '        var rotProp = parentLayer.transform.rotation;',
        '        var parentRotT = rotProp.valueAtTime(transformT);',
        '        var rotDelta = parentRotT - parentRestRot;',
        '        var rad = rotDelta * Math.PI / 180;',
        '        var cosR = Math.cos(rad);',
        '        var sinR = Math.sin(rad);',
        '        var rx = currentOffset[0] * cosR - currentOffset[1] * sinR;',
        '        var ry = currentOffset[0] * sinR + currentOffset[1] * cosR;',
        '        currentOffset[0] = rx;',
        '        currentOffset[1] = ry;',
        '    }',
        '    ',
        '    // Calculate delta from transform around parent and apply influence',
        '    var transformDelta = sub(currentOffset, offsetFromParent);',
        '    transformDelta = mul(transformDelta, transformInfluence);',
        '    parentedPos = add(parentedPos, transformDelta);',
        '}',
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
        'var restScale = [pr("PR_Rest Scale X")("Slider").value, pr("PR_Rest Scale Y")("Slider").value' + (is3D ? ', pr("PR_Rest Scale Z")("Slider").value' : '') + '];',
        'var parentRestScale = [pr("PR_Parent Rest Scale X")("Slider").value, pr("PR_Parent Rest Scale Y")("Slider").value' + (is3D ? ', 100' : '') + '];',
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
        'var restRot = pr("PR_Rest Rotation")("Slider").value;',
        'var parentRestRot = pr("PR_Parent Rest Rotation")("Slider").value;',
        '',
        '// Get accumulated rotation delta from all segments, weighted by each segment\'s influence',
        'var rotProp = parentLayer.transform.rotation;',
        'var accRotDelta = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accRotDelta === null) {',
        '    var remapInfo = getRemapInfo(time, rotProp);',
        '    var parentRot = rotProp.valueAtTime(remapInfo.t1);',
        '    accRotDelta = (parentRot - parentRestRot) * remapInfo.segInfluence;',
        '}',
        '',
        'var parentDrivenRot = restRot + accRotDelta;',
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
        'var restRot = pr("PR_Rest X Rotation")("Slider").value;',
        'var parentRestRot = pr("PR_Parent Rest X Rotation")("Slider").value;',
        '',
        '// Get accumulated X rotation delta from all segments',
        'var rotProp = parentLayer.transform.xRotation;',
        'var accRotDelta = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accRotDelta === null) {',
        '    var remapInfo = getRemapInfo(time, rotProp);',
        '    var parentRot = rotProp.valueAtTime(remapInfo.t1);',
        '    accRotDelta = (parentRot - parentRestRot) * remapInfo.segInfluence;',
        '}',
        '',
        'var parentDrivenRot = restRot + accRotDelta;',
        '',
        'var childAnimRot = value;',
        'var childRotDelta = childAnimRot - restRot;',
        '',
        '// Check if following rotation is enabled',
        'followRotation ? parentDrivenRot + childRotDelta : childAnimRot;'
    ].join('\n');

    // Y Rotation expression (3D only) - uses accumulated delta for influence handling
    var yRotExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayRotation;',
        '',
        '// Y Rotation calculation with accumulated influence',
        'var restRot = pr("PR_Rest Y Rotation")("Slider").value;',
        'var parentRestRot = pr("PR_Parent Rest Y Rotation")("Slider").value;',
        '',
        '// Get accumulated Y rotation delta from all segments',
        'var rotProp = parentLayer.transform.yRotation;',
        'var accRotDelta = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accRotDelta === null) {',
        '    var remapInfo = getRemapInfo(time, rotProp);',
        '    var parentRot = rotProp.valueAtTime(remapInfo.t1);',
        '    accRotDelta = (parentRot - parentRestRot) * remapInfo.segInfluence;',
        '}',
        '',
        'var parentDrivenRot = restRot + accRotDelta;',
        '',
        'var childAnimRot = value;',
        'var childRotDelta = childAnimRot - restRot;',
        '',
        '// Check if following rotation is enabled',
        'followRotation ? parentDrivenRot + childRotDelta : childAnimRot;'
    ].join('\n');

    // Opacity expression - uses accumulated delta for ratio calculation
    var opacityExpr = header + timeRemapFunc + [
        '// Set delay flag for this transform',
        'applyDelayToThisTransform = delayOpacity;',
        '',
        '// Opacity calculation with accumulated influence',
        'var restOpacity = pr("PR_Rest Opacity")("Slider").value;',
        'var parentRestOpacity = pr("PR_Parent Rest Opacity")("Slider").value;',
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
        'var restAnchor = [pr("PR_Rest Anchor X")("Slider").value, pr("PR_Rest Anchor Y")("Slider").value' + (is3D ? ', pr("PR_Rest Anchor Z")("Slider").value' : '') + '];',
        'var parentRestAnchor = [pr("PR_Parent Rest Anchor X")("Slider").value, pr("PR_Parent Rest Anchor Y")("Slider").value' + (is3D ? ', pr("PR_Parent Rest Anchor Z")("Slider").value' : '') + '];',
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

    // Apply expressions (errors will show in AE's expression error UI)
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

    try { child.transform.scale.expression = scaleExpr; } catch (e) {}
    try { child.transform.rotation.expression = rotExpr; } catch (e) {}

    // Apply X and Y rotation expressions for 3D layers
    if (is3D) {
        try { child.transform.xRotation.expression = xRotExpr; } catch (e) {}
        try { child.transform.yRotation.expression = yRotExpr; } catch (e) {}
    }

    try { child.transform.opacity.expression = opacityExpr; } catch (e) {}
    try { child.transform.anchorPoint.expression = anchorExpr; } catch (e) {}
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
        'var restPos = pr("PR_Rest Pos ' + axis + '")("Slider").value;',
        'var parentRestPos = pr("PR_Parent Rest Pos ' + axis + '")("Slider").value;',
        // For transform around parent with rotation, we need both X and Y
        (needsBothAxes ? 'var restPosX = pr("PR_Rest Pos X")("Slider").value;' : ''),
        (needsBothAxes ? 'var restPosY = pr("PR_Rest Pos Y")("Slider").value;' : ''),
        (needsBothAxes ? 'var parentRestPosX = pr("PR_Parent Rest Pos X")("Slider").value;' : ''),
        (needsBothAxes ? 'var parentRestPosY = pr("PR_Parent Rest Pos Y")("Slider").value;' : ''),
        'var parentRestScaleX = pr("PR_Parent Rest Scale X")("Slider").value;',
        'var parentRestScaleY = pr("PR_Parent Rest Scale Y")("Slider").value;',
        'var parentRestRot = pr("PR_Parent Rest Rotation")("Slider").value;',
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
        '// Transform around parent (scale and/or rotation affecting child position)',
        'if (scaleAroundParent || rotateAroundParent) {',
        (needsBothAxes ? '    var offsetX = restPosX - parentRestPosX;' : ''),
        (needsBothAxes ? '    var offsetY = restPosY - parentRestPosY;' : ''),
        '    ',
        '    // Use simple delay for transform-around-parent (independent of position keyframes)',
        '    var transformDelay = getDelayAtTime(time);',
        '    var transformT = time - transformDelay;',
        '    var transformInfluence = childInfluence * parentInfluenceProp.valueAtTime(time) / 100;',
        '    ',
        '    // Apply scale around parent',
        '    if (scaleAroundParent) {',
        '        var scaleProp = parentLayer.transform.scale;',
        '        var parentScaleT = scaleProp.valueAtTime(transformT);',
        (needsBothAxes ? '        offsetX *= parentScaleT[0] / parentRestScaleX;' : ''),
        (needsBothAxes ? '        offsetY *= parentScaleT[1] / parentRestScaleY;' : ''),
        '    }',
        '    ',
        '    // Apply rotation around parent',
        '    if (rotateAroundParent) {',
        '        var rotProp = parentLayer.transform.rotation;',
        '        var parentRotT = rotProp.valueAtTime(transformT);',
        '        var rotDelta = parentRotT - parentRestRot;',
        '        var rad = rotDelta * Math.PI / 180;',
        '        var cosR = Math.cos(rad);',
        '        var sinR = Math.sin(rad);',
        (needsBothAxes ? '        var newOffsetX = offsetX * cosR - offsetY * sinR;' : ''),
        (needsBothAxes ? '        var newOffsetY = offsetX * sinR + offsetY * cosR;' : ''),
        (needsBothAxes ? '        offsetX = newOffsetX;' : ''),
        (needsBothAxes ? '        offsetY = newOffsetY;' : ''),
        '    }',
        '    ',
        '    // Calculate transform delta for this axis',
        (axis === 'X' ? '    var originalOffset = restPosX - parentRestPosX;' : ''),
        (axis === 'X' ? '    var transformDelta = (offsetX - originalOffset) * transformInfluence;' : ''),
        (axis === 'Y' ? '    var originalOffset = restPosY - parentRestPosY;' : ''),
        (axis === 'Y' ? '    var transformDelta = (offsetY - originalOffset) * transformInfluence;' : ''),
        (axis === 'Z' ? '    var transformDelta = 0; // Z rotation around parent not supported in split dimensions' : ''),
        '    parentedPos += transformDelta;',
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
    var numShapes = 20;
    var compCenter = [comp.width / 2, comp.height / 2];

    // Create shapes - first shape at center, rest move right
    // Bottom of timeline = index 1 (centered shape), top = highest index
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

        // Position: first at center, rest move right
        var xPos = compCenter[0] + (i * (shapeWidth + gap));
        layer.transform.position.setValue([xPos, compCenter[1]]);

        // New layers go to top of stack, so first created (centered) ends up at bottom
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
    var numShapes = 20;
    var compCenter = [comp.width / 2, comp.height / 2];

    // Create shapes - first shape at center, rest move down
    // Bottom of timeline = index 1 (centered shape), top = highest index
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

        // Position: first at center, rest move down
        var yPos = compCenter[1] + (i * (shapeHeight + gap));
        layer.transform.position.setValue([compCenter[0], yPos]);

        // New layers go to top of stack, so first created (centered) ends up at bottom
    }

    app.endUndoGroup();
}
