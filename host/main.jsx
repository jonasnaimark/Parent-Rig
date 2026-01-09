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
        anchor: true,
        includeAffector: false,
        includeTarget: false
    };
    if (optionsJSON) {
        try {
            var parsed = JSON.parse(optionsJSON);
            if (typeof parsed.position === 'boolean') followOptions.position = parsed.position;
            if (typeof parsed.scale === 'boolean') followOptions.scale = parsed.scale;
            if (typeof parsed.rotation === 'boolean') followOptions.rotation = parsed.rotation;
            if (typeof parsed.opacity === 'boolean') followOptions.opacity = parsed.opacity;
            if (typeof parsed.anchor === 'boolean') followOptions.anchor = parsed.anchor;
            if (typeof parsed.includeAffector === 'boolean') followOptions.includeAffector = parsed.includeAffector;
            if (typeof parsed.includeTarget === 'boolean') followOptions.includeTarget = parsed.includeTarget;
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
                // No parent assigned - auto-create a parent shape layer at center
                if (selectedLayers.length > 0) {
                    // Convert LayerCollection to array for rigParentChildGroup
                    var childArray = [];
                    for (var k = 0; k < selectedLayers.length; k++) {
                        childArray.push(selectedLayers[k]);
                    }
                    var autoParent = createAutoParentLayer(comp, childArray);
                    // Parent all selected layers to the new auto-parent
                    for (var j = 0; j < childArray.length; j++) {
                        childArray[j].parent = autoParent;
                    }
                    // Now rig with the auto-parent
                    rigParentChildGroup(autoParent, childArray, comp, followOptions);
                    result = "success";
                } else {
                    messageToShow = "No layers selected.";
                }
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

// Create an auto-parent shape layer when selected layers have no parent
function createAutoParentLayer(comp, childLayers) {
    // Create empty shape layer at center of comp
    var autoParent = comp.layers.addShape();
    autoParent.name = "Parent Rig";

    // CRITICAL: Remove any default content After Effects may have added
    // This ensures isNullOrEmptyShape() recognizes it as empty
    try {
        var contents = autoParent.property("ADBE Root Vectors Group");
        if (contents) {
            while (contents.numProperties > 0) {
                contents.property(1).remove();
            }
        }
    } catch (e) {}

    // Check if any child is 3D
    var is3D = false;
    for (var i = 0; i < childLayers.length; i++) {
        if (childLayers[i].threeDLayer) {
            is3D = true;
            break;
        }
    }
    if (is3D) {
        autoParent.threeDLayer = true;
    }

    // Position at the first selected layer's position (childLayers maintains selection order)
    var currentTime = comp.time;
    var firstChild = childLayers[0];
    var firstChildPos;
    if (firstChild.transform.position.dimensionsSeparated) {
        firstChildPos = [
            firstChild.transform.xPosition.valueAtTime(currentTime, false),
            firstChild.transform.yPosition.valueAtTime(currentTime, false)
        ];
        if (is3D) {
            firstChildPos.push(firstChild.transform.zPosition.valueAtTime(currentTime, false));
        }
    } else {
        firstChildPos = firstChild.transform.position.valueAtTime(currentTime, false);
    }
    autoParent.transform.position.setValue(firstChildPos);
    autoParent.transform.anchorPoint.setValue([0, 0]);

    // Move to bottom of selected layers
    var lowestLayer = childLayers[0];
    for (var j = 1; j < childLayers.length; j++) {
        if (childLayers[j].index > lowestLayer.index) {
            lowestLayer = childLayers[j];
        }
    }
    // Move below all children (higher index = lower in layer stack)
    autoParent.moveAfter(lowestLayer);

    return autoParent;
}

// Create an invisible parent rig layer for visible parent layers
function createParentRigLayer(originalParent, children, comp) {
    // Create empty shape layer
    var rigLayer = comp.layers.addShape();
    rigLayer.name = originalParent.name + " - Parent Rig";

    // Remove any default content After Effects may have added
    try {
        var contents = rigLayer.property("ADBE Root Vectors Group");
        if (contents) {
            while (contents.numProperties > 0) {
                contents.property(1).remove();
            }
        }
    } catch (e) {}

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
    var splitDims = source.transform.position.dimensionsSeparated;

    // When dimensions are separated, skip combined 'position' and use xPosition/yPosition/zPosition instead
    var props = splitDims ? ['scale', 'rotation', 'opacity', 'anchorPoint'] : ['position', 'scale', 'rotation', 'opacity', 'anchorPoint'];
    var props3D = ['xRotation', 'yRotation', 'zRotation', 'xPosition', 'yPosition', 'zPosition'];

    // Copy standard properties
    for (var i = 0; i < props.length; i++) {
        copyPropertyKeyframes(source.transform[props[i]], target.transform[props[i]]);
    }

    // Copy 3D properties if applicable
    if (source.threeDLayer || splitDims) {
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
    var splitDims = layer.transform.position.dimensionsSeparated;

    // When dimensions are separated, skip combined 'position' and use xPosition/yPosition/zPosition instead
    var props = splitDims ? ['scale', 'rotation', 'opacity', 'anchorPoint'] : ['position', 'scale', 'rotation', 'opacity', 'anchorPoint'];
    var props3D = ['xRotation', 'yRotation', 'zRotation', 'xPosition', 'yPosition', 'zPosition'];

    for (var i = 0; i < props.length; i++) {
        clearPropertyKeyframes(layer.transform[props[i]], currentTime);
    }

    if (layer.threeDLayer || splitDims) {
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

    // Check if ANY layer is 3D - if so, make them all 3D
    var is3D = parent.threeDLayer;
    for (var nc = 0; nc < newChildren.length; nc++) {
        if (newChildren[nc].threeDLayer) {
            is3D = true;
            break;
        }
    }
    if (is3D) {
        if (!parent.threeDLayer) parent.threeDLayer = true;
        for (var nc = 0; nc < newChildren.length; nc++) {
            if (!newChildren[nc].threeDLayer) newChildren[nc].threeDLayer = true;
        }
    }

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

    // Track wanted positions for each new child (for correction after index change)
    var newChildrenData = [];

    for (var i = 0; i < newChildren.length; i++) {
        var child = newChildren[i];

        // Capture other rest values while still parented
        var childRestScale = child.transform.scale.valueAtTime(currentTime, false);
        var childRestRot = is3D ? child.transform.zRotation.valueAtTime(currentTime, false) : child.transform.rotation.valueAtTime(currentTime, false);
        var childRestXRot = is3D ? child.transform.xRotation.valueAtTime(currentTime, false) : 0;
        var childRestYRot = is3D ? child.transform.yRotation.valueAtTime(currentTime, false) : 0;
        var childRestOpacity = child.transform.opacity.valueAtTime(currentTime, false);
        var childRestAnchor = child.transform.anchorPoint.valueAtTime(currentTime, false);

        // DEBUG: Check if child was parented
        var wasParented = (child.parent !== null);
        var oldParentName = wasParented ? child.parent.name : "none";

        // Capture position BEFORE removing parent (this is local/parent space)
        var posBeforeUnparent = child.transform.position.valueAtTime(currentTime, false);

        // Remove parent - After Effects automatically converts position to world space
        child.parent = null;

        // Capture position AFTER removing parent (should be world space)
        var posAfterUnparent = child.transform.position.valueAtTime(currentTime, false);

        // Check current split dims state
        var childHadSplitDims = child.transform.position.dimensionsSeparated;

        // Sync child's split dimensions to match parent BEFORE capturing position
        child.transform.position.dimensionsSeparated = parentSplitDims;

        // Capture the current world position (AFTER unparenting and sync'ing split dims)
        var childCurrentWorldPos;
        if (parentSplitDims) {
            childCurrentWorldPos = [
                child.transform.xPosition.valueAtTime(currentTime, false),
                child.transform.yPosition.valueAtTime(currentTime, false)
            ];
            if (is3D) {
                childCurrentWorldPos.push(child.transform.zPosition.valueAtTime(currentTime, false));
            }
        } else {
            childCurrentWorldPos = child.transform.position.valueAtTime(currentTime, false);
        }

        // Get parent's CURRENT transform (where it is now in the animation)
        var parentCurrentPos;
        if (parentSplitDims) {
            parentCurrentPos = [
                parent.transform.xPosition.valueAtTime(currentTime, false),
                parent.transform.yPosition.valueAtTime(currentTime, false)
            ];
            if (is3D) {
                parentCurrentPos.push(parent.transform.zPosition.valueAtTime(currentTime, false));
            }
        } else {
            parentCurrentPos = parent.transform.position.valueAtTime(currentTime, false);
        }
        var parentCurrentScale = parent.transform.scale.valueAtTime(currentTime, false);
        var parentCurrentRot = is3D ? parent.transform.zRotation.valueAtTime(currentTime, false) : parent.transform.rotation.valueAtTime(currentTime, false);

        // Calculate child rest position by reversing parent's transform
        // This ensures the expression will evaluate to childCurrentWorldPos at this point in time
        var offsetX = childCurrentWorldPos[0] - parentCurrentPos[0];
        var offsetY = childCurrentWorldPos[1] - parentCurrentPos[1];
        var offsetZ = (is3D && childCurrentWorldPos.length > 2) ? childCurrentWorldPos[2] - parentCurrentPos[2] : 0;

        // Reverse parent rotation
        var rotRad = -parentCurrentRot * Math.PI / 180;
        var cosR = Math.cos(rotRad);
        var sinR = Math.sin(rotRad);
        var unrotatedX = offsetX * cosR - offsetY * sinR;
        var unrotatedY = offsetX * sinR + offsetY * cosR;

        // Reverse parent scale
        var unscaledX = unrotatedX / (parentCurrentScale[0] / 100);
        var unscaledY = unrotatedY / (parentCurrentScale[1] / 100);
        var unscaledZ = offsetZ / ((is3D && parentCurrentScale.length > 2) ? (parentCurrentScale[2] / 100) : 1);

        // Apply parent REST transform
        var restRotRad = parentRestRot * Math.PI / 180;
        var restCosR = Math.cos(restRotRad);
        var restSinR = Math.sin(restRotRad);
        var restRotatedX = unscaledX * restCosR - unscaledY * restSinR;
        var restRotatedY = unscaledX * restSinR + unscaledY * restCosR;

        var restScaledX = restRotatedX * (parentRestScale[0] / 100);
        var restScaledY = restRotatedY * (parentRestScale[1] / 100);
        var restScaledZ = unscaledZ * ((is3D && parentRestScale.length > 2) ? (parentRestScale[2] / 100) : 1);

        var childWorldPosAtRest = [
            parentRestPos[0] + restScaledX,
            parentRestPos[1] + restScaledY
        ];
        if (is3D) {
            childWorldPosAtRest.push((parentRestPos[2] || 0) + restScaledZ);
        }

        addChildEffect(child, 999, parent.index,
            childWorldPosAtRest, childRestScale, childRestRot, childRestXRot, childRestYRot, childRestOpacity, childRestAnchor,
            parentRestPos, parentRestScale, parentRestRot, parentRestXRot, parentRestYRot, parentRestOpacity, parentRestAnchor, is3D);

        // Clear any existing expressions (but keep keyframes for animation)
        // Set position to current world position if no keyframes
        if (parentSplitDims) {
            try {
                child.transform.xPosition.expression = "";
                if (child.transform.xPosition.numKeys === 0) {
                    child.transform.xPosition.setValue(childCurrentWorldPos[0]);
                }
            } catch(e) {}
            try {
                child.transform.yPosition.expression = "";
                if (child.transform.yPosition.numKeys === 0) {
                    child.transform.yPosition.setValue(childCurrentWorldPos[1]);
                }
            } catch(e) {}
            if (is3D && childCurrentWorldPos.length > 2) {
                try {
                    child.transform.zPosition.expression = "";
                    if (child.transform.zPosition.numKeys === 0) {
                        child.transform.zPosition.setValue(childCurrentWorldPos[2]);
                    }
                } catch(e) {}
            }
        } else {
            try {
                child.transform.position.expression = "";
                if (child.transform.position.numKeys === 0) {
                    child.transform.position.setValue(childCurrentWorldPos);
                }
            } catch(e) {}
        }

        // DON'T apply expressions yet - wait until after PR_Index is set
        // (expressions will be applied after we calculate correct rest position based on delay)

        // Store child and wanted position for correction after index change
        newChildrenData.push({
            child: child,
            wantedPos: childCurrentWorldPos.slice()
        });
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

    // FIX: After index is set, calculate CORRECT rest position based on delayed parent position
    // Then apply the expression with this correct rest position
    for (var ni = 0; ni < newChildrenData.length; ni++) {
        var data = newChildrenData[ni];
        var newChild = data.child;
        var wantedPos = data.wantedPos;

        try {
            var childEff = newChild.effect("Parent Rig - Child");
            var parentEff = parent.effect("Parent Rig - Parent");

            if (childEff && parentEff) {
                // Get the child's index and calculate its delay
                var childIndex = childEff.property("Index").value;
                var delayFrames = parentEff.property(3).value;  // PR_Delay
                var delay = delayFrames * childIndex * comp.frameDuration;

                // Get parent position at the DELAYED time (this is what the expression will sample)
                var delayedTime = currentTime - delay;
                var parentPosAtDelay;
                if (parentSplitDims) {
                    parentPosAtDelay = [
                        parent.transform.xPosition.valueAtTime(delayedTime, false),
                        parent.transform.yPosition.valueAtTime(delayedTime, false)
                    ];
                    if (is3D) parentPosAtDelay.push(parent.transform.zPosition.valueAtTime(delayedTime, false));
                } else {
                    parentPosAtDelay = parent.transform.position.valueAtTime(delayedTime, false);
                }

                // Get parent's rest position (stored in child effect)
                var parentRestPosStored = [
                    childEff.property("Parent Rest Pos X").value,
                    childEff.property("Parent Rest Pos Y").value
                ];
                if (is3D) parentRestPosStored.push(childEff.property("Parent Rest Pos Z").value);

                // Calculate the correct rest position
                // Expression formula: childPos = restPos + (parentAtDelay - parentRest) * influence
                // We want: wantedPos = restPos + (parentAtDelay - parentRest)
                // So: restPos = wantedPos - (parentAtDelay - parentRest)
                var correctRestPos = [];
                for (var ci = 0; ci < wantedPos.length; ci++) {
                    var parentDelta = (parentPosAtDelay[ci] || 0) - (parentRestPosStored[ci] || 0);
                    correctRestPos.push(wantedPos[ci] - parentDelta);
                }

                // Set the correct rest position in the effect FIRST
                childEff = newChild.effect("Parent Rig - Child");
                childEff.property("Rest Pos X").setValue(correctRestPos[0]);
                childEff.property("Rest Pos Y").setValue(correctRestPos[1]);
                if (is3D) {
                    childEff.property("Rest Pos Z").setValue(correctRestPos.length > 2 ? correctRestPos[2] : 0);
                }

                // CRITICAL: Also update the base position property to match rest position
                // This ensures childDelta (value - restPos) = 0 when there's no child animation
                // Without this, the expression uses the old wantedPos as value, causing double subtraction
                if (parentSplitDims) {
                    if (newChild.transform.xPosition.numKeys === 0) {
                        newChild.transform.xPosition.setValue(correctRestPos[0]);
                    }
                    if (newChild.transform.yPosition.numKeys === 0) {
                        newChild.transform.yPosition.setValue(correctRestPos[1]);
                    }
                    if (is3D && newChild.transform.zPosition.numKeys === 0) {
                        newChild.transform.zPosition.setValue(correctRestPos.length > 2 ? correctRestPos[2] : 0);
                    }
                } else {
                    if (newChild.transform.position.numKeys === 0) {
                        newChild.transform.position.setValue(correctRestPos);
                    }
                }

                // CRITICAL: Apply expression WITHOUT passing existingRestPos (pass null instead)
                // This forces the expression to read dynamically from the effect via cp() rather than using hardcoded values
                applyExpressions(newChild, parent, comp, is3D, parentSplitDims, null, null, followOptions);
            }
        } catch(e) {
            alert("Error in delay correction: " + e.toString());
        }
    }
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
    // AND if only ONE layer is selected, check if that layer has children
    // (This handles the case where user selects a single parent layer directly)
    // If multiple layers are selected with no common parent, skip this to create one auto-parent for all
    var hasAnyParents = false;
    for (var p in processedParents) {
        if (processedParents.hasOwnProperty(p)) {
            hasAnyParents = true;
            break;
        }
    }
    if (!hasAnyParents && selectedLayers.length === 1) {
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

    // Check if ANY layer is 3D - if so, make them all 3D
    var is3D = originalParent.threeDLayer;
    for (var c = 0; c < children.length; c++) {
        if (children[c].threeDLayer) {
            is3D = true;
            break;
        }
    }

    // Convert all layers to 3D if any are 3D
    if (is3D) {
        if (!originalParent.threeDLayer) originalParent.threeDLayer = true;
        for (var c = 0; c < children.length; c++) {
            if (!children[c].threeDLayer) children[c].threeDLayer = true;
        }
    }

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
        parentRestRot = is3D ? parent.transform.zRotation.valueAtTime(currentTime, false) : parent.transform.rotation.valueAtTime(currentTime, false);
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
        var childRestRot = is3D ? child.transform.zRotation.valueAtTime(currentTime, false) : child.transform.rotation.valueAtTime(currentTime, false);
        var childRestXRot = is3D ? child.transform.xRotation.valueAtTime(currentTime, false) : 0;
        var childRestYRot = is3D ? child.transform.yRotation.valueAtTime(currentTime, false) : 0;
        var childRestOpacity = child.transform.opacity.valueAtTime(currentTime, false);
        var childRestAnchor = child.transform.anchorPoint.valueAtTime(currentTime, false);

        var childWorldPos;
        var isOriginalParentAsChild = rigLayerCreated && child.index === originalParent.index;

        if (isOriginalParentAsChild) {
            // Original parent is now a child - use its local position as world position
            childWorldPos = childLocalPos.slice();
        } else if (child.parent) {
            // Child is currently parented - get its actual world position
            // This handles adding children to an existing rig where the parent has moved
            childWorldPos = getLayerWorldPosition(child, currentTime);
        } else {
            // Child is not parented - calculate world position using parent's rest transform
            // This is for freshly unparented children where position is already in world space
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

    // Select the parent rig layer after applying
    for (var s = 1; s <= comp.numLayers; s++) {
        comp.layer(s).selected = false;
    }
    parent.selected = true;
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

    // Check if any rigged children have affector support in their expressions
    var hasAffectorSupport = false;
    var hasRiggedChildren = false;
    for (var ci = 1; ci <= comp.numLayers; ci++) {
        var layer = comp.layer(ci);
        if (hasEffect(layer, "Parent Rig - Child")) {
            hasRiggedChildren = true;
            // Check if position expression contains affector code (handle split dimensions)
            try {
                var posExpr = layer.transform.position.expression || "";
                // If position is empty, check xPosition for split dimensions
                if (!posExpr || posExpr.length === 0) {
                    try {
                        var xPos = layer.property("ADBE Transform Group").property("ADBE Position_0");
                        if (xPos) posExpr = xPos.expression || "";
                    } catch(e2) {}
                }
                if (posExpr && posExpr.indexOf("AFFECTOR SYSTEM") !== -1) {
                    hasAffectorSupport = true;
                    break;
                }
            } catch (e) {}
        }
    }

    if (hasRiggedChildren && !hasAffectorSupport) {
        alert("This rig wasn't created with Affector support.\n\nTo enable: check 'Affector system' and re-apply the Parent Rig.");
        return "no_support";
    }

    // Capture selected layers BEFORE creating affector (creation changes selection)
    var selectedLayersForStandalone = [];
    for (var si = 1; si <= comp.numLayers; si++) {
        if (comp.layer(si).selected) {
            selectedLayersForStandalone.push(comp.layer(si));
        }
    }

    // Check which affectors already exist (1-4)
    var existingAffectors = [false, false, false, false];
    for (var i = 1; i <= comp.numLayers; i++) {
        var layerName = comp.layer(i).name;
        // Check for numbered names and legacy name
        if (layerName === "Parent Rig Affector" || layerName === "Parent Rig Affector 1") existingAffectors[0] = true;
        if (layerName === "Parent Rig Affector 2") existingAffectors[1] = true;
        if (layerName === "Parent Rig Affector 3") existingAffectors[2] = true;
        if (layerName === "Parent Rig Affector 4") existingAffectors[3] = true;
    }

    // Find first available slot
    var affectorNum = -1;
    for (var j = 0; j < 4; j++) {
        if (!existingAffectors[j]) {
            affectorNum = j + 1;
            break;
        }
    }

    if (affectorNum === -1) {
        alert("Maximum of 4 affectors allowed per composition.");
        return "exists";
    }

    var affectorName = "Parent Rig Affector " + affectorNum;

    app.beginUndoGroup("Add " + affectorName);

    try {
        // Create shape layer
        var affector = comp.layers.addShape();
        affector.name = affectorName;
        affector.guideLayer = true;

        // Check if any rigged layers are 3D - if so, make affector 3D too
        var hasRigged3D = false;
        for (var li = 1; li <= comp.numLayers; li++) {
            var layer = comp.layer(li);
            if (layer.threeDLayer && hasEffect(layer, "Parent Rig - Child")) {
                hasRigged3D = true;
                break;
            }
        }
        if (hasRigged3D) {
            affector.threeDLayer = true;
        }

        var contents = affector.property("ADBE Root Vectors Group");

        // Colors: 1=Orange, 2=Cyan, 3=Green, 4=Purple
        var affectorColors = [
            { outer: [1, 0.5, 0, 1], inner: [1, 0.7, 0.3, 1] },       // Orange
            { outer: [0, 0.8, 1, 1], inner: [0.3, 0.9, 1, 1] },       // Cyan
            { outer: [0.2, 0.9, 0.4, 1], inner: [0.5, 1, 0.6, 1] },   // Green
            { outer: [0.7, 0.3, 1, 1], inner: [0.8, 0.5, 1, 1] }      // Purple
        ];
        var colorIdx = affectorNum - 1;
        var outerColor = affectorColors[colorIdx].outer;
        var innerColor = affectorColors[colorIdx].inner;

        // Outer ellipse group
        var outerGroup = contents.addProperty("ADBE Vector Group");
        outerGroup.name = "Outer";
        var outerVectors = outerGroup.property("ADBE Vectors Group");
        var outerEllipse = outerVectors.addProperty("ADBE Vector Shape - Ellipse");
        var outerSize = outerEllipse.property("ADBE Vector Ellipse Size");
        outerSize.setValue([400, 400]);
        var outerStroke = outerVectors.addProperty("ADBE Vector Graphic - Stroke");
        outerStroke.property("ADBE Vector Stroke Color").setValue(outerColor);
        outerStroke.property("ADBE Vector Stroke Width").setValue(3);

        // Inner ellipse group
        var innerGroup = contents.addProperty("ADBE Vector Group");
        innerGroup.name = "Inner";
        var innerVectors = innerGroup.property("ADBE Vectors Group");
        var innerEllipse = innerVectors.addProperty("ADBE Vector Shape - Ellipse");
        var innerSize = innerEllipse.property("ADBE Vector Ellipse Size");
        innerSize.setValue([100, 100]);
        var innerStroke = innerVectors.addProperty("ADBE Vector Graphic - Stroke");
        innerStroke.property("ADBE Vector Stroke Color").setValue(innerColor);
        innerStroke.property("ADBE Vector Stroke Width").setValue(2);

        // Outer Line rectangle group (for Line Mode)
        var outerLineGroup = contents.addProperty("ADBE Vector Group");
        outerLineGroup.name = "Outer Line";
        var outerLineVectors = outerLineGroup.property("ADBE Vectors Group");
        var outerLineRect = outerLineVectors.addProperty("ADBE Vector Shape - Rect");
        var outerLineSize = outerLineRect.property("ADBE Vector Rect Size");
        outerLineSize.setValue([400, 5000]);
        var outerLineStroke = outerLineVectors.addProperty("ADBE Vector Graphic - Stroke");
        outerLineStroke.property("ADBE Vector Stroke Color").setValue(outerColor);
        outerLineStroke.property("ADBE Vector Stroke Width").setValue(3);

        // Inner Line rectangle group (for Line Mode)
        var innerLineGroup = contents.addProperty("ADBE Vector Group");
        innerLineGroup.name = "Inner Line";
        var innerLineVectors = innerLineGroup.property("ADBE Vectors Group");
        var innerLineRect = innerLineVectors.addProperty("ADBE Vector Shape - Rect");
        var innerLineSize = innerLineRect.property("ADBE Vector Rect Size");
        innerLineSize.setValue([100, 5000]);
        var innerLineStroke = innerLineVectors.addProperty("ADBE Vector Graphic - Stroke");
        innerLineStroke.property("ADBE Vector Stroke Color").setValue(innerColor);
        innerLineStroke.property("ADBE Vector Stroke Width").setValue(2);

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

        // Line Mode checkbox (uses layer rotation for angle)
        var lineMode = effects.addProperty("ADBE Checkbox Control");
        lineMode.name = "Line Mode";
        lineMode.property("Checkbox").setValue(0);

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

        // Rotation offsets (degrees added to rotation)
        var rotX = effects.addProperty("ADBE Slider Control");
        rotX.name = "Rotation X";
        rotX.property("Slider").setValue(0);

        var rotY = effects.addProperty("ADBE Slider Control");
        rotY.name = "Rotation Y";
        rotY.property("Slider").setValue(0);

        var rotZ = effects.addProperty("ADBE Slider Control");
        rotZ.name = "Rotation Z";
        rotZ.property("Slider").setValue(0);

        // Mirror Rotation checkbox (flip rotation direction on opposite sides of affector)
        var mirrorRot = effects.addProperty("ADBE Checkbox Control");
        mirrorRot.name = "Mirror Rotation";
        mirrorRot.property("Checkbox").setValue(0);

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

        // AUTO-DETECT FROM SPACING (positions are reliable, sourceRectAtTime is not)
        //
        // The math:
        // - spacing = itemSize + gap (center to center distance)
        // - When items scale by growth%, they grow by: itemSize * growth
        // - Gap closes by: itemSize * growth (if both adjacent items scale)
        // - Compensation formula: compOffset = growth * sliderValue * integralFactor
        // - integralFactor ≈ 0.5 for nearby items
        // - To maintain gap: sliderValue = itemSize * 2 (for 1D) or * 4 (for 2D)
        // - Since itemSize ≈ spacing * 0.85: sliderValue = spacing * 1.7 (1D) or * 3.4 (2D)
        //
        var detectedItemSize = 400;  // Default fallback
        var debugInfo = [];

        try {
            // Step 1: Find parent layer (look for Parent Rig or layer with "Parent" in name)
            var parentLayer = null;
            debugInfo.push("Looking for parent among " + comp.numLayers + " layers");

            for (var pi = 1; pi <= comp.numLayers; pi++) {
                var pLayer = comp.layer(pi);
                var pName = pLayer.name;
                // Skip affectors and targets
                if (pName.indexOf("Affector") >= 0 || pName.indexOf("Target") >= 0) continue;
                // Find parent - check for Parent Rig effect OR layer name containing "Parent"
                var hasParentRig = hasEffect(pLayer, "Parent Rig - Parent");
                var hasDelay = hasEffect(pLayer, "PR_Delay");
                var nameHasParent = (pName.indexOf("Parent") >= 0);

                if (hasParentRig || hasDelay || nameHasParent) {
                    parentLayer = pLayer;
                    debugInfo.push("Found parent: " + pName + " (index " + pi + ")");
                    break;
                }
            }

            if (!parentLayer) {
                debugInfo.push("No parent layer found!");
            }

            // Step 2: Collect child positions AND sizes
            // Parent Rig uses expressions, NOT AE layer parenting, so we find children by:
            // - Looking for layers with "Parent Rig - Child" effect, OR
            // - All layers that aren't parent/affector/target (for presets)
            var childX = [];
            var childY = [];
            var childWidths = [];
            var childHeights = [];

            if (parentLayer) {
                for (var ci = 1; ci <= comp.numLayers; ci++) {
                    var layer = comp.layer(ci);
                    var lName = layer.name;

                    // Skip parent, affectors, targets
                    if (layer.index === parentLayer.index) continue;
                    if (lName.indexOf("Affector") >= 0) continue;
                    if (lName.indexOf("Target") >= 0) continue;
                    if (lName.indexOf("Parent") >= 0 && lName.indexOf("Parent Rig") < 0) continue;

                    // Check if it's a child (has child effect OR is a shape layer in a preset)
                    var isChild = hasEffect(layer, "Parent Rig - Child") || hasEffect(layer, "PR_Delay");

                    // For presets, children are shape layers without parent/affector/target in name
                    if (!isChild && layer instanceof ShapeLayer) {
                        // It's likely a preset child shape
                        isChild = true;
                    }

                    if (isChild) {
                        var pos = layer.transform.position.value;
                        childX.push(pos[0]);
                        childY.push(pos[1]);

                        // Try multiple methods to get layer size
                        var layerWidth = 0;
                        var layerHeight = 0;
                        var sizeMethod = "none";

                        // Method 1: sourceRectAtTime (standard way)
                        try {
                            var rect = layer.sourceRectAtTime(0, false);
                            if (rect && rect.width > 0) {
                                layerWidth = rect.width;
                                layerHeight = rect.height;
                                sizeMethod = "sourceRectAtTime";
                            }
                        } catch (e) {}

                        // Method 2: Try with comp.time instead of 0
                        if (layerWidth === 0) {
                            try {
                                var rect2 = layer.sourceRectAtTime(comp.time, false);
                                if (rect2 && rect2.width > 0) {
                                    layerWidth = rect2.width;
                                    layerHeight = rect2.height;
                                    sizeMethod = "sourceRectAtTime(comp.time)";
                                }
                            } catch (e) {}
                        }

                        // Method 3: For shape layers, try reading Rectangle Path size
                        if (layerWidth === 0 && layer instanceof ShapeLayer) {
                            try {
                                var contents = layer.property("Contents");
                                for (var gi = 1; gi <= contents.numProperties; gi++) {
                                    var group = contents.property(gi);
                                    if (group.matchName === "ADBE Vector Group") {
                                        var groupContents = group.property("Contents");
                                        for (var si = 1; si <= groupContents.numProperties; si++) {
                                            var shape = groupContents.property(si);
                                            if (shape.matchName === "ADBE Vector Shape - Rect") {
                                                var size = shape.property("Size").value;
                                                layerWidth = size[0];
                                                layerHeight = size[1];
                                                sizeMethod = "Rectangle Path Size";
                                                break;
                                            }
                                        }
                                    }
                                    if (layerWidth > 0) break;
                                }
                            } catch (e) {}
                        }

                        childWidths.push(layerWidth);
                        childHeights.push(layerHeight);
                        debugInfo.push("Child: " + lName + " pos[" + Math.round(pos[0]) + "," + Math.round(pos[1]) + "] size[" + layerWidth + "x" + layerHeight + "] via " + sizeMethod);
                    }
                }
                debugInfo.push("Found " + childX.length + " children total");
            }

            if (childX.length >= 2) {
                // Step 3: Find minimum spacing in X and Y
                childX.sort(function(a,b) { return a - b; });
                childY.sort(function(a,b) { return a - b; });

                var minSpacingX = Infinity;
                var minSpacingY = Infinity;

                for (var xi = 1; xi < childX.length; xi++) {
                    var diffX = childX[xi] - childX[xi-1];
                    if (diffX > 20 && diffX < minSpacingX) minSpacingX = diffX;
                }
                for (var yi = 1; yi < childY.length; yi++) {
                    var diffY = childY[yi] - childY[yi-1];
                    if (diffY > 20 && diffY < minSpacingY) minSpacingY = diffY;
                }

                debugInfo.push("minSpacingX: " + minSpacingX + ", minSpacingY: " + minSpacingY);

                // Step 4: Detect 1D vs 2D and arrangement direction
                var xRange = childX[childX.length-1] - childX[0];
                var yRange = childY[childY.length-1] - childY[0];
                var is2D = (xRange > 50 && yRange > 50);
                var isHorizontal = (xRange > yRange);  // Items spread more in X = horizontal arrangement
                debugInfo.push("xRange: " + xRange + ", yRange: " + yRange + ", is2D: " + is2D + ", horizontal: " + isHorizontal);

                // Step 5: Get average item size
                var avgWidth = 0, avgHeight = 0;
                for (var wi = 0; wi < childWidths.length; wi++) {
                    avgWidth += childWidths[wi];
                    avgHeight += childHeights[wi];
                }
                avgWidth = avgWidth / childWidths.length;
                avgHeight = avgHeight / childHeights.length;
                debugInfo.push("avgWidth: " + Math.round(avgWidth) + ", avgHeight: " + Math.round(avgHeight));

                // Step 6: Calculate slider value using the PROPER FORMULA
                //
                // The expression uses: compOffset = growth * sliderValue * integralRatio
                // Where integralRatio ≈ 2*spacing/outerRadius for immediate neighbors
                //
                // For proper compensation: sliderValue = itemSize / integralRatio
                // Therefore: sliderValue = itemSize * outerRadius / (2 * spacing) for 1D
                //            sliderValue = itemSize * outerRadius / spacing for 2D (more neighbors)
                //
                var itemDimension;
                if (is2D) {
                    itemDimension = Math.min(avgWidth, avgHeight);
                } else if (isHorizontal) {
                    itemDimension = avgWidth;
                } else {
                    itemDimension = avgHeight;
                }

                var spacing = is2D ? Math.min(minSpacingX, minSpacingY) : (isHorizontal ? minSpacingX : minSpacingY);
                var gap = spacing - itemDimension;

                // Outer radius defaults to half the smaller comp dimension
                var outerRadius = Math.min(comp.width, comp.height) / 2;

                // Apply the formula: itemSize * outerRadius / (2 * spacing)
                // Same formula for both 1D and 2D - the divide by 2 accounts for
                // spread going in both directions from the scaling center
                detectedItemSize = Math.round(itemDimension * outerRadius / (2 * spacing));

                debugInfo.push("itemDimension: " + Math.round(itemDimension) + ", spacing: " + spacing + ", gap: " + Math.round(gap));
                debugInfo.push("outerRadius: " + outerRadius + ", formula result: " + detectedItemSize);
            } else {
                debugInfo.push("Not enough children: " + childX.length);
            }
        } catch (detectErr) {
            debugInfo.push("Error: " + detectErr.toString());
            detectedItemSize = 400;
        }

        // Debug info available in debugInfo array if needed

        // Item Size (auto-detected, used internally for gap calculations)
        var itemSize = effects.addProperty("ADBE Slider Control");
        itemSize.name = "Item Size";
        itemSize.property("Slider").setValue(detectedItemSize);

        // Outer Affector Gap (adjusts gaps in the affector zone + ripples to neighbors)
        var affectorGap = effects.addProperty("ADBE Slider Control");
        affectorGap.name = "Outer Affector Gap";
        affectorGap.property("Slider").setValue(0);

        // Inner Affector Gap (only affects items inside the zone)
        var innerGapCtrl = effects.addProperty("ADBE Slider Control");
        innerGapCtrl.name = "Inner Affector Gap";
        innerGapCtrl.property("Slider").setValue(0);

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

        // Link ellipse sizes (size 0 when in line mode to not affect bounds)
        var outerSizeExpr = affector.property("ADBE Root Vectors Group").property("Outer").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        var innerSizeExpr = affector.property("ADBE Root Vectors Group").property("Inner").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        outerSizeExpr.expression = 'var r = effect("Outer Radius")("Slider"); var lineMode = effect("Line Mode")("Checkbox").value; if (lineMode == 1) { [0, 0]; } else { [r*2, r*2]; }';
        innerSizeExpr.expression = 'var r = effect("Inner Radius")("Slider"); var lineMode = effect("Line Mode")("Checkbox").value; if (lineMode == 1) { [0, 0]; } else { [r*2, r*2]; }';

        // Link rectangle sizes for Line Mode (size 0 when hidden to not affect bounds)
        var outerLineSizeExpr = affector.property("ADBE Root Vectors Group").property("Outer Line").property("ADBE Vectors Group").property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size");
        var innerLineSizeExpr = affector.property("ADBE Root Vectors Group").property("Inner Line").property("ADBE Vectors Group").property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size");
        outerLineSizeExpr.expression = 'var r = effect("Outer Radius")("Slider"); var lineMode = effect("Line Mode")("Checkbox").value; if (lineMode == 1) { [r*2, 5000]; } else { [0, 0]; }';
        innerLineSizeExpr.expression = 'var r = effect("Inner Radius")("Slider"); var lineMode = effect("Line Mode")("Checkbox").value; if (lineMode == 1) { [r*2, 5000]; } else { [0, 0]; }';

        // Set outer radius to half of the smaller comp dimension (access fresh reference)
        var affectorSize = Math.min(comp.width, comp.height) / 2;
        affector.effect("Outer Radius")("Slider").setValue(affectorSize);

        // Update existing rigged children to include affector code
        updateExistingRigsWithAffector(comp);

        // Apply standalone effects to pre-captured selected layers
        applyStandaloneToLayers(comp, selectedLayersForStandalone);

        // Select the new affector layer
        for (var rs = 0; rs < selectedLayersForStandalone.length; rs++) {
            try { selectedLayersForStandalone[rs].selected = false; } catch(e) {}
        }
        affector.selected = true;

    } catch (e) {
        alert("Error creating affector: " + e.toString());
        app.endUndoGroup();
        return "error";
    }

    app.endUndoGroup();
    return "success";
}

// ============================================
// TARGET
// ============================================

function addTarget() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return "error";
    }

    // Check if any rigged children have target support in their expressions
    var hasTargetSupport = false;
    var hasRiggedChildren = false;
    for (var ci = 1; ci <= comp.numLayers; ci++) {
        var layer = comp.layer(ci);
        if (hasEffect(layer, "Parent Rig - Child")) {
            hasRiggedChildren = true;
            // Check if position expression contains target code (handle split dimensions)
            try {
                var posExpr = layer.transform.position.expression || "";
                // If position is empty, check xPosition for split dimensions
                if (!posExpr || posExpr.length === 0) {
                    try {
                        var xPos = layer.property("ADBE Transform Group").property("ADBE Position_0");
                        if (xPos) posExpr = xPos.expression || "";
                    } catch(e2) {}
                }
                if (posExpr && posExpr.indexOf("TARGET SYSTEM") !== -1) {
                    hasTargetSupport = true;
                    break;
                }
            } catch (e) {}
        }
    }

    if (hasRiggedChildren && !hasTargetSupport) {
        alert("This rig wasn't created with Target support.\n\nTo enable: check 'Target system' and re-apply the Parent Rig.");
        return "no_support";
    }

    // Capture selected layers BEFORE creating target (creation changes selection)
    var selectedLayersForStandalone = [];
    for (var si = 1; si <= comp.numLayers; si++) {
        if (comp.layer(si).selected) {
            selectedLayersForStandalone.push(comp.layer(si));
        }
    }

    // Check which targets already exist (1-4)
    var existingTargets = [false, false, false, false];
    for (var i = 1; i <= comp.numLayers; i++) {
        var layerName = comp.layer(i).name;
        // Check for numbered names and legacy name
        if (layerName === "Parent Rig Target" || layerName === "Parent Rig Target 1") existingTargets[0] = true;
        if (layerName === "Parent Rig Target 2") existingTargets[1] = true;
        if (layerName === "Parent Rig Target 3") existingTargets[2] = true;
        if (layerName === "Parent Rig Target 4") existingTargets[3] = true;
    }

    // Find first available slot
    var targetNum = -1;
    for (var j = 0; j < 4; j++) {
        if (!existingTargets[j]) {
            targetNum = j + 1;
            break;
        }
    }

    if (targetNum === -1) {
        alert("Maximum of 4 targets allowed per composition.");
        return "exists";
    }

    var targetName = "Parent Rig Target " + targetNum;

    app.beginUndoGroup("Add " + targetName);

    try {
        // Create shape layer
        var target = comp.layers.addShape();
        target.name = targetName;
        target.guideLayer = true;

        // Check if any rigged layers are 3D - if so, make target 3D too
        var hasRigged3D = false;
        for (var li = 1; li <= comp.numLayers; li++) {
            var layer = comp.layer(li);
            if (layer.threeDLayer && hasEffect(layer, "Parent Rig - Child")) {
                hasRigged3D = true;
                break;
            }
        }
        if (hasRigged3D) {
            target.threeDLayer = true;
        }

        var contents = target.property("ADBE Root Vectors Group");

        // Colors per target: 1=Magenta/Cyan, 2=Red/Yellow, 3=Blue/Green, 4=Orange/Purple
        var targetColors = [
            { repelOuter: [1, 0.2, 0.6, 1], repelInner: [1, 0.5, 0.8, 1], lookAtOuter: [0.2, 0.8, 1, 1], lookAtInner: [0.5, 0.9, 1, 1] },
            { repelOuter: [1, 0.3, 0.3, 1], repelInner: [1, 0.5, 0.5, 1], lookAtOuter: [1, 0.9, 0.2, 1], lookAtInner: [1, 0.95, 0.5, 1] },
            { repelOuter: [0.3, 0.4, 1, 1], repelInner: [0.5, 0.6, 1, 1], lookAtOuter: [0.3, 0.9, 0.5, 1], lookAtInner: [0.5, 1, 0.7, 1] },
            { repelOuter: [1, 0.6, 0.2, 1], repelInner: [1, 0.75, 0.4, 1], lookAtOuter: [0.7, 0.4, 1, 1], lookAtInner: [0.8, 0.6, 1, 1] }
        ];
        var colorIdx = targetNum - 1;
        var repelOuterColor = targetColors[colorIdx].repelOuter;
        var repelInnerColor = targetColors[colorIdx].repelInner;
        var lookAtOuterColor = targetColors[colorIdx].lookAtOuter;
        var lookAtInnerColor = targetColors[colorIdx].lookAtInner;

        // === REPEL CIRCLES (Magenta, solid) ===
        // Repel Outer ellipse group
        var outerGroup = contents.addProperty("ADBE Vector Group");
        outerGroup.name = "Repel Outer";
        var outerVectors = outerGroup.property("ADBE Vectors Group");
        var outerEllipse = outerVectors.addProperty("ADBE Vector Shape - Ellipse");
        var outerSize = outerEllipse.property("ADBE Vector Ellipse Size");
        outerSize.setValue([400, 400]);
        var outerStroke = outerVectors.addProperty("ADBE Vector Graphic - Stroke");
        outerStroke.property("ADBE Vector Stroke Color").setValue(repelOuterColor);
        outerStroke.property("ADBE Vector Stroke Width").setValue(3);

        // Repel Inner ellipse group
        var innerGroup = contents.addProperty("ADBE Vector Group");
        innerGroup.name = "Repel Inner";
        var innerVectors = innerGroup.property("ADBE Vectors Group");
        var innerEllipse = innerVectors.addProperty("ADBE Vector Shape - Ellipse");
        var innerSize = innerEllipse.property("ADBE Vector Ellipse Size");
        innerSize.setValue([100, 100]);
        var innerStroke = innerVectors.addProperty("ADBE Vector Graphic - Stroke");
        innerStroke.property("ADBE Vector Stroke Color").setValue(repelInnerColor);
        innerStroke.property("ADBE Vector Stroke Width").setValue(2);

        // === LOOK AT CIRCLES (Cyan, dashed) ===
        // Look At Outer ellipse group
        var lookAtOuterGroup = contents.addProperty("ADBE Vector Group");
        lookAtOuterGroup.name = "Look At Outer";
        var lookAtOuterVectors = lookAtOuterGroup.property("ADBE Vectors Group");
        var lookAtOuterEllipse = lookAtOuterVectors.addProperty("ADBE Vector Shape - Ellipse");
        var lookAtOuterSize = lookAtOuterEllipse.property("ADBE Vector Ellipse Size");
        lookAtOuterSize.setValue([400, 400]);
        var lookAtOuterStroke = lookAtOuterVectors.addProperty("ADBE Vector Graphic - Stroke");
        lookAtOuterStroke.property("ADBE Vector Stroke Color").setValue(lookAtOuterColor);
        lookAtOuterStroke.property("ADBE Vector Stroke Width").setValue(2);

        // Look At Inner ellipse group
        var lookAtInnerGroup = contents.addProperty("ADBE Vector Group");
        lookAtInnerGroup.name = "Look At Inner";
        var lookAtInnerVectors = lookAtInnerGroup.property("ADBE Vectors Group");
        var lookAtInnerEllipse = lookAtInnerVectors.addProperty("ADBE Vector Shape - Ellipse");
        var lookAtInnerSize = lookAtInnerEllipse.property("ADBE Vector Ellipse Size");
        lookAtInnerSize.setValue([100, 100]);
        var lookAtInnerStroke = lookAtInnerVectors.addProperty("ADBE Vector Graphic - Stroke");
        lookAtInnerStroke.property("ADBE Vector Stroke Color").setValue(lookAtInnerColor);
        lookAtInnerStroke.property("ADBE Vector Stroke Width").setValue(2);

        // Crosshair - horizontal line
        var hLineGroup = contents.addProperty("ADBE Vector Group");
        hLineGroup.name = "H Line";
        var hLineVectors = hLineGroup.property("ADBE Vectors Group");
        var hLinePath = hLineVectors.addProperty("ADBE Vector Shape - Group");
        var hLinePathProp = hLinePath.property("ADBE Vector Shape");
        var hLineShape = new Shape();
        hLineShape.vertices = [[-30, 0], [30, 0]];
        hLineShape.closed = false;
        hLinePathProp.setValue(hLineShape);
        var hLineStroke = hLineVectors.addProperty("ADBE Vector Graphic - Stroke");
        hLineStroke.property("ADBE Vector Stroke Color").setValue(repelOuterColor);
        hLineStroke.property("ADBE Vector Stroke Width").setValue(2);

        // Crosshair - vertical line
        var vLineGroup = contents.addProperty("ADBE Vector Group");
        vLineGroup.name = "V Line";
        var vLineVectors = vLineGroup.property("ADBE Vectors Group");
        var vLinePath = vLineVectors.addProperty("ADBE Vector Shape - Group");
        var vLinePathProp = vLinePath.property("ADBE Vector Shape");
        var vLineShape = new Shape();
        vLineShape.vertices = [[0, -30], [0, 30]];
        vLineShape.closed = false;
        vLinePathProp.setValue(vLineShape);
        var vLineStroke = vLineVectors.addProperty("ADBE Vector Graphic - Stroke");
        vLineStroke.property("ADBE Vector Stroke Color").setValue(repelOuterColor);
        vLineStroke.property("ADBE Vector Stroke Width").setValue(2);

        // Position at top center of comp
        target.transform.position.setValue([comp.width / 2, 0]);

        // Add effects
        var effects = target.property("ADBE Effect Parade");

        // === LOOK AT SETTINGS ===
        var lookAt = effects.addProperty("ADBE Checkbox Control");
        lookAt.name = "Look At";
        lookAt.property("Checkbox").setValue(1);

        var rotCorrectionZ = effects.addProperty("ADBE Angle Control");
        rotCorrectionZ.name = "Z Rotation Correction";
        rotCorrectionZ.property("Angle").setValue(0);

        var rotCorrectionX = effects.addProperty("ADBE Angle Control");
        rotCorrectionX.name = "X Rotation Correction";
        rotCorrectionX.property("Angle").setValue(0);

        var rotCorrectionY = effects.addProperty("ADBE Angle Control");
        rotCorrectionY.name = "Y Rotation Correction";
        rotCorrectionY.property("Angle").setValue(0);

        var strength = effects.addProperty("ADBE Slider Control");
        strength.name = "Strength";
        strength.property("Slider").setValue(100);

        var lookAtOuterRadius = effects.addProperty("ADBE Slider Control");
        lookAtOuterRadius.name = "Look At Outer Radius";
        lookAtOuterRadius.property("Slider").setValue(200);

        var lookAtInnerRadius = effects.addProperty("ADBE Slider Control");
        lookAtInnerRadius.name = "Look At Inner Radius";
        lookAtInnerRadius.property("Slider").setValue(0);

        // Look At Falloff with keyframes (100 at frame 0, 0 at frame 60)
        var lookAtFalloff = effects.addProperty("ADBE Slider Control");
        lookAtFalloff.name = "Look At Falloff";
        var lookAtFalloffSlider = lookAtFalloff.property("Slider");
        lookAtFalloffSlider.setValueAtTime(0, 100);
        lookAtFalloffSlider.setValueAtTime(60 * comp.frameDuration, 0);

        // Parent Delay Influence: 0 = uses actual positions, 100 = syncs with delayed visual positions
        var delayInfluence = effects.addProperty("ADBE Slider Control");
        delayInfluence.name = "Parent Delay Influence";
        delayInfluence.property("Slider").setValue(0);

        // === REPEL SETTINGS ===
        var repel = effects.addProperty("ADBE Checkbox Control");
        repel.name = "Repel";
        repel.property("Checkbox").setValue(1);

        // Repel Falloff with keyframes (100 at frame 0, 0 at frame 60)
        var repelFalloff = effects.addProperty("ADBE Slider Control");
        repelFalloff.name = "Repel Falloff";
        var repelFalloffSlider = repelFalloff.property("Slider");
        repelFalloffSlider.setValueAtTime(0, 100);
        repelFalloffSlider.setValueAtTime(60 * comp.frameDuration, 0);

        var repelOuterRadius = effects.addProperty("ADBE Slider Control");
        repelOuterRadius.name = "Repel Outer Radius";
        repelOuterRadius.property("Slider").setValue(200);

        var repelInnerRadius = effects.addProperty("ADBE Slider Control");
        repelInnerRadius.name = "Repel Inner Radius";
        repelInnerRadius.property("Slider").setValue(0);

        var force = effects.addProperty("ADBE Slider Control");
        force.name = "Force";
        force.property("Slider").setValue(100);

        // Find parent layer to position target just above it in timeline
        var parentLayer = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.name === target.name) continue;
            if (layer.name === "Carousel Parent" || layer.name === "List Parent" || layer.name === "Grid Parent" ||
                hasEffect(layer, "Parent Rig - Parent") || hasEffect(layer, "PR_Delay")) {
                parentLayer = layer;
                break;
            }
        }

        if (parentLayer) {
            target.moveBefore(parentLayer);
        } else {
            target.moveToBeginning();
        }

        // Link Repel ellipse sizes to Repel radius controls (magenta solid circles)
        var repelOuterSizeExpr = target.property("ADBE Root Vectors Group").property("Repel Outer").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        var repelInnerSizeExpr = target.property("ADBE Root Vectors Group").property("Repel Inner").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        repelOuterSizeExpr.expression = 'var r = effect("Repel Outer Radius")("Slider"); [r*2, r*2];';
        repelInnerSizeExpr.expression = 'var r = effect("Repel Inner Radius")("Slider"); [r*2, r*2];';

        // Link Look At ellipse sizes to Look At radius controls (cyan dashed circles)
        var lookAtOuterSizeExpr = target.property("ADBE Root Vectors Group").property("Look At Outer").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        var lookAtInnerSizeExpr = target.property("ADBE Root Vectors Group").property("Look At Inner").property("ADBE Vectors Group").property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size");
        lookAtOuterSizeExpr.expression = 'var r = effect("Look At Outer Radius")("Slider"); [r*2, r*2];';
        lookAtInnerSizeExpr.expression = 'var r = effect("Look At Inner Radius")("Slider"); [r*2, r*2];';

        // Set outer radius to half of the smaller comp dimension for both Look At and Repel
        var targetSize = Math.min(comp.width, comp.height) / 2;
        target.effect("Look At Outer Radius")("Slider").setValue(targetSize);
        target.effect("Repel Outer Radius")("Slider").setValue(targetSize);

        // Update existing rigged children to include target code
        updateExistingRigsWithTarget(comp);

        // Apply standalone effects to pre-captured selected layers
        applyStandaloneToLayers(comp, selectedLayersForStandalone);

        // Select the new target layer
        for (var rs = 0; rs < selectedLayersForStandalone.length; rs++) {
            try { selectedLayersForStandalone[rs].selected = false; } catch(e) {}
        }
        target.selected = true;

    } catch (e) {
        alert("Error creating target: " + e.toString());
        app.endUndoGroup();
        return "error";
    }

    app.endUndoGroup();
    return "success";
}

// Re-apply expressions to existing rigged children so they include target code
function updateExistingRigsWithTarget(comp) {
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
        // Also detect if existing expressions have affector/target support
        var followOptions = {
            position: false,
            scale: false,
            rotation: false,
            opacity: false,
            anchor: false,
            includeAffector: false,
            includeTarget: false
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
            if (is3D) {
                followOptions.rotation = child.transform.zRotation.expression && child.transform.zRotation.expression.length > 0;
            } else {
                followOptions.rotation = child.transform.rotation.expression && child.transform.rotation.expression.length > 0;
            }
            followOptions.opacity = child.transform.opacity.expression && child.transform.opacity.expression.length > 0;
            followOptions.anchor = child.transform.anchorPoint.expression && child.transform.anchorPoint.expression.length > 0;

            // Detect if existing expressions have affector/target support
            var posExpr = splitDims ? (child.property("ADBE Transform Group").property("ADBE Position_0").expression || "") : (child.transform.position.expression || "");
            followOptions.includeAffector = posExpr.indexOf("AFFECTOR SYSTEM") !== -1;
            followOptions.includeTarget = posExpr.indexOf("TARGET SYSTEM") !== -1;
        } catch (e) {}

        // Re-apply expressions with stored rest position, preserving original follow options
        applyExpressions(child, parent, comp, is3D, splitDims, groupBounds, childRestPos, followOptions);
    }
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
        // Also detect if existing expressions have affector/target support
        var followOptions = {
            position: false,
            scale: false,
            rotation: false,
            opacity: false,
            anchor: false,
            includeAffector: false,
            includeTarget: false
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
            if (is3D) {
                followOptions.rotation = child.transform.zRotation.expression && child.transform.zRotation.expression.length > 0;
            } else {
                followOptions.rotation = child.transform.rotation.expression && child.transform.rotation.expression.length > 0;
            }
            followOptions.opacity = child.transform.opacity.expression && child.transform.opacity.expression.length > 0;
            followOptions.anchor = child.transform.anchorPoint.expression && child.transform.anchorPoint.expression.length > 0;

            // Detect if existing expressions have affector/target support
            var posExpr = splitDims ? (child.property("ADBE Transform Group").property("ADBE Position_0").expression || "") : (child.transform.position.expression || "");
            followOptions.includeAffector = posExpr.indexOf("AFFECTOR SYSTEM") !== -1;
            followOptions.includeTarget = posExpr.indexOf("TARGET SYSTEM") !== -1;
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

    // Extract dynamic system flags (default to false for performance)
    var includeAffector = followOptions.includeAffector || false;
    var includeTarget = followOptions.includeTarget || false;

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
            '// Optional time parameter - defaults to current time if not provided',
            'function findLeaderLayer(atTime) {',
            '    var t = (atTime !== undefined) ? atTime : time;',
            '    var leaderIdx = Math.round(leaderIndexProp.valueAtTime(t));',
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
            '// Get leader index at a specific time',
            'function getLeaderIndexAtTime(atTime) {',
            '    var t = (atTime !== undefined) ? atTime : time;',
            '    return Math.round(leaderIndexProp.valueAtTime(t));',
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
            ''
        ]);

        // Conditionally add AFFECTOR SYSTEM (only if checkbox enabled)
        if (includeAffector) {
            header = header.concat([
            '// ===== AFFECTOR SYSTEM =====',
            'var affectors = [];',
            'for (var _ai = 1; _ai <= 4; _ai++) {',
            '    try { var _a = thisComp.layer("Parent Rig Affector " + _ai); if (_a) affectors.push(_a); } catch(e) {}',
            '}',
            'try { var _aL = thisComp.layer("Parent Rig Affector"); if (_aL) affectors.push(_aL); } catch(e) {}',
            'var affector = affectors[0] || null;',
            '',
            '// Helper to calculate influence for a given affector layer',
            'function calcInfluenceFor(aff, pos) {',
            '    if (!aff) return 0;',
            '    var globalInf = 100;',
            '    try { globalInf = aff.effect("Influence")("Slider").value; } catch(e) {}',
            '    globalInf = globalInf / 100;',
            '    if (globalInf <= 0) return 0;',
            '    var outerR = 200;',
            '    var innerR = 0;',
            '    try { outerR = aff.effect("Outer Radius")("Slider").value; } catch(e) {}',
            '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
            '    if (outerR <= 0) return 0;',
            '    var affectorPos = aff.transform.position.value;',
            '    var dx = pos[0] - affectorPos[0];',
            '    var dy = pos[1] - affectorPos[1];',
            '    ',
            '    var lineMode = 0;',
            '    try { lineMode = aff.effect("Line Mode")("Checkbox").value; } catch(e) {}',
            '    var dist;',
            '    if (lineMode) {',
            '        var angle = (aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180;',
            '        dist = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));',
            '    } else {',
            '        dist = Math.sqrt(dx * dx + dy * dy);',
            '    }',
            '    ',
            '    if (dist <= innerR) return globalInf;',
            '    if (dist >= outerR) return 0;',
            '    var falloffRange = outerR - innerR;',
            '    var normalizedDist = (dist - innerR) / falloffRange;',
            '    try {',
            '        var falloffProp = aff.effect("Falloff")("Slider");',
            '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
            '        return (falloffVal / 100) * globalInf;',
            '    } catch(e) { return (1 - normalizedDist) * globalInf; }',
            '}',
            '',
            '// Spatial influence only (ignores global Influence slider) - used for rotation with mirror',
            'function calcSpatialInfluenceFor(aff, pos) {',
            '    if (!aff) return 0;',
            '    var outerR = 200;',
            '    var innerR = 0;',
            '    try { outerR = aff.effect("Outer Radius")("Slider").value; } catch(e) {}',
            '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
            '    if (outerR <= 0) return 0;',
            '    var affectorPos = aff.transform.position.value;',
            '    var dx = pos[0] - affectorPos[0];',
            '    var dy = pos[1] - affectorPos[1];',
            '    var lineMode = 0;',
            '    try { lineMode = aff.effect("Line Mode")("Checkbox").value; } catch(e) {}',
            '    var dist;',
            '    if (lineMode) {',
            '        var angle = (aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180;',
            '        dist = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));',
            '    } else {',
            '        dist = Math.sqrt(dx * dx + dy * dy);',
            '    }',
            '    if (dist <= innerR) return 1;',
            '    if (dist >= outerR) return 0;',
            '    var falloffRange = outerR - innerR;',
            '    var normalizedDist = (dist - innerR) / falloffRange;',
            '    try {',
            '        var falloffProp = aff.effect("Falloff")("Slider");',
            '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
            '        return falloffVal / 100;',
            '    } catch(e) { return 1 - normalizedDist; }',
            '}',
            '',
            '// Legacy wrappers for spread calculation (uses affector 1 only)',
            'function getAffectorOuterRadius() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Outer Radius")("Slider").value; } catch(e) { return 200; }',
            '}',
            'function getAffectorInnerRadius() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Inner Radius")("Slider").value; } catch(e) { return 0; }',
            '}',
            'function getGlobalInfluence() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Influence")("Slider").value; } catch(e) { return 100; }',
            '}',
            'function getAffectorLineMode() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Line Mode")("Checkbox").value; } catch(e) { return 0; }',
            '}',
            'function getAffectorInfluence(pos) {',
            '    return calcInfluenceFor(affector, pos);',
            '}',
            '',
            'function getAffectorItemSize() {',
            '    if (!affector) return 100;',
            '    try { return affector.effect("Item Size")("Slider").value; } catch(e) { return 100; }',
            '}',
            '',
            'function getAffectorGap() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Outer Affector Gap")("Slider").value; } catch(e) { return 0; }',
            '}',
            '',
            'function getAffectorInnerGap() {',
            '    if (!affector) return 0;',
            '    try { return affector.effect("Inner Affector Gap")("Slider").value; } catch(e) { return 0; }',
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
            '    var innerGap = getAffectorInnerGap();',
            '    var globalGap = getGlobalGap();',
            '    var outerR = getAffectorOuterRadius();',
            '    var innerR = getAffectorInnerRadius();',
            '    var lineMode = getAffectorLineMode();',
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
            '    // Get max scale (at center)',
            '    var maxScalePercent = 100;',
            '    try { maxScalePercent = affector.effect("Scale")("Slider").value; } catch(e) {}',
            '    var growth = maxScalePercent / 100 - 1;',
            '    ',
            '    var maxIntegral = falloffRadius / 2;',
            '    if (maxIntegral <= 0) maxIntegral = 1;',
            '    ',
            '    var totalOffsetX = 0;',
            '    var totalOffsetY = 0;',
            '    ',
            '    if (lineMode) {',
            '        // LINE MODE: spread along line direction only',
            '        var angle = (affector.threeDLayer ? affector.transform.zRotation.value : affector.transform.rotation.value) * Math.PI / 180;',
            '        var cosA = Math.cos(angle);',
            '        var sinA = Math.sin(angle);',
            '        ',
            '        // Distance along line (signed - which side of center)',
            '        var alongDist = dx * cosA + dy * sinA;',
            '        ',
            '        // Adjust for inner radius',
            '        var distAlong = Math.abs(alongDist) > innerR ? (Math.abs(alongDist) - innerR) * (alongDist >= 0 ? 1 : -1) : 0;',
            '        ',
            '        // Integral for along-line direction',
            '        var integralAlong = influenceIntegral(distAlong, falloffRadius);',
            '        ',
            '        // Scale compensation',
            '        var compOffset = growth * itemSize * integralAlong / maxIntegral;',
            '        ',
            '        // Outer Affector Gap',
            '        var affectorOffset = affectorGap * integralAlong / maxIntegral;',
            '        ',
            '        // Global Gap',
            '        var itemsAway = Math.abs(alongDist) / itemSize;',
            '        var alongDir = alongDist > 0 ? 1 : (alongDist < 0 ? -1 : 0);',
            '        var globalOffset = itemsAway * globalGap * alongDir;',
            '        ',
            '        // Total offset along line direction',
            '        var totalAlong = compOffset + affectorOffset + globalOffset;',
            '        ',
            '        // Convert along-line offset back to X/Y',
            '        // Line direction is (cosA, sinA)',
            '        totalOffsetX = totalAlong * cosA;',
            '        totalOffsetY = totalAlong * sinA;',
            '    } else {',
            '        // CIRCLE MODE: true radial spread with LINEAR gaps',
            '        // Calculate radial distance and direction',
            '        var radialDist = Math.sqrt(dx * dx + dy * dy);',
            '        if (radialDist < 0.001) radialDist = 0.001; // Avoid division by zero',
            '        var unitX = dx / radialDist;',
            '        var unitY = dy / radialDist;',
            '        ',
            '        // For even VISUAL gaps, use integral of linear falloff influence',
            '        // This accounts for items closer to center scaling more (taking more space)',
            '        var outerR = innerR + falloffRadius;',
            '        var spreadDist = Math.min(radialDist, outerR);',
            '        ',
            '        // Integral of linear falloff: d - d²/(2r) gives proper compensation',
            '        // Items near center get less spread (they scale more, need less push)',
            '        // Items further get more relative spread (they scale less)',
            '        var compOffset = outerR > 0 ? growth * (spreadDist - spreadDist * spreadDist / (2 * outerR)) : 0;',
            '        ',
            '        // Affector gap uses effectiveDist (distance from inner radius edge)',
            '        var effectiveDist = radialDist > innerR ? radialDist - innerR : 0;',
            '        var affectorRatio = falloffRadius > 0 ? Math.min(effectiveDist / falloffRadius, 1) : 0;',
            '        var affectorOffset = affectorGap * affectorRatio;',
            '        ',
            '        // Global gap (based on how many items away)',
            '        var itemsAway = radialDist / itemSize;',
            '        var globalOffset = itemsAway * globalGap;',
            '        ',
            '        // Total radial offset, applied in unit direction',
            '        var totalRadial = compOffset + affectorOffset + globalOffset;',
            '        totalOffsetX = totalRadial * unitX;',
            '        totalOffsetY = totalRadial * unitY;',
            '    }',
            '    ',
            '    // Apply Inner Affector Gap (expands/contracts gaps inside zone)',
            '    var influence = getAffectorInfluence(parentedPos);',
            '    var innerGapMult = 1 + (innerGap / 100) * influence;',
            '    ',
            '    return [totalOffsetX * innerGapMult, totalOffsetY * innerGapMult];',
            '}',
            '',
            'function getAffectorPositionOffset(pos) {',
            '    var totalX = 0, totalY = 0, totalZ = 0;',
            '    for (var _i = 0; _i < affectors.length; _i++) {',
            '        var aff = affectors[_i];',
            '        var inf = calcInfluenceFor(aff, pos);',
            '        if (inf > 0) {',
            '            var px = 0, py = 0, pz = 0;',
            '            try { px = aff.effect("Position X")("Slider").value; } catch(e) {}',
            '            try { py = aff.effect("Position Y")("Slider").value; } catch(e) {}',
            '            try { pz = aff.effect("Position Z")("Slider").value; } catch(e) {}',
            '            totalX += px * inf;',
            '            totalY += py * inf;',
            '            totalZ += pz * inf;',
            '        }',
            '    }',
            '    return [totalX, totalY, totalZ];',
            '}',
            '',
            'function getAffectorScaleMult(pos) {',
            '    var total = 0;',
            '    for (var _i = 0; _i < affectors.length; _i++) {',
            '        var aff = affectors[_i];',
            '        var inf = calcInfluenceFor(aff, pos);',
            '        if (inf > 0) {',
            '            var amt = 100;',
            '            try { amt = aff.effect("Scale")("Slider").value; } catch(e) {}',
            '            total += (amt - 100) * inf;',
            '        }',
            '    }',
            '    return 100 + total;',
            '}',
            '',
            '// Helper to get mirror sign for a specific affector',
            '// Returns -1 or 1 based on which side of the affector line the item is',
            'function getMirrorSignFor(aff, pos) {',
            '    if (!aff) return 1;',
            '    var mirror = 0;',
            '    try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
            '    if (!mirror) return 1;',
            '    var affectorPos = aff.transform.position.value;',
            '    var dx = pos[0] - affectorPos[0];',
            '    var dy = pos[1] - affectorPos[1];',
            '    var angle = (aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180;',
            '    // Use PERPENDICULAR distance to determine which side of the line',
            '    // perpDist = -dx * sin(angle) + dy * cos(angle)',
            '    // For 0° rotation: perpDist = dy (above/below)',
            '    // For 90° rotation: perpDist = -dx (left/right)',
            '    var perpDist = -dx * Math.sin(angle) + dy * Math.cos(angle);',
            '    // Get inner radius - items within inner radius get no mirror flip',
            '    var innerR = 0;',
            '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
            '    // Within inner radius: no flip (neutral zone)',
            '    if (innerR > 0 && Math.abs(perpDist) <= innerR) {',
            '        return 1;',
            '    }',
            '    // Outside inner radius: flip based on which side of the line',
            '    return perpDist >= 0 ? 1 : -1;',
            '}',
            '',
            'function getAffectorRotationXBoost(pos) {',
            '    var total = 0;',
            '    for (var _i = 0; _i < affectors.length; _i++) {',
            '        var aff = affectors[_i];',
            '        var mirror = 0;',
            '        try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
            '        var inf = mirror ? calcSpatialInfluenceFor(aff, pos) : calcInfluenceFor(aff, pos);',
            '        if (inf > 0) {',
            '            var amt = 0;',
            '            try { amt = aff.effect("Rotation X")("Slider").value; } catch(e) {}',
            '            total += amt * inf * getMirrorSignFor(aff, pos);',
            '        }',
            '    }',
            '    return total;',
            '}',
            '',
            'function getAffectorRotationYBoost(pos) {',
            '    var total = 0;',
            '    for (var _i = 0; _i < affectors.length; _i++) {',
            '        var aff = affectors[_i];',
            '        var mirror = 0;',
            '        try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
            '        var inf = mirror ? calcSpatialInfluenceFor(aff, pos) : calcInfluenceFor(aff, pos);',
            '        if (inf > 0) {',
            '            var amt = 0;',
            '            try { amt = aff.effect("Rotation Y")("Slider").value; } catch(e) {}',
            '            total += amt * inf * getMirrorSignFor(aff, pos);',
            '        }',
            '    }',
            '    return total;',
            '}',
            '',
            'function getAffectorRotationZBoost(pos) {',
            '    var total = 0;',
            '    for (var _i = 0; _i < affectors.length; _i++) {',
            '        var aff = affectors[_i];',
            '        var mirror = 0;',
            '        try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
            '        var inf = mirror ? calcSpatialInfluenceFor(aff, pos) : calcInfluenceFor(aff, pos);',
            '        if (inf > 0) {',
            '            var amt = 0;',
            '            try { amt = aff.effect("Rotation Z")("Slider").value; } catch(e) {}',
            '            total += amt * inf * getMirrorSignFor(aff, pos);',
            '        }',
            '    }',
            '    return total;',
            '}',
            '',
            'function getAffectorOpacityMult(pos) {',
            '    var total = 0;',
            '    for (var _i = 0; _i < affectors.length; _i++) {',
            '        var aff = affectors[_i];',
            '        var inf = calcInfluenceFor(aff, pos);',
            '        if (inf > 0) {',
            '            var amt = 100;',
            '            try { amt = aff.effect("Opacity")("Slider").value; } catch(e) {}',
            '            total += (amt - 100) * inf;',
            '        }',
            '    }',
            '    return 100 + total;',
            '}',
            ''
            ]);
        }

        // Conditionally add TARGET SYSTEM (only if checkbox enabled)
        if (includeTarget) {
            header = header.concat([
            '// ===== TARGET SYSTEM =====',
            'var targets = [];',
            'for (var _ti = 1; _ti <= 4; _ti++) {',
            '    try { var _t = thisComp.layer("Parent Rig Target " + _ti); if (_t) targets.push(_t); } catch(e) {}',
            '}',
            'try { var _tL = thisComp.layer("Parent Rig Target"); if (_tL) targets.push(_tL); } catch(e) {}',
            '',
            'function calcLookAtInfluenceFor(tgt, pos) {',
            '    if (!tgt) return 0;',
            '    var outerR = 200;',
            '    var innerR = 0;',
            '    try { outerR = tgt.effect("Look At Outer Radius")("Slider").value; } catch(e) {}',
            '    try { innerR = tgt.effect("Look At Inner Radius")("Slider").value; } catch(e) {}',
            '    if (outerR <= 0) return 0;',
            '    var targetPos = tgt.transform.position.value;',
            '    var dx = pos[0] - targetPos[0];',
            '    var dy = pos[1] - targetPos[1];',
            '    var dz = (pos[2] || 0) - (targetPos[2] || 0);',
            '    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
            '    if (dist <= innerR) return 1;',
            '    if (dist >= outerR) return 0;',
            '    var falloffRange = outerR - innerR;',
            '    var normalizedDist = (dist - innerR) / falloffRange;',
            '    try {',
            '        var falloffProp = tgt.effect("Look At Falloff")("Slider");',
            '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
            '        return falloffVal / 100;',
            '    } catch(e) { return 1 - normalizedDist; }',
            '}',
            '',
            'function calcRepelInfluenceFor(tgt, pos) {',
            '    if (!tgt) return 0;',
            '    var outerR = 200;',
            '    var innerR = 0;',
            '    try { outerR = tgt.effect("Repel Outer Radius")("Slider").value; } catch(e) {}',
            '    try { innerR = tgt.effect("Repel Inner Radius")("Slider").value; } catch(e) {}',
            '    if (outerR <= 0) return 0;',
            '    var targetPos = tgt.transform.position.value;',
            '    var dx = pos[0] - targetPos[0];',
            '    var dy = pos[1] - targetPos[1];',
            '    var dz = (pos[2] || 0) - (targetPos[2] || 0);',
            '    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
            '    if (dist <= innerR) return 1;',
            '    if (dist >= outerR) return 0;',
            '    var falloffRange = outerR - innerR;',
            '    var normalizedDist = (dist - innerR) / falloffRange;',
            '    try {',
            '        var falloffProp = tgt.effect("Repel Falloff")("Slider");',
            '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
            '        return falloffVal / 100;',
            '    } catch(e) { return 1 - normalizedDist; }',
            '}',
            '',
            'function getTargetLookAtRotation(pos, currentRot) {',
            '    var totalRot = currentRot;',
            '    for (var _i = 0; _i < targets.length; _i++) {',
            '        var tgt = targets[_i];',
            '        var lookAtEnabled = 0;',
            '        try { lookAtEnabled = tgt.effect("Look At")("Checkbox").value; } catch(e) {}',
            '        if (!lookAtEnabled) continue;',
            '        var influence = calcLookAtInfluenceFor(tgt, pos);',
            '        if (influence <= 0) continue;',
            '        var strength = 100;',
            '        try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
            '        if (strength === 0) continue;',
            '        var rotCorrection = 0;',
            '        try { rotCorrection = tgt.effect("Z Rotation Correction")("Angle").value; } catch(e) {}',
            '        var targetPos = tgt.transform.position.value;',
            '        var dx = targetPos[0] - pos[0];',
            '        var dy = targetPos[1] - pos[1];',
            '        var angleToTarget = Math.atan2(dy, dx) * 180 / Math.PI + rotCorrection;',
            '        var lookAtAngle = angleToTarget * (strength / 100);',
            '        totalRot += lookAtAngle * influence;',
            '    }',
            '    return totalRot;',
            '}',
            '',
            '// X rotation (pitch) for 3D look-at',
            'function getTargetLookAtRotationX(pos, currentRot) {',
            '    var totalRot = currentRot;',
            '    for (var _i = 0; _i < targets.length; _i++) {',
            '        var tgt = targets[_i];',
            '        var lookAtEnabled = 0;',
            '        try { lookAtEnabled = tgt.effect("Look At")("Checkbox").value; } catch(e) {}',
            '        if (!lookAtEnabled) continue;',
            '        var influence = calcLookAtInfluenceFor(tgt, pos);',
            '        if (influence <= 0) continue;',
            '        var strength = 100;',
            '        try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
            '        if (strength === 0) continue;',
            '        var rotCorrection = 0;',
            '        try { rotCorrection = tgt.effect("X Rotation Correction")("Angle").value; } catch(e) {}',
            '        var targetPos = tgt.transform.position.value;',
            '        var dx = targetPos[0] - pos[0];',
            '        var dy = targetPos[1] - pos[1];',
            '        var dz = (targetPos[2] || 0) - (pos[2] || 0);',
            '        var horizontalDist = Math.sqrt(dx * dx + dy * dy);',
            '        var pitchAngle = Math.atan2(dz, horizontalDist) * 180 / Math.PI + rotCorrection;',
            '        var lookAtPitch = pitchAngle * (strength / 100);',
            '        totalRot += lookAtPitch * influence;',
            '    }',
            '    return totalRot;',
            '}',
            '',
            'function getTargetRepelOffset(pos) {',
            '    var totalX = 0, totalY = 0, totalZ = 0;',
            '    for (var _i = 0; _i < targets.length; _i++) {',
            '        var tgt = targets[_i];',
            '        var repelEnabled = 0;',
            '        try { repelEnabled = tgt.effect("Repel")("Checkbox").value; } catch(e) {}',
            '        if (!repelEnabled) continue;',
            '        var influence = calcRepelInfluenceFor(tgt, pos);',
            '        if (influence <= 0) continue;',
            '        var force = 100;',
            '        try { force = tgt.effect("Force")("Slider").value; } catch(e) {}',
            '        if (force === 0) continue;',
            '        var targetPos = tgt.transform.position.value;',
            '        var dx = pos[0] - targetPos[0];',
            '        var dy = pos[1] - targetPos[1];',
            '        var dz = (pos[2] || 0) - (targetPos[2] || 0);',
            '        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
            '        if (dist === 0) continue;',
            '        var pushAmount = force * influence;',
            '        totalX += (dx / dist) * pushAmount;',
            '        totalY += (dy / dist) * pushAmount;',
            '        totalZ += (dz / dist) * pushAmount;',
            '    }',
            '    return [totalX, totalY, totalZ];',
            '}',
            ''
            ]);
        }

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
            '// ===== AFFECTOR/TARGET STUBS (Fallback Mode - features not available) =====',
            'var affectors = [];',
            'var affector = null;',
            'var targets = [];',
            'function calcInfluenceFor(aff, pos) { return 0; }',
            'function calcSpatialInfluenceFor(aff, pos) { return 0; }',
            'function getAffectorInfluence(pos) { return 0; }',
            'function getAffectorOuterRadius() { return 0; }',
            'function getAffectorInnerRadius() { return 0; }',
            'function getGlobalInfluence() { return 100; }',
            'function getAffectorLineMode() { return 0; }',
            'function getAffectorItemSize() { return 100; }',
            'function getAffectorGap() { return 0; }',
            'function getAffectorInnerGap() { return 0; }',
            'function getGlobalGap() { return 0; }',
            'function getScaleMultAtPos(pos) { return 1; }',
            'function influenceIntegral(x, radius) { return 0; }',
            'function getAffectorSpread(parentedPos, restPos) { return [0, 0]; }',
            'function getAffectorPositionOffset(pos) { return [0, 0, 0]; }',
            'function getAffectorScaleMult(pos) { return 100; }',
            'function getAffectorRotationZBoost(pos) { return 0; }',
            'function getAffectorRotationXBoost(pos) { return 0; }',
            'function getAffectorRotationYBoost(pos) { return 0; }',
            'function getAffectorOpacityMult(pos) { return 100; }',
            'function calcLookAtInfluenceFor(tgt, pos) { return 0; }',
            'function calcRepelInfluenceFor(tgt, pos) { return 0; }',
            'function getTargetLookAtRotation(pos, currentRot) { return currentRot; }',
            'function getTargetLookAtRotationX(pos, currentRot) { return currentRot; }',
            'function getTargetRepelOffset(pos) { return [0, 0, 0]; }',
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
            '// Function to get delay/stretch at a specific time (returns 0 if delays disabled for this transform)',
            'function getDelayAtTime(t) {',
            '    if (!applyDelayToThisTransform) return 0;',
            '    return delayProp.valueAtTime(t) * myIndex * thisComp.frameDuration;',
            '}',
            'function getStretchAtTime(t) {',
            '    if (!applyDelayToThisTransform) return 0;',
            '    return effect("PR_Delay Stretch")("Slider").valueAtTime(t) * myIndex * thisComp.frameDuration;',
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
        ];
        header = header.join('\n');
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
        '        // Calculate movement between keyframes',
        '        var moveDiff = 0;',
        '        if (v1 instanceof Array) {',
        '            for (var d = 0; d < v1.length; d++) {',
        '                moveDiff = Math.max(moveDiff, Math.abs(v1[d] - v2[d]));',
        '            }',
        '        } else {',
        '            moveDiff = Math.abs(v1 - v2);',
        '        }',
        '        ',
        '        // Detect static segments: large time gap (15+ frames) AND small movement (< 2 units)',
        '        var frameGap = (t2 - t1) / thisComp.frameDuration;',
        '        var isStatic = (frameGap >= 15 && moveDiff < 2.0);',
        '        var isAnim = !isStatic && moveDiff > 0.001;',
        '        ',
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
        '    // Prevent segment overlap when delay settings change between segments',
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
        '// Scale version - accumulates ratio deltas (scale changes relative to rest)',
        '// Returns array of ratio deltas: finalScale = restScale * (1 + ratioDelta)',
        'function getAccumulatedScaleRatioDelta(t, prop, parentRestScale) {',
        '    // PERFORMANCE: Check for constant influence (no keyframes)',
        '    var hasInfluenceKeys = influencePropGlobal.numKeys > 0 || parentInfluenceProp.numKeys > 0;',
        '    var currentInfluence = influencePropGlobal.value / 100 * parentInfluenceProp.value / 100;',
        '    ',
        '    // Fast path: constant 0% influence - no scale change',
        '    if (!hasInfluenceKeys && currentInfluence === 0) {',
        '        return parentRestScale.length === 3 ? [0,0,0] : [0,0];',
        '    }',
        '    ',
        '    // Fast path: constant 100% influence - use simple time remapping',
        '    if (!hasInfluenceKeys && currentInfluence === 1) {',
        '        var remapInfo = getRemapInfo(t, prop);',
        '        var parentScale1 = prop.valueAtTime(remapInfo.t1);',
        '        var parentScale2 = prop.valueAtTime(remapInfo.t2);',
        '        var parentScale = blendValues(parentScale1, parentScale2, remapInfo.blend);',
        '        // Return ratio delta: (parentScale / parentRestScale) - 1',
        '        var ratioDelta = [];',
        '        for (var i = 0; i < parentScale.length; i++) {',
        '            ratioDelta.push((parentScale[i] / parentRestScale[i]) - 1);',
        '        }',
        '        return ratioDelta;',
        '    }',
        '    ',
        '    // Animated influence - need to iterate through segments',
        '    var childSegs = buildChildSegs(prop);',
        '    if (childSegs.length === 0) return null;',
        '    ',
        '    var firstSeg = childSegs[0];',
        '    if (t < firstSeg.childStart) return null;',
        '    ',
        '    var accumulated = parentRestScale.length === 3 ? [0,0,0] : [0,0];',
        '    ',
        '    for (var i = 0; i < childSegs.length; i++) {',
        '        var seg = childSegs[i];',
        '        if (t < seg.childStart) break;',
        '        ',
        '        // Skip segments with 0% influence entirely',
        '        if (seg.influence === 0) continue;',
        '        ',
        '        var segStartScale = prop.valueAtTime(seg.parentStart);',
        '        var segEndScale = prop.valueAtTime(seg.parentEnd);',
        '        ',
        '        if (t >= seg.childEnd) {',
        '            // Segment complete - add full ratio delta weighted by influence',
        '            for (var j = 0; j < accumulated.length; j++) {',
        '                var segRatioDelta = (segEndScale[j] / segStartScale[j]) - 1;',
        '                accumulated[j] += segRatioDelta * seg.influence;',
        '            }',
        '        } else {',
        '            // Segment in progress - add partial ratio delta weighted by influence',
        '            var progress = (t - seg.childStart) / (seg.childEnd - seg.childStart);',
        '            progress = Math.max(0, Math.min(1, progress));',
        '            var parentTime = seg.parentStart + progress * seg.parentDur;',
        '            var currentScale = prop.valueAtTime(parentTime);',
        '            for (var j = 0; j < accumulated.length; j++) {',
        '                var partialRatioDelta = (currentScale[j] / segStartScale[j]) - 1;',
        '                accumulated[j] += partialRatioDelta * seg.influence;',
        '            }',
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
        '    // Get scale and rotation props - use raw time, not remapped',
        '    var scaleProp = parentLayer.transform.scale;',
        '    var rotProp = parentLayer.transform.rotation;',
        '    ',
        '    // Determine pivot REST position based on mode',
        '    // IMPORTANT: Use REST positions for both child and pivot to stay in local space',
        '    // This ensures scaling works correctly regardless of where parent is on screen',
        '    var scalePivotPos = parentRestPos;  // Default to parent rest position (mode 2)',
        '    var rotatePivotPos = parentRestPos;',
        '    ',
        '    // For Leader mode, get leader\'s REST position from their effect',
        '    if (scaleAroundMode === 3 || rotateAroundMode === 3) {',
        '        // Always use raw time to find leader - children see same leader at same timeline moment',
        '        // (Delay affects WHEN they see transforms, not WHICH leader they see)',
        '        var leaderIdx = getLeaderIndexAtTime(time);',
        '        ',
        '        // Helper to get leader REST position from their effect (in local space)',
        '        // Use index-based access: 3=Rest Pos X, 4=Rest Pos Y, 5=Rest Pos Z',
        '        function getLeaderRestPos(leaderLayer) {',
        '            try {',
        '                var childEff = leaderLayer.effect("Parent Rig - Child");',
        '                if (childEff) {',
        '                    return [childEff(3).value, childEff(4).value' + (is3D ? ', childEff(5).value' : '') + '];',
        '                }',
        '            } catch(e) {}',
        '            // Fallback to old slider mode',
        '            try {',
        '                var rx = leaderLayer.effect("PR_RestPosX")("Slider").value;',
        '                var ry = leaderLayer.effect("PR_RestPosY")("Slider").value;',
        '                return [rx, ry' + (is3D ? ', 0' : '') + '];',
        '            } catch(e) {}',
        '            return null;',
        '        }',
        '        ',
        '        if (scaleAroundMode === 3) {',
        '            if (myIndex !== leaderIdx) {',
        '                var leaderLayerScale = findLeaderLayer(time);',
        '                if (leaderLayerScale) {',
        '                    var leaderRest = getLeaderRestPos(leaderLayerScale);',
        '                    if (leaderRest) scalePivotPos = leaderRest;',
        '                }',
        '            } else {',
        '                // I am the leader for scale - skip',
        '                scalePivotPos = null;',
        '            }',
        '        }',
        '        ',
        '        if (rotateAroundMode === 3) {',
        '            if (myIndex !== leaderIdx) {',
        '                var leaderLayerRotate = findLeaderLayer(time);',
        '                if (leaderLayerRotate) {',
        '                    var leaderRest = getLeaderRestPos(leaderLayerRotate);',
        '                    if (leaderRest) rotatePivotPos = leaderRest;',
        '                }',
        '            } else {',
        '                // I am the leader for rotate - skip',
        '                rotatePivotPos = null;',
        '            }',
        '        }',
        '    }',
        '    ',
        '    // Apply scale around pivot first (scale before rotation in transform order)',
        '    if (scaleAroundMode > 1 && scalePivotPos !== null) {',
        '        // Use REST positions for offset - both child and pivot in local space',
        '        var offsetFromPivot = sub(restPos, scalePivotPos);',
        '        var currentOffset = [offsetFromPivot[0], offsetFromPivot[1]' + (is3D ? ', offsetFromPivot[2]' : '') + '];',
        '        // Use DELAYED scale - same timing as scale expression for consistency',
        '        var scaleRatioDelta = getAccumulatedScaleRatioDelta(time, scaleProp, parentRestScale);',
        '        if (scaleRatioDelta === null) {',
        '            var scaleRemapInfo = getRemapInfo(time, scaleProp);',
        '            var parentScaleT = scaleProp.valueAtTime(scaleRemapInfo.t1);',
        '            scaleRatioDelta = [];',
        '            for (var si = 0; si < parentScaleT.length; si++) {',
        '                scaleRatioDelta.push(((parentScaleT[si] / parentRestScale[si]) - 1) * scaleRemapInfo.segInfluence);',
        '            }',
        '        }',
        '        // Apply scale ratio: offset * (1 + ratioDelta)',
        '        currentOffset[0] *= (1 + scaleRatioDelta[0]);',
        '        currentOffset[1] *= (1 + scaleRatioDelta[1]);',
        (is3D ? '        if (currentOffset.length > 2) currentOffset[2] *= (1 + (scaleRatioDelta[2] || 0));' : ''),
        '        var scaleDelta = sub(currentOffset, offsetFromPivot);',
        '        scaleDelta = mul(scaleDelta, childInfluence);',
        '        parentedPos = add(parentedPos, scaleDelta);',
        '    }',
        '    ',
        '    // Apply rotation around pivot (2D rotation around Z axis)',
        '    if (rotateAroundMode > 1 && rotatePivotPos !== null) {',
        '        // Use REST positions for offset - both child and pivot in local space',
        '        var offsetFromPivot = sub(restPos, rotatePivotPos);',
        '        var currentOffset = [offsetFromPivot[0], offsetFromPivot[1]' + (is3D ? ', offsetFromPivot[2]' : '') + '];',
        '        // Use DELAYED rotation - same timing as rotation expression for consistency',
        '        var accRotDeltaForPivot = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '        if (accRotDeltaForPivot === null) {',
        '            var rotRemapInfo = getRemapInfo(time, rotProp);',
        '            var parentRotT = rotProp.valueAtTime(rotRemapInfo.t1);',
        '            accRotDeltaForPivot = (parentRotT - parentRestRot) * rotRemapInfo.segInfluence;',
        '        }',
        '        var rad = accRotDeltaForPivot * Math.PI / 180;',
        '        var cosR = Math.cos(rad);',
        '        var sinR = Math.sin(rad);',
        '        var rx = currentOffset[0] * cosR - currentOffset[1] * sinR;',
        '        var ry = currentOffset[0] * sinR + currentOffset[1] * cosR;',
        '        var rotatedOffset = [rx, ry' + (is3D ? ', currentOffset[2]' : '') + '];',
        '        var rotateDelta = sub(rotatedOffset, offsetFromPivot);',
        '        rotateDelta = mul(rotateDelta, childInfluence);',
        '        parentedPos = add(parentedPos, rotateDelta);',
        '    }',
        '}',
        '',
        '// Apply Pin Edges offset',
        'var pinState = getPinEdgeState(time, parentRestPos);',
        'if (pinState.active) {',
        '    parentedPos = [parentedPos[0] + pinState.offsetX, parentedPos[1] + pinState.offsetY' + (is3D ? ', parentedPos[2]' : '') + '];',
        '}',
        ''
    ].join('\n');

    // Conditionally add affector code
    if (includeAffector) {
        posExpr += '\n' + [
            '// Apply Affector effects (spread and position offset)',
            'var affectorSpread = getAffectorSpread(parentedPos, restPos);',
            'var affectorPosOffset = getAffectorPositionOffset(parentedPos);',
            'parentedPos = [parentedPos[0] + affectorSpread[0] + affectorPosOffset[0], parentedPos[1] + affectorSpread[1] + affectorPosOffset[1]' + (is3D ? ', parentedPos[2] + affectorPosOffset[2]' : '') + '];',
            ''
        ].join('\n');
    }

    // Conditionally add target code
    if (includeTarget) {
        posExpr += '\n' + [
            '// Apply Target repel offset (3D)',
            'var targetRepel = getTargetRepelOffset(parentedPos);',
            'parentedPos = [parentedPos[0] + targetRepel[0], parentedPos[1] + targetRepel[1]' + (is3D ? ', parentedPos[2] + targetRepel[2]' : '') + '];',
            ''
        ].join('\n');
    }

    // Add final position calculation
    posExpr += '\n' + [
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
        '// Scale calculation with accumulated ratio deltas',
        'var restScale = [cp("Rest Scale X"), cp("Rest Scale Y")' + (is3D ? ', cp("Rest Scale Z")' : '') + '];',
        'var parentRestScale = [cp("Parent Rest Scale X"), cp("Parent Rest Scale Y")' + (is3D ? ', cp("Parent Rest Scale Z")' : '') + '];',
        '',
        '// Get accumulated ratio deltas from all segments, weighted by each segment\'s influence',
        'var scaleProp = parentLayer.transform.scale;',
        'var accRatioDelta = getAccumulatedScaleRatioDelta(time, scaleProp, parentRestScale);',
        '',
        '// If before first segment, use simple delay-based remapping',
        'if (accRatioDelta === null) {',
        '    var remapInfo = getRemapInfo(time, scaleProp);',
        '    var parentScale = scaleProp.valueAtTime(remapInfo.t1);',
        '    accRatioDelta = [];',
        '    for (var i = 0; i < parentScale.length; i++) {',
        '        accRatioDelta.push(((parentScale[i] / parentRestScale[i]) - 1) * remapInfo.segInfluence);',
        '    }',
        '}',
        '',
        '// Apply accumulated ratio delta: finalScale = restScale * (1 + ratioDelta)',
        'var parentDrivenScale = [];',
        'for (var i = 0; i < restScale.length; i++) {',
        '    parentDrivenScale.push(restScale[i] * (1 + accRatioDelta[i]));',
        '}',
        ''
    ].join('\n');

    // Conditionally add affector scale code
    if (includeAffector) {
        scaleExpr += '\n' + [
            '// Apply Affector scale multiplier',
            '// Calculate actual visual position including rotation-around-parent transformation',
            'var affectorPosRemapInfo = getRemapInfo(time, parentLayer.transform.position);',
            'var parentPosForAffector = parentLayer.transform.position.valueAtTime(affectorPosRemapInfo.t1);',
            'var currentPosForAffector = [',
            '    cp("Rest Pos X") + (parentPosForAffector[0] - cp("Parent Rest Pos X")) * affectorPosRemapInfo.segInfluence,',
            '    cp("Rest Pos Y") + (parentPosForAffector[1] - cp("Parent Rest Pos Y")) * affectorPosRemapInfo.segInfluence',
            '];',
            '',
            '// Include rotation-around-parent transformation in affector position',
            '// This ensures children orbiting due to parent rotation interact with affector correctly',
            'if (rotateAroundMode > 1) {',
            '    var rotatePivotForAffector = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            '    if (rotateAroundMode === 3) {',
            '        var leaderLayerForAffector = findLeaderLayer();',
            '        var leaderIdxForAffector = Math.round(leaderIndexProp.valueAtTime(time));',
            '        if (leaderLayerForAffector && myIndex !== leaderIdxForAffector) {',
            '            rotatePivotForAffector = leaderLayerForAffector.transform.position.valueAtTime(time);',
            '        }',
            '    }',
            '    if (rotatePivotForAffector) {',
            '        var restPosForAffector = [cp("Rest Pos X"), cp("Rest Pos Y")];',
            '        var offsetFromPivotAff = [restPosForAffector[0] - rotatePivotForAffector[0], restPosForAffector[1] - rotatePivotForAffector[1]];',
            '        var rotPropAff = parentLayer.transform.rotation;',
            '        var rotRemapInfoAff = getRemapInfo(time, rotPropAff);',
            '        var parentRotTAff = rotPropAff.valueAtTime(rotRemapInfoAff.t1);',
            '        var rotDeltaAff = parentRotTAff - cp("Parent Rest Rotation");',
            '        var radAff = rotDeltaAff * Math.PI / 180;',
            '        var cosRAff = Math.cos(radAff);',
            '        var sinRAff = Math.sin(radAff);',
            '        var rotatedOffsetAff = [offsetFromPivotAff[0] * cosRAff - offsetFromPivotAff[1] * sinRAff, offsetFromPivotAff[0] * sinRAff + offsetFromPivotAff[1] * cosRAff];',
            '        var rotateTransformDelta = [rotatedOffsetAff[0] - offsetFromPivotAff[0], rotatedOffsetAff[1] - offsetFromPivotAff[1]];',
            '        var rotInfluenceAff = rotRemapInfoAff.segInfluence * childInfluence;',
            '        currentPosForAffector = [currentPosForAffector[0] + rotateTransformDelta[0] * rotInfluenceAff, currentPosForAffector[1] + rotateTransformDelta[1] * rotInfluenceAff];',
            '    }',
            '}',
            '',
            '// Include pin edges offset in affector position for accurate distance calculation',
            'var parentRestPosForPin = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            'var pinStateForAffector = getPinEdgeState(time, parentRestPosForPin);',
            'if (pinStateForAffector.active) {',
            '    currentPosForAffector = [currentPosForAffector[0] + pinStateForAffector.offsetX, currentPosForAffector[1] + pinStateForAffector.offsetY];',
            '}',
            '',
            'var scaleMult = getAffectorScaleMult(currentPosForAffector) / 100;',
            'parentDrivenScale = [parentDrivenScale[0] * scaleMult, parentDrivenScale[1] * scaleMult' + (is3D ? ', parentDrivenScale[2] * scaleMult' : '') + '];',
            ''
        ].join('\n');
    }

    // Add final scale calculation
    scaleExpr += '\n' + [
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
        ''
    ].join('\n');

    // Conditionally add affector rotation code
    if (includeAffector) {
        rotExpr += '\n' + [
            '// Apply Affector rotation boost',
            '// Calculate actual visual position including rotation-around-parent transformation',
            'var affectorPosRemapInfo = getRemapInfo(time, parentLayer.transform.position);',
            'var parentPosForAffector = parentLayer.transform.position.valueAtTime(affectorPosRemapInfo.t1);',
            'var currentPosForAffector = [',
            '    cp("Rest Pos X") + (parentPosForAffector[0] - cp("Parent Rest Pos X")) * affectorPosRemapInfo.segInfluence,',
            '    cp("Rest Pos Y") + (parentPosForAffector[1] - cp("Parent Rest Pos Y")) * affectorPosRemapInfo.segInfluence',
            '];',
            '',
            '// Include rotation-around-parent transformation',
            'if (rotateAroundMode > 1) {',
            '    var rotatePivotForAffector = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            '    if (rotateAroundMode === 3) {',
            '        var leaderLayerForAffector = findLeaderLayer();',
            '        var leaderIdxForAffector = Math.round(leaderIndexProp.valueAtTime(time));',
            '        if (leaderLayerForAffector && myIndex !== leaderIdxForAffector) {',
            '            rotatePivotForAffector = leaderLayerForAffector.transform.position.valueAtTime(time);',
            '        }',
            '    }',
            '    if (rotatePivotForAffector) {',
            '        var restPosForAffector = [cp("Rest Pos X"), cp("Rest Pos Y")];',
            '        var offsetFromPivotAff = [restPosForAffector[0] - rotatePivotForAffector[0], restPosForAffector[1] - rotatePivotForAffector[1]];',
            '        var rotPropAff = parentLayer.transform.rotation;',
            '        var rotRemapInfoAff = getRemapInfo(time, rotPropAff);',
            '        var parentRotTAff = rotPropAff.valueAtTime(rotRemapInfoAff.t1);',
            '        var rotDeltaAff = parentRotTAff - cp("Parent Rest Rotation");',
            '        var radAff = rotDeltaAff * Math.PI / 180;',
            '        var cosRAff = Math.cos(radAff);',
            '        var sinRAff = Math.sin(radAff);',
            '        var rotatedOffsetAff = [offsetFromPivotAff[0] * cosRAff - offsetFromPivotAff[1] * sinRAff, offsetFromPivotAff[0] * sinRAff + offsetFromPivotAff[1] * cosRAff];',
            '        var rotateTransformDelta = [rotatedOffsetAff[0] - offsetFromPivotAff[0], rotatedOffsetAff[1] - offsetFromPivotAff[1]];',
            '        var rotInfluenceAff = rotRemapInfoAff.segInfluence * childInfluence;',
            '        currentPosForAffector = [currentPosForAffector[0] + rotateTransformDelta[0] * rotInfluenceAff, currentPosForAffector[1] + rotateTransformDelta[1] * rotInfluenceAff];',
            '    }',
            '}',
            '',
            '// Include pin edges offset in affector position for accurate distance calculation',
            'var parentRestPosForPin = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            'var pinStateForAffector = getPinEdgeState(time, parentRestPosForPin);',
            'if (pinStateForAffector.active) {',
            '    currentPosForAffector = [currentPosForAffector[0] + pinStateForAffector.offsetX, currentPosForAffector[1] + pinStateForAffector.offsetY];',
            '}',
            '',
            'var rotBoost = getAffectorRotationZBoost(currentPosForAffector);',
            'parentDrivenRot = parentDrivenRot + rotBoost;',
            ''
        ].join('\n');
    }

    // Conditionally add target look-at code
    if (includeTarget) {
        rotExpr += '\n' + [
            '// Calculate parented position for look-at (rest + parent delta, with delay influence)',
            'var restPosX = cp("Rest Pos X");',
            'var restPosY = cp("Rest Pos Y");',
            'var parentRestPosX = cp("Parent Rest Pos X");',
            'var parentRestPosY = cp("Parent Rest Pos Y");',
            'var parentPosNow = parentLayer.transform.position.value;',
            '',
            '// Get parent delay influence from target (0 = use actual pos, 100 = use delayed pos)',
            'var targetDelayInf = 0;',
            'try {',
            '    var tgt = thisComp.layer("Parent Rig Target");',
            '    if (tgt) targetDelayInf = tgt.effect("Parent Delay Influence")("Slider").value;',
            '} catch(e) {}',
            '',
            '// Calculate delayed parent position using time remapping',
            'var parentPosProp = parentLayer.transform.position;',
            'var posRemapInfo = getRemapInfo(time, parentPosProp);',
            'var parentPosDelayed = parentPosProp.valueAtTime(posRemapInfo.t1);',
            '',
            '// Blend between current and delayed parent position based on delay influence',
            'var delayBlend = 1 - (targetDelayInf / 100);',
            'var parentPosBlended = [',
            '    parentPosDelayed[0] + (parentPosNow[0] - parentPosDelayed[0]) * delayBlend,',
            '    parentPosDelayed[1] + (parentPosNow[1] - parentPosDelayed[1]) * delayBlend',
            '];',
            '',
            'var lookAtPos = [',
            '    restPosX + (parentPosBlended[0] - parentRestPosX),',
            '    restPosY + (parentPosBlended[1] - parentRestPosY)',
            '];',
            'parentDrivenRot = getTargetLookAtRotation(lookAtPos, parentDrivenRot);',
            ''
        ].join('\n');
    }

    // Add final rotation calculation
    rotExpr += '\n' + [
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
        ''
    ].join('\n');

    // Conditionally add affector X rotation code
    if (includeAffector) {
        xRotExpr += '\n' + [
            '// Apply Affector X rotation boost',
            '// Calculate actual visual position including rotation-around-parent transformation',
            'var affectorPosRemapInfo = getRemapInfo(time, parentLayer.transform.position);',
            'var parentPosForAffector = parentLayer.transform.position.valueAtTime(affectorPosRemapInfo.t1);',
            'var currentPosForAffector = [',
            '    cp("Rest Pos X") + (parentPosForAffector[0] - cp("Parent Rest Pos X")) * affectorPosRemapInfo.segInfluence,',
            '    cp("Rest Pos Y") + (parentPosForAffector[1] - cp("Parent Rest Pos Y")) * affectorPosRemapInfo.segInfluence',
            '];',
            '',
            '// Include rotation-around-parent transformation',
            'if (rotateAroundMode > 1) {',
            '    var rotatePivotForAffector = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            '    if (rotateAroundMode === 3) {',
            '        var leaderLayerForAffector = findLeaderLayer();',
            '        var leaderIdxForAffector = Math.round(leaderIndexProp.valueAtTime(time));',
            '        if (leaderLayerForAffector && myIndex !== leaderIdxForAffector) {',
            '            rotatePivotForAffector = leaderLayerForAffector.transform.position.valueAtTime(time);',
            '        }',
            '    }',
            '    if (rotatePivotForAffector) {',
            '        var restPosForAffector = [cp("Rest Pos X"), cp("Rest Pos Y")];',
            '        var offsetFromPivotAff = [restPosForAffector[0] - rotatePivotForAffector[0], restPosForAffector[1] - rotatePivotForAffector[1]];',
            '        var rotPropAff = parentLayer.transform.rotation;',
            '        var rotRemapInfoAff = getRemapInfo(time, rotPropAff);',
            '        var parentRotTAff = rotPropAff.valueAtTime(rotRemapInfoAff.t1);',
            '        var rotDeltaAff = parentRotTAff - cp("Parent Rest Rotation");',
            '        var radAff = rotDeltaAff * Math.PI / 180;',
            '        var cosRAff = Math.cos(radAff);',
            '        var sinRAff = Math.sin(radAff);',
            '        var rotatedOffsetAff = [offsetFromPivotAff[0] * cosRAff - offsetFromPivotAff[1] * sinRAff, offsetFromPivotAff[0] * sinRAff + offsetFromPivotAff[1] * cosRAff];',
            '        var rotateTransformDelta = [rotatedOffsetAff[0] - offsetFromPivotAff[0], rotatedOffsetAff[1] - offsetFromPivotAff[1]];',
            '        var rotInfluenceAff = rotRemapInfoAff.segInfluence * childInfluence;',
            '        currentPosForAffector = [currentPosForAffector[0] + rotateTransformDelta[0] * rotInfluenceAff, currentPosForAffector[1] + rotateTransformDelta[1] * rotInfluenceAff];',
            '    }',
            '}',
            '',
            'var rotBoost = getAffectorRotationXBoost(currentPosForAffector);',
            'parentDrivenRot = parentDrivenRot + rotBoost;',
            ''
        ].join('\n');
    }

    // Conditionally add target look-at X code
    if (includeTarget) {
        xRotExpr += '\n' + [
            '// Apply Target look-at X rotation (pitch) - uses current position for look-at direction',
            'var currentPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);',
            'parentDrivenRot = getTargetLookAtRotationX(currentPos, parentDrivenRot);',
            ''
        ].join('\n');
    }

    // Add final X rotation calculation
    xRotExpr += '\n' + [
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
        ''
    ].join('\n');

    // Conditionally add affector Y rotation code
    if (includeAffector) {
        yRotExpr += '\n' + [
            '// Apply Affector Y rotation boost',
            '// Calculate actual visual position including rotation-around-parent transformation',
            'var affectorPosRemapInfo = getRemapInfo(time, parentLayer.transform.position);',
            'var parentPosForAffector = parentLayer.transform.position.valueAtTime(affectorPosRemapInfo.t1);',
            'var currentPosForAffector = [',
            '    cp("Rest Pos X") + (parentPosForAffector[0] - cp("Parent Rest Pos X")) * affectorPosRemapInfo.segInfluence,',
            '    cp("Rest Pos Y") + (parentPosForAffector[1] - cp("Parent Rest Pos Y")) * affectorPosRemapInfo.segInfluence',
            '];',
            '',
            '// Include rotation-around-parent transformation',
            'if (rotateAroundMode > 1) {',
            '    var rotatePivotForAffector = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            '    if (rotateAroundMode === 3) {',
            '        var leaderLayerForAffector = findLeaderLayer();',
            '        var leaderIdxForAffector = Math.round(leaderIndexProp.valueAtTime(time));',
            '        if (leaderLayerForAffector && myIndex !== leaderIdxForAffector) {',
            '            rotatePivotForAffector = leaderLayerForAffector.transform.position.valueAtTime(time);',
            '        }',
            '    }',
            '    if (rotatePivotForAffector) {',
            '        var restPosForAffector = [cp("Rest Pos X"), cp("Rest Pos Y")];',
            '        var offsetFromPivotAff = [restPosForAffector[0] - rotatePivotForAffector[0], restPosForAffector[1] - rotatePivotForAffector[1]];',
            '        var rotPropAff = parentLayer.transform.rotation;',
            '        var rotRemapInfoAff = getRemapInfo(time, rotPropAff);',
            '        var parentRotTAff = rotPropAff.valueAtTime(rotRemapInfoAff.t1);',
            '        var rotDeltaAff = parentRotTAff - cp("Parent Rest Rotation");',
            '        var radAff = rotDeltaAff * Math.PI / 180;',
            '        var cosRAff = Math.cos(radAff);',
            '        var sinRAff = Math.sin(radAff);',
            '        var rotatedOffsetAff = [offsetFromPivotAff[0] * cosRAff - offsetFromPivotAff[1] * sinRAff, offsetFromPivotAff[0] * sinRAff + offsetFromPivotAff[1] * cosRAff];',
            '        var rotateTransformDelta = [rotatedOffsetAff[0] - offsetFromPivotAff[0], rotatedOffsetAff[1] - offsetFromPivotAff[1]];',
            '        var rotInfluenceAff = rotRemapInfoAff.segInfluence * childInfluence;',
            '        currentPosForAffector = [currentPosForAffector[0] + rotateTransformDelta[0] * rotInfluenceAff, currentPosForAffector[1] + rotateTransformDelta[1] * rotInfluenceAff];',
            '    }',
            '}',
            '',
            'var rotBoost = getAffectorRotationYBoost(currentPosForAffector);',
            'parentDrivenRot = parentDrivenRot + rotBoost;',
            ''
        ].join('\n');
    }

    // Add final Y rotation calculation
    yRotExpr += '\n' + [
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
        ''
    ].join('\n');

    // Conditionally add affector opacity code
    if (includeAffector) {
        opacityExpr += '\n' + [
            '// Apply Affector opacity multiplier',
            '// Calculate actual visual position including rotation-around-parent transformation',
            'var affectorPosRemapInfo = getRemapInfo(time, parentLayer.transform.position);',
            'var parentPosForAffector = parentLayer.transform.position.valueAtTime(affectorPosRemapInfo.t1);',
            'var currentPosForAffector = [',
            '    cp("Rest Pos X") + (parentPosForAffector[0] - cp("Parent Rest Pos X")) * affectorPosRemapInfo.segInfluence,',
            '    cp("Rest Pos Y") + (parentPosForAffector[1] - cp("Parent Rest Pos Y")) * affectorPosRemapInfo.segInfluence',
            '];',
            '',
            '// Include rotation-around-parent transformation',
            'if (rotateAroundMode > 1) {',
            '    var rotatePivotForAffector = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            '    if (rotateAroundMode === 3) {',
            '        var leaderLayerForAffector = findLeaderLayer();',
            '        var leaderIdxForAffector = Math.round(leaderIndexProp.valueAtTime(time));',
            '        if (leaderLayerForAffector && myIndex !== leaderIdxForAffector) {',
            '            rotatePivotForAffector = leaderLayerForAffector.transform.position.valueAtTime(time);',
            '        }',
            '    }',
            '    if (rotatePivotForAffector) {',
            '        var restPosForAffector = [cp("Rest Pos X"), cp("Rest Pos Y")];',
            '        var offsetFromPivotAff = [restPosForAffector[0] - rotatePivotForAffector[0], restPosForAffector[1] - rotatePivotForAffector[1]];',
            '        var rotPropAff = parentLayer.transform.rotation;',
            '        var rotRemapInfoAff = getRemapInfo(time, rotPropAff);',
            '        var parentRotTAff = rotPropAff.valueAtTime(rotRemapInfoAff.t1);',
            '        var rotDeltaAff = parentRotTAff - cp("Parent Rest Rotation");',
            '        var radAff = rotDeltaAff * Math.PI / 180;',
            '        var cosRAff = Math.cos(radAff);',
            '        var sinRAff = Math.sin(radAff);',
            '        var rotatedOffsetAff = [offsetFromPivotAff[0] * cosRAff - offsetFromPivotAff[1] * sinRAff, offsetFromPivotAff[0] * sinRAff + offsetFromPivotAff[1] * cosRAff];',
            '        var rotateTransformDelta = [rotatedOffsetAff[0] - offsetFromPivotAff[0], rotatedOffsetAff[1] - offsetFromPivotAff[1]];',
            '        var rotInfluenceAff = rotRemapInfoAff.segInfluence * childInfluence;',
            '        currentPosForAffector = [currentPosForAffector[0] + rotateTransformDelta[0] * rotInfluenceAff, currentPosForAffector[1] + rotateTransformDelta[1] * rotInfluenceAff];',
            '    }',
            '}',
            '',
            '// Include pin edges offset in affector position for accurate distance calculation',
            'var parentRestPosForPin = [cp("Parent Rest Pos X"), cp("Parent Rest Pos Y")];',
            'var pinStateForAffector = getPinEdgeState(time, parentRestPosForPin);',
            'if (pinStateForAffector.active) {',
            '    currentPosForAffector = [currentPosForAffector[0] + pinStateForAffector.offsetX, currentPosForAffector[1] + pinStateForAffector.offsetY];',
            '}',
            '',
            'var opacityMult = getAffectorOpacityMult(currentPosForAffector) / 100;',
            'parentDrivenOpacity = parentDrivenOpacity * opacityMult;',
            ''
        ].join('\n');
    }

    // Add final opacity calculation
    opacityExpr += '\n' + [
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
            var xPosExpr = createSplitPosExpr(header, timeRemapFunc, 'X', 'xPosition', is3D, includeAffector, includeTarget);
            var yPosExpr = createSplitPosExpr(header, timeRemapFunc, 'Y', 'yPosition', is3D, includeAffector, includeTarget);

            try { child.transform.xPosition.expression = xPosExpr; } catch (e) {}
            try { child.transform.yPosition.expression = yPosExpr; } catch (e) {}

            if (is3D) {
                var zPosExpr = createSplitPosExpr(header, timeRemapFunc, 'Z', 'zPosition', is3D, includeAffector, includeTarget);
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
        if (is3D) {
            try { child.transform.zRotation.expression = rotExpr; } catch (e) {}
            try { child.transform.xRotation.expression = xRotExpr; } catch (e) {}
            try { child.transform.yRotation.expression = yRotExpr; } catch (e) {}
        } else {
            try { child.transform.rotation.expression = rotExpr; } catch (e) {}
        }
    } else {
        if (is3D) {
            try { child.transform.zRotation.expression = ""; } catch (e) {}
            try { child.transform.xRotation.expression = ""; } catch (e) {}
            try { child.transform.yRotation.expression = ""; } catch (e) {}
        } else {
            try { child.transform.rotation.expression = ""; } catch (e) {}
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
function createSplitPosExpr(header, timeRemapFunc, axis, propName, is3D, includeAffector, includeTarget) {
    // For transform around parent, we need both X and Y even for single-axis expressions
    var needsBothAxes = (axis === 'X' || axis === 'Y');

    var expr = header + timeRemapFunc + [
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
        '    // Get scale and rotation props - use raw time, not remapped',
        '    // (Position expression handles its own timing; scale/rotation around pivot should just use current values)',
        '    var scaleProp = parentLayer.transform.scale;',
        '    var rotProp = parentLayer.transform.rotation;',
        '    ',
        '    // Determine pivot REST positions based on mode',
        '    // IMPORTANT: Use REST positions for both child and pivot to stay in local space',
        '    var scalePivotX = parentRestPosX;  // Default to parent REST position (mode 2)',
        '    var scalePivotY = parentRestPosY;',
        '    var rotatePivotX = parentRestPosX;',
        '    var rotatePivotY = parentRestPosY;',
        '    var skipScaleTransform = false;',
        '    var skipRotateTransform = false;',
        '    ',
        '    // For Leader mode, get leader\'s REST position from their effect',
        '    if (scaleAroundMode === 3 || rotateAroundMode === 3) {',
        '        // Always use raw time to find leader - children see same leader at same timeline moment',
        '        // (Delay affects WHEN they see transforms, not WHICH leader they see)',
        '        var leaderIdx = getLeaderIndexAtTime(time);',
        '        ',
        '        // Helper to get leader REST position from their effect (in local space)',
        '        // Use index-based access: 3=Rest Pos X, 4=Rest Pos Y',
        '        function getLeaderRestPos(leaderLayer) {',
        '            try {',
        '                var childEff = leaderLayer.effect("Parent Rig - Child");',
        '                if (childEff) {',
        '                    return [childEff(3).value, childEff(4).value];',
        '                }',
        '            } catch(e) {}',
        '            // Fallback to old slider mode',
        '            try {',
        '                var rx = leaderLayer.effect("PR_RestPosX")("Slider").value;',
        '                var ry = leaderLayer.effect("PR_RestPosY")("Slider").value;',
        '                return [rx, ry];',
        '            } catch(e) {}',
        '            return null;',
        '        }',
        '        ',
        '        if (scaleAroundMode === 3) {',
        '            if (myIndex !== leaderIdx) {',
        '                var leaderLayerScale = findLeaderLayer(time);',
        '                if (leaderLayerScale) {',
        '                    var leaderRestPosScale = getLeaderRestPos(leaderLayerScale);',
        '                    if (leaderRestPosScale) {',
        '                        scalePivotX = leaderRestPosScale[0];',
        '                        scalePivotY = leaderRestPosScale[1];',
        '                    }',
        '                }',
        '            } else {',
        '                skipScaleTransform = true;',
        '            }',
        '        }',
        '        ',
        '        if (rotateAroundMode === 3) {',
        '            if (myIndex !== leaderIdx) {',
        '                var leaderLayerRotate = findLeaderLayer(time);',
        '                if (leaderLayerRotate) {',
        '                    var leaderRestPosRotate = getLeaderRestPos(leaderLayerRotate);',
        '                    if (leaderRestPosRotate) {',
        '                        rotatePivotX = leaderRestPosRotate[0];',
        '                        rotatePivotY = leaderRestPosRotate[1];',
        '                    }',
        '                }',
        '            } else {',
        '                skipRotateTransform = true;',
        '            }',
        '        }',
        '    }',
        '    ',
        '    // Calculate offsets using REST positions (stay in local space)',
        '    // IMPORTANT: Both child and pivot use REST positions for consistent coordinate space',
        (needsBothAxes ? '    var offsetX = restPosX - scalePivotX;' : ''),
        (needsBothAxes ? '    var offsetY = restPosY - scalePivotY;' : ''),
        (needsBothAxes ? '    var rotOffsetX = restPosX - rotatePivotX;' : ''),
        (needsBothAxes ? '    var rotOffsetY = restPosY - rotatePivotY;' : ''),
        '    ',
        '    // Apply scale around pivot',
        '    if (scaleAroundMode > 1 && !skipScaleTransform) {',
        '        // Use DELAYED scale - same timing as scale expression for consistency',
        '        var parentRestScaleArr = [parentRestScaleX, parentRestScaleY];',
        '        var scaleRatioDelta = getAccumulatedScaleRatioDelta(time, scaleProp, parentRestScaleArr);',
        '        if (scaleRatioDelta === null) {',
        '            var scaleRemapInfo = getRemapInfo(time, scaleProp);',
        '            var parentScaleT = scaleProp.valueAtTime(scaleRemapInfo.t1);',
        '            scaleRatioDelta = [',
        '                ((parentScaleT[0] / parentRestScaleX) - 1) * scaleRemapInfo.segInfluence,',
        '                ((parentScaleT[1] / parentRestScaleY) - 1) * scaleRemapInfo.segInfluence',
        '            ];',
        '        }',
        (needsBothAxes ? '        offsetX *= (1 + scaleRatioDelta[0]);' : ''),
        (needsBothAxes ? '        offsetY *= (1 + scaleRatioDelta[1]);' : ''),
        '    }',
        '    ',
        '    // Apply rotation around pivot',
        '    if (rotateAroundMode > 1 && !skipRotateTransform) {',
        '        // Use DELAYED rotation - same timing as rotation expression for consistency',
        '        var accRotDeltaForPivot = getAccumulatedScalarDelta(time, rotProp, parentRestRot);',
        '        if (accRotDeltaForPivot === null) {',
        '            var rotRemapInfo = getRemapInfo(time, rotProp);',
        '            var parentRotT = rotProp.valueAtTime(rotRemapInfo.t1);',
        '            accRotDeltaForPivot = (parentRotT - parentRestRot) * rotRemapInfo.segInfluence;',
        '        }',
        '        var rad = accRotDeltaForPivot * Math.PI / 180;',
        '        var cosR = Math.cos(rad);',
        '        var sinR = Math.sin(rad);',
        (needsBothAxes ? '        var newRotOffsetX = rotOffsetX * cosR - rotOffsetY * sinR;' : ''),
        (needsBothAxes ? '        var newRotOffsetY = rotOffsetX * sinR + rotOffsetY * cosR;' : ''),
        (needsBothAxes ? '        rotOffsetX = newRotOffsetX;' : ''),
        (needsBothAxes ? '        rotOffsetY = newRotOffsetY;' : ''),
        '    }',
        '    ',
        '    // Calculate transform deltas for this axis',
        '    // Original offset is the offset BEFORE scale/rotation (using REST positions)',
        (axis === 'X' ? '    var scaleOriginalOffsetX = restPosX - scalePivotX;' : ''),
        (axis === 'X' ? '    var scaleDelta = skipScaleTransform ? 0 : (offsetX - scaleOriginalOffsetX) * childInfluence;' : ''),
        (axis === 'X' ? '    var rotOriginalOffsetX = restPosX - rotatePivotX;' : ''),
        (axis === 'X' ? '    var rotateDelta = skipRotateTransform ? 0 : (rotOffsetX - rotOriginalOffsetX) * childInfluence;' : ''),
        (axis === 'Y' ? '    var scaleOriginalOffsetY = restPosY - scalePivotY;' : ''),
        (axis === 'Y' ? '    var scaleDelta = skipScaleTransform ? 0 : (offsetY - scaleOriginalOffsetY) * childInfluence;' : ''),
        (axis === 'Y' ? '    var rotOriginalOffsetY = restPosY - rotatePivotY;' : ''),
        (axis === 'Y' ? '    var rotateDelta = skipRotateTransform ? 0 : (rotOffsetY - rotOriginalOffsetY) * childInfluence;' : ''),
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
        ''
    ].join('\n');

    // Conditionally add affector code for split dimensions
    if (includeAffector) {
        // For split dims, we need to get the full position for affector calculations
        expr += '\n' + [
            '// Apply Affector effects (spread and position offset) for ' + axis + ' axis',
            '// Get current full position for affector calculations',
            'var fullRestPos = [cp("Rest Pos X"), cp("Rest Pos Y")' + (is3D ? ', cp("Rest Pos Z")' : '') + '];',
            'var fullParentedPos = [',
            '    cp("Rest Pos X") + (parentLayer.transform.xPosition.value - cp("Parent Rest Pos X")),',
            '    cp("Rest Pos Y") + (parentLayer.transform.yPosition.value - cp("Parent Rest Pos Y"))',
            (is3D ? '    , cp("Rest Pos Z") + (parentLayer.transform.zPosition.value - cp("Parent Rest Pos Z"))' : '') + '];',
            'var affectorSpread = getAffectorSpread(fullParentedPos, fullRestPos);',
            'var affectorPosOffset = getAffectorPositionOffset(fullParentedPos);',
            (axis === 'X' ? 'parentedPos += affectorSpread[0] + affectorPosOffset[0];' : ''),
            (axis === 'Y' ? 'parentedPos += affectorSpread[1] + affectorPosOffset[1];' : ''),
            (axis === 'Z' ? 'parentedPos += affectorPosOffset[2];' : ''),
            ''
        ].join('\n');
    }

    // Conditionally add target code for split dimensions
    if (includeTarget) {
        expr += '\n' + [
            '// Apply Target repel offset for ' + axis + ' axis',
            'var fullPosForTarget = [',
            '    cp("Rest Pos X") + (parentLayer.transform.xPosition.value - cp("Parent Rest Pos X")),',
            '    cp("Rest Pos Y") + (parentLayer.transform.yPosition.value - cp("Parent Rest Pos Y"))',
            (is3D ? '    , cp("Rest Pos Z") + (parentLayer.transform.zPosition.value - cp("Parent Rest Pos Z"))' : '') + '];',
            'var targetRepel = getTargetRepelOffset(fullPosForTarget);',
            (axis === 'X' ? 'parentedPos += targetRepel[0];' : ''),
            (axis === 'Y' ? 'parentedPos += targetRepel[1];' : ''),
            (axis === 'Z' ? 'parentedPos += targetRepel[2];' : ''),
            ''
        ].join('\n');
    }

    // Add final position calculation
    expr += '\n// Check if following position is enabled\nfollowPosition ? parentedPos + childDelta : childAnimPos;';

    return expr;
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
        'var parentRot = parentLayer.transform.' + (is3D ? 'zRotation' : 'rotation') + '.valueAtTime(t);',
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
        'var parentRot = parentLayer.transform.' + (is3D ? 'zRotation' : 'rotation') + '.valueAtTime(t);',
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
            'var parentRot = parentLayer.transform.' + (is3D ? 'zRotation' : 'rotation') + '.valueAtTime(t);',
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
            'var parentRot = parentLayer.transform.' + (is3D ? 'zRotation' : 'rotation') + '.valueAtTime(t);',
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
    if (is3D) {
        try { child.transform.zRotation.expression = rotExpr; } catch (e) {}
    } else {
        try { child.transform.rotation.expression = rotExpr; } catch (e) {}
    }
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
    var totalPositions = 19; // Total positions for layout calculation
    var skipLeft = 7;        // Skip 7 positions on the left
    var numShapes = 12;      // Create 12 shapes
    var compCenter = [comp.width / 2, comp.height / 2];

    // Calculate total width based on original 19 positions (keeps right side positioning)
    var totalWidth = (totalPositions * shapeWidth) + ((totalPositions - 1) * gap);
    var startX = compCenter[0] - (totalWidth / 2) + (shapeWidth / 2);

    // Create parent null first (will be at bottom of layer stack)
    var parentNull = comp.layers.addShape();
    parentNull.name = "Carousel Parent";
    parentNull.transform.position.setValue([comp.width / 2, comp.height / 2]);
    parentNull.label = 9; // Green

    // Create shapes starting from position 7 (skipping first 7)
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
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]); // White

        // Add soft drop shadow
        var dropShadow = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        dropShadow.property(2).setValue(40);  // Opacity (0-255)
        dropShadow.property(3).setValue(180); // Direction
        dropShadow.property(4).setValue(12);  // Distance
        dropShadow.property(5).setValue(80);  // Softness

        // Set world position (offset by skipLeft to keep right-side positioning)
        var xPos = startX + ((skipLeft + i) * (shapeWidth + gap));
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
    var totalPositions = 19; // Total positions for layout calculation
    var skipTop = 5;         // Skip 5 positions at the top
    var numShapes = 14;      // Create 14 shapes
    var compCenter = [comp.width / 2, comp.height / 2];

    // Calculate total height based on original 19 positions (keeps bottom positioning)
    var totalHeight = (totalPositions * shapeHeight) + ((totalPositions - 1) * gap);
    var startY = compCenter[1] - (totalHeight / 2) + (shapeHeight / 2);

    // Create parent null first (will be at bottom of layer stack)
    var parentNull = comp.layers.addShape();
    parentNull.name = "List Parent";
    parentNull.transform.position.setValue([comp.width / 2, comp.height / 2]);
    parentNull.label = 9; // Green

    // Create shapes starting from position 5 (skipping first 5)
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
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]); // White

        // Add soft drop shadow
        var dropShadow = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        dropShadow.property(2).setValue(40);  // Opacity (0-255)
        dropShadow.property(3).setValue(180); // Direction
        dropShadow.property(4).setValue(12);  // Distance
        dropShadow.property(5).setValue(80);  // Softness

        // Set world position (offset by skipTop to keep bottom positioning)
        var yPos = startY + ((skipTop + i) * (shapeHeight + gap));
        layer.transform.position.setValue([compCenter[0], yPos]);

        // Parent to null (AE will convert position to be relative to parent)
        layer.parent = parentNull;
    }

    app.endUndoGroup();
}

function add3DList() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    app.beginUndoGroup("Add 3D List");

    var shapeWidth = 800;
    var shapeHeight = 220;
    var gap = 20;
    var cornerRadius = 32;
    var totalPositions = 19; // Total positions for layout calculation (same as vertical list)
    var skipTop = 5;         // Skip 5 positions at the top (same as vertical list)
    var numShapes = 14;      // Create 14 shapes (same as vertical list)
    var compCenter = [comp.width / 2, comp.height / 2];

    // Calculate total height based on original 19 positions (same as vertical list)
    var totalHeight = (totalPositions * shapeHeight) + ((totalPositions - 1) * gap);
    var startY = compCenter[1] - (totalHeight / 2) + (shapeHeight / 2);

    var createdLayers = [];

    // Create shapes - same Y layout as vertical list, but 3D and rotated on X
    for (var i = 0; i < numShapes; i++) {
        var layer = comp.layers.addShape();
        layer.name = "Row " + (i + 1);
        layer.threeDLayer = true;

        // Add rectangle shape
        var contents = layer.property("ADBE Root Vectors Group");
        var rectGroup = contents.addProperty("ADBE Vector Group");
        rectGroup.name = "Rectangle";

        var rectPath = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rectPath.property("ADBE Vector Rect Size").setValue([shapeWidth, shapeHeight]);
        rectPath.property("ADBE Vector Rect Roundness").setValue(cornerRadius);

        var fill = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]); // White

        // Add soft drop shadow
        var dropShadow = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        dropShadow.property(2).setValue(40);  // Opacity (0-255)
        dropShadow.property(3).setValue(180); // Direction
        dropShadow.property(4).setValue(12);  // Distance
        dropShadow.property(5).setValue(80);  // Softness

        // Set position on Y axis (same as vertical list, offset by skipTop)
        var yPos = startY + ((skipTop + i) * (shapeHeight + gap));
        layer.transform.position.setValue([compCenter[0], yPos, 0]);

        // Rotate 90 degrees on X axis
        layer.transform.xRotation.setValue(90);

        createdLayers.push(layer);
    }

    // Select all created layers
    for (var s = 1; s <= comp.numLayers; s++) {
        comp.layer(s).selected = false;
    }
    for (var j = 0; j < createdLayers.length; j++) {
        createdLayers[j].selected = true;
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
    var fillColor = [1, 1, 1, 1]; // White

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

            // Add soft drop shadow
            var dropShadow = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
            dropShadow.property(2).setValue(40);  // Opacity (0-255)
            dropShadow.property(3).setValue(180); // Direction
            dropShadow.property(4).setValue(12);  // Distance
            dropShadow.property(5).setValue(80);  // Softness

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
    var fillColor = [1, 1, 1, 1]; // White

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

        // Add soft drop shadow
        var dropShadow = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        dropShadow.property(2).setValue(40);  // Opacity (0-255)
        dropShadow.property(3).setValue(180); // Direction
        dropShadow.property(4).setValue(12);  // Distance
        dropShadow.property(5).setValue(80);  // Softness

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

function addLargeCards() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    app.beginUndoGroup("Add Large Cards");

    var shapeWidth = 600;
    var shapeHeight = 600;
    var gap = 30;
    var cornerRadius = 48;
    var numShapes = 9;
    var compCenter = [comp.width / 2, comp.height / 2];

    // Calculate total width to center
    var totalWidth = (numShapes * shapeWidth) + ((numShapes - 1) * gap);
    var startX = compCenter[0] - (totalWidth / 2) + (shapeWidth / 2);

    // Create parent null first
    var parentNull = comp.layers.addShape();
    parentNull.name = "Large Cards Parent";
    parentNull.transform.position.setValue([comp.width / 2, comp.height / 2]);
    parentNull.label = 9; // Green

    // Create shapes
    for (var i = 0; i < numShapes; i++) {
        var layer = comp.layers.addShape();
        layer.name = "Large Card " + (i + 1);

        // Add rectangle shape
        var contents = layer.property("ADBE Root Vectors Group");
        var rectGroup = contents.addProperty("ADBE Vector Group");
        rectGroup.name = "Rectangle";

        var rectPath = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
        rectPath.property("ADBE Vector Rect Size").setValue([shapeWidth, shapeHeight]);
        rectPath.property("ADBE Vector Rect Roundness").setValue(cornerRadius);

        var fill = rectGroup.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]); // White

        // Add soft drop shadow
        var dropShadow = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        dropShadow.property(2).setValue(40);  // Opacity (0-255)
        dropShadow.property(3).setValue(180); // Direction
        dropShadow.property(4).setValue(12);  // Distance
        dropShadow.property(5).setValue(80);  // Softness

        // Set world position first
        var xPos = startX + (i * (shapeWidth + gap));
        layer.transform.position.setValue([xPos, compCenter[1]]);

        // Parent to null
        layer.parent = parentNull;
    }

    app.endUndoGroup();
}

