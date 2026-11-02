#!/usr/bin/env python3
"""Send Personal OS alerts to a single LINE user via the official Messaging API.

Requires LINE_CHANNEL_ACCESS_TOKEN and LINE_TO_USER_ID as GitHub Actions secrets.
Can be called by workflow_dispatch, workflow_run (failed only), or a future
workflow step that sets LINE_MESSAGE after detecting a genuine change.
No third-party packages and no webhook server are needed for outbound push.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push"
MAX_TEXT_CHARS = 4500


def read_github_event():
    path = os.environ.get("GITHUB_EVENT_PATH", "")
    if not path:
        return {}
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build_message(event_name, event):
    # Allow existing data-refresh workflows to send only after a verified change.
    explicit_message = os.environ.get("LINE_MESSAGE", "").strip()
    if explicit_message:
        return explicit_message

    if event_name == "workflow_dispatch":
        inputs = event.get("inputs") or {}
        note = str(inputs.get("message") or "").strip()
        return (
            "✅ Personal OS｜LINE 通知測試\n"
            + (note or "GitHub Actions 已連上 LINE Messaging API。")
            + "\n來源：GitHub Actions 手動測試"
        )

    if event_name == "workflow_run":
        run = event.get("workflow_run") or {}
        if run.get("conclusion") != "failure":
            return None
        if run.get("head_branch") != "main":
            return None
        name = str(run.get("name") or "未命名工作流程")
        url = str(run.get("html_url") or "")
        return (
            "⚠️ Personal OS｜GitHub 自動化失敗\n"
            f"工作流程：{name}\n"
            f"執行編號：{run.get('run_number', '未知')}\n"
            f"分支：{run.get('head_branch', '未知')}\n"
            f"檢查紀錄：{url}"
        )

    print(f"No LINE notification rule for event: {event_name}", flush=True)
    return None


def send_line_message(token, user_id, message):
    if not re.fullmatch(r"U[0-9a-fA-F]{32}", user_id):
        raise ValueError(
            "LINE_TO_USER_ID must be the LINE Developers 'Your user ID' "
            "(U followed by 32 hexadecimal characters), not your LINE search ID."
        )
    body = json.dumps(
        {
            "to": user_id,
            "messages": [{"type": "text", "text": message[:MAX_TEXT_CHARS]}],
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        LINE_PUSH_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"LINE Messaging API returned HTTP {response.status}")
        print("LINE Messaging API accepted the push message (HTTP 200).")


def main():
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    message = build_message(event_name, read_github_event())
    if not message:
        print("No matching event/change; LINE notification skipped.")
        return 0

    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    user_id = os.environ.get("LINE_TO_USER_ID", "").strip()
    if not token or not user_id:
        if event_name == "workflow_dispatch":
            print(
                "::error::Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_TO_USER_ID. "
                "Add both under Settings > Secrets and variables > Actions."
            )
            return 1
        print("::warning::LINE secrets not configured; alert skipped.")
        return 0

    try:
        send_line_message(token, user_id, message)
        return 0
    except urllib.error.HTTPError as exc:
        # Never log the Authorization header or access token.
        detail = exc.read(500).decode("utf-8", "replace")
        print(f"::error::LINE push failed (HTTP {exc.code}): {detail}")
        return 1
    except (ValueError, OSError, urllib.error.URLError) as exc:
        print(f"::error::LINE push failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
