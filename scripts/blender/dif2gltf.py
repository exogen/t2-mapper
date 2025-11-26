# dif2gltf.py
import argparse
import bpy, sys, os, addon_utils

# ANSI color codes for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

# ---- args ----
# Extract arguments after "--" (Blender passes its own args before that)
if "--" in sys.argv:
    script_args = sys.argv[sys.argv.index("--") + 1:]
else:
    script_args = []

parser = argparse.ArgumentParser(
    prog="dif2gltf.py",
    description="Convert DIF files to glTF/GLB format",
    usage="blender -b -P dif2gltf.py -- [options] <input.dif> [<input2.dif> ...]",
)
parser.add_argument(
    "input_files",
    nargs="+",
    metavar="INPUT",
    help="Input .dif file(s) to convert",
)
parser.add_argument(
    "--addon",
    default="io_dif",
    metavar="MODULE",
    help="Blender add-on module name (default: io_dif)",
)
parser.add_argument(
    "--format",
    choices=["GLB", "GLTF_SEPARATE"],
    default="GLB",
    help="Export format (default: GLB)",
)

args = parser.parse_args(script_args)

# Resolve and validate input files
input_files = [os.path.abspath(f) for f in args.input_files]
for in_path in input_files:
    if not os.path.isfile(in_path):
        parser.error(f"Input not found: {in_path}")

# ---- enable add-on (once) ----
addon_utils.enable(args.addon, default_set=True, handle_error=None)
loaded, enabled = addon_utils.check(args.addon)
if not enabled:
    mods = [m.__name__ for m in addon_utils.modules()]
    parser.error(f"Could not enable '{args.addon}'. Installed add-ons: {mods}")

try:
    op_id, op_call = "import_scene.dif", bpy.ops.import_scene.dif
except Exception as e:
    sys.exit(f"[dif2gltf] ERROR: {e}")

print(f"[dif2gltf] Using importer: {op_id}")
print(f"[dif2gltf] Processing {len(input_files)} file(s)...")

# ---- process each file ----
total = len(input_files)
for i, in_path in enumerate(input_files, start=1):
    # Derive output path: same location, same name, but .glb/.gltf extension
    ext = ".gltf" if args.format == "GLTF_SEPARATE" else ".glb"
    out_path = os.path.splitext(in_path)[0] + ext

    # Reset scene for each file
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Re-enable add-on after reset
    addon_utils.enable(args.addon, default_set=True, handle_error=None)

    # Import
    print(f"[dif2gltf] [{i}/{total}] Converting: {in_path}")
    try:
        res = op_call(filepath=in_path)
        if "FINISHED" not in res:
            raise RuntimeError(f"Import failed via {op_id}")
    except Exception:
        print(f"\n{RED}[dif2gltf] [{i}/{total}] FAIL:{RESET} {in_path}")
        continue

    # Export
    res = bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format=args.format,  # GLB | GLTF_SEPARATE
        use_selection=False,
        export_apply=True,
        # Blender and T2 are Z-up, but these assets are destined for Three.js which
        # is Y-up. It's easiest to match the Y-up of our destination engine.
        export_yup=True,
    )
    if "FINISHED" not in res:
        print(f"\n{RED}[dif2gltf] [{i}/{total}] FAIL (export):{RESET} {out_path}")
        continue

    print(f"{GREEN}[dif2gltf] [{i}/{total}] OK:{RESET} {in_path} -> {out_path}")

print(f"[dif2gltf] Done! Converted {len(input_files)} file(s).")
