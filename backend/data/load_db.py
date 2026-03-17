#!/usr/bin/env python3
"""
data/load_db.py — Generate EXACTLY 1,000,000 YouTube analytics rows.

Specification (from PDF):
  ┌────────────────────────────────────────────────────────┐
  │  Table:       youtube_data                             │
  │  Total rows:  1,000,000 (NOT per category)             │
  │  Categories:  Coding, Education, Gaming,               │
  │               Music, Tech Reviews, Vlogs               │
  │  Dates:       2024-01-01  →  2025-12-30                │
  │  Sentiment:   -1.0  →  +1.0  (category-specific bias)  │
  │  Regions:     US, UK, IN, PK, BR (and others)          │
  │  Languages:   English, Urdu, Hindi, Japanese, Spanish  │
  └────────────────────────────────────────────────────────┘

Usage:
    cd backend
    python data/load_db.py
"""

import sqlite3
import os
import random
import math
import time
from datetime import datetime, timedelta

# ═══════════════════════════════════════════════════════════════════════════════
# PATHS
# ═══════════════════════════════════════════════════════════════════════════════

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "..", "database.db")

# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMA — matches the PDF specification exactly
# ═══════════════════════════════════════════════════════════════════════════════

SCHEMA = """
CREATE TABLE IF NOT EXISTS youtube_data (
    row_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id          TEXT,
    title             TEXT,
    category          TEXT,
    region            TEXT,
    language          TEXT,
    views             INTEGER,
    likes             INTEGER,
    comments          INTEGER,
    shares            INTEGER,
    ads_enabled       INTEGER,
    publish_date      TEXT,
    sentiment_score   REAL,
    duration_seconds  INTEGER,
    subscribers       INTEGER
);
"""

INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_category  ON youtube_data(category);",
    "CREATE INDEX IF NOT EXISTS idx_region    ON youtube_data(region);",
    "CREATE INDEX IF NOT EXISTS idx_language  ON youtube_data(language);",
    "CREATE INDEX IF NOT EXISTS idx_ads       ON youtube_data(ads_enabled);",
    "CREATE INDEX IF NOT EXISTS idx_pubdate   ON youtube_data(publish_date);",
    "CREATE INDEX IF NOT EXISTS idx_cat_date  ON youtube_data(category, publish_date);",
    "CREATE INDEX IF NOT EXISTS idx_reg_ads   ON youtube_data(region, ads_enabled);",
    "CREATE INDEX IF NOT EXISTS idx_vid       ON youtube_data(video_id);",
]

# ═══════════════════════════════════════════════════════════════════════════════
# CONSTANTS  —  the ONLY place that controls total row count
# ═══════════════════════════════════════════════════════════════════════════════

TOTAL_ROWS = 1_000_000          # ← EXACTLY one million, total, across ALL categories
BATCH_SIZE = 50_000             # Insert 50 K rows per commit (memory-efficient)

# ═══════════════════════════════════════════════════════════════════════════════
# DIMENSION VALUES
# ═══════════════════════════════════════════════════════════════════════════════

CATEGORIES = ["Coding", "Education", "Gaming", "Music", "Tech Reviews", "Vlogs"]

REGIONS = ["US", "UK", "IN", "PK", "BR", "DE", "FR", "JP", "KR", "AU"]

LANGUAGES = ["English", "Urdu", "Hindi", "Japanese", "Spanish",
             "Portuguese", "German", "French", "Korean", "Arabic"]

# Date range: 2024-01-01  →  2025-12-30  (729 days inclusive)
DATE_START = datetime(2024, 1, 1)
DATE_END   = datetime(2025, 12, 30)
DATE_RANGE_DAYS = (DATE_END - DATE_START).days   # 729

# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY-SPECIFIC DISTRIBUTIONS
#
# Each category has its own:
#   • sentiment  (mean, std)    — normal distribution clipped to [-1, 1]
#   • views      (μ_log, σ_log) — log-normal so most are small, few go viral
#   • duration   (min_sec, max_sec)
#   • ads_prob   — probability that ads_enabled = 1
#   • weight     — relative frequency (how common this category is)
# ═══════════════════════════════════════════════════════════════════════════════

