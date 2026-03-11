"""
ai_module.py — AI Analysis for Complaint Processing

Performs:
  1. Priority classification from complaint text (keyword-based NLP)
  2. Category auto-detection
  3. Confidence scoring

In production, replace with an actual ML model or OpenAI API call.
"""

import re
from typing import Optional

# ─────────────────────────────────────────────────────────
# Keyword priority rules
# ─────────────────────────────────────────────────────────

PRIORITY_RULES = {
    "critical": [
        "flood", "fire", "collapse", "emergency", "dangerous", "accident",
        "injury", "death", "electric shock", "gas leak", "sewage overflow",
        "building collapse", "road blocked", "no water for days"
    ],
    "high": [
        "urgent", "days without", "no water", "pothole", "broken pipe",
        "illegal construction", "blocked", "overflowing", "public safety",
        "school zone", "hospital", "not working for"
    ],
    "medium": [
        "streetlight", "garbage", "littering", "dog", "noise",
        "minor leak", "crack", "fading paint", "slow", "delay"
    ],
    "low": [
        "suggestion", "inquiry", "feedback", "please fix", "minor issue",
        "small crack", "faded"
    ]
}

CATEGORY_RULES = {
    "Roads":          ["pothole", "road", "highway", "divider", "footpath", "pavement"],
    "Sanitation":     ["garbage", "waste", "trash", "litter", "dump", "sewage", "drain"],
    "Water Supply":   ["water", "pipe", "leak", "supply", "tap", "borewell"],
    "Infrastructure": ["streetlight", "light", "electricity", "building", "wall", "bridge"],
    "Animal Control": ["dog", "animal", "stray", "cattle", "monkey"],
    "Enforcement":    ["illegal", "construction", "encroachment", "bribe", "corruption"],
}


# ─────────────────────────────────────────────────────────
# Main Analysis Function
# ─────────────────────────────────────────────────────────

def analyze_complaint(description: str, category: str) -> dict:
    """
    Analyze a complaint description and return:
      - priority: critical / high / medium / low
      - detected_category: auto-detected category
      - confidence: 0-100 integer
      - keywords_found: list of matched keywords
    """
    text = description.lower()
    text = re.sub(r"[^\w\s]", " ", text)  # strip punctuation

    priority, keywords_found = classify_priority(text)
    detected_category        = detect_category(text, category)
    confidence               = compute_confidence(priority, keywords_found, description)

    return {
        "priority":          priority,
        "detected_category": detected_category,
        "confidence":        confidence,
        "keywords_found":    keywords_found,
    }


def classify_priority(text: str):
    """Return (priority_label, matched_keywords)."""
    for priority in ("critical", "high", "medium", "low"):
        matched = [kw for kw in PRIORITY_RULES[priority] if kw in text]
        if matched:
            return priority, matched
    return "medium", []   # default


def detect_category(text: str, fallback_category: str) -> str:
    """Try to auto-detect category from text; fall back to user-selected."""
    scores = {cat: 0 for cat in CATEGORY_RULES}
    for cat, keywords in CATEGORY_RULES.items():
        for kw in keywords:
            if kw in text:
                scores[cat] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else fallback_category


def compute_confidence(priority: str, keywords_found: list, description: str) -> int:
    """
    Simple confidence score (0-100).
    More keywords matched + longer description = higher confidence.
    """
    base = {"critical": 90, "high": 80, "medium": 70, "low": 60}
    score = base.get(priority, 70)

    # Boost for keyword matches
    score += min(len(keywords_found) * 2, 8)

    # Boost for description length
    word_count = len(description.split())
    if word_count > 30:
        score += 3
    elif word_count > 15:
        score += 1

    return min(score, 99)


# ─────────────────────────────────────────────────────────
# Image Analysis (placeholder for future CV model)
# ─────────────────────────────────────────────────────────

def analyze_image(image_base64: Optional[str]) -> dict:
    """
    Placeholder for image-based complaint analysis.
    In production: call a Vision API or local CV model.
    """
    if not image_base64:
        return {"image_detected": False}

    # Simulate detection result
    return {
        "image_detected": True,
        "objects_detected": ["road", "pothole"],  # placeholder
        "severity_estimate": "high",
        "confidence": 78
    }


# ─────────────────────────────────────────────────────────
# SLA Calculator
# ─────────────────────────────────────────────────────────

def get_sla_days(priority: str) -> int:
    """Return number of working days to resolve based on priority."""
    sla = {
        "critical": 1,
        "high":     2,
        "medium":   5,
        "low":      10,
    }
    return sla.get(priority, 5)