// Helper: Apply standalone effects to a list of layers (called from addAffector/addTarget)
function applyStandaloneToLayers(comp, layers) {
    if (!layers || layers.length === 0) return;

    // First, clean up any standalone expressions that were incorrectly applied to parent layers
    for (var c = 0; c < layers.length; c++) {
        var layer = layers[c];
        if (hasEffect(layer, "Parent Rig - Parent") || hasEffect(layer, "PR_Delay")) {
            // Remove standalone expressions from parent layers (they shouldn't have them)
            try {
                var expr = layer.transform.position.expression;
                if (expr && expr.indexOf("Standalone Affector/Target Effects") >= 0) {
                    layer.transform.position.expression = "";
                    layer.transform.scale.expression = "";
                    layer.transform.opacity.expression = "";
                    if (layer.threeDLayer) {
                        layer.transform.xRotation.expression = "";
                        layer.transform.yRotation.expression = "";
                        layer.transform.zRotation.expression = "";
                    } else {
                        layer.transform.rotation.expression = "";
                    }
                }
            } catch(e) {}
        }
    }

    // Filter out layers that shouldn't get standalone expressions
    var validLayers = [];
    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        // Skip affector/target layers
        if (layer.name.indexOf("Parent Rig Affector") === 0) continue;
        if (layer.name.indexOf("Parent Rig Target") === 0) continue;
        // Skip layers already rigged with parent rig (both parent and child layers)
        if (hasEffect(layer, "Parent Rig - Child")) continue;
        if (hasEffect(layer, "Parent Rig - Parent")) continue;
        if (hasEffect(layer, "PR_Delay")) continue;  // Fallback parent effect
        // Skip if layer already has standalone expressions
        try {
            var existingExpr = layer.transform.position.expression;
            if (existingExpr && existingExpr.indexOf("Standalone Affector/Target Effects") >= 0) continue;
        } catch(e) {}
        validLayers.push(layer);
    }

    if (validLayers.length === 0) return;

    // Apply standalone expressions to each valid layer
    var standaloneHeader = getStandaloneHeader();
    for (var s = 0; s < validLayers.length; s++) {
        applyStandaloneToLayer(validLayers[s], standaloneHeader);
    }
}