CATEGORY_CONFIG = {
    #                    sentiment       views(log-normal)  duration(sec)    ads%   weight
    "Music":        {"s": (0.50, 0.30), "v": (10.5, 2.0), "d": (120, 420),   "a": 0.70, "w": 20},
    "Education":    {"s": (0.40, 0.30), "v": ( 9.0, 1.8), "d": (300, 2400),  "a": 0.60, "w": 15},
    "Gaming":       {"s": (0.20, 0.45), "v": (10.0, 2.2), "d": (300, 3600),  "a": 0.75, "w": 22},
    "Coding":       {"s": (0.35, 0.25), "v": ( 8.5, 1.5), "d": (300, 3600),  "a": 0.55, "w": 13},
    "Tech Reviews": {"s": (0.05, 0.50), "v": ( 9.5, 1.8), "d": (300, 1800),  "a": 0.80, "w": 15},
    "Vlogs":        {"s": (0.10, 0.40), "v": ( 9.0, 2.0), "d": (300, 1200),  "a": 0.50, "w": 15},
}

# Build a weighted list so random.choices can pick categories by weight
_CAT_NAMES   = list(CATEGORY_CONFIG.keys())
_CAT_WEIGHTS = [CATEGORY_CONFIG[c]["w"] for c in _CAT_NAMES]

# ═══════════════════════════════════════════════════════════════════════════════
# TITLE TEMPLATES  —  category-specific for realistic look
# ═══════════════════════════════════════════════════════════════════════════════

TITLE_TEMPLATES = {
    "Coding": [
        "How to Build {t} in Python",
        "Complete {t} Tutorial 2024",
        "{t} Crash Course for Beginners",
        "Advanced {t} Techniques You Must Know",
        "Learn {t} in 30 Minutes",
        "{t} Project from Scratch",
        "Top 10 {t} Tips & Tricks",
        "{t} Explained Simply",
        "Building a {t} App — Full Walkthrough",
        "Why {t} Will Change Everything",
        "{t} Best Practices in 2025",
        "Mastering {t} — Complete Guide",
    ],
    "Education": [
        "Understanding {t} — Full Lecture",
        "{t} Explained in 10 Minutes",
        "The Science Behind {t}",
        "History of {t} — Documentary",
        "{t} Study Guide for Exams",
        "Everything About {t}",
        "{t} for Students — Simplified",
        "Why {t} Matters More Than Ever",
        "The Truth About {t}",
        "{t} — What They Don't Teach You",
        "Deep Dive into {t}",
        "{t} Lecture Series Part {n}",
    ],
    "Gaming": [
        "{t} Gameplay Walkthrough Part {n}",
        "Best {t} Moments Compilation",
        "{t} Tips for Pro Players",
        "I Beat {t} on Hardest Difficulty",
        "{t} Review — Worth Buying?",
        "Top 10 {t} Strategies",
        "{t} Speedrun Attempt",
        "{t} New Update — Everything Changed",
        "{t} Funny Moments & Fails",
        "Playing {t} for the First Time",
        "{t} Ranked Gameplay",
        "{t} Ultimate Guide",
    ],
    "Music": [
        "{t} — Official Music Video",
        "{t} Live Performance 2024",
        "{t} Cover by Independent Artist",
        "Best {t} Playlist 2024",
        "{t} Remix — Bass Boosted",
        "Making a {t} Beat from Scratch",
        "{t} Album Review — Honest Take",
        "Top {t} Hits This Month",
        "{t} — Acoustic Version",
        "Reacting to {t} for the First Time",
        "{t} Music Mix — Study & Chill",
        "Best {t} Songs You've Never Heard",
    ],
    "Tech Reviews": [
        "{t} Review — Is It Worth It?",
        "Unboxing {t} — First Impressions",
        "{t} vs Competition — Honest Comparison",
        "{t} After 6 Months — Long Term Review",
        "Best {t} in 2024 — Buyer's Guide",
        "{t} Setup Tour & Tips",
        "Why I Switched to {t}",
        "{t} — Don't Buy Before Watching",
        "{t} Camera/Display/Battery Test",
        "Everything Wrong with {t}",
        "{t} Tips and Hidden Features",
        "{t} — Worth the Upgrade?",
    ],
    "Vlogs": [
        "A Day in My Life — {t}",
        "{t} Daily Vlog",
        "Moving to {t} — Week {n}",
        "Trying {t} for the First Time",
        "My {t} Morning Routine",
        "{t} Travel Diary",
        "Life Update: {t} Changes",
        "{t} Challenge — Can I Do It?",
        "What I Learned in {t}",
        "Exploring {t} — Hidden Gems",
        "{t} — Expectations vs Reality",
        "Day {n} of {t}",
    ],
}

