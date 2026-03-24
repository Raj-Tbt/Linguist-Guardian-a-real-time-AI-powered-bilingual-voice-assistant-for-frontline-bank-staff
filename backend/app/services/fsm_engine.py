"""
Linguist-Guardian — Finite State Machine (FSM) Process Engine.

Implements sequential process flows for:
  • Account Opening  (form → kyc → verification → approval → done)
  • Loan Inquiry     (eligibility → details → documents → approval → done)

Key design decisions:
  • Each process is a linear chain — no branching.
  • Transitions are validated: you cannot skip steps.
  • The engine is stateless — state lives in the Session DB row.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.core.logging import logger


# ── Process Definitions ──────────────────────────────────────
# Each process is an ordered list of states.
# The first state is the entry point, the last is the terminal state.

PROCESSES: Dict[str, List[str]] = {
    "account_opening": [
        "form_filling",
        "kyc_submission",
        "document_verification",
        "approval_pending",
        "completed",
    ],
    "loan_inquiry": [
        "eligibility_check",
        "loan_details",
        "document_submission",
        "approval_pending",
        "completed",
    ],
}

# Human-readable labels for UI display
STATE_LABELS: Dict[str, str] = {
    "idle": "Not Started",
    "form_filling": "Filling Application Form",
    "kyc_submission": "KYC Submission",
    "document_verification": "Document Verification",
    "approval_pending": "Pending Approval",
    "completed": "Process Completed",
    "eligibility_check": "Checking Eligibility",
    "loan_details": "Reviewing Loan Details",
    "document_submission": "Submitting Documents",
}


class FSMError(Exception):
    """Raised when an invalid FSM transition is attempted."""
    pass


def get_process_steps(process_type: str) -> List[str]:
    """
    Return the ordered list of states for a process type.

    Args:
        process_type: e.g. "account_opening" or "loan_inquiry"

    Returns:
        List of state names.

    Raises:
        FSMError: if process_type is unknown.
    """
    if process_type not in PROCESSES:
        raise FSMError(f"Unknown process type: {process_type}")
    return PROCESSES[process_type]


def get_initial_state(process_type: str) -> str:
    """Return the first state of a process."""
    return get_process_steps(process_type)[0]


def get_available_transitions(
    process_type: str,
    current_state: str,
) -> List[str]:
    """
    Return the list of states the FSM can transition to from
    ``current_state``.  Only the immediate next state is allowed
    (linear chain — no skipping).

    Args:
        process_type: process identifier.
        current_state: current FSM state.

    Returns:
        List with 0 or 1 elements (next state, if any).
    """
    steps = get_process_steps(process_type)

    if current_state == "idle":
        return [steps[0]]

    if current_state not in steps:
        return []

    idx = steps.index(current_state)

    # Already at terminal state
    if idx >= len(steps) - 1:
        return []

    return [steps[idx + 1]]


def get_completed_steps(
    process_type: str,
    current_state: str,
) -> List[str]:
    """
    Return all steps that have been completed (i.e. before current).

    Args:
        process_type: process identifier.
        current_state: current FSM state.

    Returns:
        List of completed state names.
    """
    steps = get_process_steps(process_type)

    if current_state == "idle":
        return []

    if current_state not in steps:
        return []

    idx = steps.index(current_state)
    return steps[:idx]


def validate_transition(
    process_type: str,
    current_state: str,
    target_state: str,
) -> Tuple[bool, str]:
    """
    Check whether transitioning from current_state → target_state
    is allowed.

    Returns:
        (is_valid, reason) tuple.
    """
    available = get_available_transitions(process_type, current_state)

    if target_state in available:
        return True, "Transition allowed."

    # Build a helpful error message
    steps = get_process_steps(process_type)

    if target_state not in steps and target_state != "idle":
        return False, f"State '{target_state}' does not exist in process '{process_type}'."

    if current_state == "completed":
        return False, "Process is already completed. No further transitions allowed."

    # Attempt to skip?
    if target_state in steps:
        target_idx = steps.index(target_state)
        current_idx = steps.index(current_state) if current_state in steps else -1
        if target_idx > current_idx + 1:
            skipped = steps[current_idx + 1 : target_idx]
            return False, (
                f"Cannot skip steps. You must complete "
                f"{', '.join(skipped)} before reaching '{target_state}'."
            )

    return False, f"Transition from '{current_state}' to '{target_state}' is not allowed."


def advance_state(
    process_type: str,
    current_state: str,
    target_state: str,
) -> str:
    """
    Attempt to advance the FSM.

    Args:
        process_type: process identifier.
        current_state: current FSM state.
        target_state: desired next state.

    Returns:
        The new state on success.

    Raises:
        FSMError: if the transition is invalid.
    """
    is_valid, reason = validate_transition(process_type, current_state, target_state)

    if not is_valid:
        logger.warning(
            "FSM reject: %s → %s in %s — %s",
            current_state, target_state, process_type, reason,
        )
        raise FSMError(reason)

    logger.info(
        "FSM advance: %s → %s in %s",
        current_state, target_state, process_type,
    )
    return target_state


def start_process(process_type: str) -> str:
    """
    Start a new process and return the initial state.

    Args:
        process_type: process identifier.

    Returns:
        The initial state string.
    """
    initial = get_initial_state(process_type)
    logger.info("FSM start: process=%s initial_state=%s", process_type, initial)
    return initial


def get_state_info(
    process_type: Optional[str],
    current_state: str,
) -> dict:
    """
    Build a complete state information dict for API responses.

    Returns dict with: current_state, available_transitions,
    completed_steps, all_steps, state_label.
    """
    if not process_type or process_type not in PROCESSES:
        return {
            "current_state": current_state,
            "available_transitions": [],
            "completed_steps": [],
            "all_steps": [],
            "state_label": STATE_LABELS.get(current_state, current_state),
        }

    return {
        "current_state": current_state,
        "available_transitions": get_available_transitions(process_type, current_state),
        "completed_steps": get_completed_steps(process_type, current_state),
        "all_steps": get_process_steps(process_type),
        "state_label": STATE_LABELS.get(current_state, current_state),
    }
