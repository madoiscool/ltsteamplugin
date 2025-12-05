#!/usr/bin/env python3
"""
Script auxiliar para ler versão do plugin.json
"""
import json
import sys
import os

def main():
    if len(sys.argv) < 2:
        print("unknown")
        sys.exit(1)
    
    plugin_path = os.path.join(sys.argv[1], 'plugin.json')
    
    try:
        with open(plugin_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            version = data.get('version', 'unknown')
            print(version)
    except Exception:
        print("unknown")
        sys.exit(1)

if __name__ == '__main__':
    main()

