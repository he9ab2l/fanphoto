# -*- coding: utf-8 -*-
import os, struct, sys
sys.stdout.reconfigure(encoding='utf-8')

folder = r"D:\fffaa-photo\test-photo"

MARKERS = {0xC0:'SOF0',0xC1:'SOF1',0xC2:'SOF2',0xC4:'DHT',0xDA:'SOS',0xDB:'DQT',0xDD:'DRI',
    0xE0:'APP0',0xE1:'APP1',0xE2:'APP2',0xE3:'APP3',0xE4:'APP4',0xE5:'APP5',0xE6:'APP6',
    0xE7:'APP7',0xE8:'APP8',0xE9:'APP9',0xEA:'APPA',0xEB:'APPB',0xEC:'APPC',0xED:'APPD',
    0xEE:'APPE',0xEF:'APPF',0xFE:'COM'}

def hexdump(b, n=64):
    return b[:n].hex(' ').upper()

def find_at_offsets(data, pat, limit=10):
    offs = []
    start = 0
    while True:
        i = data.find(pat, start)
        if i < 0: break
        offs.append(i)
        if len(offs) >= limit: break
        start = i + 1
    return offs

def scan_jpeg(path):
    data = open(path,'rb').read()
    print(f"=== {os.path.basename(path)} ({len(data):,} bytes) ===")
    # 1. polyglot signatures
    sigs = [(b'PK\x03\x04','ZIP'),(b'%PDF','PDF'),(b'<!DOCTYPE','HTML'),(b'<html','HTML'),
            (b'<?php','PHP'),(b'MZ','PE/EXE'),(b'\x89PNG','PNG'),(b'GIF8','GIF'),
            (b'RIFF','RIFF'),(b'ftyp','MP4'),(b'7z\xbc\xaf','7Z'),(b'Rar!','RAR')]
    print("  [signatures]")
    for sig,name in sigs:
        offs = find_at_offsets(data, sig, 5)
        if offs:
            # exclude trivial 'MZ'/'RIFF' random hits in entropy data by context check
            desc = ""
            if name=='PE/EXE':
                desc = " (verify context)" if offs[0] > 100000 else " (at file start!)"
            for o in offs[:3]:
                print(f"    {name:8s} at offset {o}{desc}")
    # 2. header segments (before SOS)
    print("  [header segments]")
    i = 2
    while i < len(data)-1:
        if data[i] != 0xFF:
            i += 1; continue
        m = data[i+1]
        if m == 0xD8: i += 2; continue
        if m == 0xD9: print("    EOI reached unexpectedly before SOS"); break
        if m == 0xDA:  # SOS
            sl = struct.unpack('>H', data[i+2:i+4])[0]
            print(f"    SOS at {i} (len {sl+2}) -> entropy data starts {i+2+sl}")
            sos_end = i + 2 + sl
            break
        if (0xD0<=m<=0xD7) or m==0x01:
            i += 2; continue
        sl = struct.unpack('>H', data[i+2:i+4])[0]
        name = MARKERS.get(m, 'M%02X'%m)
        payload = data[i+4:i+2+sl]
        extra = ""
        if m == 0xE1:
            if payload[:5] == b'Exif\x00': extra = " (EXIF)"
            elif payload[:28] == b'http://ns.adobe.com/xap/1.0/': extra = " (XMP)"
        elif m == 0xE2:
            if payload[:11] == b'ICC_PROFILE': extra = " (ICC)"
            elif payload[:15] == b'FPXR': extra = " (FlashPix/FPXR)"
        elif m == 0xE0 and payload[:5] == b'JFIF\x00': extra = " (JFIF)"
        elif m == 0xED and payload[:5] == b'Adobe': extra = " (Adobe/Photoshop)"
        elif m == 0xFE: extra = " (COM comment)"
        print(f"    {name:5s} at {i:8d} len {sl+2:7d}{extra}")
        i += 2 + sl
    # 3. find EOI and trailing
    eoi = data.rfind(b'\xff\xd9')
    print(f"  last EOI at offset {eoi}")
    trailing = data[eoi+2:]
    if trailing:
        nz = trailing.lstrip(b'\x00')
        print(f"  !! trailing data: {len(trailing):,} bytes = {len(trailing)-len(nz):,} zeros + {len(nz):,} non-zero")
        print(f"     first 64B: {hexdump(trailing[:64])}")
        print(f"     ascii     : {trailing[:96]!r}")
    else:
        print("  no trailing data after EOI")
    print()

def scan_png(path):
    data = open(path,'rb').read()
    print(f"=== {os.path.basename(path)} ({len(data):,} bytes) ===")
    pos = 8
    chunks = []
    while pos + 8 <= len(data):
        length, ctype = struct.unpack('>I4s', data[pos:pos+8])
        ctype = ctype.decode('ascii','replace')
        chunks.append((ctype, pos, length))
        pos += 12 + length
        if ctype == 'IEND':
            break
    from collections import Counter
    cnt = Counter(c for c,_,_ in chunks)
    print("  chunk types:", dict(cnt))
    for c,p,l in chunks[:40]:
        desc = ""
        if c=='IHDR':
            w,h,d,ct,comp,filt,inter = struct.unpack('>IIBBBBB', data[p+8:p+21])
            desc = f'{w}x{h} depth={d} colortype={ct}(RGBA if 6)'
        elif c in ('tEXt','zTXt','iTXt'):
            kw = data[p+8:p+8+l].split(b'\x00')[0].decode('latin1','replace')
            desc = f'keyword={kw}'
        elif c=='eXIf':
            desc = f'embedded EXIF {l} bytes'
        elif c=='tIME':
            desc = 'modification time'
        elif c in ('acTL','fcTL','fdAT'):
            desc = 'animation (APNG)'
        elif c=='iCCP':
            desc = 'color profile'
        print(f"  {c:6s} at {p:9d} len {l:9d} {desc}")
    if len(chunks) > 40:
        print(f"  ... {len(chunks)-40} more chunks (mostly IDAT)")
    trailing = data[pos:]
    if trailing:
        print(f"  !! trailing data after IEND: {len(trailing):,} bytes, first 64B: {hexdump(trailing[:64])}")
    else:
        print("  no trailing data after IEND")
    # text keywords
    print()

for fname in sorted(os.listdir(folder)):
    path = os.path.join(folder, fname)
    ext = os.path.splitext(fname)[1].lower()
    try:
        if ext == '.png':
            scan_png(path)
        else:
            scan_jpeg(path)
    except Exception as e:
        print(f"ERROR scanning {fname}: {e}")
