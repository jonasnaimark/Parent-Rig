// Initialize CSInterface
var csInterface = new CSInterface();

// Get the extension path for loading assets
var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

document.addEventListener('DOMContentLoaded', function() {
    var applyButton = document.getElementById('applyRig');
    var removeButton = document.getElementById('removeRig');
    var affectorButton = document.getElementById('addAffector');
    var targetButton = document.getElementById('addTarget');
    var horizontalButton = document.getElementById('addHorizontal');
    var verticalButton = document.getElementById('addVertical');
    var gridButton = document.getElementById('addGrid');
    var radialButton = document.getElementById('addRadial');
    var largeCardsButton = document.getElementById('addLargeCards');
    var threeDListButton = document.getElementById('add3DList');

    // Helper to get follow options from checkboxes
    function getFollowOptions() {
        return {
            position: document.getElementById('prPosition').checked,
            scale: document.getElementById('prScale').checked,
            rotation: document.getElementById('prRotation').checked,
            opacity: document.getElementById('prOpacity').checked,
            anchor: document.getElementById('prAnchor').checked,
            includeAffector: document.getElementById('prIncludeAffector').checked,
            includeTarget: document.getElementById('prIncludeTarget').checked
        };
    }

    applyButton.addEventListener('click', function() {
        applyButton.classList.add('loading');
        applyButton.textContent = 'Applying...';

        var optionsJSON = JSON.stringify(getFollowOptions());

        // Pass extension path to ExtendScript (no 'var' to update the global)
        var setPathScript = 'extensionRoot = "' + extensionPath.replace(/\\/g, '\\\\') + '";';

        csInterface.evalScript(setPathScript, function() {
            csInterface.evalScript('applyParentRig(\'' + optionsJSON + '\')', function(result) {
                applyButton.classList.remove('loading');
                applyButton.textContent = 'Apply Parent Rig';

                if (result && result !== 'undefined') {
                    console.log('Result:', result);
                }
            });
        });
    });

    removeButton.addEventListener('click', function() {
        removeButton.classList.add('loading');
        removeButton.textContent = 'Removing...';

        csInterface.evalScript('removeParentRig()', function(result) {
            removeButton.classList.remove('loading');
            removeButton.textContent = 'Remove Parent Rig';

            if (result && result !== 'undefined') {
                console.log('Remove result:', result);
            }
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

    targetButton.addEventListener('click', function() {
        targetButton.classList.add('loading');
        targetButton.textContent = 'Adding...';
        csInterface.evalScript('addTarget()', function(result) {
            targetButton.classList.remove('loading');
            targetButton.textContent = 'Add Target';
            if (result && result !== 'undefined') {
                console.log('Target result:', result);
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

    largeCardsButton.addEventListener('click', function() {
        csInterface.evalScript('addLargeCards()');
    });

    threeDListButton.addEventListener('click', function() {
        csInterface.evalScript('add3DList()');
    });
});
