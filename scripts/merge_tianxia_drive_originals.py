#!/usr/bin/env python3
"""Idempotently merge verified Drive original-image batches into the existing frontend map."""
import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data/oil/tianxia"
DEST = DATA / "drive-original-links.json"
STAGED = DATA / "verified-original-staging"

def main():
    current = json.loads(DEST.read_text(encoding="utf-8"))
    records = current.setdefault("byRecord", {})
    attachments = current.setdefault("byAttachment", {})
    detailed = current.setdefault("byRecordAttachments", {})
    folders = current.setdefault("batchFolders", [])
    before = len(records)
    added = 0
    skipped = 0
    categories = {}
    occupied = {v.get("destinationDriveFileId") for v in attachments.values() if v.get("destinationDriveFileId")}
    for stage in sorted(STAGED.glob("batch-*.json")):
        payload = json.loads(stage.read_text(encoding="utf-8"))
        for item in payload.get("items", []):
            att = item["attachment"]
            rec = item["record"]
            rid, aid = att["recordId"], att["attachmentId"]
            drive_id = att.get("destinationDriveFileId")
            key = f"{rid}:{aid}"
            detail_key = f"{rid}:{att['attachmentField']}:{att['attachmentIndex']}:{aid}"
            if (rec.get("recordId") != rid or not drive_id or
                f"/d/{drive_id}/" not in att.get("driveUrl", "") or
                rec.get("driveUrl") != att.get("driveUrl") or
                rec.get("sizeBytes") != att.get("sizeBytes") or
                att.get("mimeType") != "image/jpeg"):
                raise ValueError(f"Invalid staged attachment metadata: {stage.name}: {key}")
            old = attachments.get(key)
            if old:
                if old.get("destinationDriveFileId") != drive_id:
                    raise ValueError(f"Attachment identity collision: {key}")
                skipped += 1
                continue
            existing_rec = records.get(rid)
            if existing_rec and existing_rec.get("driveUrl") != att["driveUrl"]:
                raise ValueError(f"Existing byRecord must not be overwritten: {rid}")
            if drive_id in occupied:
                raise ValueError(f"Drive destination ID reused by a different attachment: {drive_id}")
            attachments[key] = att
            detailed[detail_key] = att
            records.setdefault(rid, rec)
            occupied.add(drive_id)
            added += 1
            cat = att["category"]
            categories[cat] = categories.get(cat, 0) + 1
        for folder in payload.get("folders", []):
            if not any(x.get("size") == folder.get("size") for x in folders):
                folders.append(folder)
    if added:
        current["total"] = len(records)
        today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        info = {
            "date": today,
            "startTotal": before,
            "added": added,
            "endTotal": len(records),
            "success": added,
            "failed": 0,
            "categoryAdditions": categories,
            "driveCloudCopies": added,
            "referenceRecords": 4673,
            "referenceAttachments": 5047,
            "remainingEstimate": max(0, 5047-len(records)),
            "errors": [],
            "visualVerification": False,
            "hashVerification": False,
            "pendingBatch": 0,
            "notes": "Verified Drive originals from staged attachment-specific metadata; copied files were checked separately for name/byte size/MIME/private. Source content not visually/hash verified."
        }
        current["lastBatch"] = info
        current["lastAutomationRun"] = {**info,
            "byRecord": len(records), "byAttachment": len(attachments),
            "byRecordAttachments": len(detailed)}
        current["pendingBatch"] = []
        DEST.write_text(json.dumps(current, ensure_ascii=False, separators=(",", ":"))+"\n", encoding="utf-8")
    print(f"Staged merge: new={added} already_present={skipped} byRecord={len(records)} byAttachment={len(attachments)}")

if __name__ == "__main__":
    main()
