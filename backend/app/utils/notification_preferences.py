from typing import Any


DEFAULT_NOTIFICATION_PREFERENCES: dict[str, bool] = {
    "in_app_enabled": True,
    "message_notifications": True,
    "application_updates": True,
    "email_message_digest": True,
    "email_application_updates": True,
    "security_alerts": True,
}

APPLICATION_NOTIFICATION_TYPES = {
    "application_received",
    "shortlisted",
    "rejected",
    "rejection",
    "advance",
}


def normalize_notification_preferences(value: Any) -> dict[str, bool]:
    preferences = DEFAULT_NOTIFICATION_PREFERENCES.copy()
    if isinstance(value, dict):
        for key in preferences:
            if isinstance(value.get(key), bool):
                preferences[key] = value[key]
    return preferences


def notification_visible_for_role(notification_type: str, preferences: dict[str, bool], role: str) -> bool:
    prefs = normalize_notification_preferences(preferences)

    if notification_type == "tamper_alert":
        return prefs["security_alerts"]
    if not prefs["in_app_enabled"]:
        return False
    if notification_type == "message":
        return prefs["message_notifications"]
    if notification_type in APPLICATION_NOTIFICATION_TYPES:
        return prefs["application_updates"]
    return True


def notification_email_allowed(notification_type: str, preferences: dict[str, bool]) -> bool:
    prefs = normalize_notification_preferences(preferences)

    if notification_type == "tamper_alert":
        return prefs["security_alerts"]
    if notification_type == "message_digest_email":
        return prefs["email_message_digest"]
    if notification_type in APPLICATION_NOTIFICATION_TYPES:
        return prefs["email_application_updates"]
    return True
