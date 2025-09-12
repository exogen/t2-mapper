# dif2gltf.py
import bpy, sys, os, addon_utils

def die(msg, code=2):
    print(f"[dif2gltf] ERROR: {msg}", file=sys.stderr); sys.exit(code)

# ---- args ----
argv = sys.argv
if "--" not in argv: die("Usage: blender -b -P dif2gltf.py -- <in.dif> <out.glb|.gltf> [--addon io_dif] [--op import_scene.dif|wm.dif_import] [--format GLB|GLTF_EMBEDDED|GLTF_SEPARATE]")
argv = argv[argv.index("--")+1:]
if len(argv) < 2: die("Need <in.dif> and <out.glb|.gltf>")
in_path, out_path = map(os.path.abspath, argv[:2])

addon_mod = "io_dif"
forced_op = None
export_format = "GLB"
i = 2
while i < len(argv):
    if argv[i] == "--addon" and i+1 < len(argv): addon_mod = argv[i+1]; i += 2
    elif argv[i] == "--op" and i+1 < len(argv): forced_op = argv[i+1]; i += 2
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

# ---- resolve importer (import_scene.* or wm.*) ----
def list_ops(ns):
    try: return [n for n in dir(ns) if not n.startswith("_")]
    except: return []

def resolve_operator():
    if forced_op:
        mod, name = forced_op.split(".", 1)
        return forced_op, getattr(getattr(bpy.ops, mod), name)
    # auto-discover
    for modname in ("import_scene", "wm"):
        names = list_ops(getattr(bpy.ops, modname))
        hits = [n for n in names if "dif" in n.lower()] or [n for n in names if "torque" in n.lower()]
        if len(hits) == 1:
            name = hits[0]
            return f"{modname}.{name}", getattr(getattr(bpy.ops, modname), name)
        if len(hits) > 1:
            raise RuntimeError(f"Multiple candidates: {[f'{modname}.{h}' for h in hits]}. Use --op.")
    raise RuntimeError("No DIF-like importer found.")

try:
    op_id, op_call = resolve_operator()
except Exception as e:
    die(str(e))

print(f"[dif2gltf] Using importer: {op_id}")

# ---- import ----
res = op_call(filepath=in_path)
if "FINISHED" not in res: die(f"Import failed via {op_id}: {in_path}")

# ---- export ----
res = bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format=export_format,   # GLB | GLTF_EMBEDDED | GLTF_SEPARATE
    use_selection=False,
    export_apply=True,
)
if "FINISHED" not in res: die(f"Export failed: {out_path}")
print(f"[dif2gltf] OK: {in_path} -> {out_path}")
