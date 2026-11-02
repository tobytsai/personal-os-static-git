"""LINE watch bridge tests: baseline silence, real price reductions, and official-only news."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import line_watch_bridge as bridge


class BridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.orders = bridge.read_window_json(
            ROOT / "public/data/shopee-order-history-20261102.js",
            "TOBY_SHOPEE_ORDER_HISTORY_20261102",
        )
        cls.prices = json.loads((ROOT / "public/data/shopee-price-watch-state.json").read_text())
        cls.weekly = bridge.read_window_json(
            ROOT / "public/data/gakubuti-weekly.js", "TOBY_GAKUBUTI_WEEKLY",
        )
        cls.ledger = json.loads((ROOT / ".github/line-watch-ledger.json").read_text())
        cls.now = datetime.now(timezone.utc)

    def test_seeded_records_never_realert(self):
        # Freeze prior delivered quotes at the values recorded in the ledger.
        # Real source data may change after this test was written.
        state = deepcopy(self.prices)
        state["last_notified"] = {
            sid: offer for sid, offer in state.get("last_notified", {}).items()
            if sid in self.ledger["shopee_last_sent"]
        }
        for sid, offer in state["last_notified"].items():
            offer["current_price"] = self.ledger["shopee_last_sent"][sid]["price"]
            offer["verified_at"] = self.now.isoformat()
        self.assertEqual([], bridge.find_new_shopee(self.orders, state, self.ledger, self.now))
        baseline = deepcopy(self.weekly)
        baseline["weeklyNew"] = deepcopy(baseline.get("recentBaseline", []))
        self.assertEqual([], bridge.find_new_gakubuti(baseline, self.ledger, self.now))

    def test_lower_verified_shopee_price_triggers_once(self):
        state = deepcopy(self.prices)
        id_ = "shorder-20261102-nutella-biscuits"
        state["last_notified"][id_]["current_price"] = 120
        state["last_notified"][id_]["verified_at"] = self.now.isoformat()
        pending = bridge.find_new_shopee(self.orders, state, self.ledger, self.now)
        self.assertEqual(1, len(pending))
        self.assertEqual(120, pending[0]["price"])
        self.assertIn("尚未證實低於當時實付價", bridge.make_shopee_messages(pending)[0])
        updated = deepcopy(self.ledger)
        updated["shopee_last_sent"][id_]["price"] = 120
        self.assertEqual([], bridge.find_new_shopee(self.orders, state, updated, self.now))

    def test_repeated_or_increased_price_is_not_an_alert(self):
        state = deepcopy(self.prices)
        id_ = "shorder-20261102-nutella-biscuits"
        state["last_notified"][id_]["current_price"] = 135
        state["last_notified"][id_]["verified_at"] = self.now.isoformat()
        self.assertEqual([], bridge.find_new_shopee(self.orders, state, self.ledger, self.now))

    def test_missing_spec_or_unverified_listing_is_not_an_alert(self):
        state = deepcopy(self.prices)
        id_ = "shorder-20261102-nutella-biscuits"
        offer = state["last_notified"][id_]
        offer["current_price"] = 110
        offer["verified_at"] = self.now.isoformat()
        offer["matched_spec"] = ""
        self.assertEqual([], bridge.find_new_shopee(self.orders, state, self.ledger, self.now))
        offer["matched_spec"] = "193.2g"
        offer["url"] = "https://not-shopee.example/product/50662979/41761473809"
        self.assertEqual([], bridge.find_new_shopee(self.orders, state, self.ledger, self.now))
        offer["url"] = "https://shopee.tw/product/50662979/41761473809"
        offer["listing_status"] = "sold_out"
        self.assertEqual([], bridge.find_new_shopee(self.orders, state, self.ledger, self.now))

    def test_new_official_news_only_once(self):
        state = deepcopy(self.weekly)
        entry = {
            "date": "2026-11-02",
            "title": "測試新品框（測試資料）",
            "original": "架空新品テスト",
            "news": "https://www.gakubuti.net/news/99999123",
            "product": "https://www.gakubuti.net/product/detail/99999123",
        }
        state["weeklyNew"] = [entry, entry]
        pending = bridge.find_new_gakubuti(state, self.ledger, self.now)
        self.assertEqual(1, len(pending))
        updated = deepcopy(self.ledger)
        updated["gakubuti_seen_keys"].append(pending[0]["key"])
        self.assertEqual([], bridge.find_new_gakubuti(state, updated, self.now))

    def test_not_promotion_or_generic_news_link(self):
        state = deepcopy(self.weekly)
        entry = {
            "date": "2026-11-02",
            "title": "優惠資訊",
            "original": "割引セール",
            "news": "https://www.gakubuti.net/news",
            "product": "https://www.gakubuti.net/product/detail/123",
        }
        state["weeklyNew"] = [entry]
        self.assertEqual([], bridge.find_new_gakubuti(state, self.ledger, self.now))
        entry["news"] = "https://example.com/news/42"
        self.assertEqual([], bridge.find_new_gakubuti(state, self.ledger, self.now))


if __name__ == "__main__":
    unittest.main()