TOPICS = {
    "Coding": [
        "React", "Django", "FastAPI", "Machine Learning", "Docker",
        "Kubernetes", "TypeScript", "Rust", "Go", "REST APIs",
        "GraphQL", "Next.js", "Flutter", "Node.js", "PostgreSQL",
        "Redis", "WebSocket", "Tailwind CSS", "Vue.js", "Svelte",
    ],
    "Education": [
        "Quantum Physics", "Calculus", "Economics", "Biology",
        "Psychology", "Philosophy", "Statistics", "Organic Chemistry",
        "Literature", "Geography", "Astronomy", "Linguistics",
        "Neuroscience", "Sociology", "Political Science",
        "World History", "Climate Science", "Genetics", "Logic", "Ethics",
    ],
    "Gaming": [
        "Minecraft", "Fortnite", "GTA VI", "Zelda", "Elden Ring",
        "Valorant", "CS2", "Baldur's Gate 3", "Cyberpunk 2077", "Starfield",
        "Palworld", "Helldivers 2", "Dragon Ball", "Final Fantasy XVI", "Mario",
        "League of Legends", "Apex Legends", "Overwatch 2", "Diablo IV", "Hades II",
    ],
    "Music": [
        "Pop", "Rock", "Hip Hop", "Jazz", "Classical",
        "EDM", "R&B", "Country", "Indie", "K-Pop",
        "Latin", "Soul", "Metal", "Acoustic", "Lo-Fi",
        "Funk", "Reggaeton", "Blues", "Synthwave", "Afrobeats",
    ],
    "Tech Reviews": [
        "iPhone 16", "Galaxy S24", "MacBook Pro M4", "RTX 5090",
        "Steam Deck OLED", "PlayStation 5 Pro", "Apple Vision Pro", "Pixel 9",
        "iPad Pro M4", "ThinkPad X1", "AirPods Pro 3", "Sony WH-1000XM6",
        "DJI Mini 4 Pro", "Tesla Model Y", "Mac Mini M4",
        "Galaxy Tab S10", "OnePlus 13", "Nothing Phone 3", "Garmin Watch", "Sonos Era",
    ],
    "Vlogs": [
        "Tokyo", "New York", "London", "Paris", "Dubai",
        "Bali", "Seoul", "Istanbul", "Barcelona", "Sydney",
        "College Life", "Remote Work", "Fitness Journey", "Cooking", "Minimalism",
        "Van Life", "Solo Travel", "Apartment Hunting", "Grocery Haul", "Weekend Reset",
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# GENERATORS  —  each returns a single value with realistic distribution
# ═══════════════════════════════════════════════════════════════════════════════

def gen_sentiment(category: str) -> float:
    """
    Normal distribution with category-specific mean & std.
    Hard-clipped to [-1.0, +1.0].  Rounded to 4 decimals.

    Examples of resulting averages:
      Music        ≈ +0.50  (mostly positive)
      Tech Reviews ≈ +0.05  (mixed, some very negative)
      Gaming       ≈ +0.20  (mixed)
    """
    mean, std = CATEGORY_CONFIG[category]["s"]
    score = random.gauss(mean, std)
    return round(max(-1.0, min(1.0, score)), 4)


def gen_views(category: str) -> int:
    """
    Log-normal distribution → most videos get few views, some go viral.
    Floored at 100, capped at 50 000 000.
    """
    mu, sigma = CATEGORY_CONFIG[category]["v"]
    raw = math.exp(random.gauss(mu, sigma))
    return max(100, min(int(raw), 50_000_000))


def gen_engagement(views: int) -> tuple:
    """
    Generate (likes, comments, shares) proportional to views.
    Each metric uses a random engagement rate so rows vary naturally.

    Typical engagement rates (YouTube industry averages):
      likes:    2–8 %   of views
      comments: 0.1–1.5 % of views
      shares:   0.05–0.5 % of views
    """
    # ── likes ──
    like_rate = random.uniform(0.02, 0.08)
    likes = int(views * like_rate * random.uniform(0.5, 1.5))
    likes = max(0, min(likes, views))

    # ── comments ──
    comment_rate = random.uniform(0.001, 0.015)
    comments = int(views * comment_rate * random.uniform(0.3, 1.8))
    comments = max(0, comments)

    # ── shares ──
    share_rate = random.uniform(0.0005, 0.005)
    shares = int(views * share_rate * random.uniform(0.2, 2.0))
    shares = max(0, shares)

    return likes, comments, shares


def gen_title(category: str) -> str:
    """Pick a random template and fill in a topic + optional number."""
    template = random.choice(TITLE_TEMPLATES[category])
    topic    = random.choice(TOPICS[category])
    number   = str(random.randint(1, 50))
    return template.replace("{t}", topic).replace("{n}", number)


def gen_publish_date() -> str:
    """Random date between 2024-01-01 and 2025-12-30 inclusive."""
    offset = random.randint(0, DATE_RANGE_DAYS)
    dt = DATE_START + timedelta(days=offset)
    return dt.strftime("%Y-%m-%d")


def gen_subscribers(views: int) -> int:
    """
    Subscribers loosely correlated with views.
    Higher-view channels tend to have more subscribers,
    but there's wide variance.
    """
    base = max(100, views // random.randint(5, 50))
    jitter = random.uniform(0.3, 2.5)
    return max(100, min(int(base * jitter), 100_000_000))


def gen_category() -> str:
    """Weighted random category selection."""
    return random.choices(_CAT_NAMES, weights=_CAT_WEIGHTS, k=1)[0]


# ═══════════════════════════════════════════════════════════════════════════════
# ROW GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

def generate_row(row_num: int) -> tuple:
    """
    Generate one complete row as a 14-element tuple.
    (row_id is AUTOINCREMENT so we don't include it)
    """
    category = gen_category()
    views    = gen_views(category)
    likes, comments, shares = gen_engagement(views)
    dur_min, dur_max = CATEGORY_CONFIG[category]["d"]
    ads_prob = CATEGORY_CONFIG[category]["a"]

    return (
        f"vid_{row_num:07d}",                                    # video_id
        gen_title(category),                                      # title
        category,                                                 # category
        random.choice(REGIONS),                                   # region
        random.choice(LANGUAGES),                                 # language
        views,                                                    # views
        likes,                                                    # likes
        comments,                                                 # comments
        shares,                                                   # shares
        1 if random.random() < ads_prob else 0,                   # ads_enabled
        gen_publish_date(),                                       # publish_date
        gen_sentiment(category),                                  # sentiment_score
        random.randint(dur_min, dur_max),                         # duration_seconds
        gen_subscribers(views),                                   # subscribers
    )


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN  —  generate, load, verify
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 65)
    print("  MATRIQ / InsightAI  —  Database Generator")
    print("=" * 65)
    print(f"  Target rows:  {TOTAL_ROWS:>12,}")
    print(f"  Batch size:   {BATCH_SIZE:>12,}")
    print(f"  Date range:   {DATE_START.strftime('%Y-%m-%d')} → {DATE_END.strftime('%Y-%m-%d')}")
    print(f"  Categories:   {', '.join(CATEGORIES)}")
    print(f"  DB path:      {DB_PATH}")
    print("=" * 65)

    # ── 1. Remove old database ────────────────────────────────────────────
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("\n✓ Removed old database.")

    # ── 2. Create database with performance pragmas ───────────────────────
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous  = NORMAL;")
    conn.execute("PRAGMA cache_size   = -64000;")   # 64 MB cache
    conn.execute("PRAGMA temp_store   = MEMORY;")
    conn.execute(SCHEMA)
    conn.commit()
    print("✓ Created table youtube_data.\n")

    # ── 3. Seed random for reproducibility ────────────────────────────────
    #    Remove or change the seed for different data each run.
    random.seed(42)

    # ── 4. Generate and insert in batches ─────────────────────────────────
    INSERT_SQL = (
        "INSERT INTO youtube_data "
        "(video_id, title, category, region, language, "
        "views, likes, comments, shares, ads_enabled, "
        "publish_date, sentiment_score, duration_seconds, subscribers) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    )

    total_inserted = 0
    t_start = time.time()

    while total_inserted < TOTAL_ROWS:
        # Last batch may be smaller
        chunk = min(BATCH_SIZE, TOTAL_ROWS - total_inserted)

        batch = [
            generate_row(total_inserted + i + 1)
            for i in range(chunk)
        ]

        conn.executemany(INSERT_SQL, batch)
        conn.commit()

        total_inserted += chunk
        elapsed = time.time() - t_start
        rate    = total_inserted / max(elapsed, 0.001)
        pct     = total_inserted / TOTAL_ROWS * 100

        print(
            f"  {total_inserted:>10,} / {TOTAL_ROWS:,}  "
            f"({pct:5.1f}%)  "
            f"│ {rate:,.0f} rows/sec  "
            f"│ elapsed {elapsed:.1f}s"
        )

    gen_time = time.time() - t_start
    print(f"\n✓ All {total_inserted:,} rows inserted in {gen_time:.1f}s.\n")

    # ── 5. Create indexes ─────────────────────────────────────────────────
    print("Creating indexes...")
    for idx_sql in INDEXES:
        conn.execute(idx_sql)
    conn.commit()
    idx_time = time.time() - t_start - gen_time
    print(f"✓ {len(INDEXES)} indexes created in {idx_time:.1f}s.\n")

    # ══════════════════════════════════════════════════════════════════════
    # VERIFICATION  —  proves the data matches the PDF specification
    # ══════════════════════════════════════════════════════════════════════
    print("=" * 65)
    print("  VERIFICATION")
    print("=" * 65)

    # ── Total row count ───────────────────────────────────────────────────
    count = conn.execute("SELECT COUNT(*) FROM youtube_data").fetchone()[0]
    status = "✓ PASS" if count == TOTAL_ROWS else "✗ FAIL"
    print(f"\n{status}  Total rows: {count:,}  (expected {TOTAL_ROWS:,})")

    if count != TOTAL_ROWS:
        print(f"\n  *** CRITICAL: Row count mismatch! ***")
        conn.close()
        return

    # ── Per-category breakdown ────────────────────────────────────────────
    print(f"\n{'Category':>15}  {'Count':>10}  {'Pct':>6}  {'Avg Sentiment':>14}  {'Min':>7}  {'Max':>7}")
    print("─" * 65)

    rows = conn.execute("""
        SELECT
            category,
            COUNT(*)                        AS cnt,
            ROUND(AVG(sentiment_score), 4)  AS avg_s,
            ROUND(MIN(sentiment_score), 4)  AS min_s,
            ROUND(MAX(sentiment_score), 4)  AS max_s
        FROM youtube_data
        GROUP BY category
        ORDER BY category
    """).fetchall()

    cat_total = 0
    for cat, cnt, avg_s, min_s, max_s in rows:
        cat_total += cnt
        print(
            f"  {cat:>13}  {cnt:>10,}  {cnt/TOTAL_ROWS*100:5.1f}%"
            f"      {avg_s:+.4f}  {min_s:+.4f}  {max_s:+.4f}"
        )

    print("─" * 65)
    print(f"  {'TOTAL':>13}  {cat_total:>10,}  {cat_total/TOTAL_ROWS*100:5.1f}%")

    sum_ok = "✓ PASS" if cat_total == TOTAL_ROWS else "✗ FAIL"
    print(f"\n{sum_ok}  Category counts sum to {cat_total:,}")

    # ── Date range ────────────────────────────────────────────────────────
    min_d = conn.execute("SELECT MIN(publish_date) FROM youtube_data").fetchone()[0]
    max_d = conn.execute("SELECT MAX(publish_date) FROM youtube_data").fetchone()[0]
    date_ok = (min_d >= "2024-01-01" and max_d <= "2025-12-30")
    d_status = "✓ PASS" if date_ok else "✗ FAIL"
    print(f"{d_status}  Date range: {min_d}  →  {max_d}")

    # ── Sentiment global range ────────────────────────────────────────────
    g_min = conn.execute("SELECT MIN(sentiment_score) FROM youtube_data").fetchone()[0]
    g_max = conn.execute("SELECT MAX(sentiment_score) FROM youtube_data").fetchone()[0]
    s_ok  = (g_min >= -1.0 and g_max <= 1.0)
    s_status = "✓ PASS" if s_ok else "✗ FAIL"
    print(f"{s_status}  Sentiment range: {g_min:.4f}  →  {g_max:.4f}")

    # ── Region distribution ───────────────────────────────────────────────
    print(f"\nRegion distribution:")
    for reg, cnt in conn.execute(
        "SELECT region, COUNT(*) FROM youtube_data GROUP BY region ORDER BY COUNT(*) DESC"
    ).fetchall():
        print(f"  {reg:5s}  {cnt:>10,}  ({cnt/TOTAL_ROWS*100:.1f}%)")

    # ── Language distribution ─────────────────────────────────────────────
    print(f"\nLanguage distribution:")
    for lang, cnt in conn.execute(
        "SELECT language, COUNT(*) FROM youtube_data GROUP BY language ORDER BY COUNT(*) DESC"
    ).fetchall():
        print(f"  {lang:12s}  {cnt:>10,}  ({cnt/TOTAL_ROWS*100:.1f}%)")

    # ── Sample rows ───────────────────────────────────────────────────────
    print(f"\nSample rows:")
    sample = conn.execute("""
        SELECT video_id, category, region, views, sentiment_score, publish_date
        FROM youtube_data
        LIMIT 5
    """).fetchall()
    for r in sample:
        print(f"  {r}")

    # ── Quick sanity queries (same ones that were failing before) ─────────
    print(f"\n{'─' * 65}")
    print("Sanity checks (these were broken before):\n")

    # Check: total positive sentiment videos — should be < 1,000,000
    pos_count = conn.execute(
        "SELECT COUNT(*) FROM youtube_data WHERE sentiment_score > 0"
    ).fetchone()[0]
    print(f"  Videos with positive sentiment: {pos_count:,}  (must be < {TOTAL_ROWS:,})")

    # Check: positive videos in Coding alone — should be << 1,000,000
    coding_pos = conn.execute(
        "SELECT COUNT(*) FROM youtube_data WHERE category='Coding' AND sentiment_score > 0"
    ).fetchone()[0]
    print(f"  Positive videos in Coding:      {coding_pos:,}  (must be << {TOTAL_ROWS:,})")

    # Check: avg sentiment in Music — should be meaningfully positive (~0.5)
    music_avg = conn.execute(
        "SELECT ROUND(AVG(sentiment_score), 4) FROM youtube_data WHERE category='Music'"
    ).fetchone()[0]
    print(f"  Avg sentiment in Music:         {music_avg:+.4f}  (should be ≈ +0.50)")

    # Check: avg sentiment in Tech Reviews — should be near 0
    tech_avg = conn.execute(
        "SELECT ROUND(AVG(sentiment_score), 4) FROM youtube_data WHERE category='Tech Reviews'"
    ).fetchone()[0]
    print(f"  Avg sentiment in Tech Reviews:  {tech_avg:+.4f}  (should be ≈ +0.05)")

    total_time = time.time() - t_start
    print(f"\n{'=' * 65}")
    print(f"  ✓ DATABASE READY")
    print(f"    {count:,} rows  •  {len(INDEXES)} indexes  •  {total_time:.1f}s total")
    print(f"    {DB_PATH}")
    print(f"{'=' * 65}")

    conn.close()


if __name__ == "__main__":
    main()