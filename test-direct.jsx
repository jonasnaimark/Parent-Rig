// Test applying pseudo effect directly (no FFX)
var comp = app.project.activeItem;
if (comp && comp instanceof CompItem && comp.selectedLayers.length > 0) {
    var layer = comp.selectedLayers[0];
    var effects = layer.property("ADBE Effect Parade");

    try {
        // Try to add the pseudo effect directly by matchname
        var eff = effects.addProperty("Pseudo/ParentRigParent");
        alert("Success! Effect added: " + eff.name);
    } catch (e) {
        alert("Error: " + e.message);
    }
} else {
    alert("Select a layer in an active comp first");
}
