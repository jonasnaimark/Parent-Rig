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
