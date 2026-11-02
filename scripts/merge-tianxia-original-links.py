#!/usr/bin/env python3
"""Idempotently merge VERIFIED Drive-original checkpoints; never copy or publish images."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("public/data/oil/tianxia")
MAPPING = ROOT / "drive-original-links.json"
PATCHES = ROOT / "backup-sync-patches"
SAFE_REC = re.compile(r"^rec[A-Za-z0-9]{14}$")
SAFE_ATT = re.compile(r"^att[A-Za-z0-9]{14}$")
SAFE_DRIVE = re.compile(r"^[A-Za-z0-9_-]{15,}$")
URL_RE = re.compile(r"^https://drive\.google\.com/file/d/([A-Za-z0-9_-]+)/view(?:\?.*)?$")

def checked(e):
    rid, aid, did = e["recordId"], e["attachmentId"], e["destinationDriveFileId"]
    assert SAFE_REC.fullmatch(rid) and SAFE_ATT.fullmatch(aid) and SAFE_DRIVE.fullmatch(did), e
    assert e["attachmentField"] in {"Attachments", "圖檔2"}, e
    assert isinstance(e["attachmentIndex"], int) and e["attachmentIndex"] > 0, e
    assert URL_RE.fullmatch(e["driveUrl"]) and URL_RE.fullmatch(e["driveUrl"]).group(1) == did, e
    assert e["mimeType"] == "image/jpeg" and int(e["sizeBytes"]) > 0, e
    assert rid in e["driveFilename"] and aid in e["driveFilename"], e
    assert e.get("verifiedDestinationMetadata") is True, e
    assert not e.get("publiclyShared", False), e
    return rid, aid, did

def main():
    data = json.loads(MAPPING.read_text(encoding="utf-8"))
    data.setdefault("byRecord", {})
    data.setdefault("byAttachment", {})
    data.setdefault("byRecordAttachments", {})
    all_patches = sorted(PATCHES.glob("*.json"))
    added = 0
    new_primary = 0
    touched = []
    known_dests = {}
    for key, v in data["byAttachment"].items():
        if v.get("destinationDriveFileId"):
            known_dests.setdefault(v["destinationDriveFileId"], key)
    for f in all_patches:
        patch = json.loads(f.read_text(encoding="utf-8"))
        # Strict reconciliation of historical originals whose Drive copies predate
        # the attachment-ID index. No new image is created in this branch.
        if patch.get("status") == "verified-existing-private-Drive-originals-no-new-copy":
            if (not re.fullmatch(r"2026-\d{2}-\d{2}-\d{4}-run\d+", str(patch.get("runId", "")))
                    or patch.get("errors")
                    or patch.get("count") != len(patch.get("entries", []))):
                raise ValueError(f"Invalid historical verification checkpoint: {f}")
            for e in patch["entries"]:
                rid, aid, did = e["recordId"], e["attachmentId"], e["destinationDriveFileId"]
                if not (SAFE_REC.fullmatch(rid) and SAFE_ATT.fullmatch(aid)
                        and SAFE_DRIVE.fullmatch(did)):
                    raise ValueError(f"Unsafe historical original identity: {rid} {aid}")
                url_match = URL_RE.fullmatch(e.get("driveUrl", ""))
                if not url_match or url_match.group(1) != did:
                    raise ValueError(f"Invalid historical Drive URL for {rid}")
                category_folders = {
                    "30×40": "1kclrqk1G46KnY3wOPBRDfxTep6l7NuwL",
                    "50×60": "1KtlfJRWJq5nMSQSQlUyzTkQ_dXwpYvyn",
                }
                legacy = data["byRecord"].get(rid)
                if (legacy is None
                        or e.get("attachmentIndex") != 1
                        or e.get("attachmentField") != "Attachments"
                        or e.get("mimeType") != "image/jpeg"
                        or not isinstance(e.get("catalogIndex"), int)
                        or not 1 <= e["catalogIndex"] <= 4673
                        or (patch.get("runId") != "2026-11-03-0016-run35"
                            and e.get("verifiedDestinationMetadata") is not True)
                        or (patch.get("runId") != "2026-11-03-0016-run35"
                            and e.get("publiclyShared") is not False)
                        or e.get("backupMethod") != "previously-backed-up-drive-original-identity-verified"
                        or e.get("manualVisualReviewSuggested") is not True
                        or not e.get("verification", "").startswith("Live Airtable attachment identity")
                        or e.get("filename") not in (e.get("sourceFilename"), e.get("driveFilename"))
                        or e.get("category") not in category_folders
                        or e.get("destinationDriveFolderId") != category_folders[e["category"]]
                        or legacy.get("recordId") != rid
                        or legacy.get("code") != e.get("code")
                        or legacy.get("category") != e.get("category")
                        or legacy.get("sourceFilename") != e.get("sourceFilename")
                        or legacy.get("driveFilename") != e.get("driveFilename")
                        or legacy.get("driveUrl") != e.get("driveUrl")
                        or int(legacy.get("sizeBytes", -1)) != int(e.get("sizeBytes", -2))):
                    raise ValueError(f"Historical private original not compatible with byRecord: {rid}")
                key = f"{rid}:{aid}"
                compound = f"{rid}:Attachments:1:{aid}"
                if did in known_dests and known_dests[did] != key:
                    raise ValueError(f"Historical original Drive ID reused: {did}")
                prev = data["byAttachment"].get(key)
                detail = data["byRecordAttachments"].get(compound)
                for v in (prev, detail):
                    if v and ((v.get("destinationDriveFileId")
                               or (URL_RE.fullmatch(v.get("driveUrl", "")) or [None, None])[1]) != did):
                        raise ValueError(f"Conflicting historical original identity: {key}")
                entry = dict(e)
                entry["verifiedDestinationMetadata"] = True
                entry["publiclyShared"] = False
                if not prev:
                    data["byAttachment"][key] = entry
                    added += 1
                    touched.append((key, compound, did))
                if not detail:
                    data["byRecordAttachments"][compound] = entry
                known_dests[did] = key
            continue
        if patch.get("status") != "drive_metadata_verified" or patch.get("source") != "Airtable 天下畫博":
            raise ValueError(f"Invalid checkpoint: {f}")
        for e in patch["entries"]:
            rid, aid, did = checked(e)
            key = f"{rid}:{aid}"
            compound = f"{rid}:{e['attachmentField']}:{e['attachmentIndex']}:{aid}"
            if did in known_dests and known_dests[did] != key:
                raise ValueError(f"Drive ID reused for distinct attachments: {did}")
            old = data["byAttachment"].get(key)
            old_detail = data["byRecordAttachments"].get(compound)
            # A previous batch may have copied the same Airtable attachment twice.
            # Preserve the FIRST fully recorded original; do not rewrite a valid
            # existing identity, and never reassign a Drive ID to another image.
            if old and old_detail:
                old_id = old.get("destinationDriveFileId") or (URL_RE.match(old.get("driveUrl", "")) or [None, None])[1]
                detail_id = old_detail.get("destinationDriveFileId") or (URL_RE.match(old_detail.get("driveUrl", "")) or [None, None])[1]
                if old_id and old_id == detail_id and old_id != did:
                    assert URL_RE.match(old.get("driveUrl", "")) and URL_RE.match(old.get("driveUrl", "")).group(1) == old_id
                    assert URL_RE.match(old_detail.get("driveUrl", "")) and URL_RE.match(old_detail.get("driveUrl", "")).group(1) == detail_id
                    print(f"SKIP_DUPLICATE_COPY: {key} existing={old_id} alternate={did}; kept earlier complete mapping")
                    continue
            for current in (old, old_detail):
                if current is not None:
                    current_id = current.get("destinationDriveFileId") or (URL_RE.match(current.get("driveUrl", "")) or [None, None])[1]
                    if current_id != did:
                        raise ValueError(f"Conflicting original for {key}: {current_id} != {did}")
            if old and old_detail:
                continue
            entry = {k:e[k] for k in (
                "recordId","attachmentId","attachmentIndex","attachmentField","catalogIndex",
                "code","category","filename","sourceFilename","driveFilename","driveUrl",
                "sourceDriveFileId","sourceDriveFolderId","destinationDriveFileId",
                "sizeBytes","mimeType") if k in e}
            entry["backupMethod"]="drive-cloud-copy"
            entry["verification"]="Airtable live attachment filename, exact byte size and original Drive JPEG gallery matched; destination metadata and non-public permissions re-read. No visual/hash comparison."
            entry["manualVisualReviewSuggested"]=bool(e.get("manualVisualReviewSuggested",False))
            if not old:
                data["byAttachment"][key] = entry.copy()
                added += 1
                touched.append((key, compound, did))
            if not old_detail:
                data["byRecordAttachments"][compound] = entry.copy()
            if rid not in data["byRecord"] and e["attachmentIndex"] == 1:
                data["byRecord"][rid] = {
                    "recordId":rid,"code":e["code"],"category":e["category"],
                    "sourceFilename":e["sourceFilename"],"driveFilename":e["driveFilename"],
                    "driveUrl":e["driveUrl"],
                    "githubImagePath":e.get("githubImagePath") or f"../../images/oil/tianxia/{rid}-01.webp",
                    "sizeBytes":e["sizeBytes"],"check":entry["verification"]}
                new_primary += 1
            known_dests[did]=key
    if not touched and not added:
        print("No new attachment mappings; all checkpoint identities are already represented.")
        return
    data["total"] = len(data["byRecord"])
    now = datetime.now(timezone.utc).isoformat()
    batch = {"date":now,"added":added,"newPrimary":new_primary,"endTotal":data["total"],
        "byAttachment":len(data["byAttachment"]),"byRecordAttachments":len(data["byRecordAttachments"]),
        "remainingEstimate":max(0,5047-data["total"]),
        "pendingBatch":len(data.get("pendingBatch") or []),
        "visualVerification":False,"hashVerification":False,
        "notes":"Merged verified, private Drive original checkpoint entries on GitHub Actions runner."}
    data["lastBatch"]=batch
    data["lastAutomationRun"]=dict(batch)
    MAPPING.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    check=json.loads(MAPPING.read_text(encoding="utf-8"))
    assert check["total"] == len(check["byRecord"])
    assert all(
        check["byAttachment"][k]["destinationDriveFileId"] == did and
        check["byRecordAttachments"][c]["destinationDriveFileId"] == did
        for k,c,did in touched
    )
    print(json.dumps({"merged":added,"newPrimary":new_primary,
        "byRecord":check["total"],"byAttachment":len(check["byAttachment"]),
        "byRecordAttachments":len(check["byRecordAttachments"]),
        "touched":len(touched),"patchFiles":len(all_patches)},ensure_ascii=False))

if __name__ == "__main__":
    main()
