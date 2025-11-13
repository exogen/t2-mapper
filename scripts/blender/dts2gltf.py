# dts2gltf.py
import bpy, sys, os, addon_utils

def die(msg, code=2):
    print(f"[dts2gltf] ERROR: {msg}", file=sys.stderr); sys.exit(code)

# ---- args ----
argv = sys.argv
if "--" not in argv: die("Usage: blender -b -P dts2gltf.py -- <in.dts> <out.glb|.gltf> [--addon io_scene_dts] [--format GLB|GLTF_SEPARATE]")
argv = argv[argv.index("--")+1:]
if len(argv) < 2: die("Need <in.dts> and <out.glb|.gltf>")
in_path, out_path = map(os.path.abspath, argv[:2])

addon_mod = "io_scene_dts"
forced_op = None
export_format = "GLTF_SEPARATE"
i = 2
while i < len(argv):
    if argv[i] == "--addon" and i+1 < len(argv): addon_mod = argv[i+1]; i += 2
    elif argv[i] == "--format" and i+1 < len(argv): export_format = argv[i+1]; i += 2
    else: die(f"Unknown arg: {argv[i]}")
if not os.path.isfile(in_path): die(f"Input not found: {in_path}")

# ---- reset FIRST (so we don't lose the add-on afterward) ----
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---- enable add-on ----
addon_utils.enable(addon_mod, default_set=True, handle_error=None)
loaded, enabled = addon_utils.check(addon_mod)
if not enabled:
    mods = [m.__name__ for m in addon_utils.modules()]
    die(f"Could not enable '{addon_mod}'. Installed add-ons: {mods}")

try:
    op_id, op_call = "import_scene.dts", bpy.ops.import_scene.dts
except Exception as e:
    die(str(e))

print(f"[dts2gltf] Using importer: {op_id}")

# ---- import ----
res = op_call(filepath=in_path)
if "FINISHED" not in res: die(f"Import failed via {op_id}: {in_path}")

# ---- export ----
res = bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format=export_format, # GLB | GLTF_SEPARATE
    use_selection=False,
    export_apply=True,
)
if "FINISHED" not in res: die(f"Export failed: {out_path}")
print(f"[dts2gltf] OK: {in_path} -> {out_path}")
