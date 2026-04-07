import os
import shutil
import glob
from collections import defaultdict

TRADES_DIR = r"d:\QUANT_DASHBAORD\trades"

# Target FoldERS (using user's exact names)
V1_FOLDER = "Blaze v1 - v1"
V2_FOLDER = "Blaze v2 -v2"
V3_FOLDER = "Blaze v3 - v3"
V4_FOLDER = "Blaze v4 - v4"
V42_FOLDER = "Blaze v4.2 - v4.2"
V5_FOLDER = "Blaze 5 - v5"
B20_FOLDER = "B - 20 - Nifty BEES"

FOLDERS = [V1_FOLDER, V2_FOLDER, V3_FOLDER, V4_FOLDER, V42_FOLDER, V5_FOLDER, B20_FOLDER]

def setup_folders():
    for f in FOLDERS:
        path = os.path.join(TRADES_DIR, f)
        if not os.path.exists(path):
            os.makedirs(path)
            print(f"Created folder: {f}")

def move_file(src, folder_name):
    if not os.path.exists(src):
        return
    dest_dir = os.path.join(TRADES_DIR, folder_name)
    dest_path = os.path.join(dest_dir, os.path.basename(src))
    
    # Don't move if it's already in the correct group of folders
    for fld in FOLDERS:
        if fld in src:
            # Check if it's in the WRONG folder among ours
            if fld != folder_name:
                print(f"File {os.path.basename(src)} is in wrong folder {fld}, moving to {folder_name}")
                break
            else:
                return # Already in correct folder

    shutil.move(src, dest_path)
    print(f"Moved {os.path.basename(src)} -> {folder_name}")

def reorganize():
    # 1. B-20 / NiftyBeES
    for f in glob.glob(os.path.join(TRADES_DIR, "**", "*NiftyBeES*"), recursive=True):
        if os.path.isfile(f):
            move_file(f, B20_FOLDER)

    # 2. SENSEX Files (priority over general Blaze)
    # Mapping: _v4.csv -> V4, _v5.csv -> V4.2, _v6.csv -> V5
    mapping = [
        ("_v4.csv", V4_FOLDER),
        ("_v5.csv", V42_FOLDER),
        ("_v6.csv", V5_FOLDER)
    ]
    for suffix, folder in mapping:
        for f in glob.glob(os.path.join(TRADES_DIR, "**", f"*{suffix}"), recursive=True):
            if os.path.isfile(f):
                move_file(f, folder)

    # Legacy SENSEX mapping (ending in 6.csv or 7.csv but not _v6.csv)
    for f in glob.glob(os.path.join(TRADES_DIR, "**", "*SENSEX*"), recursive=True):
        if not os.path.isfile(f): continue
        bn = os.path.basename(f)
        if bn.endswith("6.csv") and not bn.endswith("_v6.csv") and not bn.endswith("_v4.csv"):
            move_file(f, V4_FOLDER)
        elif bn.endswith("7.csv") and not bn.endswith("_v5.csv") and not bn.endswith("_v1.csv"): # v1 shouldn't happen but safe
            move_file(f, V5_FOLDER)

    # 3. Explicit V1, V2, V3
    for v_suffix, folder in [("_V1.csv", V1_FOLDER), ("_V2.csv", V2_FOLDER), ("_V3.csv", V3_FOLDER)]:
        for f in glob.glob(os.path.join(TRADES_DIR, "**", f"*{v_suffix}"), recursive=True):
            if os.path.isfile(f):
                move_file(f, folder)

    # 4. Old-format BLAZE files (BLAZE_YYYYMMDD_HHMMSS.csv)
    # These need the V1/V2/V3 logic
    old_blaze = []
    for f in glob.glob(os.path.join(TRADES_DIR, "**", "BLAZE_2*.csv"), recursive=True):
        if not os.path.isfile(f): continue
        bn = os.path.basename(f)
        # Exclude already handled
        if any(x in bn for x in ["SENSEX", "_V1", "_V2", "_V3", "_v4", "_v5", "_v6", "NiftyBeES"]):
            continue
        # Also exclude if already in one of our target folders (though move_file handles it, let's be clean)
        if any(fld in f for fld in FOLDERS):
            continue
        old_blaze.append(f)

    # Group by date
    day_groups = defaultdict(list)
    for f in old_blaze:
        bn = os.path.basename(f)
        try:
            date_part = bn.split("_")[1]
            day_groups[date_part].append(f)
        except:
            continue
    
    for date in day_groups:
        day_groups[date].sort()
        sorted_files = day_groups[date]
        if len(sorted_files) >= 1: move_file(sorted_files[0], V1_FOLDER)
        if len(sorted_files) >= 2: move_file(sorted_files[1], V2_FOLDER)
        if len(sorted_files) >= 3: move_file(sorted_files[2], V3_FOLDER)

if __name__ == "__main__":
    setup_folders()
    reorganize()
    print("Optimization complete.")
