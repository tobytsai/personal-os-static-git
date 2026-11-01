#!/usr/bin/env python3
"""Merge verified, immutable Tianxia Drive-original checkpoints into the legacy index.

Each checkpoint is an auditable list of successful Drive-copy verifications.
Never modify preview WebP files, Airtable records, or Drive permissions here.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "public/data/oil/tianxia"
INDEX = DIR / "drive-original-links.json"
CHECKPOINTS = DIR / "backup-checkpoints"


def main():
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    for name in ("byRecord", "byAttachment", "byRecordAttachments"):
        index.setdefault(name, {})
    beginning = len(index["byRecord"])
    inserted = 0
    skipped = 0
    conflicts = []
    categories = {}
    for file in sorted(CHECKPOINTS.glob("*.json")):
        checkpoint = json.loads(file.read_text(encoding="utf-8"))
        if checkpoint.get("schemaVersion") != 1 or checkpoint.get("collection") != "tianxia":
            raise ValueError(f"Invalid checkpoint schema: {file}")
        for item in checkpoint["entries"]:
            rid = item["recordId"]
            aid = item["attachmentId"]
            attachment_index = item["attachmentIndex"]
            field = item["attachmentField"]
            entry = item["attachment"]
            record = item["record"]
            key = f"{rid}:{aid}"
            rk = f"{rid}:{field}:{attachment_index}:{aid}"
            if not re.fullmatch(r"rec[A-Za-z0-9]{14}", rid) or not re.fullmatch(r"att[A-Za-z0-9]{14}", aid):
                raise ValueError(f"Bad record/attachment ID in {file}")
            if field not in ("Attachments", "圖檔2") or attachment_index < 1:
                raise ValueError(f"Bad attachment field/index in {file}")
            if entry.get("recordId") != rid or entry.get("attachmentId") != aid:
                raise ValueError(f"Identity mismatch in {file}")
            did = entry.get("destinationDriveFileId", "")
            url = entry.get("driveUrl", "")
            if not did or url != f"https://drive.google.com/file/d/{did}/view":
                raise ValueError(f"Invalid destination URL in {file}")
            if entry.get("mimeType") != "image/jpeg" or int(entry.get("sizeBytes", 0)) <= 0:
                raise ValueError(f"Original JPEG verification missing in {file}")
            if entry.get("backupMethod") != "drive-cloud-copy":
                raise ValueError(f"Untrusted copy method in {file}")
            old = index["byAttachment"].get(key)
            if old:
                if old.get("destinationDriveFileId") != did and old.get("driveUrl") != url:
                    conflicts.append(f"{file.name}:{key}:existing different destination")
                else:
                    skipped += 1
                continue
            if rk in index["byRecordAttachments"]:
                conflicts.append(f"{file.name}:{rk}:record-attachment key taken")
                continue
            if rid in index["byRecord"]:
                old_url = index["byRecord"][rid].get("driveUrl", "")
                if old_url and old_url != url:
                    # Keep existing primary for backwards-compatible frontend links.
                    pass
            else:
                if record.get("driveUrl") != url or record.get("recordId") != rid:
                    raise ValueError(f"Invalid primary record in {file}")
                index["byRecord"][rid] = record
            index["byAttachment"][key] = entry
            index["byRecordAttachments"][rk] = dict(entry)
            categories[entry["category"]] = categories.get(entry["category"], 0) + 1
            inserted += 1
    if conflicts:
        raise RuntimeError("Conflicting checkpoint records; existing links NOT overwritten: " + "; ".join(conflicts[:15]))
    if not inserted:
        print(f"No new verified originals; skipped {skipped} already merged attachments.")
        return
    end = len(index["byRecord"])
    index["total"] = end
    progress = {
        "date": datetime.now(timezone.utc).date().isoformat(),
        "startTotal": beginning,
        "added": inserted,
        "endTotal": end,
        "success": inserted,
        "failed": 0,
        "categoryAdditions": categories,
        "driveCloudCopies": inserted,
        "referenceRecords": 4673,
        "referenceAttachments": 5047,
        "remainingEstimate": max(0, 5047 - end),
        "errors": [],
        "visualVerification": False,
        "hashVerification": False,
        "pendingBatch": 0,
        "notes": "Merged independently verified Drive-copy checkpoints; no visual/hash comparison.",
    }
    index["lastBatch"] = progress
    index["lastAutomationRun"] = dict(
        progress,
        byRecord=end,
        byAttachment=len(index["byAttachment"]),
        byRecordAttachments=len(index["byRecordAttachments"]),
    )
    INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Merged {inserted} verified attachments; byRecord {beginning} => {end}, skipped {skipped} duplicates.")


if __name__ == "__main__":
    main()
