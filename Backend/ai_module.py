"""
ai_module.py — AI Analysis & Verification Pipeline
Smart Civic Service Platform

Functions:
  1. analyze_complaint()    — priority + category classification on submission
  2. verify_proof()         — AI verification of employee completion proof
  3. analyze_image()        — image analysis placeholder (Vision API ready)
"""

import re
import json
from datetime import datetime
from typing import Optional

# ─────────────────────────────────────────────────────────
# Priority classification rules
# ─────────────────────────────────────────────────────────

PRIORITY_RULES = {
    "critical": [
        "flood","fire","collapse","emergency","dangerous","accident",
        "injury","death","electric shock","gas leak","sewage overflow",
        "building collapse","road blocked","no water for days","explosion",
        "toxic","hazardous","body","unconscious","threat","immediate danger"
    ],
    "high": [
        "urgent","days without","no water","pothole","broken pipe",
        "illegal construction","blocked","overflowing","public safety",
        "school zone","hospital","not working for","accident prone",
        "children","elderly","major leak","sewage","flooding","severe"
    ],
    "medium": [
        "streetlight","garbage","littering","dog","noise",
        "minor leak","crack","fading paint","slow","delay",
        "stray","dumping","overflowing bin","pothole small"
    ],
    "low": [
        "suggestion","inquiry","feedback","please fix","minor issue",
        "small crack","faded","request","question","general"
    ]
}

CATEGORY_RULES = {
    "Roads":          ["pothole","road","highway","divider","footpath","pavement","tar","asphalt"],
    "Sanitation":     ["garbage","waste","trash","litter","dump","sewage","drain","cleaning"],
    "Water Supply":   ["water","pipe","leak","supply","tap","borewell","no water","tanker"],
    "Infrastructure": ["streetlight","light","electricity","building","wall","bridge","sign","pole"],
    "Animal Control": ["dog","animal","stray","cattle","monkey","snake","wildlife"],
    "Enforcement":    ["illegal","construction","encroachment","bribe","corruption","unauthorized"],
}

# ─────────────────────────────────────────────────────────
# Proof verification keyword sets
# ─────────────────────────────────────────────────────────

# Words in proof_note that suggest genuine completion
COMPLETION_POSITIVE = [
    "fixed","repaired","completed","done","filled","cleared","cleaned",
    "removed","installed","replaced","resolved","restored","patched",
    "collected","attended","addressed","actioned","finished"
]
# Words that raise red flags
COMPLETION_NEGATIVE = [
    "partial","not done","pending","unable","could not","delayed",
    "rescheduled","failed","no access","refused","tomorrow","next week",
    "will do","plan to","will visit"
]

CATEGORY_PROOF_KEYWORDS = {
    "Roads":          ["patch","tar","filled","pothole fixed","road repair","asphalt","sealed"],
    "Sanitation":     ["cleared","cleaned","collected","disposed","bin empty","swept","sanitized"],
    "Water Supply":   ["pipe fixed","supply restored","leak sealed","water running","repaired pipe"],
    "Infrastructure": ["light working","bulb replaced","pole fixed","installed","restored power"],
    "Animal Control": ["animal removed","dog captured","rehomed","cleared area","vet visit"],
    "Enforcement":    ["demolished","stopped","notice served","action taken","sealed","arrested"],
}


# ─────────────────────────────────────────────────────────
# 1. Complaint Analysis (on submission)
# ─────────────────────────────────────────────────────────

def analyze_complaint(description: str, category: str) -> dict:
    """
    Analyze complaint text.
    Returns priority, detected_category, confidence, keywords_found.
    """
    text = description.lower()
    text = re.sub(r"[^\w\s]", " ", text)

    priority, kw_found   = _classify_priority(text)
    detected_category    = _detect_category(text, category)
    confidence           = _compute_confidence(priority, kw_found, description)

    return {
        "priority":          priority,
        "detected_category": detected_category,
        "confidence":        confidence,
        "keywords_found":    kw_found,
    }


def _classify_priority(text: str):
    for level in ("critical", "high", "medium", "low"):
        matched = [kw for kw in PRIORITY_RULES[level] if kw in text]
        if matched:
            return level, matched
    return "medium", []


def _detect_category(text: str, fallback: str) -> str:
    scores = {cat: sum(1 for kw in kws if kw in text) for cat, kws in CATEGORY_RULES.items()}
    best   = max(scores, key=scores.get)
    return best if scores[best] > 0 else fallback


def _compute_confidence(priority: str, keywords: list, description: str) -> int:
    base  = {"critical": 90, "high": 80, "medium": 70, "low": 60}.get(priority, 70)
    base += min(len(keywords) * 2, 8)
    base += 3 if len(description.split()) > 30 else (1 if len(description.split()) > 15 else 0)
    return min(base, 99)


# ─────────────────────────────────────────────────────────
# 2. Proof Verification (after employee submits proof)
# ─────────────────────────────────────────────────────────

