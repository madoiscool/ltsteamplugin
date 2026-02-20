import json
import os
import glob

# so mely doesnt need to rely on claude to fill translations lmao
# go claude code

en_file = "en.json"
with open(en_file, "r", encoding="utf-8") as f:
    en_data = json.load(f)

for filepath in glob.glob("*.json"):
    if filepath == "en.json":
        continue
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Fill missing strings
    changes = 0
    for k, v in en_data["strings"].items():
        if k not in data["strings"]:
            data["strings"][k] = v
            changes += 1
            
    if changes > 0:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Updated {filepath} with {changes} new strings.")
print("Done.")
