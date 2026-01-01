// Initialize CSInterface
var csInterface = new CSInterface();

// Get the extension path for loading assets
var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

document.addEventListener('DOMContentLoaded', function() {
    var applyButton = document.getElementById('applyRig');
    var horizontalButton = document.getElementById('addHorizontal');
    var verticalButton = document.getElementById('addVertical');
    var gridButton = document.getElementById('addGrid');

    applyButton.addEventListener('click', function() {
        applyButton.classList.add('loading');
        applyButton.textContent = 'Applying...';

        // Pass extension path to ExtendScript (no 'var' to update the global)
        var setPathScript = 'extensionRoot = "' + extensionPath.replace(/\\/g, '\\\\') + '";';

        csInterface.evalScript(setPathScript, function() {
            csInterface.evalScript('applyParentRig()', function(result) {
                applyButton.classList.remove('loading');
                applyButton.textContent = 'Apply Parent Rig';

                if (result && result !== 'undefined') {
                    console.log('Result:', result);
                }
            });
        });
    });

    horizontalButton.addEventListener('click', function() {
        csInterface.evalScript('addHorizontalCarousel()');
    });

    verticalButton.addEventListener('click', function() {
        csInterface.evalScript('addVerticalList()');
    });

    gridButton.addEventListener('click', function() {
        csInterface.evalScript('addGrid()');
    });
});
