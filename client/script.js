// Initialize CSInterface
var csInterface = new CSInterface();

// Get the extension path for loading assets
var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

document.addEventListener('DOMContentLoaded', function() {
    var applyButton = document.getElementById('applyRig');
    var affectorButton = document.getElementById('addAffector');
    var horizontalButton = document.getElementById('addHorizontal');
    var verticalButton = document.getElementById('addVertical');
    var gridButton = document.getElementById('addGrid');
    var radialButton = document.getElementById('addRadial');

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

    affectorButton.addEventListener('click', function() {
        affectorButton.classList.add('loading');
        affectorButton.textContent = 'Adding...';
        csInterface.evalScript('addAffector()', function(result) {
            affectorButton.classList.remove('loading');
            affectorButton.textContent = 'Add Affector';
            if (result && result !== 'undefined') {
                console.log('Affector result:', result);
            }
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

    radialButton.addEventListener('click', function() {
        csInterface.evalScript('addRadialCarousel()');
    });
});
