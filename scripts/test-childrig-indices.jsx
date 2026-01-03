// Test script to find Child Rig pseudo effect property indices
var comp = app.project.activeItem;
if (comp && comp instanceof CompItem && comp.selectedLayers.length > 0) {
    var layer = comp.selectedLayers[0];
    var eff = layer.effect("Child Rig");

    if (eff) {
        var result = "Child Rig Property indices:\n\n";
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
        alert("No 'Child Rig' effect found on selected layer");
    }
} else {
    alert("Select a layer with the Child Rig effect");
}
