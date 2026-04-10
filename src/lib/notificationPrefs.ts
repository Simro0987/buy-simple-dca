const PREFS_KEY = 'notification-prefs';

export interface NotificationPrefs {
  browserNotifications: boolean;
  soundAlerts: boolean;
}

const defaults: NotificationPrefs = {
  browserNotifications: true,
  soundAlerts: true,
};

export function getNotificationPrefs(): NotificationPrefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return defaults;
  }
}

export function setNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
