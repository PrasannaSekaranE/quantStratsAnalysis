import os
import shutil
import glob

TRADES_DIR = "d:/QUANT_DASHBAORD/trades"

# Target Folders
V1_FOLDER = os.path.join(TRADES_DIR, "Blaze v1 - v1")
V2_FOLDER = os.path.join(TRADES_DIR, "Blaze v2 -v2")
V3_FOLDER = os.path.join(TRADES_DIR, "Blaze v3 - v3")
V4_FOLDER = os.path.join(TRADES_DIR, "Blaze v4 - v4")
V42_FOLDER = os.path.join(TRADES_DIR, "Blaze v4.2 - v4.2")
V5_FOLDER = os.path.join(TRADES_DIR, "Blaze 5 - v5")
B20_FOLDER = os.path.join(TRADES_DIR, "B - 20 - Nifty BEES")

def move_file(src, dest_folder):
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)
    
    bn = os.path.basename(src)
    dest = os.path.join(dest_folder, bn)
    
    if os.path.exists(dest):
        # If it's the same file, skip. Otherwise, give it a unique name
        if os.path.getsize(src) == os.path.getsize(dest):
            print(f"Skipping identical file: {bn}")
            os.remove(src)
            return
        else:
            dest = os.path.join(dest_folder, f"dup_{bn}")
            
    print(f"Moving {bn} to {os.path.basename(dest_folder)}")
    shutil.move(src, dest)

def run_reorg():
    # Identify NiftyBeES files in root
    for f in glob.glob(os.path.join(TRADES_DIR, "*NiftyBeES*")):
        if os.path.isfile(f):
            move_file(f, B20_FOLDER)
            
    # Identify BLAZE SENSEX files in root (likely V4 if not otherwise marked)
    for f in glob.glob(os.path.join(TRADES_DIR, "*SENSEX*")):
        if os.path.isfile(f):
            # Check for version suffix
            bn = os.path.basename(f).lower()
            if "_v6" in bn:
                move_file(f, V5_FOLDER)
            elif "_v5" in bn:
                move_file(f, V42_FOLDER)
            elif "_v4" in bn:
                move_file(f, V4_FOLDER)
            else:
                # Default SENSEX to V4 as per history
                move_file(f, V4_FOLDER)

    # Identify other BLAZE files (likely V1 if not marked)
    for f in glob.glob(os.path.join(TRADES_DIR, "BLAZE_*")):
        if os.path.isfile(f):
            bn = os.path.basename(f).lower()
            if "sensex" in bn: continue # already handled
            if "niftybees" in bn: continue # already handled
            
            if "_v1" in bn: move_file(f, V1_FOLDER)
            elif "_v2" in bn: move_file(f, V2_FOLDER)
            elif "_v3" in bn: move_file(f, V3_FOLDER)
            else: move_file(f, V1_FOLDER)

if __name__ == "__main__":
    run_reorg()
