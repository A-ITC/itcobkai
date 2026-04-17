import Toastify from "toastify-js";

export interface NotificationPort {
  alert(text: string, reload?: boolean): void;
  joined(name: string): void;
  left(name: string): void;
}

export const browserNotifications: NotificationPort = {
  alert(text: string, reload?: boolean): void {
    window.alert(text);
    if (reload) {
      location.reload();
    }
  },

  joined(name: string): void {
    Toastify({ text: `${name} が参加しました`, duration: 3000 }).showToast();
  },

  left(name: string): void {
    Toastify({ text: `${name} が退出しました`, duration: 3000 }).showToast();
  }
};
