# dts2gltf.py
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
    prog="dts2gltf.py",
    description="Convert DTS files to glTF/GLB format",
    usage="blender -b -P dts2gltf.py -- [options] <input.dts> [<input2.dts> ...]",
)
parser.add_argument(
    "input_files",
    nargs="+",
    metavar="INPUT",
    help="Input .dts file(s) to convert",
)
parser.add_argument(
    "--addon",
    default="io_scene_dtst3d",
    metavar="MODULE",
    help="Blender add-on module name (default: io_scene_dtst3d)",
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
    op_id, op_call = "import_scene.dtst3d(", bpy.ops.import_scene.dtst3d
except Exception as e:
    sys.exit(f"[dts2gltf] ERROR: {e}")

print(f"[dts2gltf] Using importer: {op_id}")
print(f"[dts2gltf] Processing {len(input_files)} file(s)...")

# ---- process each file ----
total = len(input_files)
success_count = 0
failure_count = 0
failed_paths = []
for i, in_path in enumerate(input_files, start=1):
    # Derive output path: same location, same name, but .glb/.gltf extension
    ext = ".gltf" if args.format == "GLTF_SEPARATE" else ".glb"
    out_path = os.path.splitext(in_path)[0] + ext

    # Reset scene for each file
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Match the fps the addon uses for keyframe placement so the glTF exporter
    # converts frame numbers to the correct times (factory default is 24fps).
    bpy.context.scene.render.fps = 30
    bpy.context.scene.render.fps_base = 1.0

    # Re-enable add-on after reset
    addon_utils.enable(args.addon, default_set=True, handle_error=None)

    # Import
    print(f"[dts2gltf] [{i}/{total}] Converting: {in_path}")
    try:
        res = op_call(filepath=in_path, merge_verts=True, import_sequences=True, dsq_name_from_filename=True)
        if "FINISHED" not in res:
            raise RuntimeError(f"Import failed via {op_id}")
    except Exception:
        failure_count += 1
        failed_paths.append(in_path)
        print(f"\n{RED}[dts2gltf] [{i}/{total}] FAIL (import):{RESET} {in_path}")
        continue

    # Export
    res = bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format=args.format,  # GLB | GLTF_SEPARATE
        use_selection=False,
        export_apply=False,
        export_materials='EXPORT',
        export_normals=True,
        export_tangents=False,
        export_texcoords=True,
        # Export custom properties, which is where we store the original
        # resource path.
        export_extras=True,
        # Include armature animations (DTS sequences)
        export_animations=True,
        export_animation_mode='ACTIONS',
        # Blender and T2 are Z-up, but these assets are destined for Three.js which
        # is Y-up. It's easiest to match the Y-up of our destination engine.
        export_yup=True,
        # Don't force-sample all bones; only export F-curves that exist.
        # This prevents placeholder animations (IFL/visibility-only sequences)
        # from getting rest-pose channels for every bone, which would override
        # other playing animations.
        export_force_sampling=False,
        # Draco compression
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    if "FINISHED" not in res:
        failure_count += 1
        failed_paths.append(in_path)
        print(f"\n{RED}[dts2gltf] [{i}/{total}] FAIL (export):{RESET} {out_path}")
        continue

    success_count += 1
    print(f"{GREEN}[dts2gltf] [{i}/{total}] OK:{RESET} {in_path} -> {out_path}")

print(f"[dts2gltf] Done! Converted {success_count} file(s), {failure_count} failed.")
if failed_paths:
    print(f"\n{RED}[dts2gltf] Failed paths:{RESET}")
    for p in failed_paths:
        print(os.path.relpath(p))