// Generate the standalone expression header (shared by all standalone modes)
function getStandaloneHeader() {
    return [
        '// Standalone Affector/Target Effects',
        '',
        '// ===== AFFECTOR SYSTEM =====',
        'var affectors = [];',
        'for (var _ai = 1; _ai <= 4; _ai++) {',
        '    try { var _a = thisComp.layer("Parent Rig Affector " + _ai); if (_a) affectors.push(_a); } catch(e) {}',
        '}',
        'try { var _aL = thisComp.layer("Parent Rig Affector"); if (_aL) affectors.push(_aL); } catch(e) {}',
        '',
        'function calcInfluenceFor(aff, pos) {',
        '    if (!aff) return 0;',
        '    var globalInf = 100;',
        '    try { globalInf = aff.effect("Influence")("Slider").value; } catch(e) {}',
        '    globalInf = globalInf / 100;',
        '    if (globalInf <= 0) return 0;',
        '    var outerR = 200, innerR = 0;',
        '    try { outerR = aff.effect("Outer Radius")("Slider").value; } catch(e) {}',
        '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (outerR <= 0) return 0;',
        '    var affectorPos = aff.transform.position.value;',
        '    var dx = pos[0] - affectorPos[0], dy = pos[1] - affectorPos[1], dz = (pos[2] || 0) - (affectorPos[2] || 0);',
        '    var lineMode = 0;',
        '    try { lineMode = aff.effect("Line Mode")("Checkbox").value; } catch(e) {}',
        '    var dist = lineMode ? Math.abs(dx * Math.cos((aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180) + dy * Math.sin((aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180)) : Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '    if (dist <= innerR) return globalInf;',
        '    if (dist >= outerR) return 0;',
        '    var normalizedDist = (dist - innerR) / (outerR - innerR);',
        '    try { return (aff.effect("Falloff")("Slider").valueAtTime(normalizedDist * 60 * thisComp.frameDuration) / 100) * globalInf; } catch(e) { return (1 - normalizedDist) * globalInf; }',
        '}',
        '',
        'function calcSpatialInfluenceFor(aff, pos) {',
        '    if (!aff) return 0;',
        '    var outerR = 200, innerR = 0;',
        '    try { outerR = aff.effect("Outer Radius")("Slider").value; } catch(e) {}',
        '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (outerR <= 0) return 0;',
        '    var affectorPos = aff.transform.position.value;',
        '    var dx = pos[0] - affectorPos[0], dy = pos[1] - affectorPos[1], dz = (pos[2] || 0) - (affectorPos[2] || 0);',
        '    var lineMode = 0;',
        '    try { lineMode = aff.effect("Line Mode")("Checkbox").value; } catch(e) {}',
        '    var dist = lineMode ? Math.abs(dx * Math.cos((aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180) + dy * Math.sin((aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180)) : Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '    if (dist <= innerR) return 1;',
        '    if (dist >= outerR) return 0;',
        '    var normalizedDist = (dist - innerR) / (outerR - innerR);',
        '    try { return aff.effect("Falloff")("Slider").valueAtTime(normalizedDist * 60 * thisComp.frameDuration) / 100; } catch(e) { return 1 - normalizedDist; }',
        '}',
        '',
        'function getAffectorPositionOffset(pos) {',
        '    var totalX = 0, totalY = 0, totalZ = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i], inf = calcInfluenceFor(aff, pos);',
        '        if (inf > 0) {',
        '            var px = 0, py = 0, pz = 0;',
        '            try { px = aff.effect("Position X")("Slider").value; } catch(e) {}',
        '            try { py = aff.effect("Position Y")("Slider").value; } catch(e) {}',
        '            try { pz = aff.effect("Position Z")("Slider").value; } catch(e) {}',
        '            totalX += px * inf; totalY += py * inf; totalZ += pz * inf;',
        '        }',
        '    }',
        '    return [totalX, totalY, totalZ];',
        '}',
        '',
        'function getAffectorScaleMult(pos) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i], inf = calcInfluenceFor(aff, pos);',
        '        if (inf > 0) { var amt = 100; try { amt = aff.effect("Scale")("Slider").value; } catch(e) {} total += (amt - 100) * inf; }',
        '    }',
        '    return 100 + total;',
        '}',
        '',
        'function getMirrorSignFor(aff, pos) {',
        '    if (!aff) return 1;',
        '    var mirror = 0; try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
        '    if (!mirror) return 1;',
        '    var affectorPos = aff.transform.position.value;',
        '    var dx = pos[0] - affectorPos[0], dy = pos[1] - affectorPos[1];',
        '    var angle = (aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180;',
        '    var perpDist = -dx * Math.sin(angle) + dy * Math.cos(angle);',
        '    var innerR = 0; try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (innerR > 0 && Math.abs(perpDist) <= innerR) return 1;',
        '    return perpDist >= 0 ? 1 : -1;',
        '}',
        '',
        'function getAffectorRotationBoost(pos, axis) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i], mirror = 0;',
        '        try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
        '        var inf = mirror ? calcSpatialInfluenceFor(aff, pos) : calcInfluenceFor(aff, pos);',
        '        if (inf > 0) { var amt = 0; try { amt = aff.effect("Rotation " + axis)("Slider").value; } catch(e) {} total += amt * inf * getMirrorSignFor(aff, pos); }',
        '    }',
        '    return total;',
        '}',
        '',
        'function getAffectorOpacityMult(pos) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i], inf = calcInfluenceFor(aff, pos);',
        '        if (inf > 0) { var amt = 100; try { amt = aff.effect("Opacity")("Slider").value; } catch(e) {} total += (amt - 100) * inf; }',
        '    }',
        '    return 100 + total;',
        '}',
        '',
        '// ===== TARGET SYSTEM =====',
        'var targets = [];',
        'for (var _ti = 1; _ti <= 4; _ti++) {',
        '    try { var _t = thisComp.layer("Parent Rig Target " + _ti); if (_t) targets.push(_t); } catch(e) {}',
        '}',
        'try { var _tL = thisComp.layer("Parent Rig Target"); if (_tL) targets.push(_tL); } catch(e) {}',
        '',
        'function calcTargetInfluence(tgt, pos, radiusPrefix) {',
        '    if (!tgt) return 0;',
        '    var outerR = 500, innerR = 0;',
        '    try { outerR = tgt.effect(radiusPrefix + " Outer Radius")("Slider").value; } catch(e) { try { outerR = tgt.effect("Outer Radius")("Slider").value; } catch(e2) {} }',
        '    try { innerR = tgt.effect(radiusPrefix + " Inner Radius")("Slider").value; } catch(e) { try { innerR = tgt.effect("Inner Radius")("Slider").value; } catch(e2) {} }',
        '    if (outerR <= 0) return 0;',
        '    var targetPos = tgt.transform.position.value;',
        '    var dx = pos[0] - targetPos[0], dy = pos[1] - targetPos[1], dz = (pos[2] || 0) - (targetPos[2] || 0);',
        '    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '    if (dist <= innerR) return 1;',
        '    if (dist >= outerR) return 0;',
        '    return 1 - (dist - innerR) / (outerR - innerR);',
        '}',
        '',
        'function getTargetLookAtRotation(pos, currentRot) {',
        '    var totalRot = currentRot;',
        '    for (var _i = 0; _i < targets.length; _i++) {',
        '        var tgt = targets[_i], lookAtEnabled = 0;',
        '        try { lookAtEnabled = tgt.effect("Look At")("Checkbox").value; } catch(e) {}',
        '        if (!lookAtEnabled) continue;',
        '        var influence = calcTargetInfluence(tgt, pos, "Look At");',
        '        if (influence <= 0) continue;',
        '        var strength = 100; try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
        '        if (strength === 0) continue;',
        '        var rotCorrection = 0; try { rotCorrection = tgt.effect("Z Rotation Correction")("Angle").value; } catch(e) {}',
        '        var targetPos = tgt.transform.position.value;',
        '        var dx = targetPos[0] - pos[0], dy = targetPos[1] - pos[1];',
        '        totalRot += (Math.atan2(dy, dx) * 180 / Math.PI + rotCorrection) * (strength / 100) * influence;',
        '    }',
        '    return totalRot;',
        '}',
        '',
        'function getTargetLookAtRotationX(pos, currentRot) {',
        '    var totalRot = currentRot;',
        '    for (var _i = 0; _i < targets.length; _i++) {',
        '        var tgt = targets[_i], lookAtEnabled = 0;',
        '        try { lookAtEnabled = tgt.effect("Look At")("Checkbox").value; } catch(e) {}',
        '        if (!lookAtEnabled) continue;',
        '        var influence = calcTargetInfluence(tgt, pos, "Look At");',
        '        if (influence <= 0) continue;',
        '        var strength = 100; try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
        '        if (strength === 0) continue;',
        '        var rotCorrection = 0; try { rotCorrection = tgt.effect("X Rotation Correction")("Angle").value; } catch(e) {}',
        '        var targetPos = tgt.transform.position.value;',
        '        var dx = targetPos[0] - pos[0], dy = targetPos[1] - pos[1], dz = (targetPos[2] || 0) - (pos[2] || 0);',
        '        var horizontalDist = Math.sqrt(dx * dx + dy * dy);',
        '        totalRot += (Math.atan2(dz, horizontalDist) * 180 / Math.PI + rotCorrection) * (strength / 100) * influence;',
        '    }',
        '    return totalRot;',
        '}',
        '',
        'function getTargetRepelOffset(pos) {',
        '    var totalX = 0, totalY = 0, totalZ = 0;',
        '    for (var _i = 0; _i < targets.length; _i++) {',
        '        var tgt = targets[_i], repelEnabled = 0;',
        '        try { repelEnabled = tgt.effect("Repel")("Checkbox").value; } catch(e) {}',
        '        if (!repelEnabled) continue;',
        '        var influence = calcTargetInfluence(tgt, pos, "Repel");',
        '        if (influence <= 0) continue;',
        '        var strength = 100; try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
        '        if (strength === 0) continue;',
        '        var targetPos = tgt.transform.position.value;',
        '        var dx = pos[0] - targetPos[0], dy = pos[1] - targetPos[1], dz = (pos[2] || 0) - (targetPos[2] || 0);',
        '        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '        if (dist < 0.001) continue;',
        '        var pushAmount = strength * influence;',
        '        totalX += (dx / dist) * pushAmount; totalY += (dy / dist) * pushAmount; totalZ += (dz / dist) * pushAmount;',
        '    }',
        '    return [totalX, totalY, totalZ];',
        '}',
        ''
    ].join('\n');
}

