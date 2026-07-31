#!/usr/bin/env python3
"""
Generate TTS audio files from audio script text files.

Parses each audio{x}.txt file in src/data/, extracts per-asset blocks
(voice + Arabic text), and calls edge-tts to produce MP3 files grouped
by asset ID.

Usage:
    python3 scripts/generate-audio.py              # process all audio*.txt
    python3 scripts/generate-audio.py --file src/data/audio1.txt  # single file
    python3 scripts/generate-audio.py --dry-run    # show commands without running
"""

import argparse
import asyncio
import glob
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "src" / "data"
OUTPUT_DIR = DATA_DIR / "audio"

SEPARATOR = re.compile(r"^={64,}$", re.MULTILINE)


def parse_audio_blocks(filepath: Path) -> list[dict]:
    """Parse an audio script txt file into a list of audio block dicts."""
    content = filepath.read_text(encoding="utf-8")
    blocks = []

    # Split on separator lines (===========...)
    parts = SEPARATOR.split(content)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Skip header comments
        if part.startswith("#"):
            continue

        block: dict = {}

        # Extract Asset ID
        m = re.search(r"^Asset ID:\s*(.+)$", part, re.MULTILINE)
        if not m:
            continue
        block["asset_id"] = m.group(1).strip()

        # Extract Target Questions
        m = re.search(r"^Target Questions:\s*(.+)$", part, re.MULTILINE)
        if m:
            block["target_questions"] = [
                q.strip() for q in m.group(1).split(",") if q.strip()
            ]

        # Extract voice from the edge-tts command line
        m = re.search(r"edge-tts\s+--voice\s+(\S+)", part)
        if not m:
            continue
        block["voice"] = m.group(1)

        # Extract text from the edge-tts --text "..." argument
        m = re.search(r'--text\s+"((?:[^"\\]|\\.)*)"\s+--write-media', part)
        if not m:
            # Fallback: look for Text: section
            m = re.search(r"^Text:\s*\n(.+?)$", part, re.MULTILINE | re.DOTALL)
            if m:
                block["text"] = m.group(1).strip()
            else:
                continue
        else:
            block["text"] = m.group(1)

        # Extract output filename hint from --write-media (e.g. data/1_1.mp3)
        m = re.search(r"--write-media\s+(\S+)", part)
        if m:
            block["hint_path"] = m.group(1)

        blocks.append(block)

    return blocks


def bundle_index_from_filename(filepath: Path) -> str:
    """Extract the bundle number from audio{x}.txt → 'x'."""
    m = re.search(r"audio(\d+)\.txt$", filepath.name)
    return m.group(1) if m else "0"


def output_filename(bundle_idx: str, asset_id: str, index: int) -> str:
    """Generate output filename: {bundle}_{index:02d}_{asset_id}.mp3"""
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", asset_id)
    return f"{bundle_idx}_{index:02d}_{safe_id}.mp3"


async def generate_audio(block: dict, output_path: Path, dry_run: bool) -> bool:
    """Run edge-tts for a single block. Returns True on success."""
    voice = block["voice"]
    text = block["text"]
    asset_id = block["asset_id"]

    if dry_run:
        print(f"  [dry-run] {output_path.name}")
        print(f"           voice: {voice}")
        print(f"           text:  {text[:80]}...")
        return True

    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(output_path))
        size_kb = output_path.stat().st_size / 1024
        print(f"  ✓ {output_path.name}  ({size_kb:.1f} KB)")
        return True
    except Exception as e:
        print(f"  ✗ {asset_id}: {e}", file=sys.stderr)
        return False


async def process_file(filepath: Path, dry_run: bool) -> int:
    """Process one audio txt file. Returns count of generated files."""
    bundle_idx = bundle_index_from_filename(filepath)
    blocks = parse_audio_blocks(filepath)

    if not blocks:
        print(f"  (no audio blocks found in {filepath.name})")
        return 0

    out_dir = OUTPUT_DIR / bundle_idx
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  Bundle {bundle_idx} — {filepath.name}")
    print(f"  {len(blocks)} audio asset(s)")
    print(f"  Output → {out_dir.relative_to(REPO_ROOT)}/")
    print(f"{'='*60}")

    count = 0
    for i, block in enumerate(blocks, start=1):
        fname = output_filename(bundle_idx, block["asset_id"], i)
        out_path = out_dir / fname

        # Update hint_path in block for reference
        block["output_path"] = str(out_path.relative_to(REPO_ROOT))

        ok = await generate_audio(block, out_path, dry_run)
        if ok:
            count += 1

    return count


async def main():
    parser = argparse.ArgumentParser(
        description="Generate TTS audio from audio script text files"
    )
    parser.add_argument(
        "--file", "-f",
        help="Process a single audio txt file instead of all",
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Show commands without actually generating audio",
    )
    args = parser.parse_args()

    if args.file:
        files = [Path(args.file)]
    else:
        files = sorted(DATA_DIR.glob("audio*.txt"))

    if not files:
        print("No audio txt files found.")
        sys.exit(1)

    print(f"edge-tts audio generator")
    print(f"  Files: {len(files)}")
    print(f"  Output: {OUTPUT_DIR.relative_to(REPO_ROOT)}/")
    if args.dry_run:
        print(f"  Mode: DRY RUN (no audio will be generated)")

    total = 0
    for f in files:
        n = await process_file(f, args.dry_run)
        total += n

    print(f"\n{'='*60}")
    print(f"  Done — {total} audio file(s) {'(dry run)' if args.dry_run else 'generated'}")
    print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
