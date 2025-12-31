# Parent Rig

A CEP extension for Adobe After Effects that creates expression-based parenting with cascade animation controls.

## Features

- **Delay Step & Stretch** - Create cascading animations where children follow the parent with configurable delays
- **Leader Index** - Set which child leads the animation (0 delay), with separate before/after delay multipliers for center-out effects
- **Scale Around Parent** - Children scale outward/inward from the parent's position
- **Rotate Around Parent** - Children orbit around the parent when it rotates
- **Falloff** - Reduce delay influence for children further from the leader
- **Per-Property Control** - Toggle which properties follow the parent and which properties use delays
- **Reverse Order** - Flip the cascade direction
- **Random Order** - Randomize cascade order with seed control

## Installation

### Development Setup

1. Clone this repository
2. Create a symlink in the CEP extensions folder:
   ```bash
   ln -s /path/to/Parent-Rig ~/Library/Application\ Support/Adobe/CEP/extensions/com.parentrig.cep.dev
   ```
3. Enable unsigned extensions (for development):
   ```bash
   defaults write com.adobe.CSXS.11 PlayerDebugMode 1
   ```
4. Install the pseudo effect (requires After Effects restart):
   ```bash
   sudo ./scripts/install-pseudo-effects.sh
   ```
5. Restart After Effects

### Production Build

The `dist/` folder contains ZXP files for distribution (not included in repo).

## Usage

1. Create your layers in After Effects
2. Parent child layers to a parent layer using AE's native parenting
3. Select all the layers (parent and children)
4. Open the Parent Rig panel (Window → Extensions → Parent Rig Dev)
5. Click "Apply Parent Rig"

The extension will:
- Create an invisible rig layer if needed (for visible parents)
- Apply expressions to all children
- Add the Parent Rig control effect to the parent

### Controls

| Control | Description |
|---------|-------------|
| Delay - Step | Frames of delay between each child |
| Delay - Stretch | Time stretch factor for child animations |
| Falloff | Reduces delay for children further from leader (100% = full delay) |
| Influence | How much children follow the parent (0% = independent) |
| Reverse Order | Flip which child animates first |
| Random Order | Randomize child order |
| Leader Index | Which child has 0 delay (default: 1 = first child) |
| Delay Before/After Leader | Multipliers for children before/after the leader |
| Scale Around | Child (default) or Parent pivot point |
| Rotate Around | Child (default) or Parent pivot point |

## Project Structure

```
Parent-Rig/
├── client/          # Panel UI (HTML/CSS/JS)
├── host/            # ExtendScript (main.jsx)
├── CSXS/            # Extension manifest
├── assets/          # FFX presets
├── scripts/         # Dev/build scripts
├── docs/            # Planning documents
└── NOTES.md         # Development notes & troubleshooting
```

## Development Notes

See [NOTES.md](NOTES.md) for:
- Pseudo effect index mapping
- Troubleshooting CEP caching issues
- Updating pseudo effects workflow

## Test Helpers

The panel includes buttons to quickly generate test shapes:
- **Add Horizontal Carousel** - 20 cards in a row
- **Add Vertical List** - 20 rows in a column

## Requirements

- Adobe After Effects 2024 or later
- macOS (Windows support untested)

## License

Private - Internal use only
