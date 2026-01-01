// Test script to check pin boundary values
var comp = app.project.activeItem;
if (comp && comp instanceof CompItem && comp.selectedLayers.length > 0) {
    var layer = comp.selectedLayers[0];
    var eff = layer.effect("Parent Rig - Parent");

    if (eff) {
        var result = "Pin Edges Property Check:\n\n";

        // Check key pin-related indices
        var checks = [
            {idx: 32, name: "Pin direction"},
            {idx: 33, name: "Pin influence"},
            {idx: 34, name: "Pin trim"},
            {idx: 37, name: "Top checkbox"},
            {idx: 38, name: "Top Y boundary"},
            {idx: 41, name: "Bottom checkbox"},
            {idx: 42, name: "Bottom Y boundary"},
            {idx: 45, name: "Left checkbox"},
            {idx: 46, name: "Left X boundary"},
            {idx: 49, name: "Right checkbox"},
            {idx: 50, name: "Right X boundary"}
        ];

        for (var i = 0; i < checks.length; i++) {
            var c = checks[i];
            try {
                var prop = eff.property(c.idx);
                result += "Index " + c.idx + " (" + c.name + "):\n";
                result += "  Actual name: " + prop.name + "\n";
                result += "  Value: " + prop.value + "\n\n";
            } catch(e) {
                result += "Index " + c.idx + " (" + c.name + "): ERROR - " + e.message + "\n\n";
            }
        }

        result += "\nComp size: " + comp.width + " x " + comp.height;
        result += "\n\nExpected: Bottom Y = " + comp.height + ", Right X = " + comp.width;

        alert(result);
    } else {
        alert("No 'Parent Rig - Parent' effect found on selected layer");
    }
} else {
    alert("Select a layer with the Parent Rig - Parent effect");
}
