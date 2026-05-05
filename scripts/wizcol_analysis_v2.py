#!/usr/bin/env python3
"""
WizCol Discussion Analysis — Tzfat, Hatzor, Rosh Pina
Fetches statements + evaluations from Firestore, clusters semantically,
aggregates at evaluator level, splits by city/age, outputs analysis_output.json

Data structure (discovered via exploration):
- statements: parentId="e4RvrhcOzPNt", type="option", consensus pre-computed
- evaluations: parentId="e4RvrhcOzPNt", fields: evaluatorId, evaluation (range -1 to 1)
- userDemographicEvaluations: parentId="e4RvrhcOzPNt", fields: userId, demographic[{question,answer}]
  - City question: "ישוב מגורים", options: צפת/חצור הגלילית/ראש פינה
  - Age question: "גיל", options: מתחת ל 18/18 - 21/22 - 35/36 - 67/מעל 67
"""

import os
import sys
import json
import math
import datetime
import warnings
from collections import defaultdict
from typing import Optional

warnings.filterwarnings("ignore")

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.preprocessing import normalize
from openai import OpenAI

import firebase_admin
from firebase_admin import credentials, firestore

# ─── CONFIG ───────────────────────────────────────────────────────────────────
MAIN_STATEMENT_ID = "e4RvrhcOzPNt"
CONSENSUS_THRESHOLD = 0.35
DISTANCE_THRESHOLD = 0.35
ENV_PATH = "/Users/talyaron/Documents/Freedi-app/env/.env.prod"
OUTPUT_PATH = "/Users/talyaron/Documents/Freedi-app/analysis_output.json"

CITIES = ["Tzfat", "Hatzor", "RoshPina", "Other"]
CITY_MAP = {
    "צפת": "Tzfat",
    "ראש פינה": "RoshPina",
    "ראש-פינה": "RoshPina",
    "חצור הגלילית": "Hatzor",
    "חצור": "Hatzor",
}

# Age groups based on actual data buckets
AGE_GROUPS = ["youth_under35", "mid_36_67", "seniors_67plus"]
AGE_MAP = {
    "מתחת ל 18": "youth_under35",
    "18 - 21": "youth_under35",
    "22 - 35": "youth_under35",
    "36 - 67": "mid_36_67",
    "מעל 67": "seniors_67plus",
}

TOPIC_KEYWORDS = {
    "employment": ["תעסוקה", "עבודה", "הייטק", "תעשייה", "משרות", "פרנסה", "כלכלה", "אזור תעשייה", "עסקים"],
    "youth": ["ילדים", "נוער", "צעירים", "גיל הרך", "בני נוער", "תלמידים", "מחוננים"],
    "infrastructure": ["תשתית", "ניקיון", "סביבה", "מים", "ביוב", "פארק", "שצ", "גינה"],
    "commerce": ["מסחר", "קניון", "חנויות", "יוקר", "רשתות", "שווק", "שוק", "מכולת"],
    "education": ["חינוך", "בית ספר", "מצוינות", "חוגים", "אוניברסיטה", "לימודים", "מכללה"],
    "tourism": ["תיירות", "פסטיבל", "אטרקציה", "מבקרים", "מלון", "אירוח", "עיר עתיקה"],
    "culture": ["תרבות", "אמנות", "מופע", "ספרייה", "אירוע", "קונצרט", "תיאטרון", "קהילתי"],
    "health_welfare": ["בריאות", "רפואה", "רווחה", "קופת חולים", "בית חולים", "מרפאה", "קשיש", "נכה", "נגישות"],
    "transportation": ["תחבורה", "אוטובוס", "שאטל", "כביש", "חניה", "רכבת", "קו", "הסעה"],
    "leisure_sports": ["פנאי", "בילוי", "ספורט", "קאנטרי", "בריכה", "מגרש", "פעילות גופנית", "חוג"],
    "housing": ["דיור", "שכירות", "דירה", "בנייה", "שכונה", "הרחבה", "מגורים"],
    "security": ["מיגון", "ביטחון", "חירום", "משטרה", "הצלה", "בטיחות"],
    "regional_governance": ["שיתוף פעולה", "איחוד", "רשות", "אזורי", "ועד", "מועצה", "שיתוף"],
    "community": ["קהילה", "מגזר", "זהות", "התנדבות", "חברתי", "וואטסאפ", "רשת"],
    "digital": ["דיגיטל", "אפליקציה", "אתר", "מידע", "פלטפורמה", "אינטרנט"],
}


