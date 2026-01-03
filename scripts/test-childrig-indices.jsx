// Test script to find Child Rig pseudo effect property indices
var comp = app.project.activeItem;
if (comp && comp instanceof CompItem && comp.selectedLayers.length > 0) {
    var layer = comp.selectedLayers[0];
    var effects = layer.property("ADBE Effect Parade");
    var eff = null;

    // Find Child Rig effect (may be named "Child Rig - ParentName")
    for (var e = 1; e <= effects.numProperties; e++) {
        var testEff = effects.property(e);
        if (testEff.name.indexOf("Child Rig") === 0 || testEff.matchName === "Pseudo/ChildRig") {
            eff = testEff;
            break;
        }
    }

    if (eff) {
        var result = "Child Rig (" + eff.name + ") - " + eff.numProperties + " properties:\n\n";
        for (var i = 1; i <= eff.numProperties; i++) {
            try {
                var prop = eff.property(i);
                result += i + ": " + prop.name + "\n";
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
