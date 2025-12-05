#!/usr/bin/env python3
"""
Script auxiliar para criar arquivo ZIP do build
"""
import os
import sys
import zipfile
from pathlib import Path

def should_exclude(path_str, exclude_patterns):
    """Verifica se um caminho deve ser excluído"""
    for pattern in exclude_patterns:
        if pattern in path_str:
            return True
    return False

def main():
    if len(sys.argv) < 3:
        print("Usage: build_zip.py <root_dir> <output_zip>")
        sys.exit(1)
    
    root_dir = Path(sys.argv[1])
    output_zip = sys.argv[2]
    
    include = ['backend', 'public', 'plugin.json', 'requirements.txt', 'readme']
    exclude_patterns = [
        '__pycache__', '.pyc', '.pyo', '.git', '.gitignore', '.zip',
        'temp_dl', 'data', 'update_pending.zip', 'update_pending.json',
        'api.json', 'loadedappids.txt', 'appidlogs.txt'
    ]
    
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for include_item in include:
            full_path = root_dir / include_item
            if full_path.exists():
                if full_path.is_dir():
                    for file_path in full_path.rglob('*'):
                        if file_path.is_file():
                            rel_path = str(file_path.relative_to(root_dir)).replace('\\', '/')
                            if not should_exclude(rel_path, exclude_patterns):
                                z.write(str(file_path), rel_path)
                                print(f'  + {rel_path}')
                else:
                    rel_path = str(full_path.relative_to(root_dir)).replace('\\', '/')
                    z.write(str(full_path), rel_path)
                    print(f'  + {rel_path}')
    
    print('ZIP created successfully')

if __name__ == '__main__':
    main()