# ─── ENV / FIREBASE ────────────────────────────────────────────────────────────
def load_env(path: str) -> dict[str, str]:
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                env[k.strip()] = v.replace("\\n", "\n")
    return env


def init_firebase(env: dict) -> firestore.Client:
    cred_dict = {
        "type": "service_account",
        "project_id": env["FIREBASE_PROJECT_ID"],
        "private_key_id": "key1",
        "private_key": env["FIREBASE_PRIVATE_KEY"],
        "client_email": env["FIREBASE_CLIENT_EMAIL"],
        "client_id": "123",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
    cred = credentials.Certificate(cred_dict)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    return firestore.client()


# ─── DATA FETCHING ──────────────────────────────────────────────────────────────
def fetch_statements(db) -> list[dict]:
    """Fetch all original solution statements (direct children of main question)."""
    print("Step 1: Fetching statements...")
    docs = list(db.collection("statements")
                .where("parentId", "==", MAIN_STATEMENT_ID)
                .stream())

    statements = []
    for doc in docs:
        d = doc.to_dict()
        d["statementId"] = doc.id
        stmt_type = d.get("statementType", "")
        # Only include original proposals — not sub-questions, paragraphs, etc.
        if stmt_type not in ("option", "statement"):
            continue
        if not d.get("statement"):
            continue
        statements.append(d)

    print(f"  Fetched {len(statements)} original proposals")
    return statements


def fetch_all_evaluations(db) -> tuple[dict[str, list[dict]], int, set[str]]:
    """
    Fetch all evaluations for this discussion.
    Returns: (evals_by_statement, total_count, all_evaluator_ids)
    """
    print("Step 2: Fetching all evaluations...")
    all_evals = list(db.collection("evaluations")
                     .where("parentId", "==", MAIN_STATEMENT_ID)
                     .stream())

    evals_by_statement: dict[str, list[dict]] = defaultdict(list)
    evaluator_ids: set[str] = set()

    for doc in all_evals:
        d = doc.to_dict()
        sid = d.get("statementId")
        uid = d.get("evaluatorId")
        val = d.get("evaluation")
        if sid and uid and val is not None:
            evals_by_statement[sid].append({"userId": uid, "value": float(val)})
            evaluator_ids.add(uid)

    print(f"  Total evaluations: {len(all_evals)}, unique evaluators: {len(evaluator_ids)}")
    return dict(evals_by_statement), len(all_evals), evaluator_ids


def fetch_demographics(db) -> tuple[dict[str, str], dict[str, Optional[str]]]:
    """
    Fetch city and age data from userDemographicEvaluations.
    Returns: (user_city_map, user_age_map)
    """
    print("Step 3: Fetching demographics...")
    all_demo = list(db.collection("userDemographicEvaluations")
                    .where("parentId", "==", MAIN_STATEMENT_ID)
                    .stream())

    print(f"  Raw demographic evaluation records: {len(all_demo)}")

    user_city: dict[str, str] = {}
    user_age: dict[str, Optional[str]] = {}

    for doc in all_demo:
        d = doc.to_dict()
        uid = d.get("userId")
        if not uid:
            continue
        for item in d.get("demographic", []):
            question = item.get("question", "")
            answer = item.get("answer", "")
            if "ישוב" in question or "עיר" in question or "מגורים" in question:
                if uid not in user_city:
                    user_city[uid] = CITY_MAP.get(answer, "Other")
            elif "גיל" in question:
                if uid not in user_age:
                    user_age[uid] = AGE_MAP.get(answer)

    city_dist = defaultdict(int)
    for c in user_city.values():
        city_dist[c] += 1

    age_dist = defaultdict(int)
    for a in user_age.values():
        if a:
            age_dist[a] += 1

    print(f"  Users with city: {len(user_city)} — {dict(city_dist)}")
    print(f"  Users with age:  {len(user_age)} — {dict(age_dist)}")
    return user_city, user_age


# ─── FILTERING ──────────────────────────────────────────────────────────────────
def filter_by_consensus(statements: list[dict]) -> list[dict]:
    filtered = [
        s for s in statements
        if s.get("consensus") is not None and float(s["consensus"]) >= CONSENSUS_THRESHOLD
    ]
    print(f"Step 4: Consensus filter → {len(filtered)}/{len(statements)} proposals pass (threshold={CONSENSUS_THRESHOLD})")
    return filtered


# ─── EMBEDDINGS + CLUSTERING ─────────────────────────────────────────────────────
def get_embeddings(texts: list[str], openai_key: str) -> np.ndarray:
    client = OpenAI(api_key=openai_key)
    print(f"Step 5: Embedding {len(texts)} texts via OpenAI...")
    all_embeddings = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        response = client.embeddings.create(model="text-embedding-3-large", input=batch)
        for item in sorted(response.data, key=lambda x: x.index):
            all_embeddings.append(item.embedding)
        print(f"  ...{min(i+batch_size, len(texts))}/{len(texts)}")
    return np.array(all_embeddings)


def cluster_statements(embeddings: np.ndarray, n: int) -> list[int]:
    print(f"Step 6: Agglomerative clustering (threshold={DISTANCE_THRESHOLD})...")
    normed = normalize(embeddings)
    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=DISTANCE_THRESHOLD,
        metric="cosine",
        linkage="average",
    )
    labels = clustering.fit_predict(normed)
    unique_clusters = len(set(labels))
    print(f"  Formed {unique_clusters} clusters from {n} proposals")
    return labels.tolist()