// Apply standalone expressions to a single layer
function applyStandaloneToLayer(layer, header) {
    var is3D = layer.threeDLayer;
    var restPos = layer.transform.position.value;
    var restScale = layer.transform.scale.value;
    var restOpacity = layer.transform.opacity.value;

    // Position expression
    var posExpr = header + [
        'var restPos = ' + JSON.stringify(restPos) + ';',
        'var currentPos = restPos;',
        'var affOffset = getAffectorPositionOffset(currentPos);',
        'currentPos = [currentPos[0] + affOffset[0], currentPos[1] + affOffset[1]' + (is3D ? ', currentPos[2] + affOffset[2]' : '') + '];',
        'var repelOffset = getTargetRepelOffset(currentPos);',
        'currentPos = [currentPos[0] + repelOffset[0], currentPos[1] + repelOffset[1]' + (is3D ? ', currentPos[2] + repelOffset[2]' : '') + '];',
        'var animDelta = value - restPos;',
        is3D ? 'currentPos + animDelta;' : '[currentPos[0] + animDelta[0], currentPos[1] + animDelta[1]];'
    ].join('\n');

    // Scale expression - use restPos for affector influence calculation
    var scaleExpr = header + [
        'var restScale = ' + JSON.stringify(restScale) + ';',
        'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
        'var scaleMult = getAffectorScaleMult(restPosForAffector) / 100;',
        'var scaledRest = [restScale[0] * scaleMult, restScale[1] * scaleMult' + (is3D ? ', restScale[2] * scaleMult' : '') + '];',
        'var animRatio = [value[0] / restScale[0], value[1] / restScale[1]' + (is3D ? ', value[2] / restScale[2]' : '') + '];',
        '[scaledRest[0] * animRatio[0], scaledRest[1] * animRatio[1]' + (is3D ? ', scaledRest[2] * animRatio[2]' : '') + '];'
    ].join('\n');

    // Opacity expression - use restPos for affector influence calculation
    var opacityExpr = header + [
        'var restOpacity = ' + restOpacity + ';',
        'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
        'var opacityMult = getAffectorOpacityMult(restPosForAffector) / 100;',
        'var currentOpacity = restOpacity * opacityMult;',
        'var animRatio = value / restOpacity;',
        'clamp(currentOpacity * animRatio, 0, 100);'
    ].join('\n');

    // Apply position, scale, opacity
    try { layer.transform.position.expression = posExpr; } catch(e) {}
    try { layer.transform.scale.expression = scaleExpr; } catch(e) {}
    try { layer.transform.opacity.expression = opacityExpr; } catch(e) {}

    // Rotation expressions - use restPos for affector influence, currentPos for target look-at
    if (is3D) {
        var restRotZ = layer.transform.zRotation.value;
        var restRotX = layer.transform.xRotation.value;
        var restRotY = layer.transform.yRotation.value;

        var zRotExpr = header + [
            'var restRot = ' + restRotZ + ';',
            'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
            'var currentRot = restRot + getAffectorRotationBoost(restPosForAffector, "Z");',
            'var currentPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);',
            'currentRot = getTargetLookAtRotation(currentPos, currentRot);',
            'currentRot + (value - restRot);'
        ].join('\n');

        var xRotExpr = header + [
            'var restRot = ' + restRotX + ';',
            'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
            'var currentRot = restRot + getAffectorRotationBoost(restPosForAffector, "X");',
            'var currentPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);',
            'currentRot = getTargetLookAtRotationX(currentPos, currentRot);',
            'currentRot + (value - restRot);'
        ].join('\n');

        var yRotExpr = header + [
            'var restRot = ' + restRotY + ';',
            'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
            'var currentRot = restRot + getAffectorRotationBoost(restPosForAffector, "Y");',
            'currentRot + (value - restRot);'
        ].join('\n');

        try { layer.transform.zRotation.expression = zRotExpr; } catch(e) {}
        try { layer.transform.xRotation.expression = xRotExpr; } catch(e) {}
        try { layer.transform.yRotation.expression = yRotExpr; } catch(e) {}
    } else {
        var restRot = layer.transform.rotation.value;
        var rotExpr = header + [
            'var restRot = ' + restRot + ';',
            'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
            'var currentRot = restRot + getAffectorRotationBoost(restPosForAffector, "Z");',
            'var currentPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);',
            'currentRot = getTargetLookAtRotation(currentPos, currentRot);',
            'currentRot + (value - restRot);'
        ].join('\n');

        try { layer.transform.rotation.expression = rotExpr; } catch(e) {}
    }
}

