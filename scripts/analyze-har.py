#!/usr/bin/env python3
import json
import sys
from pathlib import Path

def analyze_har(har_path):
    with open(har_path, 'r') as f:
        data = json.load(f)

    entries = data['log']['entries']

    # Categorize resources
    js_files = []
    css_files = []
    font_files = []
    google_fonts = []

    total_size = 0

    for entry in entries:
        url = entry['request']['url']
        size = entry['response'].get('bodySize', 0)
        content = entry['response'].get('content', {})
        mime_type = content.get('mimeType', '')

        # Skip if size is negative (usually indicates cached or error)
        if size < 0:
            size = content.get('size', 0)

        total_size += size

        # Categorize by type
        if '.js' in url or 'javascript' in mime_type:
            js_files.append((url.split('/')[-1][:50], size))
        elif '.css' in url or 'text/css' in mime_type:
            css_files.append((url.split('/')[-1][:50], size))
        elif any(ext in url for ext in ['.ttf', '.woff', '.woff2', '.otf']):
            font_files.append((url.split('/')[-1][:50], size))
        elif 'fonts.googleapis.com' in url or 'fonts.gstatic.com' in url:
            google_fonts.append((url[:80], size))

    # Sort by size
    js_files.sort(key=lambda x: x[1], reverse=True)
    css_files.sort(key=lambda x: x[1], reverse=True)
    font_files.sort(key=lambda x: x[1], reverse=True)

    # Print analysis
    print("🔍 HAR File Performance Analysis")
    print("=" * 60)

    print(f"\n📊 Total Size: {total_size / 1024:.0f}KB")

    print(f"\n📦 JavaScript Files ({len(js_files)} files, {sum(s for _, s in js_files) / 1024:.0f}KB total):")
    for name, size in js_files[:10]:  # Top 10
        print(f"  {name:45} {size/1024:8.1f}KB")

    print(f"\n🎨 CSS Files ({len(css_files)} files, {sum(s for _, s in css_files) / 1024:.0f}KB total):")
    for name, size in css_files[:5]:  # Top 5
        print(f"  {name:45} {size/1024:8.1f}KB")

    print(f"\n🔤 Font Files ({len(font_files)} files, {sum(s for _, s in font_files) / 1024:.0f}KB total):")
    for name, size in font_files:
        print(f"  {name:45} {size/1024:8.1f}KB")

    if google_fonts:
        print(f"\n⚠️  Google Fonts Found ({len(google_fonts)} requests):")
        for url, size in google_fonts[:5]:
            print(f"  {url:75} {size/1024:8.1f}KB")

    # Check for WOFF2 usage
    woff2_count = len([f for f in font_files if '.woff2' in f[0]])
    ttf_count = len([f for f in font_files if '.ttf' in f[0]])

    print(f"\n🔤 Font Format Analysis:")
    print(f"  WOFF2 files: {woff2_count}")
    print(f"  TTF files: {ttf_count}")

    # Page load metrics
    page = data['log']['pages'][0]
    content_load = page['pageTimings'].get('onContentLoad', 0) / 1000
    page_load = page['pageTimings'].get('onLoad', 0) / 1000

    print(f"\n⏱️  Page Load Metrics:")
    print(f"  DOM Content Loaded: {content_load:.2f}s")
    print(f"  Page Load Complete: {page_load:.2f}s")

if __name__ == '__main__':
    import sys
    har_path = sys.argv[1] if len(sys.argv) > 1 else '/Users/talyaron/Downloads/freedi-test.web.app4.har'
    analyze_har(har_path)