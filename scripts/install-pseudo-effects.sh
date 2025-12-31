#!/bin/bash
# Install Parent Rig pseudo effects into After Effects PresetEffects.xml
# Run this ONCE on your development machine, then restart AE

# Find After Effects installation - newer versions have it in aelib.framework
PRESET_FILE="/Applications/Adobe After Effects 2025/Adobe After Effects 2025.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml"

if [ ! -f "$PRESET_FILE" ]; then
    PRESET_FILE="/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml"
fi

if [ ! -f "$PRESET_FILE" ]; then
    PRESET_FILE="/Applications/Adobe After Effects 2025/Adobe After Effects 2025.app/Contents/Resources/PresetEffects.xml"
fi

if [ ! -f "$PRESET_FILE" ]; then
    PRESET_FILE="/Applications/Adobe After Effects 2024/Adobe After Effects 2024.app/Contents/Resources/PresetEffects.xml"
fi

if [ ! -f "$PRESET_FILE" ]; then
    echo "ERROR: Cannot find After Effects PresetEffects.xml"
    exit 1
fi

echo "Found PresetEffects.xml at: $PRESET_FILE"

# Backup original
BACKUP_FILE="${PRESET_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "Creating backup: $BACKUP_FILE"
sudo cp "$PRESET_FILE" "$BACKUP_FILE"

# Use Python to update or replace the pseudo effect
python3 << 'PYTHON_SCRIPT'
import re

preset_file = '/Applications/Adobe After Effects 2025/Adobe After Effects 2025.app/Contents/Frameworks/aelib.framework/Versions/A/Resources/xml/PresetEffects.xml'

# New pseudo effect definition
new_effect = '''  <!-- Parent Rig - Parent -->
  <Effect matchname="Pseudo/ParentRigParent" name="$$$/AE/Preset/ParentRigParent=Parent Rig - Parent" Category="Expression Controls">
    <Group name="$$$/AE/Preset/Delay:=Delay:" ></Group>
    <Slider name="$$$/AE/Preset/Delaystep=Delay step" default="0" valid_min="0" valid_max="500" slider_min="0" slider_max="10" precision="1" />
    <Slider name="$$$/AE/Preset/Delaystretch=Delay stretch" default="0" valid_min="0" valid_max="500" slider_min="0" slider_max="10" precision="1" />
    <Slider name="$$$/AE/Preset/Falloff=Falloff" default="100" valid_min="0" valid_max="200" slider_min="0" slider_max="10" precision="0" DISPLAY_PERCENT="true" />
    <Group name="$$$/AE/Preset/=" ></Group>
    <Group name="$$$/AE/Preset/Order:=Order:" ></Group>
    <Slider name="$$$/AE/Preset/Reverseorder=Reverse order" default="0" valid_min="0" valid_max="100" slider_min="0" slider_max="10" precision="0" DISPLAY_PERCENT="true" />
    <Checkbox name="$$$/AE/Preset/Randomorder=Random order" hold="true" default="false" />
    <Slider name="$$$/AE/Preset/Randomseed=Random seed" default="0" valid_min="0" valid_max="100" slider_min="0" slider_max="10" precision="0" />
    <Group name="$$$/AE/Preset/1=" ></Group>
    <Group name="$$$/AE/Preset/Childlayersfollow:=Child layers follow:" ></Group>
    <Checkbox name="$$$/AE/Preset/Position=Position" hold="true" default="false" />
    <Checkbox name="$$$/AE/Preset/Scale=Scale" hold="true" default="false" />
    <Checkbox name="$$$/AE/Preset/Rotation=Rotation" hold="true" default="false" />
    <Checkbox name="$$$/AE/Preset/Opacity=Opacity" hold="true" default="false" />
    <Checkbox name="$$$/AE/Preset/Anchorpoint=Anchor point" hold="true" default="false" />
    <Slider name="$$$/AE/Preset/Childcount=Child count" UI_INVISIBLE="true" default="0" valid_min="0" valid_max="100" slider_min="0" slider_max="10" precision="2" />
  </Effect>'''

with open(preset_file, 'r') as f:
    content = f.read()

# Check if new ParentRigParent exists and replace it
if 'Pseudo/ParentRigParent' in content:
    # Replace existing ParentRigParent effect
    old_pattern = r'<!-- Parent Rig - Parent -->.*?<Effect matchname="Pseudo/ParentRigParent".*?</Effect>'
    if re.search(old_pattern, content, re.DOTALL):
        content = re.sub(old_pattern, new_effect, content, flags=re.DOTALL)
        print("Replaced existing ParentRigParent effect")
    else:
        # Try simpler pattern
        old_pattern2 = r'<Effect matchname="Pseudo/ParentRigParent"[^>]*>.*?</Effect>'
        if re.search(old_pattern2, content, re.DOTALL):
            content = re.sub(old_pattern2, new_effect, content, flags=re.DOTALL)
            print("Replaced existing ParentRigParent effect (simple pattern)")
        else:
            print("Found Pseudo/ParentRigParent but pattern didn't match - will add new")
            content = content.replace('</PresetEffects>', new_effect + '\n</PresetEffects>')
elif 'Pseudo/ParentRig' in content:
    # Old matchname exists - replace it with new one
    old_pattern = r'<!-- Parent Rig.*?-->.*?<Effect matchname="Pseudo/ParentRig"[^P].*?</Effect>'
    if re.search(old_pattern, content, re.DOTALL):
        content = re.sub(old_pattern, new_effect, content, flags=re.DOTALL)
        print("Replaced old Parent Rig effect with new ParentRigParent")
    else:
        old_pattern2 = r'<Effect matchname="Pseudo/ParentRig"[^PC].*?</Effect>'
        if re.search(old_pattern2, content, re.DOTALL):
            content = re.sub(old_pattern2, new_effect, content, flags=re.DOTALL)
            print("Replaced old Parent Rig effect (simple pattern)")
        else:
            print("Found old Pseudo/ParentRig but couldn't replace - adding new")
            content = content.replace('</PresetEffects>', new_effect + '\n</PresetEffects>')
else:
    # Add before </PresetEffects>
    content = content.replace('</PresetEffects>', new_effect + '\n</PresetEffects>')
    print("Added new ParentRigParent effect before </PresetEffects>")

with open(preset_file, 'w') as f:
    f.write(content)

print("Done!")
PYTHON_SCRIPT

# Verify
if grep -q "Pseudo/ParentRigParent" "$PRESET_FILE"; then
    echo ""
    echo "SUCCESS! Parent Rig pseudo effect installed."
    echo ""
    echo "NEXT STEPS:"
    echo "1. Restart After Effects"
    echo ""
else
    echo "ERROR: Installation failed. Restoring backup..."
    sudo cp "$BACKUP_FILE" "$PRESET_FILE"
    exit 1
fi
