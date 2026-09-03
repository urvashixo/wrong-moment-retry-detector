"""
Supabase client abstraction with in-memory fallback.
Spec Section 10/12: Supabase is primary, but system must run without it for local demo/tests.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

# Auto-load .env so get_db() works even when called before main.py loads it
try:
    from dotenv import load_dotenv

    load_dotenv()
    # also try project root .env one level above backend
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
    load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))
except Exception:
    pass

import pytz

logger = logging.getLogger(__name__)
UTC = pytz.timezone("UTC")


class InMemoryDB:
    """In-memory fallback that mirrors Supabase tables."""

    def __init__(self):
        self.customers: Dict[str, Dict[str, Any]] = {}
        self.payment_events: List[Dict[str, Any]] = []
        self.retry_decisions: List[Dict[str, Any]] = []
        self.demo_batches: List[Dict[str, Any]] = []
        self.webhook_log: List[Dict[str, Any]] = []
        self.retry_overrides: List[Dict[str, Any]] = []

    # Customers
    def upsert_customer(self, customer_id: str, hidden_profile_tag: str | None = None):
        if customer_id not in self.customers:
            self.customers[customer_id] = {
                "customer_id": customer_id,
                "hidden_profile_tag": hidden_profile_tag,
                "created_at": datetime.now(UTC),
            }

    def list_customers(self) -> List[Dict[str, Any]]:
        return list(self.customers.values())

    # Payment events
    def insert_payment_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        ev = {**event}
        if "id" not in ev:
            ev["id"] = str(uuid.uuid4())
        if "created_at" not in ev:
            ev["created_at"] = datetime.now(UTC)
        self.payment_events.append(ev)
        # ensure customer exists
        if ev.get("customer_id"):
            self.upsert_customer(ev["customer_id"])
        return ev

    def get_success_events_for_customer(self, customer_id: str) -> List[Dict[str, Any]]:
        return [e for e in self.payment_events if e["customer_id"] == customer_id and e["status"] == "success"]

    def get_all_success_events(self) -> List[Dict[str, Any]]:
        return [e for e in self.payment_events if e["status"] == "success"]

    def list_payment_events(self, customer_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        res = self.payment_events
        if customer_id:
            res = [e for e in res if e["customer_id"] == customer_id]
        if status:
            res = [e for e in res if e["status"] == status]
        return res

    # Retry decisions
    def insert_retry_decision(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        d = {**decision}
        if "decision_id" not in d:
            d["decision_id"] = str(uuid.uuid4())
        if "created_at" not in d:
            d["created_at"] = datetime.now(UTC)
        if "actual_retry_outcome" not in d:
            d["actual_retry_outcome"] = "pending"
        if "status" not in d:
            d["status"] = "scheduled"
        if "effective_retry_at" not in d:
            d["effective_retry_at"] = d.get("recommended_retry_at")
        if "experiment_group" not in d:
            d["experiment_group"] = "B"
        self.retry_decisions.append(d)
        return d

    def list_retry_decisions(self, customer_id: Optional[str] = None, status: Optional[str] = None, experiment_group: Optional[str] = None) -> List[Dict[str, Any]]:
        res = self.retry_decisions
        if customer_id:
            res = [d for d in res if d["customer_id"] == customer_id]
        if status:
            res = [d for d in res if d.get("status") == status]
        if experiment_group:
            res = [d for d in res if d.get("experiment_group") == experiment_group]
        return list(res)

    def get_retry_decision(self, decision_id: str) -> Optional[Dict[str, Any]]:
        for d in self.retry_decisions:
            if str(d.get("decision_id")) == str(decision_id):
                return d
        return None

    def update_retry_decision(self, decision_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        d = self.get_retry_decision(decision_id)
        if d:
            d.update(fields)
            return d
        return None

    def update_retry_outcome(self, decision_id: str, outcome: str, executed_at: Optional[datetime] = None):
        return self.update_retry_decision(decision_id, {"actual_retry_outcome": outcome, "actual_retry_executed_at": executed_at or datetime.now(UTC), "status": "executed" if outcome != "pending" else "scheduled"})

    # Overrides
    def insert_override(self, override: Dict[str, Any]) -> Dict[str, Any]:
        o = {**override}
        if "override_id" not in o:
            o["override_id"] = str(uuid.uuid4())
        if "created_at" not in o:
            o["created_at"] = datetime.now(UTC)
        self.retry_overrides.append(o)
        # also mark decision as overridden
        dec = self.get_retry_decision(str(o.get("decision_id")))
        if dec:
            dec["status"] = "overridden"
            dec["effective_retry_at"] = o.get("overridden_retry_at")
        return o

    def list_overrides(self, customer_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if customer_id:
            return [o for o in self.retry_overrides if o.get("customer_id") == customer_id]
        return list(self.retry_overrides)

    def get_override_for_decision(self, decision_id: str) -> Optional[Dict[str, Any]]:
        for o in self.retry_overrides:
            if str(o.get("decision_id")) == str(decision_id):
                return o
        return None

    def list_needs_review(self) -> List[Dict[str, Any]]:
        return [d for d in self.retry_decisions if d.get("status") == "needs_human_review"]

    # Demo batches
    def insert_demo_batch(self, batch: Dict[str, Any]) -> Dict[str, Any]:
        b = {**batch}
        if "batch_id" not in b:
            b["batch_id"] = str(uuid.uuid4())
        if "created_at" not in b:
            b["created_at"] = datetime.now(UTC)
        self.demo_batches.append(b)
        return b

    def list_demo_batches(self) -> List[Dict[str, Any]]:
        return list(self.demo_batches)

    # Webhook log
    def insert_webhook_log(self, event_type: str, raw_payload: Dict[str, Any], processed: bool = False):
        entry = {
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "raw_payload": raw_payload,
            "processed": processed,
            "received_at": datetime.now(UTC),
        }
        self.webhook_log.append(entry)
        return entry

    def list_webhook_logs(self) -> List[Dict[str, Any]]:
        return list(self.webhook_log)


def _is_rls_error(e: Exception) -> bool:
    msg = str(e)
    return "42501" in msg or "row-level security" in msg.lower() or "row violates row-level security" in msg.lower()


RLS_FIX_SQL = """
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql):
alter table customers disable row level security;
alter table payment_events disable row level security;
alter table retry_decisions disable row level security;
alter table demo_batches disable row level security;
alter table webhook_log disable row level security;
alter table retry_overrides disable row level security;
-- Or, if you prefer to keep RLS, create permissive policies:
-- create policy "Allow all" on customers for all using (true) with check (true);
-- create policy "Allow all" on payment_events for all using (true) with check (true);
-- create policy "Allow all" on retry_decisions for all using (true) with check (true);
-- create policy "Allow all" on demo_batches for all using (true) with check (true);
-- create policy "Allow all" on webhook_log for all using (true) with check (true);
-- create policy "Allow all" on retry_overrides for all using (true) with check (true);
"""


class SupabaseDB:
    """Thin wrapper around real Supabase if credentials present."""

    def __init__(self, url: str, key: str):
        from supabase import create_client

        self.client = create_client(url, key)
        self.url = url
        self.key = key
        # also keep an in-memory fallback for writes when RLS blocks
        self._fallback = InMemoryDB()
        self._rls_warned = False

    def _warn_rls_once(self, e: Exception):
        if _is_rls_error(e) and not self._rls_warned:
            self._rls_warned = True
            logger.error(
                "Supabase RLS is blocking writes (42501). Your publishable key cannot insert. "
                "Fix: In Supabase Dashboard -> SQL Editor, run:\n" + RLS_FIX_SQL +
                "\nOr add a SECRET/SERVICE_ROLE key as SUPABASE_SECRET_KEY or SUPABASE_SERVICE_KEY in .env (sb_secret_...), then restart."
            )

    # For brevity, delegate to supabase queries; fallback to in-memory shape
    # Customers
    def upsert_customer(self, customer_id: str, hidden_profile_tag: str | None = None):
        try:
            self.client.table("customers").upsert({"customer_id": customer_id, "hidden_profile_tag": hidden_profile_tag}).execute()
        except Exception as e:
            self._warn_rls_once(e)
            logger.warning(f"Supabase upsert_customer failed: {e} — using in-memory fallback for this write")
            self._fallback.upsert_customer(customer_id, hidden_profile_tag)

    def list_customers(self):
        try:
            r = self.client.table("customers").select("*").execute()
            supa = r.data or []
            # merge fallback (writes that were blocked by RLS)
            fb = self._fallback.list_customers()
            if fb:
                # merge by customer_id, supabase wins
                seen = {c["customer_id"] for c in supa}
                supa.extend([c for c in fb if c["customer_id"] not in seen])
            return supa
        except Exception as e:
            logger.warning(f"list_customers failed: {e}")
            return self._fallback.list_customers()

    def insert_payment_event(self, event: Dict[str, Any]):
        payload = _serialize_datetimes(event)
        try:
            r = self.client.table("payment_events").insert(payload).execute()
            return r.data[0] if r.data else event
        except Exception as e:
            self._warn_rls_once(e)
            logger.warning(f"insert_payment_event failed: {e} — fallback")
            return self._fallback.insert_payment_event(event)

    def get_success_events_for_customer(self, customer_id: str):
        try:
            r = self.client.table("payment_events").select("*").eq("customer_id", customer_id).eq("status", "success").execute()
            supa = [_deserialize_datetimes(x) for x in (r.data or [])]
            fb = self._fallback.get_success_events_for_customer(customer_id)
            # merge fallback events that aren't in supa (by id)
            if fb:
                supa_ids = {e.get("id") for e in supa}
                supa.extend([e for e in fb if e.get("id") not in supa_ids])
            return supa
        except Exception as e:
            logger.warning(f"get_success failed: {e}")
            return self._fallback.get_success_events_for_customer(customer_id)

    def get_all_success_events(self):
        try:
            r = self.client.table("payment_events").select("*").eq("status", "success").execute()
            supa = [_deserialize_datetimes(x) for x in (r.data or [])]
            fb = self._fallback.get_all_success_events()
            if fb:
                supa_ids = {e.get("id") for e in supa}
                supa.extend([e for e in fb if e.get("id") not in supa_ids])
            return supa
        except Exception as e:
            logger.warning(f"get_all_success failed: {e}")
            return self._fallback.get_all_success_events()

    def list_payment_events(self, customer_id=None, status=None):
        try:
            q = self.client.table("payment_events").select("*")
            if customer_id:
                q = q.eq("customer_id", customer_id)
            if status:
                q = q.eq("status", status)
            r = q.execute()
            supa = [_deserialize_datetimes(x) for x in (r.data or [])]
            fb = self._fallback.list_payment_events(customer_id=customer_id, status=status)
            if fb:
                supa_ids = {e.get("id") for e in supa}
                supa.extend([e for e in fb if e.get("id") not in supa_ids])
            return supa
        except Exception as e:
            logger.warning(f"list_payment_events failed: {e}")
            return self._fallback.list_payment_events(customer_id=customer_id, status=status)

    def insert_retry_decision(self, decision: Dict[str, Any]):
        payload = _serialize_datetimes(decision)
        try:
            r = self.client.table("retry_decisions").insert(payload).execute()
            return r.data[0] if r.data else decision
        except Exception as e:
            msg = str(e)
            # Feature 6/4: if Supabase schema not yet migrated, strip new cols and retry
            if "PGRST204" in msg or "schema cache" in msg or "column" in msg.lower():
                stripped = {k:v for k,v in payload.items() if k not in ("experiment_group","status","effective_retry_at")}
                try:
                    r2 = self.client.table("retry_decisions").insert(stripped).execute()
                    logger.warning(f"retry_decisions missing new columns — inserted without them; run schema.sql addendum migration for full features")
                    data = r2.data[0] if r2.data else decision
                    # ensure in-memory still gets full payload for hybrid
                    self._fallback.insert_retry_decision(decision)
                    return data
                except Exception as e2:
                    pass
            self._warn_rls_once(e)
            logger.warning(f"insert_retry_decision failed: {e} — fallback")
            return self._fallback.insert_retry_decision(decision)

    def list_retry_decisions(self, customer_id=None, status=None, experiment_group=None):
        try:
            q = self.client.table("retry_decisions").select("*")
            if customer_id:
                q = q.eq("customer_id", customer_id)
            if status:
                q = q.eq("status", status)
            if experiment_group:
                q = q.eq("experiment_group", experiment_group)
            q = q.order("created_at", desc=True)
            r = q.execute()
            supa = [_deserialize_datetimes(x) for x in (r.data or [])]
            fb = self._fallback.list_retry_decisions(customer_id=customer_id, status=status, experiment_group=experiment_group)
            if fb:
                supa_ids = {str(e.get("decision_id")) for e in supa}
                supa.extend([e for e in fb if str(e.get("decision_id")) not in supa_ids])
                try:
                    supa.sort(key=lambda d: d.get("created_at") or "", reverse=True)
                except Exception:
                    pass
            return supa
        except Exception as e:
            logger.warning(f"list_retry_decisions failed: {e}")
            return self._fallback.list_retry_decisions(customer_id=customer_id, status=status, experiment_group=experiment_group)

    def get_retry_decision(self, decision_id: str):
        try:
            r = self.client.table("retry_decisions").select("*").eq("decision_id", decision_id).limit(1).execute()
            if r.data:
                return _deserialize_datetimes(r.data[0])
            return self._fallback.get_retry_decision(decision_id)
        except Exception as e:
            logger.warning(f"get_retry_decision failed: {e}")
            return self._fallback.get_retry_decision(decision_id)

    def update_retry_decision(self, decision_id: str, fields: Dict[str, Any]):
        payload = _serialize_datetimes(fields)
        try:
            r = self.client.table("retry_decisions").update(payload).eq("decision_id", decision_id).execute()
            data = r.data[0] if r.data else None
            # also update fallback if exists there
            self._fallback.update_retry_decision(decision_id, fields)
            return data
        except Exception as e:
            logger.warning(f"update_retry_decision failed: {e}")
            return self._fallback.update_retry_decision(decision_id, fields)

    def update_retry_outcome(self, decision_id: str, outcome: str, executed_at=None):
        fields = {"actual_retry_outcome": outcome, "actual_retry_executed_at": (executed_at or datetime.now(UTC)).isoformat(), "status": "executed" if outcome != "pending" else "scheduled"}
        return self.update_retry_decision(decision_id, fields)

    def insert_override(self, override: Dict[str, Any]):
        payload = _serialize_datetimes(override)
        try:
            r = self.client.table("retry_overrides").insert(payload).execute()
            try:
                self.client.table("retry_decisions").update({"status": "overridden", "effective_retry_at": payload.get("overridden_retry_at")}).eq("decision_id", payload.get("decision_id")).execute()
            except Exception as e2:
                # if columns missing, try without effective_retry_at
                if "PGRST204" in str(e2) or "schema cache" in str(e2):
                    try:
                        self.client.table("retry_decisions").update({"status": "overridden"}).eq("decision_id", payload.get("decision_id")).execute()
                    except Exception:
                        pass
                else:
                    logger.warning(f"mark overridden failed: {e2}")
            self._fallback.insert_override(override)
            return r.data[0] if r.data else override
        except Exception as e:
            msg = str(e)
            if "PGRST204" in msg or "relation" in msg.lower() or "does not exist" in msg.lower() or "schema cache" in msg.lower():
                logger.warning(f"retry_overrides table missing — using fallback; run schema.sql addendum in Supabase SQL Editor")
            self._warn_rls_once(e)
            logger.warning(f"insert_override failed: {e} — fallback")
            return self._fallback.insert_override(override)

    def list_overrides(self, customer_id=None):
        try:
            q = self.client.table("retry_overrides").select("*")
            if customer_id:
                q = q.eq("customer_id", customer_id)
            q = q.order("created_at", desc=True)
            r = q.execute()
            supa = [_deserialize_datetimes(x) for x in (r.data or [])]
            fb = self._fallback.list_overrides(customer_id=customer_id)
            if fb:
                supa_ids = {str(o.get("override_id")) for o in supa}
                supa.extend([o for o in fb if str(o.get("override_id")) not in supa_ids])
            return supa
        except Exception as e:
            logger.warning(f"list_overrides failed: {e}")
            return self._fallback.list_overrides(customer_id=customer_id)

    def get_override_for_decision(self, decision_id: str):
        try:
            r = self.client.table("retry_overrides").select("*").eq("decision_id", decision_id).limit(1).execute()
            if r.data:
                return _deserialize_datetimes(r.data[0])
            return self._fallback.get_override_for_decision(decision_id)
        except Exception as e:
            logger.warning(f"get_override_for_decision failed: {e}")
            return self._fallback.get_override_for_decision(decision_id)

    def list_needs_review(self):
        return self.list_retry_decisions(status="needs_human_review")

    def insert_demo_batch(self, batch: Dict[str, Any]):
        payload = _serialize_datetimes(batch)
        try:
            r = self.client.table("demo_batches").insert(payload).execute()
            return r.data[0] if r.data else batch
        except Exception as e:
            self._warn_rls_once(e)
            logger.warning(f"insert_demo_batch failed: {e} — fallback")
            return self._fallback.insert_demo_batch(batch)

    def list_demo_batches(self):
        try:
            r = self.client.table("demo_batches").select("*").order("created_at", desc=True).execute()
            supa = [_deserialize_datetimes(x) for x in (r.data or [])]
            fb = self._fallback.list_demo_batches()
            if fb:
                supa_ids = {str(e.get("batch_id")) for e in supa}
                supa.extend([e for e in fb if str(e.get("batch_id")) not in supa_ids])
            return supa
        except Exception as e:
            logger.warning(f"list_demo_batches failed: {e}")
            return self._fallback.list_demo_batches()

    def insert_webhook_log(self, event_type: str, raw_payload: Dict[str, Any], processed: bool = False):
        payload = {"event_type": event_type, "raw_payload": raw_payload, "processed": processed}
        try:
            r = self.client.table("webhook_log").insert(payload).execute()
            return r.data[0] if r.data else payload
        except Exception as e:
            self._warn_rls_once(e)
            logger.warning(f"insert_webhook_log failed: {e} — fallback")
            return self._fallback.insert_webhook_log(event_type, raw_payload, processed)

    def list_webhook_logs(self):
        try:
            r = self.client.table("webhook_log").select("*").order("received_at", desc=True).execute()
            return r.data or []
        except Exception as e:
            logger.warning(f"list_webhook_logs failed: {e}")
            return []


def _serialize_datetimes(d: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in d.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _deserialize_datetimes(d: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in d.items():
        if k in ("attempted_at", "created_at", "recommended_retry_at", "original_failure_at", "actual_retry_executed_at", "received_at", "effective_retry_at", "original_retry_at", "overridden_retry_at") and isinstance(v, str):
            try:
                if v.endswith("Z"):
                    v = v.replace("Z", "+00:00")
                out[k] = datetime.fromisoformat(v)
            except Exception:
                out[k] = v
        else:
            out[k] = v
    return out


# Singleton factory
_db_instance: Optional[Any] = None


def get_db():
    global _db_instance
    if _db_instance is not None:
        return _db_instance
    url = os.getenv("SUPABASE_URL")
    # Prefer secret/service_role key if available (needed for RLS writes)
    # New Supabase uses sb_secret_*, legacy uses service_role
    key = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
    )
    if url and key:
        try:
            _db_instance = SupabaseDB(url, key)
            # quick probe: if key is publishable and RLS blocks, we'll warn on first write but still use hybrid
            key_type = "secret/service_role" if key.startswith("sb_secret") or "service" in key.lower()[:30] else "publishable/anon"
            logger.info(f"Using Supabase DB ({key_type} key) at {url[:40]}...")
            return _db_instance
        except Exception as e:
            logger.warning(f"Supabase init failed, falling back to in-memory: {e}")
    logger.info("Using InMemoryDB (no Supabase credentials)")
    _db_instance = InMemoryDB()
    return _db_instance


def reset_db_for_testing():
    """Helper to force re-init after env change (used in tests)."""
    global _db_instance
    _db_instance = None
