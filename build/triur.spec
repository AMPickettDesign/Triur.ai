# -*- mode: python ; coding: utf-8 -*-
"""
Triur.ai — PyInstaller spec file
Bundles the entire Python backend into a single executable.
Users never need to install Python.
"""

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all data files needed
datas = [
    ('../config', 'config'),
]

# Hidden imports that PyInstaller might miss
hiddenimports = [
    'flask',
    'flask_cors',
    'requests',
    'feedparser',
    'brain',
    'memory',
    'emotions',
    'relationship',
    'gossip',
    'actions',
    'chat',
    'utils',
    'world',
    'sibling_relationship',
]

a = Analysis(
    ['../src/server.py'],
    pathex=['../src'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'PIL',
        'cv2',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='triur-brain',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='../app/web/assets/icon.ico',
)