// Apply standalone affector/target effects to selected layers (direct call, with validation)
// Note: This function is now unused since standalone is triggered via addAffector/addTarget,
// but kept for potential future direct use or scripting
function applyStandaloneEffects() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return "error";
    }

    var selectedLayers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).selected) {
            selectedLayers.push(comp.layer(i));
        }
    }

    if (selectedLayers.length === 0) {
        alert("Please select one or more layers to apply effects to.");
        return "error";
    }

    // Check if there are any affectors or targets
    var hasAffector = false;
    var hasTarget = false;
    for (var i = 1; i <= comp.numLayers; i++) {
        var name = comp.layer(i).name;
        if (name.indexOf("Parent Rig Affector") === 0) hasAffector = true;
        if (name.indexOf("Parent Rig Target") === 0) hasTarget = true;
    }

    if (!hasAffector && !hasTarget) {
        alert("No affectors or targets found. Add an affector or target first.");
        return "error";
    }

    app.beginUndoGroup("Apply Standalone Effects");

    // Standalone header - just the affector/target systems, no parent rig timing
    var standaloneHeader = [
        '// Standalone Affector/Target Effects',
        '',
        '// ===== AFFECTOR SYSTEM =====',
        'var affectors = [];',
        'for (var _ai = 1; _ai <= 4; _ai++) {',
        '    try { var _a = thisComp.layer("Parent Rig Affector " + _ai); if (_a) affectors.push(_a); } catch(e) {}',
        '}',
        'try { var _aL = thisComp.layer("Parent Rig Affector"); if (_aL) affectors.push(_aL); } catch(e) {}',
        '',
        '// Helper to calculate influence for a given affector layer',
        'function calcInfluenceFor(aff, pos) {',
        '    if (!aff) return 0;',
        '    var globalInf = 100;',
        '    try { globalInf = aff.effect("Influence")("Slider").value; } catch(e) {}',
        '    globalInf = globalInf / 100;',
        '    if (globalInf <= 0) return 0;',
        '    var outerR = 200;',
        '    var innerR = 0;',
        '    try { outerR = aff.effect("Outer Radius")("Slider").value; } catch(e) {}',
        '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (outerR <= 0) return 0;',
        '    var affectorPos = aff.transform.position.value;',
        '    var dx = pos[0] - affectorPos[0];',
        '    var dy = pos[1] - affectorPos[1];',
        '    var dz = (pos[2] || 0) - (affectorPos[2] || 0);',
        '    ',
        '    var lineMode = 0;',
        '    try { lineMode = aff.effect("Line Mode")("Checkbox").value; } catch(e) {}',
        '    var dist;',
        '    if (lineMode) {',
        '        var angle = (aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180;',
        '        dist = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));',
        '    } else {',
        '        dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '    }',
        '    ',
        '    if (dist <= innerR) return globalInf;',
        '    if (dist >= outerR) return 0;',
        '    var falloffRange = outerR - innerR;',
        '    var normalizedDist = (dist - innerR) / falloffRange;',
        '    try {',
        '        var falloffProp = aff.effect("Falloff")("Slider");',
        '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
        '        return (falloffVal / 100) * globalInf;',
        '    } catch(e) { return (1 - normalizedDist) * globalInf; }',
        '}',
        '',
        '// Spatial influence only (ignores global Influence slider)',
        'function calcSpatialInfluenceFor(aff, pos) {',
        '    if (!aff) return 0;',
        '    var outerR = 200;',
        '    var innerR = 0;',
        '    try { outerR = aff.effect("Outer Radius")("Slider").value; } catch(e) {}',
        '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (outerR <= 0) return 0;',
        '    var affectorPos = aff.transform.position.value;',
        '    var dx = pos[0] - affectorPos[0];',
        '    var dy = pos[1] - affectorPos[1];',
        '    var dz = (pos[2] || 0) - (affectorPos[2] || 0);',
        '    var lineMode = 0;',
        '    try { lineMode = aff.effect("Line Mode")("Checkbox").value; } catch(e) {}',
        '    var dist;',
        '    if (lineMode) {',
        '        var angle = (aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180;',
        '        dist = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));',
        '    } else {',
        '        dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '    }',
        '    if (dist <= innerR) return 1;',
        '    if (dist >= outerR) return 0;',
        '    var falloffRange = outerR - innerR;',
        '    var normalizedDist = (dist - innerR) / falloffRange;',
        '    try {',
        '        var falloffProp = aff.effect("Falloff")("Slider");',
        '        var falloffVal = falloffProp.valueAtTime(normalizedDist * 60 * thisComp.frameDuration);',
        '        return falloffVal / 100;',
        '    } catch(e) { return 1 - normalizedDist; }',
        '}',
        '',
        'function getAffectorPositionOffset(pos) {',
        '    var totalX = 0, totalY = 0, totalZ = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i];',
        '        var inf = calcInfluenceFor(aff, pos);',
        '        if (inf > 0) {',
        '            var px = 0, py = 0, pz = 0;',
        '            try { px = aff.effect("Position X")("Slider").value; } catch(e) {}',
        '            try { py = aff.effect("Position Y")("Slider").value; } catch(e) {}',
        '            try { pz = aff.effect("Position Z")("Slider").value; } catch(e) {}',
        '            totalX += px * inf;',
        '            totalY += py * inf;',
        '            totalZ += pz * inf;',
        '        }',
        '    }',
        '    return [totalX, totalY, totalZ];',
        '}',
        '',
        'function getAffectorScaleMult(pos) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i];',
        '        var inf = calcInfluenceFor(aff, pos);',
        '        if (inf > 0) {',
        '            var amt = 100;',
        '            try { amt = aff.effect("Scale")("Slider").value; } catch(e) {}',
        '            total += (amt - 100) * inf;',
        '        }',
        '    }',
        '    return 100 + total;',
        '}',
        '',
        'function getMirrorSignFor(aff, pos) {',
        '    if (!aff) return 1;',
        '    var mirror = 0;',
        '    try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
        '    if (!mirror) return 1;',
        '    var affectorPos = aff.transform.position.value;',
        '    var dx = pos[0] - affectorPos[0];',
        '    var dy = pos[1] - affectorPos[1];',
        '    var angle = (aff.threeDLayer ? aff.transform.zRotation.value : aff.transform.rotation.value) * Math.PI / 180;',
        '    var perpDist = -dx * Math.sin(angle) + dy * Math.cos(angle);',
        '    var innerR = 0;',
        '    try { innerR = aff.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (innerR > 0 && Math.abs(perpDist) <= innerR) return 1;',
        '    return perpDist >= 0 ? 1 : -1;',
        '}',
        '',
        'function getAffectorRotationXBoost(pos) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i];',
        '        var mirror = 0;',
        '        try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
        '        var inf = mirror ? calcSpatialInfluenceFor(aff, pos) : calcInfluenceFor(aff, pos);',
        '        if (inf > 0) {',
        '            var amt = 0;',
        '            try { amt = aff.effect("Rotation X")("Slider").value; } catch(e) {}',
        '            total += amt * inf * getMirrorSignFor(aff, pos);',
        '        }',
        '    }',
        '    return total;',
        '}',
        '',
        'function getAffectorRotationYBoost(pos) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i];',
        '        var mirror = 0;',
        '        try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
        '        var inf = mirror ? calcSpatialInfluenceFor(aff, pos) : calcInfluenceFor(aff, pos);',
        '        if (inf > 0) {',
        '            var amt = 0;',
        '            try { amt = aff.effect("Rotation Y")("Slider").value; } catch(e) {}',
        '            total += amt * inf * getMirrorSignFor(aff, pos);',
        '        }',
        '    }',
        '    return total;',
        '}',
        '',
        'function getAffectorRotationZBoost(pos) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i];',
        '        var mirror = 0;',
        '        try { mirror = aff.effect("Mirror Rotation")("Checkbox").value; } catch(e) {}',
        '        var inf = mirror ? calcSpatialInfluenceFor(aff, pos) : calcInfluenceFor(aff, pos);',
        '        if (inf > 0) {',
        '            var amt = 0;',
        '            try { amt = aff.effect("Rotation Z")("Slider").value; } catch(e) {}',
        '            total += amt * inf * getMirrorSignFor(aff, pos);',
        '        }',
        '    }',
        '    return total;',
        '}',
        '',
        'function getAffectorOpacityMult(pos) {',
        '    var total = 0;',
        '    for (var _i = 0; _i < affectors.length; _i++) {',
        '        var aff = affectors[_i];',
        '        var inf = calcInfluenceFor(aff, pos);',
        '        if (inf > 0) {',
        '            var amt = 100;',
        '            try { amt = aff.effect("Opacity")("Slider").value; } catch(e) {}',
        '            total += (amt - 100) * inf;',
        '        }',
        '    }',
        '    return 100 + total;',
        '}',
        '',
        '// ===== TARGET SYSTEM =====',
        'var targets = [];',
        'for (var _ti = 1; _ti <= 4; _ti++) {',
        '    try { var _t = thisComp.layer("Parent Rig Target " + _ti); if (_t) targets.push(_t); } catch(e) {}',
        '}',
        'try { var _tL = thisComp.layer("Parent Rig Target"); if (_tL) targets.push(_tL); } catch(e) {}',
        '',
        'function calcLookAtInfluenceFor(tgt, pos) {',
        '    if (!tgt) return 0;',
        '    var outerR = 500;',
        '    var innerR = 0;',
        '    try { outerR = tgt.effect("Outer Radius")("Slider").value; } catch(e) {}',
        '    try { innerR = tgt.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (outerR <= 0) return 0;',
        '    var targetPos = tgt.transform.position.value;',
        '    var dx = pos[0] - targetPos[0];',
        '    var dy = pos[1] - targetPos[1];',
        '    var dz = (pos[2] || 0) - (targetPos[2] || 0);',
        '    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '    if (dist <= innerR) return 1;',
        '    if (dist >= outerR) return 0;',
        '    var normalizedDist = (dist - innerR) / (outerR - innerR);',
        '    return 1 - normalizedDist;',
        '}',
        '',
        'function calcRepelInfluenceFor(tgt, pos) {',
        '    if (!tgt) return 0;',
        '    var outerR = 500;',
        '    var innerR = 0;',
        '    try { outerR = tgt.effect("Outer Radius")("Slider").value; } catch(e) {}',
        '    try { innerR = tgt.effect("Inner Radius")("Slider").value; } catch(e) {}',
        '    if (outerR <= 0) return 0;',
        '    var targetPos = tgt.transform.position.value;',
        '    var dx = pos[0] - targetPos[0];',
        '    var dy = pos[1] - targetPos[1];',
        '    var dz = (pos[2] || 0) - (targetPos[2] || 0);',
        '    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '    if (dist <= innerR) return 1;',
        '    if (dist >= outerR) return 0;',
        '    var normalizedDist = (dist - innerR) / (outerR - innerR);',
        '    return 1 - normalizedDist;',
        '}',
        '',
        'function getTargetLookAtRotation(pos, currentRot) {',
        '    var totalRot = currentRot;',
        '    for (var _i = 0; _i < targets.length; _i++) {',
        '        var tgt = targets[_i];',
        '        var lookAtEnabled = 0;',
        '        try { lookAtEnabled = tgt.effect("Look At")("Checkbox").value; } catch(e) {}',
        '        if (!lookAtEnabled) continue;',
        '        var influence = calcLookAtInfluenceFor(tgt, pos);',
        '        if (influence <= 0) continue;',
        '        var strength = 100;',
        '        try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
        '        if (strength === 0) continue;',
        '        var rotCorrection = 0;',
        '        try { rotCorrection = tgt.effect("Z Rotation Correction")("Angle").value; } catch(e) {}',
        '        var targetPos = tgt.transform.position.value;',
        '        var dx = targetPos[0] - pos[0];',
        '        var dy = targetPos[1] - pos[1];',
        '        var angleToTarget = Math.atan2(dy, dx) * 180 / Math.PI + rotCorrection;',
        '        var lookAtAngle = angleToTarget * (strength / 100);',
        '        totalRot += lookAtAngle * influence;',
        '    }',
        '    return totalRot;',
        '}',
        '',
        'function getTargetLookAtRotationX(pos, currentRot) {',
        '    var totalRot = currentRot;',
        '    for (var _i = 0; _i < targets.length; _i++) {',
        '        var tgt = targets[_i];',
        '        var lookAtEnabled = 0;',
        '        try { lookAtEnabled = tgt.effect("Look At")("Checkbox").value; } catch(e) {}',
        '        if (!lookAtEnabled) continue;',
        '        var influence = calcLookAtInfluenceFor(tgt, pos);',
        '        if (influence <= 0) continue;',
        '        var strength = 100;',
        '        try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
        '        if (strength === 0) continue;',
        '        var rotCorrection = 0;',
        '        try { rotCorrection = tgt.effect("X Rotation Correction")("Angle").value; } catch(e) {}',
        '        var targetPos = tgt.transform.position.value;',
        '        var dx = targetPos[0] - pos[0];',
        '        var dy = targetPos[1] - pos[1];',
        '        var dz = (targetPos[2] || 0) - (pos[2] || 0);',
        '        var horizontalDist = Math.sqrt(dx * dx + dy * dy);',
        '        var pitchAngle = Math.atan2(dz, horizontalDist) * 180 / Math.PI + rotCorrection;',
        '        var lookAtPitch = pitchAngle * (strength / 100);',
        '        totalRot += lookAtPitch * influence;',
        '    }',
        '    return totalRot;',
        '}',
        '',
        'function getTargetRepelOffset(pos) {',
        '    var totalX = 0, totalY = 0, totalZ = 0;',
        '    for (var _i = 0; _i < targets.length; _i++) {',
        '        var tgt = targets[_i];',
        '        var repelEnabled = 0;',
        '        try { repelEnabled = tgt.effect("Repel")("Checkbox").value; } catch(e) {}',
        '        if (!repelEnabled) continue;',
        '        var influence = calcRepelInfluenceFor(tgt, pos);',
        '        if (influence <= 0) continue;',
        '        var strength = 100;',
        '        try { strength = tgt.effect("Strength")("Slider").value; } catch(e) {}',
        '        if (strength === 0) continue;',
        '        var targetPos = tgt.transform.position.value;',
        '        var dx = pos[0] - targetPos[0];',
        '        var dy = pos[1] - targetPos[1];',
        '        var dz = (pos[2] || 0) - (targetPos[2] || 0);',
        '        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);',
        '        if (dist < 0.001) continue;',
        '        var pushAmount = strength * influence;',
        '        totalX += (dx / dist) * pushAmount;',
        '        totalY += (dy / dist) * pushAmount;',
        '        totalZ += (dz / dist) * pushAmount;',
        '    }',
        '    return [totalX, totalY, totalZ];',
        '}',
        ''
    ].join('\n');

    for (var s = 0; s < selectedLayers.length; s++) {
        var layer = selectedLayers[s];
        var is3D = layer.threeDLayer;

        // Skip affector/target layers themselves
        if (layer.name.indexOf("Parent Rig Affector") === 0 || layer.name.indexOf("Parent Rig Target") === 0) {
            continue;
        }

        // Skip layers that already have parent rig
        if (hasEffect(layer, "Parent Rig - Child")) {
            continue;
        }

        // Store rest values
        var restPos = layer.transform.position.value;
        var restScale = layer.transform.scale.value;
        var restOpacity = layer.transform.opacity.value;

        // Position expression
        var posExpr = standaloneHeader + [
            'var restPos = ' + JSON.stringify(restPos) + ';',
            'var currentPos = restPos;',
            '',
            '// Apply affector position offset',
            'var affOffset = getAffectorPositionOffset(currentPos);',
            'currentPos = [currentPos[0] + affOffset[0], currentPos[1] + affOffset[1]' + (is3D ? ', currentPos[2] + affOffset[2]' : '') + '];',
            '',
            '// Apply target repel',
            'var repelOffset = getTargetRepelOffset(currentPos);',
            'currentPos = [currentPos[0] + repelOffset[0], currentPos[1] + repelOffset[1]' + (is3D ? ', currentPos[2] + repelOffset[2]' : '') + '];',
            '',
            '// Add any animation delta',
            'var animDelta = value - restPos;',
            is3D ? 'currentPos + animDelta;' : '[currentPos[0] + animDelta[0], currentPos[1] + animDelta[1]];'
        ].join('\n');

        // Scale expression - use restPos for affector influence calculation
        var scaleExpr = standaloneHeader + [
            'var restScale = ' + JSON.stringify(restScale) + ';',
            'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
            '',
            '// Apply affector scale (using rest position for influence)',
            'var scaleMult = getAffectorScaleMult(restPosForAffector) / 100;',
            'var scaledRest = [restScale[0] * scaleMult, restScale[1] * scaleMult' + (is3D ? ', restScale[2] * scaleMult' : '') + '];',
            '',
            '// Add any animation delta (as ratio)',
            'var animRatio = [value[0] / restScale[0], value[1] / restScale[1]' + (is3D ? ', value[2] / restScale[2]' : '') + '];',
            '[scaledRest[0] * animRatio[0], scaledRest[1] * animRatio[1]' + (is3D ? ', scaledRest[2] * animRatio[2]' : '') + '];'
        ].join('\n');

        // Rotation expression (Z or 2D rotation) - use restPos for affector influence, currentPos for target look-at
        var restRot, rotExpr;
        if (is3D) {
            restRot = layer.transform.zRotation.value;
            var restRotX = layer.transform.xRotation.value;
            var restRotY = layer.transform.yRotation.value;

            rotExpr = standaloneHeader + [
                'var restRot = ' + restRot + ';',
                'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
                '',
                '// Apply affector rotation boost (using rest position for influence)',
                'var rotBoost = getAffectorRotationZBoost(restPosForAffector);',
                'var currentRot = restRot + rotBoost;',
                '',
                '// Apply target look-at (using current position for direction)',
                'var currentPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);',
                'currentRot = getTargetLookAtRotation(currentPos, currentRot);',
                '',
                '// Add any animation delta',
                'var animDelta = value - restRot;',
                'currentRot + animDelta;'
            ].join('\n');

            var xRotExpr = standaloneHeader + [
                'var restRot = ' + restRotX + ';',
                'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
                '',
                '// Apply affector rotation boost (using rest position for influence)',
                'var rotBoost = getAffectorRotationXBoost(restPosForAffector);',
                'var currentRot = restRot + rotBoost;',
                '',
                '// Apply target look-at (pitch) - using current position for direction',
                'var currentPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);',
                'currentRot = getTargetLookAtRotationX(currentPos, currentRot);',
                '',
                '// Add any animation delta',
                'var animDelta = value - restRot;',
                'currentRot + animDelta;'
            ].join('\n');

            var yRotExpr = standaloneHeader + [
                'var restRot = ' + restRotY + ';',
                'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
                '',
                '// Apply affector rotation boost (using rest position for influence)',
                'var rotBoost = getAffectorRotationYBoost(restPosForAffector);',
                'var currentRot = restRot + rotBoost;',
                '',
                '// Add any animation delta',
                'var animDelta = value - restRot;',
                'currentRot + animDelta;'
            ].join('\n');

            try { layer.transform.zRotation.expression = rotExpr; } catch(e) {}
            try { layer.transform.xRotation.expression = xRotExpr; } catch(e) {}
            try { layer.transform.yRotation.expression = yRotExpr; } catch(e) {}
        } else {
            restRot = layer.transform.rotation.value;
            rotExpr = standaloneHeader + [
                'var restRot = ' + restRot + ';',
                'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
                '',
                '// Apply affector rotation boost (using rest position for influence)',
                'var rotBoost = getAffectorRotationZBoost(restPosForAffector);',
                'var currentRot = restRot + rotBoost;',
                '',
                '// Apply target look-at (using current position for direction)',
                'var currentPos = thisLayer.toWorld(thisLayer.transform.anchorPoint);',
                'currentRot = getTargetLookAtRotation(currentPos, currentRot);',
                '',
                '// Add any animation delta',
                'var animDelta = value - restRot;',
                'currentRot + animDelta;'
            ].join('\n');

            try { layer.transform.rotation.expression = rotExpr; } catch(e) {}
        }

        // Opacity expression - use restPos for affector influence calculation
        var opacityExpr = standaloneHeader + [
            'var restOpacity = ' + restOpacity + ';',
            'var restPosForAffector = ' + JSON.stringify(restPos) + ';',
            '',
            '// Apply affector opacity (using rest position for influence)',
            'var opacityMult = getAffectorOpacityMult(restPosForAffector) / 100;',
            'var currentOpacity = restOpacity * opacityMult;',
            '',
            '// Add any animation delta (as ratio)',
            'var animRatio = value / restOpacity;',
            'clamp(currentOpacity * animRatio, 0, 100);'
        ].join('\n');

        // Apply expressions
        try { layer.transform.position.expression = posExpr; } catch(e) {}
        try { layer.transform.scale.expression = scaleExpr; } catch(e) {}
        try { layer.transform.opacity.expression = opacityExpr; } catch(e) {}
    }

    app.endUndoGroup();
    return "success";
}
