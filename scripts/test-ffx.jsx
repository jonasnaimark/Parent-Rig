// Test FFX application
var comp = app.project.activeItem;
if (comp && comp instanceof CompItem && comp.selectedLayers.length > 0) {
    var layer = comp.selectedLayers[0];
    var ffxPath = "/Users/jonas_naimark/Documents/ParentRig-CEP/assets/presets/Parent Rig - Parent.ffx";
    var ffxFile = new File(ffxPath);

    alert("FFX exists: " + ffxFile.exists);

    if (ffxFile.exists) {
        try {
            layer.applyPreset(ffxFile);
            alert("Success! Check the layer for the effect.");
        } catch (e) {
            alert("Error applying FFX:\n" + e.message);
        }
    }
} else {
    alert("Select a layer in an active comp first");
}
