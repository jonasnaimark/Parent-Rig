// Debug script to check pin edge calculations
var comp = app.project.activeItem;
if (comp && comp instanceof CompItem && comp.selectedLayers.length > 0) {
    var layer = comp.selectedLayers[0];

    // Find parent layer (might be selected layer or find it)
    var parentLayer = null;
    var eff = layer.effect("Parent Rig - Parent");
    if (eff) {
        parentLayer = layer;
    } else {
        // Search for parent layer
        for (var i = 1; i <= comp.numLayers; i++) {
            try {
                if (comp.layer(i).effect("Parent Rig - Parent")) {
                    parentLayer = comp.layer(i);
                    eff = parentLayer.effect("Parent Rig - Parent");
                    break;
                }
            } catch(e) {}
        }
    }

    if (eff) {
        // Get the expression from a CHILD layer's Position property (that's where groupMin/Max are)
        var posExpr = "";
        for (var i = 1; i <= comp.numLayers; i++) {
            try {
                var childEff = comp.layer(i).effect("Parent Rig - Child");
                if (childEff) {
                    posExpr = comp.layer(i).transform.position.expression;
                    break;
                }
            } catch(e) {}
        }

        // Extract groupMinY, groupMaxY from expression
        var groupMinY = "not found";
        var groupMaxY = "not found";

        // Try different regex patterns
        var minMatch = posExpr.match(/groupMinY\s*=\s*([-\d.]+)/);
        var maxMatch = posExpr.match(/groupMaxY\s*=\s*([-\d.]+)/);

        if (minMatch) groupMinY = parseFloat(minMatch[1]);
        if (maxMatch) groupMaxY = parseFloat(maxMatch[1]);

        // Get current values
        var pinDirection = eff.property(32).value;  // 1=Overscroll, 2=Collision
        var pinBottomEnabled = eff.property(41).value;
        var pinBottomY = eff.property(42).value;

        // Get parent rest position from a child
        var parentRestPosY = "unknown";
        var childEff = null;
        for (var i = 1; i <= comp.numLayers; i++) {
            try {
                childEff = comp.layer(i).effect("Parent Rig - Child");
                if (childEff) {
                    parentRestPosY = childEff.property(15).value;  // Parent Rest Pos Y
                    break;
                }
            } catch(e) {}
        }

        var parentCurrentY = "unknown";
        var parentDeltaY = "unknown";
        var bottomLayerNaturalY = "unknown";

        if (parentLayer && parentRestPosY !== "unknown") {
            parentCurrentY = parentLayer.transform.position.value[1];
            parentDeltaY = parentCurrentY - parentRestPosY;
            if (groupMaxY !== "not found") {
                bottomLayerNaturalY = groupMaxY + parentDeltaY;
            }
        }

        var result = "PIN EDGES DEBUG:\n\n";
        result += "Comp height: " + comp.height + "\n\n";
        result += "--- From Expression ---\n";
        result += "groupMinY (top layer rest): " + groupMinY + "\n";
        result += "groupMaxY (bottom layer rest): " + groupMaxY + "\n\n";
        result += "--- From Effect ---\n";
        result += "Pin direction: " + (pinDirection === 1 ? "Overscroll stretch" : "Collision squish") + " (" + pinDirection + ")\n";
        result += "Bottom enabled: " + (pinBottomEnabled ? "YES" : "NO") + "\n";
        result += "Bottom Y boundary: " + pinBottomY + "\n\n";
        result += "--- Calculated ---\n";
        result += "Parent rest Y: " + parentRestPosY + "\n";
        result += "Parent current Y: " + parentCurrentY + "\n";
        result += "Parent delta Y: " + parentDeltaY + "\n";
        result += "Bottom layer natural Y: " + bottomLayerNaturalY + "\n\n";
        result += "--- Pin Activation ---\n";

        if (bottomLayerNaturalY !== "unknown" && pinBottomY) {
            var collisionActive = bottomLayerNaturalY > pinBottomY;
            var overscrollActive = bottomLayerNaturalY < pinBottomY;

            result += "Collision would activate: " + (collisionActive ? "YES (natural > boundary)" : "NO") + "\n";
            result += "  (" + bottomLayerNaturalY + " > " + pinBottomY + " = " + collisionActive + ")\n";
            result += "Overscroll would activate: " + (overscrollActive ? "YES (natural < boundary)" : "NO") + "\n";
            result += "  (" + bottomLayerNaturalY + " < " + pinBottomY + " = " + overscrollActive + ")\n\n";

            if (pinDirection === 2 && collisionActive) {
                var offset = pinBottomY - bottomLayerNaturalY;
                result += "Collision squish ACTIVE!\n";
                result += "Offset to apply: " + offset + " (negative = pull UP)\n";
            } else if (pinDirection === 1 && overscrollActive) {
                var offset = pinBottomY - bottomLayerNaturalY;
                result += "Overscroll stretch ACTIVE!\n";
                result += "Offset to apply: " + offset + " (positive = push DOWN)\n";
            } else {
                result += "Pin NOT active (condition not met)\n";
            }
        }

        result += "\n--- ISSUE CHECK ---\n";
        if (groupMaxY !== "not found" && groupMaxY > pinBottomY) {
            result += "⚠️ WARNING: groupMaxY (" + groupMaxY + ") > pinBottomY (" + pinBottomY + ")\n";
            result += "This means children extend BELOW the boundary at rest!\n";
            result += "The pin would be constantly active, causing unexpected behavior.\n";
        } else {
            result += "✓ groupMaxY is within boundary at rest\n";
        }

        alert(result);
    } else {
        alert("No 'Parent Rig - Parent' effect found");
    }
} else {
    alert("Select the parent layer");
}