# ─── TOPIC CLASSIFICATION ────────────────────────────────────────────────────────
def classify_topic(text: str) -> tuple[str, Optional[str]]:
    scores: dict[str, int] = defaultdict(int)
    for topic, keywords in TOPIC_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                scores[topic] += 1
    if not scores:
        return "other", None
    sorted_t = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    primary = sorted_t[0][0]
    secondary = sorted_t[1][0] if len(sorted_t) > 1 and sorted_t[1][1] > 0 else None
    return primary, secondary


# ─── TITLE GENERATION ────────────────────────────────────────────────────────────
def generate_titles_batch(cluster_groups: list[list[dict]], openai_key: str) -> list[tuple[str, str]]:
    """Generate Hebrew title + description for each cluster using OpenAI."""
    client = OpenAI(api_key=openai_key)
    print(f"Step 7: Generating titles for {len(cluster_groups)} clusters...")
    results = []

    for i, members in enumerate(cluster_groups):
        # Take up to 6 representative texts
        sample_texts = [m.get("statement", "")[:120] for m in members[:6]]
        combined = "\n- ".join(sample_texts)

        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": f"""אלו הצעות מדיון ציבורי על שיתוף פעולה בין עיריות צפת, חצור הגלילית וראש-פינה.

הצעות (דוגמאות מהאשכול):
- {combined}