def verify_proof(
    complaint_description: str,
    complaint_category:    str,
    proof_note:            str,
    proof_image:           Optional[str],
    submitted_at:          Optional[str],
    sla_deadline:          Optional[str],
) -> dict:
    """
    Multi-signal AI verification pipeline.
    Returns verdict, confidence, reason, signals.

    Verdict: 'verified' | 'needs-review' | 'rejected'
    """
    signals = {}
    score   = 0   # 0-100

    # ── Signal 1: Proof note quality ─────────────────────
    note_text  = (proof_note or "").lower()
    note_text  = re.sub(r"[^\w\s]", " ", note_text)

    pos_matches = [w for w in COMPLETION_POSITIVE if w in note_text]
    neg_matches = [w for w in COMPLETION_NEGATIVE if w in note_text]

    note_score = min(len(pos_matches) * 12, 40)
    note_score -= len(neg_matches) * 15
    note_score  = max(0, min(40, note_score))
    score      += note_score
    signals["note_positive_words"] = pos_matches
    signals["note_negative_words"] = neg_matches
    signals["note_score"]          = note_score

    # ── Signal 2: Category-specific keyword match ─────────
    cat_kws      = CATEGORY_PROOF_KEYWORDS.get(complaint_category, [])
    cat_matches  = [kw for kw in cat_kws if kw in note_text]
    cat_score    = min(len(cat_matches) * 10, 25)
    score       += cat_score
    signals["category_keywords_matched"] = cat_matches
    signals["category_score"]            = cat_score

    # ── Signal 3: Proof note length / detail ─────────────
    word_count   = len(proof_note.split()) if proof_note else 0
    detail_score = 0
    if   word_count >= 20: detail_score = 15
    elif word_count >= 10: detail_score = 10
    elif word_count >= 5:  detail_score = 5
    score       += detail_score
    signals["proof_word_count"] = word_count
    signals["detail_score"]     = detail_score

    # ── Signal 4: Image submitted ─────────────────────────
    img_score          = 15 if proof_image else 0
    score             += img_score
    signals["image_submitted"] = bool(proof_image)
    signals["image_score"]     = img_score

    # ── Signal 5: Timeliness ─────────────────────────────
    time_score = 0
    if submitted_at and sla_deadline:
        try:
            submitted_date = datetime.fromisoformat(submitted_at).date()
            deadline_date  = datetime.strptime(sla_deadline, "%Y-%m-%d").date()
            if submitted_date <= deadline_date:
                time_score = 5
        except Exception:
            pass
    score += time_score
    signals["submitted_on_time"] = time_score > 0

    # ── Signal 6: Original complaint cross-check ──────────
    orig_text   = complaint_description.lower()
    orig_words  = set(re.sub(r"[^\w\s]"," ",orig_text).split())
    note_words  = set(note_text.split())
    overlap     = orig_words & note_words - {"the","a","is","was","and","in","at","to","of","it","i"}
    cross_score = min(len(overlap) * 2, 10)
    score      += cross_score
    signals["description_overlap_words"] = list(overlap)[:5]
    signals["cross_check_score"]         = cross_score

    # ── Final scoring ─────────────────────────────────────
    score = min(score, 100)

    if score >= 60:
        verdict = "verified"
    elif score >= 35:
        verdict = "needs-review"
    else:
        verdict = "rejected"

    # Build human-readable reason
    reason = _build_reason(verdict, pos_matches, neg_matches, cat_matches, bool(proof_image), word_count)

    return {
        "verdict":    verdict,
        "confidence": score,
        "reason":     reason,
        "signals":    signals,
    }


def _build_reason(verdict, pos, neg, cat, has_image, words):
    parts = []
    if pos:
        parts.append(f"Completion keywords: {', '.join(pos[:3])}")
    if cat:
        parts.append(f"Category evidence: {', '.join(cat[:2])}")
    if has_image:
        parts.append("Proof image submitted")
    if words >= 10:
        parts.append(f"Detailed note ({words} words)")
    if neg:
        parts.append(f"⚠ Flags: {', '.join(neg[:2])}")
    if not parts:
        parts.append("Insufficient evidence in proof")

    prefix = {
        "verified":     "✓ Work verified. ",
        "needs-review": "⚠ Manual review needed. ",
        "rejected":     "✗ Proof insufficient. ",
    }[verdict]
    return prefix + " | ".join(parts)


# ─────────────────────────────────────────────────────────
# 3. Image Analysis (Vision API ready placeholder)
# ─────────────────────────────────────────────────────────

def analyze_image(image_base64: Optional[str], category: str = "") -> dict:
    """
    Placeholder for Vision API / CV model analysis.
    In production: call Google Vision API or run a local YOLO/CLIP model.
    Returns a confidence boost and detected objects.
    """
    if not image_base64:
        return {"detected": False, "boost": 0, "objects": []}

    # Simulate category-aware detection
    category_objects = {
        "Roads":          (["road","pothole","asphalt","cone","worker"], 18),
        "Sanitation":     (["bin","truck","waste","cleaning","broom"], 18),
        "Water Supply":   (["pipe","worker","water","valve","equipment"], 18),
        "Infrastructure": (["light","pole","worker","electrical","panel"], 18),
        "Animal Control": (["animal","cage","worker","area"], 15),
        "Enforcement":    (["building","site","notice","officer"], 15),
    }
    objects, boost = category_objects.get(category, (["worker","site"], 10))
    return {
        "detected": True,
        "objects":  objects,
        "boost":    boost,
        "note":     "Image analysis: relevant objects detected (simulated)"
    }


# ─────────────────────────────────────────────────────────
# 4. SLA helper
# ─────────────────────────────────────────────────────────

def get_sla_days(priority: str) -> int:
    return {"critical": 1, "high": 2, "medium": 5, "low": 10}.get(priority, 5)