משימה: צור כותרת ותיאור בעברית שמסכמים את הרעיון המשותף.
- כותרת: 4-8 מילים, מנוסחת כפעולה קיבוצית (לדוג': "הקמת מרכז תעסוקה אזורי", "קידום תחבורה ציבורית משותפת")
- תיאור: 1-2 משפטים קצרים שמסבירים את הרעיון לפקידים עירוניים

ענה ב-JSON בלבד:
{{"title": "...", "description": "..."}}"""
                }],
                max_tokens=200,
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content)
            title = data.get("title", f"אשכול {i+1}")
            desc = data.get("description", "")
        except Exception as e:
            print(f"  Warning: Title generation failed for cluster {i+1}: {e}")
            # Fallback: use first statement text
            title = members[0].get("statement", f"אשכול {i+1}")[:60]
            desc = ""

        results.append((title, desc))
        if (i + 1) % 20 == 0:
            print(f"  ...titled {i+1}/{len(cluster_groups)}")

    return results


# ─── AGGREGATION ────────────────────────────────────────────────────────────────
def aggregate_cluster(member_ids: list[str], evals_by_statement: dict) -> tuple[dict, dict[str, float]]:
    """
    Aggregate evaluations at evaluator level.
    Returns: (stats_dict, user_means {userId: mean})
    """
    # Collect all evaluations for cluster members
    user_vals: dict[str, list[float]] = defaultdict(list)
    total_evals = 0

    for sid in member_ids:
        for e in evals_by_statement.get(sid, []):
            user_vals[e["userId"]].append(e["value"])
            total_evals += 1

    if not user_vals:
        return {
            "unique_evaluators": 0,
            "pro_users": 0, "con_users": 0, "neutral_users": 0,
            "mean_user_average": None,
            "mean_per_evaluation": None,
            "support_share": None,
            "total_individual_evaluations": 0,
        }, {}

    # User-level means
    user_means = {uid: sum(vals) / len(vals) for uid, vals in user_vals.items()}
    values = list(user_means.values())

    pro = sum(1 for v in values if v > 0.2)
    con = sum(1 for v in values if v < -0.2)
    neutral = len(values) - pro - con

    mean_user = sum(values) / len(values)

    all_vals = [v for vals in user_vals.values() for v in vals]
    mean_per_eval = sum(all_vals) / len(all_vals)

    return {
        "unique_evaluators": len(user_means),
        "pro_users": pro,
        "con_users": con,
        "neutral_users": neutral,
        "mean_user_average": round(mean_user, 4),
        "mean_per_evaluation": round(mean_per_eval, 4),
        "support_share": round(pro / len(values), 4),
        "total_individual_evaluations": total_evals,
    }, user_means


def aggregate_by_city(user_means: dict[str, float], user_city_map: dict) -> dict:
    city_data: dict[str, list[float]] = defaultdict(list)
    for uid, mean_val in user_means.items():
        city = user_city_map.get(uid, "Other")
        city_data[city].append(mean_val)

    result = {}
    for city in CITIES:
        vals = city_data.get(city, [])
        if not vals:
            result[city] = {
                "unique_evaluators": 0, "mean": None,
                "support_share": None, "pro_users": 0, "con_users": 0, "neutral_users": 0,
            }
        else:
            pro = sum(1 for v in vals if v > 0.2)
            con = sum(1 for v in vals if v < -0.2)
            result[city] = {
                "unique_evaluators": len(vals),
                "mean": round(sum(vals) / len(vals), 4),
                "support_share": round(pro / len(vals), 4),
                "pro_users": pro,
                "con_users": len(vals) - pro - sum(1 for v in vals if -0.2 <= v <= 0.2),
                "neutral_users": sum(1 for v in vals if -0.2 <= v <= 0.2),
            }
    return result


def aggregate_by_age(user_means: dict[str, float], user_age_map: dict) -> dict:
    age_data: dict[str, list[float]] = defaultdict(list)
    for uid, mean_val in user_means.items():
        grp = user_age_map.get(uid)
        if grp:
            age_data[grp].append(mean_val)

    result = {}
    for grp in AGE_GROUPS:
        vals = age_data.get(grp, [])
        if not vals:
            result[grp] = {
                "unique_evaluators": 0, "mean": None,
                "support_share": None, "pro_users": 0, "con_users": 0, "neutral_users": 0,
            }
        else:
            pro = sum(1 for v in vals if v > 0.2)
            con = sum(1 for v in vals if v < -0.2)
            result[grp] = {
                "unique_evaluators": len(vals),
                "mean": round(sum(vals) / len(vals), 4),
                "support_share": round(pro / len(vals), 4),
                "pro_users": pro,
                "con_users": len(vals) - pro - sum(1 for v in vals if -0.2 <= v <= 0.2),
                "neutral_users": sum(1 for v in vals if -0.2 <= v <= 0.2),
            }
    return result


def is_cross_city_consensus(by_city: dict) -> tuple[bool, Optional[float]]:
    main = ["Tzfat", "Hatzor", "RoshPina"]
    city_means = []
    for city in main:
        data = by_city.get(city, {})
        n = data.get("unique_evaluators", 0)
        mean = data.get("mean")
        support = data.get("support_share")
        if n < 5 or mean is None or support is None:
            return False, None
        if mean <= 0.4 or support <= 0.6:
            return False, None
        city_means.append(mean)
    return True, round(min(city_means), 4)


# ─── TOPIC SUMMARY ──────────────────────────────────────────────────────────────
def build_topics_summary(clusters: list[dict]) -> list[dict]:
    topic_cls: dict[str, list] = defaultdict(list)
    for c in clusters:
        topic_cls[c["topic_primary"]].append(c)

    summary = []
    for topic, tcls in sorted(topic_cls.items()):
        # Unique users across all clusters in this topic
        all_means_flat = []
        for c in tcls:
            m = c["aggregated"]["mean_user_average"]
            n = c["aggregated"]["unique_evaluators"]
            if m is not None and n > 0:
                all_means_flat.extend([m] * 1)  # weighted equally per cluster

        topic_mean = round(sum(all_means_flat) / len(all_means_flat), 4) if all_means_flat else None
        top_cls = sorted(tcls, key=lambda c: c["aggregated"]["mean_user_average"] or 0, reverse=True)[:3]

        summary.append({
            "topic": topic,
            "n_clusters": len(tcls),
            "topic_mean": topic_mean,
            "top_cluster_ids": [c["cluster_id"] for c in top_cls],
        })

    return sorted(summary, key=lambda x: x["topic_mean"] or 0, reverse=True)


# ─── MAIN ────────────────────────────────────────────────────────────────────────
def main():
    env = load_env(ENV_PATH)
    db = init_firebase(env)
    openai_key = env["OPENAI_API_KEY"]

    # 1. Fetch data
    statements = fetch_statements(db)
    total_raw = len(statements)

    evals_by_statement, total_eval_count, all_evaluator_ids = fetch_all_evaluations(db)
    user_city_map, user_age_map = fetch_demographics(db)

    # 2. Filter
    filtered = filter_by_consensus(statements)
    total_filtered = len(filtered)

    # 3. Embed
    texts = [
        (s.get("statement", "") + " " + (s.get("description", "") or "")).strip()
        for s in filtered
    ]
    embeddings = get_embeddings(texts, openai_key)

    # 4. Cluster
    labels = cluster_statements(embeddings, len(filtered))

    # Group indices by cluster label
    groups: dict[int, list[int]] = defaultdict(list)
    for idx, label in enumerate(labels):
        groups[label].append(idx)

    cluster_groups_members = [
        [filtered[idx] for idx in indices]
        for indices in groups.values()
    ]

    # Sort clusters by size descending for easier review
    cluster_groups_members.sort(key=len, reverse=True)

    # 5. Generate titles
    titles_descs = generate_titles_batch(cluster_groups_members, openai_key)

    # 6. Build cluster objects
    print("Step 8: Building cluster objects...")
    cluster_objects = []

    for i, (members, (title, description)) in enumerate(zip(cluster_groups_members, titles_descs)):
        cluster_id = f"C{i+1:03d}"
        member_ids = [m["statementId"] for m in members]

        # Aggregate
        agg, user_means = aggregate_cluster(member_ids, evals_by_statement)
        by_city = aggregate_by_city(user_means, user_city_map)
        by_age = aggregate_by_age(user_means, user_age_map)
        cross_city, min_city_mean = is_cross_city_consensus(by_city)

        # Youth metrics
        youth_data = by_age.get("youth_under35", {})
        youth_n = youth_data.get("unique_evaluators", 0)
        youth_mean = youth_data.get("mean")
        gen_mean = agg.get("mean_user_average")
        young_score = round((youth_mean * youth_n), 4) if youth_mean is not None else 0.0
        young_delta = round(youth_mean - gen_mean, 4) if (youth_mean is not None and gen_mean is not None) else None

        # Topic
        all_text = " ".join(m.get("statement", "") for m in members)
        primary_topic, secondary_topic = classify_topic(all_text)

        # Member proposals (full text, no truncation)
        member_proposals = []
        for m in members:
            sid = m["statementId"]
            n_evals = len(evals_by_statement.get(sid, []))
            cp = m.get("consensus")
            member_proposals.append({
                "statement_id": sid,
                "statement_text": m.get("statement", ""),
                "consensus": round(float(cp), 4) if cp is not None else None,
                "n_evaluators_per_item": n_evals,
            })

        cluster_obj = {
            "cluster_id": cluster_id,
            "title": title,
            "description": description,
            "topic_primary": primary_topic,
            "topic_secondary": secondary_topic,
            "member_proposals": member_proposals,
            "n_member_proposals": len(members),
            "aggregated": agg,
            "by_city": by_city,
            "cross_city_consensus": cross_city,
            "cross_city_min_mean": min_city_mean,
            "by_age_group": by_age,
            "young_priority_score": young_score,
            "young_vs_general_delta": young_delta,
            # Internal — removed before final output
            "_user_means": user_means,
        }
        cluster_objects.append(cluster_obj)

    # 7. Rankings
    sorted_by_priority = sorted(cluster_objects, key=lambda c: c["aggregated"]["mean_user_average"] or 0, reverse=True)
    sorted_by_evaluators = sorted(cluster_objects, key=lambda c: c["aggregated"]["unique_evaluators"], reverse=True)
    cross_city_list = sorted(
        [c for c in cluster_objects if c["cross_city_consensus"]],
        key=lambda c: c["cross_city_min_mean"] or 0,
        reverse=True,
    )
    young_by_score = sorted(cluster_objects, key=lambda c: c["young_priority_score"], reverse=True)
    young_by_delta = sorted(
        [c for c in cluster_objects if c["young_vs_general_delta"] is not None],
        key=lambda c: c["young_vs_general_delta"],
        reverse=True,
    )

    # 8. Topics summary
    topics_summary = build_topics_summary(cluster_objects)

    # 9. Count city coverage
    city_coverage = defaultdict(int)
    for uid in all_evaluator_ids:
        city_coverage[user_city_map.get(uid, "not_reported")] += 1

    # 10. Strip internal fields
    for c in cluster_objects:
        c.pop("_user_means", None)

    # 11. Assemble final output
    output = {
        "metadata": {
            "main_question": "מה יכולות צפת, חצור וראש-פינה לקדם יחד כבר בשנה הקרובה כדי לשפר את החיים באזור?",
            "main_statement_id": MAIN_STATEMENT_ID,
            "exported_at": datetime.datetime.utcnow().isoformat() + "Z",
            "total_proposals_raw": total_raw,
            "total_proposals_filtered": total_filtered,
            "total_unique_evaluators": len(all_evaluator_ids),
            "total_individual_evaluations": total_eval_count,
            "consensus_threshold": CONSENSUS_THRESHOLD,
            "clustering_method": "OpenAI text-embedding-3-large + agglomerative cosine",
            "clustering_distance_threshold": DISTANCE_THRESHOLD,
            "city_categories": CITIES,
            "age_groups": AGE_GROUPS,
            "age_groups_note": "Data uses pre-defined age brackets: youth_under35 (18-35), mid_36_67 (36-67), seniors_67plus (67+)",
            "demographic_data_completeness": {
                "users_with_city": len(user_city_map),
                "users_with_age": sum(1 for v in user_age_map.values() if v is not None),
                "coverage_percent": round(len(user_city_map) / len(all_evaluator_ids) * 100, 1),
                "city_coverage": dict(city_coverage),
            },
        },
        "clusters": cluster_objects,
        "topics_summary": topics_summary,
        "rankings": {
            "by_overall_priority": [c["cluster_id"] for c in sorted_by_priority],
            "by_total_evaluators": [c["cluster_id"] for c in sorted_by_evaluators],
            "cross_city_consensus": [
                {"cluster_id": c["cluster_id"], "min_city_mean": c["cross_city_min_mean"], "title": c["title"]}
                for c in cross_city_list
            ],
            "young_priorities_by_score": [
                {"cluster_id": c["cluster_id"], "young_score": c["young_priority_score"], "title": c["title"]}
                for c in young_by_score[:20]
            ],
            "young_priorities_by_delta": [
                {
                    "cluster_id": c["cluster_id"],
                    "delta": c["young_vs_general_delta"],
                    "young_mean": c["by_age_group"].get("youth_under35", {}).get("mean"),
                    "general_mean": c["aggregated"].get("mean_user_average"),
                    "title": c["title"],
                }
                for c in young_by_delta[:20]
            ],
        },
    }

    # Write output
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # ─── SUMMARY REPORT ───────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("ANALYSIS COMPLETE — SUMMARY")
    print(f"{'='*60}")
    print(f"Output: {OUTPUT_PATH}")
    print(f"Total proposals: {total_raw} raw → {total_filtered} filtered")
    print(f"Clusters formed: {len(cluster_objects)}")
    print(f"Cross-city consensus clusters: {len(cross_city_list)}")
    print(f"Evaluators: {len(all_evaluator_ids)} total, {len(user_city_map)} with city data ({len(user_city_map)/len(all_evaluator_ids)*100:.0f}%)")

    if sorted_by_evaluators:
        top = sorted_by_evaluators[0]
        print(f"\nTop by evaluators: {top['cluster_id']} '{top['title']}' ({top['aggregated']['unique_evaluators']} evaluators)")

    if sorted_by_priority:
        top = sorted_by_priority[0]
        print(f"Top by priority:   {top['cluster_id']} '{top['title']}' (mean={top['aggregated']['mean_user_average']})")

    if cross_city_list:
        print(f"\nTop cross-city consensus cluster: {cross_city_list[0]['cluster_id']} '{cross_city_list[0]['title']}' (min_mean={cross_city_list[0]['cross_city_min_mean']})")

    if young_by_delta:
        top = young_by_delta[0]
        print(f"Biggest youth gap: {top['cluster_id']} '{top['title']}' (delta={top['young_vs_general_delta']})")

    print(f"\nValidate: python3 -m json.tool {OUTPUT_PATH} > /dev/null && echo JSON_VALID")

    # Quick JSON validation
    with open(OUTPUT_PATH) as f:
        json.load(f)
    print("JSON: VALID ✅")


if __name__ == "__main__":
    main()
